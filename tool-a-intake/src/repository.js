import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, moveFileSafe, readJson, writeJsonAtomic } from "./fs-json.js";

const writeLocks = new Map();

function withWriteLock(lockKey, task) {
  const previous = writeLocks.get(lockKey) || Promise.resolve();
  const next = previous.then(task, task);
  writeLocks.set(lockKey, next.catch(() => {}));
  return next;
}

export async function ensureStorageLayout(config) {
  await ensureDir(config.intakeDir);
  await ensureDir(config.metadataDir);
  await ensureDir(config.queueDir);
  await ensureDir(config.locksDir);
  await ensureDir(config.multerTmpDir);

  if (!(await fileExists(config.queueFile))) {
    await writeJsonAtomic(config.queueFile, { jobs: [] });
  }
}

export async function enqueueUploadedWorksheet({
  config,
  worksheetId,
  title,
  ownerEmail,
  originalFilename,
  tempFilePath
}) {
  const lockKey = path.resolve(config.storageRoot);

  return withWriteLock(lockKey, async () => {
    const worksheetDir = path.join(config.intakeDir, worksheetId);
    await ensureDir(worksheetDir);

    const artifactAbsolutePath = path.join(worksheetDir, "original.zip");
    await moveFileSafe(tempFilePath, artifactAbsolutePath);

    const artifactRelativePath = path.posix.join("storage", "intake", worksheetId, "original.zip");
    const uploadedAt = new Date().toISOString();
    const metadata = {
      worksheet_id: worksheetId,
      title,
      owner_email: ownerEmail,
      original_filename: originalFilename,
      artifact_path: artifactRelativePath,
      state: "queued",
      uploaded_at: uploadedAt,
      integrated_at: null,
      last_error: null
    };

    const metadataPath = path.join(config.metadataDir, `${worksheetId}.json`);
    await writeJsonAtomic(metadataPath, metadata);

    const queue = await readJson(config.queueFile, { jobs: [] });
    if (!Array.isArray(queue.jobs)) {
      queue.jobs = [];
    }
    const nextJob = {
      worksheet_id: worksheetId,
      state: "queued",
      attempts: 0,
      queued_at: uploadedAt
    };
    const existingIndex = queue.jobs.findIndex((job) => job.worksheet_id === worksheetId);
    if (existingIndex >= 0) {
      queue.jobs[existingIndex] = { ...queue.jobs[existingIndex], ...nextJob };
    } else {
      queue.jobs.push(nextJob);
    }
    await writeJsonAtomic(config.queueFile, queue);

    return metadata;
  });
}

export async function getWorksheetStatus(config, worksheetId) {
  const metadataPath = path.join(config.metadataDir, `${worksheetId}.json`);
  const exists = await fileExists(metadataPath);
  if (!exists) {
    return null;
  }

  const metadata = await readJson(metadataPath, null);
  if (!metadata) {
    return null;
  }

  const queue = await readJson(config.queueFile, { jobs: [] });
  const queueEntry = Array.isArray(queue.jobs)
    ? queue.jobs.find((job) => job.worksheet_id === worksheetId)
    : null;

  const state =
    (typeof metadata.state === "string" && metadata.state.trim()) ||
    (typeof queueEntry?.state === "string" && queueEntry.state.trim()) ||
    "queued";

  return {
    worksheet_id: metadata.worksheet_id,
    state,
    uploaded_at: metadata.uploaded_at || null,
    integrated_at: metadata.integrated_at ?? null,
    last_error: metadata.last_error ?? null
  };
}
