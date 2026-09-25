import crypto from "node:crypto";

function getKey() {
  const secret = process.env.GOOGLE_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string) {
  const key = getKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string) {
  const key = getKey();
  if (!key) return payload;
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
