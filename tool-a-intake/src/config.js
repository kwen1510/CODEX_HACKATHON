import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

function resolveStorageRoot(input) {
  if (!input) {
    return path.join(APP_ROOT, "storage");
  }
  if (path.isAbsolute(input)) {
    return input;
  }
  return path.resolve(APP_ROOT, input);
}

export function buildConfig(overrides = {}) {
  const storageRoot = resolveStorageRoot(
    overrides.storageRoot || process.env.TOOL_A_STORAGE_ROOT || null
  );

  return {
    appRoot: APP_ROOT,
    storageRoot,
    intakeDir: path.join(storageRoot, "intake"),
    metadataDir: path.join(storageRoot, "metadata"),
    queueDir: path.join(storageRoot, "queue"),
    queueFile: path.join(storageRoot, "queue", "pending.json"),
    locksDir: path.join(storageRoot, "locks"),
    multerTmpDir: path.join(storageRoot, "locks", "multer-tmp"),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024),
    port: Number(process.env.PORT || 8787)
  };
}
