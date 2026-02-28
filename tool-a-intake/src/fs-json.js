import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(tempPath, data, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function moveFileSafe(sourcePath, destinationPath) {
  await ensureDir(path.dirname(destinationPath));
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (error && error.code === "EXDEV") {
      await fs.copyFile(sourcePath, destinationPath);
      await fs.unlink(sourcePath);
      return;
    }
    throw error;
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
