import crypto from "node:crypto";

function formatUtcDate(now) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateWorksheetId(now = new Date()) {
  const datePart = formatUtcDate(now);
  const randomPart = crypto.randomBytes(4).toString("hex").slice(0, 6);
  return `ws_${datePart}_${randomPart}`;
}

export function isWorksheetId(value) {
  return typeof value === "string" && /^ws_\d{8}_[a-f0-9]{6}$/i.test(value);
}
