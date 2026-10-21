import fs from "fs";
import path from "path";
import sharp from "sharp";
import { config } from "../config";
import { randomToken } from "../lib/crypto";

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function detectImage(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString() === "GIF87a" || buffer.subarray(0, 6).toString() === "GIF89a")) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export async function saveImage(buffer: Buffer): Promise<{ fileName: string; url: string; sizeBytes: number }> {
  const detected = detectImage(buffer);
  if (!detected || !TYPES[detected.mime]) {
    throw new Error("Only JPG, PNG, GIF, and WebP images are allowed");
  }
  const image = sharp(buffer, { animated: detected.mime === "image/gif" }).rotate();
  const meta = await image.metadata();
  const width = meta.width && meta.width > 1600 ? 1600 : undefined;
  let output: Buffer;
  if (detected.mime === "image/gif") output = await image.toBuffer();
  else if (detected.mime === "image/png") output = await image.resize({ width, withoutEnlargement: true }).png().toBuffer();
  else if (detected.mime === "image/webp") output = await image.resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  else output = await image.resize({ width, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();

  const fileName = `${randomToken()}.${detected.ext}`;
  await fs.promises.mkdir(config.uploadDir, { recursive: true });
  await fs.promises.writeFile(path.join(config.uploadDir, fileName), output);
  return { fileName, url: `${config.mediaUrl}/${fileName}`, sizeBytes: output.length };
}
