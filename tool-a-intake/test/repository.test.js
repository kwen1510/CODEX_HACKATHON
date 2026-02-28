import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildConfig } from "../src/config.js";
import { writeJsonAtomic } from "../src/fs-json.js";
import { generateWorksheetId } from "../src/id.js";
import { enqueueUploadedWorksheet, ensureStorageLayout, getWorksheetStatus } from "../src/repository.js";

function emptyZipBuffer() {
  const header = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const tail = Buffer.alloc(18, 0x00);
  return Buffer.concat([header, tail]);
}

async function withTempStorage(fn) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tool-a-intake-"));
  try {
    const config = buildConfig({ storageRoot: path.join(tmpRoot, "storage") });
    await ensureStorageLayout(config);
    await fn({ config, tmpRoot });
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

test("generateWorksheetId follows ws_<YYYYMMDD>_<6hex>", () => {
  const id = generateWorksheetId(new Date("2026-02-28T10:00:00Z"));
  assert.match(id, /^ws_20260228_[a-f0-9]{6}$/);
});

test("writeJsonAtomic writes full valid json", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tool-a-intake-json-"));
  try {
    const file = path.join(tmpRoot, "sample.json");
    await writeJsonAtomic(file, { ok: true, list: [1, 2, 3] });
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, { ok: true, list: [1, 2, 3] });
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("enqueueUploadedWorksheet stores artifact, metadata, and queue", async () => {
  await withTempStorage(async ({ config, tmpRoot }) => {
    const worksheetId = "ws_20260228_ab12cd";
    const tempUpload = path.join(tmpRoot, "upload.tmp");
    await fs.writeFile(tempUpload, emptyZipBuffer());

    const metadata = await enqueueUploadedWorksheet({
      config,
      worksheetId,
      title: "My Worksheet",
      ownerEmail: "teacher@example.com",
      originalFilename: "worksheet.zip",
      tempFilePath: tempUpload
    });

    assert.equal(metadata.worksheet_id, worksheetId);
    assert.equal(metadata.state, "queued");
    assert.equal(metadata.artifact_path, "storage/intake/ws_20260228_ab12cd/original.zip");

    const artifactPath = path.join(config.intakeDir, worksheetId, "original.zip");
    await fs.access(artifactPath);

    const metadataPath = path.join(config.metadataDir, `${worksheetId}.json`);
    const metadataDisk = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    assert.equal(metadataDisk.worksheet_id, worksheetId);
    assert.equal(metadataDisk.original_filename, "worksheet.zip");

    const queue = JSON.parse(await fs.readFile(config.queueFile, "utf8"));
    assert.equal(queue.jobs.length, 1);
    assert.equal(queue.jobs[0].worksheet_id, worksheetId);
    assert.equal(queue.jobs[0].state, "queued");
  });
});

test("getWorksheetStatus returns queued info for existing worksheet", async () => {
  await withTempStorage(async ({ config, tmpRoot }) => {
    const worksheetId = "ws_20260228_deadbe";
    const tempUpload = path.join(tmpRoot, "upload.tmp");
    await fs.writeFile(tempUpload, emptyZipBuffer());

    await enqueueUploadedWorksheet({
      config,
      worksheetId,
      title: null,
      ownerEmail: null,
      originalFilename: "worksheet.zip",
      tempFilePath: tempUpload
    });

    const status = await getWorksheetStatus(config, worksheetId);
    assert.equal(status.worksheet_id, worksheetId);
    assert.equal(status.state, "queued");
    assert.equal(status.integrated_at, null);
    assert.equal(status.last_error, null);
    assert.ok(status.uploaded_at);
  });
});

test("enqueueUploadedWorksheet upserts queue entry instead of duplicating worksheet rows", async () => {
  await withTempStorage(async ({ config, tmpRoot }) => {
    const worksheetId = "ws_20260228_c0ffee";
    const tempUploadA = path.join(tmpRoot, "upload-a.tmp");
    await fs.writeFile(tempUploadA, emptyZipBuffer());

    await enqueueUploadedWorksheet({
      config,
      worksheetId,
      title: "First",
      ownerEmail: "a@example.com",
      originalFilename: "worksheet-a.zip",
      tempFilePath: tempUploadA
    });

    const tempUploadB = path.join(tmpRoot, "upload-b.tmp");
    await fs.writeFile(tempUploadB, emptyZipBuffer());

    await enqueueUploadedWorksheet({
      config,
      worksheetId,
      title: "Second",
      ownerEmail: "b@example.com",
      originalFilename: "worksheet-b.zip",
      tempFilePath: tempUploadB
    });

    const queue = JSON.parse(await fs.readFile(config.queueFile, "utf8"));
    const entries = queue.jobs.filter((job) => job.worksheet_id === worksheetId);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].state, "queued");
    assert.equal(entries[0].attempts, 0);
  });
});

test("getWorksheetStatus prefers metadata state over stale queue state", async () => {
  await withTempStorage(async ({ config, tmpRoot }) => {
    const worksheetId = "ws_20260228_feed01";
    const tempUpload = path.join(tmpRoot, "upload.tmp");
    await fs.writeFile(tempUpload, emptyZipBuffer());

    await enqueueUploadedWorksheet({
      config,
      worksheetId,
      title: null,
      ownerEmail: null,
      originalFilename: "worksheet.zip",
      tempFilePath: tempUpload
    });

    const metadataPath = path.join(config.metadataDir, `${worksheetId}.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.state = "queued";
    await writeJsonAtomic(metadataPath, metadata);

    const queue = JSON.parse(await fs.readFile(config.queueFile, "utf8"));
    queue.jobs = queue.jobs.map((job) =>
      job.worksheet_id === worksheetId ? { ...job, state: "failed" } : job
    );
    await writeJsonAtomic(config.queueFile, queue);

    const status = await getWorksheetStatus(config, worksheetId);
    assert.equal(status.state, "queued");
  });
});
