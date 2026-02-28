import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { buildConfig } from "./config.js";
import { generateWorksheetId, isWorksheetId } from "./id.js";
import { ensureStorageLayout, enqueueUploadedWorksheet, getWorksheetStatus } from "./repository.js";

const ZIP_MAGIC_HEADERS = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];

const ALLOWED_ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
  "application/octet-stream"
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function fileHasZipMagic(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, 4, 0);
    if (bytesRead < 4) {
      return false;
    }
    return ZIP_MAGIC_HEADERS.some((magic) => magic.equals(header));
  } finally {
    await handle.close();
  }
}

function sanitizeOptionalString(value, maxLen) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  return text.slice(0, maxLen);
}

function validateMetadataFields(req) {
  const title = sanitizeOptionalString(req.body?.title, 200);
  const ownerEmail = sanitizeOptionalString(req.body?.owner_email, 254);

  if (ownerEmail && !EMAIL_REGEX.test(ownerEmail)) {
    return { error: "owner_email is invalid" };
  }

  return { title, ownerEmail };
}

function ensureZipFilename(name) {
  return typeof name === "string" && path.extname(name).toLowerCase() === ".zip";
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

async function rewriteWorksheetHtmlForServe(indexHtml, worksheetId, worksheetDir) {
  const refs = extractAssetRefs(indexHtml);
  let next = indexHtml;
  for (const ref of refs) {
    const localFile = path.join(worksheetDir, ref.localPath);
    if (!(await exists(localFile))) {
      const esc = ref.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      next = next.replace(new RegExp(`^.*(?:src|href)="${esc}".*\\n?`, "gm"), "");
      continue;
    }

    const normalizedPath = ref.localPath.replace(/^\.?\//, "");
    const replacement = `/shippable/${encodeURIComponent(worksheetId)}/${normalizedPath}`;
    const esc = ref.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`"${esc}"`, "g"), `"${replacement}"`);
  }
  return next;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listWorksheetIds(config) {
  const ids = new Set();

  try {
    const queueRaw = await fs.readFile(config.queueFile, "utf8");
    const queue = JSON.parse(queueRaw);
    if (Array.isArray(queue.jobs)) {
      for (const job of queue.jobs) {
        if (isWorksheetId(job?.worksheet_id)) {
          ids.add(job.worksheet_id);
        }
      }
    }
  } catch {
    // Ignore queue parse/read errors and continue with folder scans.
  }

  try {
    const metadataEntries = await fs.readdir(config.metadataDir, { withFileTypes: true });
    for (const entry of metadataEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const worksheetId = entry.name.slice(0, -".json".length);
      if (isWorksheetId(worksheetId)) {
        ids.add(worksheetId);
      }
    }
  } catch {
    // Ignore metadata scan errors.
  }

  for (const dirPath of [config.intakeDir, path.join(config.storageRoot, "shippable")]) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && isWorksheetId(entry.name)) {
          ids.add(entry.name);
        }
      }
    } catch {
      // Ignore per-directory scan errors.
    }
  }

  return [...ids];
}

async function listWorksheetSummaries(config) {
  const worksheetIds = await listWorksheetIds(config);
  const summaries = [];

  for (const worksheetId of worksheetIds) {
    const metadataPath = path.join(config.metadataDir, `${worksheetId}.json`);
    const indexPath = path.join(config.storageRoot, "shippable", worksheetId, "index.html");

    let metadata = null;
    try {
      const raw = await fs.readFile(metadataPath, "utf8");
      metadata = JSON.parse(raw);
    } catch {
      // Best effort summary even without metadata.
    }

    const shippableReady = await exists(indexPath);
    const uploadedAt = metadata?.uploaded_at ?? null;
    const integratedAt = metadata?.integrated_at ?? null;
    const fallbackState = shippableReady ? "integrated" : "queued";
    const state =
      (typeof metadata?.state === "string" && metadata.state.trim()) || fallbackState;

    summaries.push({
      worksheet_id: worksheetId,
      state,
      uploaded_at: uploadedAt,
      integrated_at: integratedAt,
      last_error: metadata?.last_error ?? null,
      shippable_ready: shippableReady,
      open_url: shippableReady ? `/ws?ws=${encodeURIComponent(worksheetId)}` : null
    });
  }

  summaries.sort((a, b) => {
    const at = a.uploaded_at || "";
    const bt = b.uploaded_at || "";
    if (at && bt) return bt.localeCompare(at);
    if (at) return -1;
    if (bt) return 1;
    return a.worksheet_id.localeCompare(b.worksheet_id);
  });

  return summaries;
}

function extractResponseText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  if (Array.isArray(response.output_text)) {
    const joined = response.output_text
      .filter((chunk) => typeof chunk === "string")
      .join("\n")
      .trim();
    if (joined) {
      return joined;
    }
  }
  if (!Array.isArray(response.output)) {
    return "";
  }
  const chunks = [];
  for (const item of response.output) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

async function validateUploadedFile(file) {
  if (!file) {
    return { ok: false, error: "Missing file upload" };
  }

  if (!ensureZipFilename(file.originalname)) {
    return { ok: false, error: "Only .zip files are allowed" };
  }

  if (!ALLOWED_ZIP_MIME_TYPES.has(file.mimetype)) {
    return { ok: false, error: `Unsupported MIME type: ${file.mimetype}` };
  }

  const isZip = await fileHasZipMagic(file.path);
  if (!isZip) {
    return { ok: false, error: "File content does not match ZIP signature" };
  }

  return { ok: true };
}

export async function createApp(overrides = {}) {
  const config = buildConfig(overrides);
  await ensureStorageLayout(config);

  const app = express();
  const uploader = multer({
    dest: config.multerTmpDir,
    limits: { fileSize: config.maxUploadBytes }
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(config.appRoot, "public")));
  app.use("/shippable", express.static(path.join(config.storageRoot, "shippable"), { index: false }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(config.appRoot, "public", "index.html"));
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/intake/status", async (req, res) => {
    const worksheetId = String(req.query.ws || "").trim();
    if (!isWorksheetId(worksheetId)) {
      return res.status(400).json({ error: "Invalid or missing ws query parameter" });
    }

    const status = await getWorksheetStatus(config, worksheetId);
    if (!status) {
      return res.status(404).json({ error: "Worksheet not found" });
    }
    return res.json(status);
  });

  app.get("/api/intake/worksheets", async (_req, res) => {
    try {
      const worksheets = await listWorksheetSummaries(config);
      return res.json({ worksheets });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to list worksheets",
        details: [String(error.message || error)]
      });
    }
  });

  app.post("/api/intake/upload", uploader.single("file"), async (req, res) => {
    const fieldValidation = validateMetadataFields(req);
    if (fieldValidation.error) {
      if (req.file?.path) {
        await fs.rm(req.file.path, { force: true }).catch(() => {});
      }
      return res.status(400).json({ error: fieldValidation.error });
    }

    const validation = await validateUploadedFile(req.file);
    if (!validation.ok) {
      if (req.file?.path) {
        await fs.rm(req.file.path, { force: true }).catch(() => {});
      }
      return res.status(400).json({ error: validation.error });
    }

    const worksheetId = generateWorksheetId();
    try {
      const metadata = await enqueueUploadedWorksheet({
        config,
        worksheetId,
        title: fieldValidation.title,
        ownerEmail: fieldValidation.ownerEmail,
        originalFilename: req.file.originalname,
        tempFilePath: req.file.path
      });

      return res.json({
        worksheet_id: metadata.worksheet_id,
        status: metadata.state,
        artifact_path: metadata.artifact_path
      });
    } catch (error) {
      if (req.file?.path) {
        await fs.rm(req.file.path, { force: true }).catch(() => {});
      }
      return res.status(500).json({
        error: "Failed to enqueue worksheet upload",
        details: [String(error.message || error)]
      });
    }
  });

  app.post("/api/runtime/ai", async (req, res) => {
    const { messages, response_format: responseFormat, max_output_tokens: maxOutputTokens } =
      req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const payload = {
        model: "gpt-4.1",
        input: messages
      };
      if (responseFormat && typeof responseFormat === "object") {
        if (
          responseFormat.type === "json_schema" &&
          responseFormat.json_schema &&
          typeof responseFormat.json_schema === "object" &&
          typeof responseFormat.json_schema.schema === "object"
        ) {
          payload.text = {
            format: {
              type: "json_schema",
              name:
                typeof responseFormat.json_schema.name === "string"
                  ? responseFormat.json_schema.name
                  : "response",
              schema: responseFormat.json_schema.schema,
              strict: Boolean(responseFormat.json_schema.strict)
            }
          };
        } else if (responseFormat.type === "json_object") {
          payload.text = {
            format: {
              type: "json_object"
            }
          };
        }
      }
      if (
        Number.isInteger(maxOutputTokens) &&
        maxOutputTokens >= 16 &&
        maxOutputTokens <= 32768
      ) {
        payload.max_output_tokens = maxOutputTokens;
      }
      const response = await client.responses.create({
        ...payload
      });
      const outputText = extractResponseText(response);
      return res.json({
        model: "gpt-4.1",
        output_text: outputText,
        output: response.output ?? [],
        response_id: response.id ?? null
      });
    } catch (error) {
      return res.status(500).json({
        error: "runtime_ai_failed",
        details: [String(error.message || error)]
      });
    }
  });

  app.get("/ws", async (req, res) => {
    const worksheetId = String(req.query.ws || "").trim();
    if (!isWorksheetId(worksheetId)) {
      return res.status(400).json({ error: "Invalid or missing ws query parameter" });
    }
    const worksheetDir = path.join(config.storageRoot, "shippable", worksheetId);
    const target = path.join(worksheetDir, "index.html");
    try {
      const rawHtml = await fs.readFile(target, "utf8");
      const html = await rewriteWorksheetHtmlForServe(rawHtml, worksheetId, worksheetDir);
      return res.type("html").send(html);
    } catch {
      return res.status(404).json({ error: "Worksheet not integrated yet" });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `File too large. Max ${config.maxUploadBytes} bytes` });
    }
    return res.status(500).json({
      error: "Unexpected server error",
      details: [String(error.message || error)]
    });
  });

  return { app, config };
}
