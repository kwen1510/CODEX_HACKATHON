#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { readJson, writeJsonAtomic } from "../src/fs-json.js";
import { isWorksheetId } from "../src/id.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");

dotenv.config({ path: path.join(APP_ROOT, ".env") });
dotenv.config({ path: path.join(REPO_ROOT, ".env"), override: false });

const storageRootInput = process.env.TOOL_A_STORAGE_ROOT || path.join(APP_ROOT, "storage");
const STORAGE_ROOT = path.isAbsolute(storageRootInput)
  ? storageRootInput
  : path.resolve(APP_ROOT, storageRootInput);
const METADATA_DIR = path.join(STORAGE_ROOT, "metadata");
const INTAKE_DIR = path.join(STORAGE_ROOT, "intake");
const WORK_DIR = path.join(STORAGE_ROOT, "work");
const SHIPPABLE_DIR = path.join(STORAGE_ROOT, "shippable");
const QUEUE_FILE = path.join(STORAGE_ROOT, "queue", "pending.json");
const RETRYABLE_FAILURE_PATTERNS = [
  /ENOTFOUND\s+registry\.npmjs\.org/i,
  /ENOTFOUND\s+api\.openai\.com/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /network request to https?:\/\/registry\.npmjs\.org/i
];

function parseArgs(argv) {
  const wsArg = argv.find((arg) => arg.startsWith("--ws="));
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  return {
    worksheetId: wsArg ? wsArg.slice("--ws=".length).trim() : null,
    mode: modeArg ? modeArg.slice("--mode=".length).trim() : "codex"
  };
}

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function isTruthyEnv(value, fallback = true) {
  if (value == null || value === "") return fallback;
  return !/^(0|false|no|off)$/i.test(String(value).trim());
}

function isRetryableFailure(errorMessage) {
  const text = String(errorMessage || "");
  return RETRYABLE_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

function run(cmd, args, cwd, options = {}) {
  const timeoutMs = parsePositiveInt(options.timeoutMs, 0);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timeoutId = null;
    let hardKillId = null;

    function finalize(fn) {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (hardKillId) clearTimeout(hardKillId);
      fn();
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (finished) return;
        stderr += `\n${cmd} ${args.join(" ")} timed out after ${timeoutMs}ms`;
        child.kill("SIGTERM");
        hardKillId = setTimeout(() => {
          if (!finished) child.kill("SIGKILL");
        }, 5000);
      }, timeoutMs);
    }

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (error) => finalize(() => reject(error)));
    child.on("close", (code) => {
      finalize(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`${cmd} ${args.join(" ")} failed (${code})\n${stdout}\n${stderr}`.trim()));
        }
      });
    });
  });
}

async function resolveWorksheetIds(targetWorksheetId) {
  if (targetWorksheetId) {
    return [targetWorksheetId];
  }
  const queue = await readJson(QUEUE_FILE, { jobs: [] });
  const staleProcessingMs = parsePositiveInt(process.env.PROCESSING_STALE_MS, 20 * 60 * 1000);
  const nowMs = Date.now();
  const retryFailedJobs = isTruthyEnv(process.env.RETRY_FAILED_JOBS, true);
  const maxFailedAttempts = parsePositiveInt(process.env.MAX_FAILED_ATTEMPTS, 4);
  const queuedFromQueue = [];
  if (Array.isArray(queue.jobs)) {
    for (const job of queue.jobs) {
      if (typeof job?.worksheet_id !== "string") continue;
      const worksheetId = job.worksheet_id.trim();
      if (!worksheetId) continue;

      if (job.state === "queued") {
        queuedFromQueue.push(worksheetId);
        continue;
      }

      if (job.state === "processing") {
        const startedMs = Date.parse(String(job.started_at || ""));
        const stale = !Number.isFinite(startedMs) || nowMs - startedMs >= staleProcessingMs;
        if (stale) {
          queuedFromQueue.push(worksheetId);
        }
        continue;
      }

      if (retryFailedJobs && job.state === "failed") {
        const attempts = Number.isFinite(job.attempts) ? job.attempts : 0;
        if (attempts >= maxFailedAttempts) continue;
        const metadata = await readJson(path.join(METADATA_DIR, `${worksheetId}.json`), null);
        if (isRetryableFailure(metadata?.last_error)) {
          queuedFromQueue.push(worksheetId);
        }
      }
    }
  }

  const discoveredFromMetadata = [];
  try {
    const entries = await fs.readdir(METADATA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const metadataPath = path.join(METADATA_DIR, entry.name);
      const metadata = await readJson(metadataPath, null);
      if (!metadata || typeof metadata.worksheet_id !== "string") {
        continue;
      }
      if (metadata.state !== "queued") {
        if (!(retryFailedJobs && metadata.state === "failed" && isRetryableFailure(metadata.last_error))) {
          continue;
        }
      }
      discoveredFromMetadata.push(metadata.worksheet_id.trim());
    }
  } catch {
    // Ignore metadata scan errors and rely on queue + intake scan.
  }

  const discoveredFromIntake = [];
  try {
    const entries = await fs.readdir(INTAKE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const worksheetId = entry.name;
      if (!isWorksheetId(worksheetId)) continue;
      const zipPath = path.join(INTAKE_DIR, worksheetId, "original.zip");
      const metadataPath = path.join(METADATA_DIR, `${worksheetId}.json`);
      if (!(await fileExists(zipPath))) continue;
      const metadata = await ensureMetadataFromIntake(worksheetId, zipPath, metadataPath);
      if (!metadata || metadata.state !== "queued") continue;
      discoveredFromIntake.push(worksheetId);
    }
  } catch {
    // Ignore intake scan errors; queue + metadata may still be enough.
  }

  return [...new Set([...queuedFromQueue, ...discoveredFromMetadata, ...discoveredFromIntake])];
}

async function ensureMetadataFromIntake(worksheetId, zipPath, metadataPath) {
  const existing = await readJson(metadataPath, null);
  if (existing) {
    return existing;
  }

  const uploadedAt = await fs
    .stat(zipPath)
    .then((stat) => stat.mtime.toISOString())
    .catch(() => new Date().toISOString());

  const metadata = {
    worksheet_id: worksheetId,
    title: null,
    owner_email: null,
    original_filename: "original.zip",
    artifact_path: path.posix.join("storage", "intake", worksheetId, "original.zip"),
    state: "queued",
    uploaded_at: uploadedAt,
    integrated_at: null,
    last_error: null
  };
  await writeJsonAtomic(metadataPath, metadata);
  return metadata;
}

async function detectProjectRoot(extractDir) {
  const rootPkg = path.join(extractDir, "package.json");
  try {
    await fs.access(rootPkg);
    return extractDir;
  } catch {
    // fallthrough
  }

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const maybe = path.join(extractDir, entry.name, "package.json");
    try {
      await fs.access(maybe);
      return path.join(extractDir, entry.name);
    } catch {
      // continue
    }
  }
  throw new Error("No package.json found in extracted worksheet");
}

async function updateMetadata(worksheetId, patch) {
  const file = path.join(METADATA_DIR, `${worksheetId}.json`);
  const current = await readJson(file, null);
  if (!current) {
    throw new Error(`Missing metadata for ${worksheetId}`);
  }
  const next = { ...current, ...patch };
  await writeJsonAtomic(file, next);
  return next;
}

async function updateQueueState(worksheetId, state) {
  const queue = await readJson(QUEUE_FILE, { jobs: [] });
  if (!Array.isArray(queue.jobs)) {
    queue.jobs = [];
  }
  const now = new Date().toISOString();
  let found = false;
  queue.jobs = queue.jobs.map((job) => {
    if (job.worksheet_id !== worksheetId) return job;
    found = true;
    const next = { ...job, state };
    if (state === "processing") {
      next.attempts = Number.isFinite(job.attempts) ? job.attempts + 1 : 1;
      next.started_at = now;
    } else if (!Number.isFinite(next.attempts)) {
      next.attempts = 0;
    }
    if (state !== "processing" && next.started_at) {
      delete next.started_at;
    }
    if (!next.queued_at) {
      next.queued_at = now;
    }
    return next;
  });
  if (!found) {
    queue.jobs.push({
      worksheet_id: worksheetId,
      state,
      attempts: state === "processing" ? 1 : 0,
      queued_at: now,
      ...(state === "processing" ? { started_at: now } : {})
    });
  }
  await writeJsonAtomic(QUEUE_FILE, queue);
}

async function runCodexRewrite(projectRoot) {
  const prompt = [
    "You are integrating an uploaded worksheet project for safe production.",
    "Task:",
    "1) Remove Gemini and any Google Generative Language usage.",
    "2) Remove direct client API keys/process.env leakage.",
    "3) Wire AI calls to POST /api/runtime/ai with model gpt-4.1.",
    "4) Keep worksheet behavior equivalent.",
    "5) Ensure build succeeds.",
    "6) Do not add new external AI SDK dependencies.",
    "",
    "After edits, leave the project ready for `npm run build`."
  ].join("\n");

  await run(
    "codex",
    [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-C",
      projectRoot,
      prompt
    ],
    REPO_ROOT,
    {
      timeoutMs: parsePositiveInt(process.env.CODEX_REWRITE_TIMEOUT_MS, 8 * 60 * 1000)
    }
  );
}

async function sanitizeGuardrails(projectRoot) {
  const pkgPath = path.join(projectRoot, "package.json");
  const pkg = await readJson(pkgPath, {});
  if (pkg.dependencies && pkg.dependencies["@google/genai"]) {
    delete pkg.dependencies["@google/genai"];
    await writeJsonAtomic(pkgPath, pkg);
  }
}

function extractAssetRefs(indexHtml) {
  const refs = [];
  const re = /(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = re.exec(indexHtml)) !== null) {
    const raw = match[1];
    if (
      !raw ||
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("//") ||
      raw.startsWith("data:") ||
      raw.startsWith("#") ||
      raw.startsWith("javascript:")
    ) {
      continue;
    }
    const noQuery = raw.split(/[?#]/, 1)[0];
    const localPath = noQuery.startsWith("/") ? noQuery.slice(1) : noQuery;
    if (!localPath) continue;
    refs.push({ raw, localPath });
  }
  return refs;
}

async function gatherTextFiles(root) {
  const files = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(js|mjs|cjs|html|ts|tsx|json|map)$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }
  await walk(root);
  return files;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function normalizeShippableIndexHtml(outDir) {
  const indexPath = path.join(outDir, "index.html");
  let html;
  try {
    html = await fs.readFile(indexPath, "utf8");
  } catch {
    return;
  }

  const refs = extractAssetRefs(html);
  let next = html;

  for (const ref of refs) {
    const exists = await fileExists(path.join(outDir, ref.localPath));

    if (!exists) {
      // Remove broken local tags (common: /index.css, /favicon.ico in source templates).
      const esc = ref.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      next = next.replace(new RegExp(`^.*(?:src|href)="${esc}".*\\n?`, "gm"), "");
      continue;
    }

    // Convert absolute local paths to relative so /ws?ws=<id> serves assets correctly.
    if (ref.raw.startsWith("/")) {
      const escapedQuoted = `"${ref.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`;
      next = next.replace(new RegExp(escapedQuoted, "g"), `"./${ref.raw.slice(1)}"`);
    }
  }

  if (next !== html) {
    await fs.writeFile(indexPath, next, "utf8");
  }
}

async function verifyShippableOutput(outDir) {
  await normalizeShippableIndexHtml(outDir);

  const indexPath = path.join(outDir, "index.html");
  const indexHtml = await fs.readFile(indexPath, "utf8");
  const refs = extractAssetRefs(indexHtml);

  for (const ref of refs) {
    const local = path.join(outDir, ref.localPath);
    await fs.access(local);
  }

  const files = await gatherTextFiles(outDir);
  const forbidden = [/generativelanguage\.googleapis\.com/i, /@google\/genai/i, /GoogleGenAI/i];
  let hasRuntimeHook = false;
  let hasModelHint = false;

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    if (content.includes("/api/runtime/ai")) {
      hasRuntimeHook = true;
    }
    if (content.includes("gpt-4.1")) {
      hasModelHint = true;
    }
    for (const re of forbidden) {
      if (re.test(content)) {
        throw new Error(`Forbidden Gemini pattern found in shippable output: ${file}`);
      }
    }
  }

  if (!hasRuntimeHook) {
    throw new Error("Missing /api/runtime/ai hook in shippable output");
  }
  if (!hasModelHint) {
    throw new Error("Missing gpt-4.1 reference in shippable output");
  }
}

async function verifyOpenAiConnectivity() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing; cannot verify OpenAI gpt-4.1 runtime integration");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [{ role: "user", content: "Reply with OK only." }],
    max_output_tokens: 16
  });
  const text = typeof response.output_text === "string" ? response.output_text.toUpperCase() : "";
  if (!text.includes("OK")) {
    throw new Error("OpenAI connectivity check failed for gpt-4.1");
  }
}

async function processWorksheet(worksheetId, mode) {
  const metadata = await readJson(path.join(METADATA_DIR, `${worksheetId}.json`), null);
  if (!metadata) {
    throw new Error(`No metadata found for ${worksheetId}`);
  }

  const zipPath = path.join(INTAKE_DIR, worksheetId, "original.zip");
  const extractDir = path.join(WORK_DIR, worksheetId);
  const outDir = path.join(SHIPPABLE_DIR, worksheetId);

  await updateMetadata(worksheetId, {
    state: "processing",
    last_error: null
  });
  await updateQueueState(worksheetId, "processing");

  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await run("unzip", ["-q", zipPath, "-d", extractDir], REPO_ROOT, {
    timeoutMs: parsePositiveInt(process.env.UNZIP_TIMEOUT_MS, 60 * 1000)
  });
  const projectRoot = await detectProjectRoot(extractDir);

  if (mode === "codex") {
    await runCodexRewrite(projectRoot);
  }
  await sanitizeGuardrails(projectRoot);

  await run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--fetch-timeout=30000",
      "--fetch-retries=1",
      "--fetch-retry-maxtimeout=60000"
    ],
    projectRoot,
    {
      timeoutMs: parsePositiveInt(process.env.NPM_INSTALL_TIMEOUT_MS, 6 * 60 * 1000)
    }
  );
  const pkg = await readJson(path.join(projectRoot, "package.json"), {});
  if (pkg.scripts && pkg.scripts.build) {
    await run("npm", ["run", "build"], projectRoot, {
      timeoutMs: parsePositiveInt(process.env.BUILD_TIMEOUT_MS, 5 * 60 * 1000)
    });
    await fs.cp(path.join(projectRoot, "dist"), outDir, { recursive: true });
  } else {
    await fs.cp(projectRoot, outDir, { recursive: true });
  }

  await verifyShippableOutput(outDir);
  await verifyOpenAiConnectivity();

  await updateMetadata(worksheetId, {
    state: "integrated",
    integrated_at: new Date().toISOString(),
    last_error: null
  });
  await updateQueueState(worksheetId, "completed");

  return {
    worksheet_id: worksheetId,
    state: "integrated",
    output: outDir
  };
}

async function markFailure(worksheetId, errorMessage) {
  await updateMetadata(worksheetId, {
    state: "failed",
    last_error: errorMessage
  });
  await updateQueueState(worksheetId, "failed");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const worksheetIds = await resolveWorksheetIds(args.worksheetId);

  if (worksheetIds.length === 0) {
    console.log("No queued worksheets found.");
    return;
  }

  const summary = [];
  for (const worksheetId of worksheetIds) {
    try {
      const result = await processWorksheet(worksheetId, args.mode);
      summary.push(result);
    } catch (error) {
      const message = String(error.message || error);
      await markFailure(worksheetId, message);
      summary.push({
        worksheet_id: worksheetId,
        state: "failed",
        error: message
      });
    }
  }

  console.table(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
