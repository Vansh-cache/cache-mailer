import crypto from "crypto";
import { config } from "../config";

export function encrypt(plain: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decrypt(payload: Buffer): string {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", config.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function randomToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`${ip}|${config.encryptionKey.toString("hex")}`).digest("hex");
}

export function sha1(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
