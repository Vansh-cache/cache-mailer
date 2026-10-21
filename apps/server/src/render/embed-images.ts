import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { sha1 } from "../lib/crypto";
import { detectImage } from "../storage/local";
import type { InlineImage } from "../providers/graph";

const IMG_SRC = /(<img[^>]+src\s*=\s*)(["'])(.*?)\2/gi;
const SAFE_FILE = /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp)$/i;
const MAX_IMAGES = 12;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

function mediaFileName(src: string): string | null {
  const index = src.indexOf("/media/");
  if (index === -1) return null;
  const raw = src.slice(index + "/media/".length).split(/[?#\s"']/, 1)[0] ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const base = path.basename(decoded);
  return SAFE_FILE.test(base) ? base : null;
}

// Uploaded images are normally linked as remote /media URLs, which only load
// for receivers who can reach the server. Embedding them as inline CID
// attachments makes them part of the message itself, so they display in every
// mail client without depending on the media URL being public.
export async function embedUploadedImages(html: string): Promise<{ html: string; attachments: InlineImage[] }> {
  const fileBySrc = new Map<string, string>();
  for (const match of html.matchAll(IMG_SRC)) {
    const src = match[3];
    if (!src) continue;
    const file = mediaFileName(src);
    if (file) fileBySrc.set(src, file);
  }
  if (fileBySrc.size === 0) return { html, attachments: [] };

  const attachments: InlineImage[] = [];
  const cidByFile = new Map<string, string>();
  let totalBytes = 0;
  for (const file of new Set(fileBySrc.values())) {
    if (attachments.length >= MAX_IMAGES || totalBytes >= MAX_TOTAL_BYTES) break;
    try {
      const content = await fs.promises.readFile(path.join(config.uploadDir, file));
      const detected = detectImage(content);
      if (!detected) continue;
      totalBytes += content.length;
      const cid = `img${sha1(file).slice(0, 20)}`;
      cidByFile.set(file, cid);
      attachments.push({ filename: file, content, cid, contentType: detected.mime });
    } catch {
      // File missing on this server - leave the remote URL as a fallback.
    }
  }
  if (attachments.length === 0) return { html, attachments: [] };

  const embedded = html.replace(IMG_SRC, (whole, prefix: string, quote: string, src: string) => {
    const file = fileBySrc.get(src);
    const cid = file ? cidByFile.get(file) : undefined;
    return cid ? `${prefix}${quote}cid:${cid}${quote}` : whole;
  });
  return { html: embedded, attachments };
}
