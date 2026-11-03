import path from "node:path";
import { sha1 } from "../lib/crypto";
import { loadAssetImage } from "../storage/assets";
import type { InlineImage } from "../providers/graph";

const SAFE_FILE = /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp)$/i;
const MAX_IMAGES = 24;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

// Matches src="..." and background="..." attributes pointing to media assets
const MEDIA_SRC_PATTERN = /(?:src|background|background-url)\s*=\s*(["'])([^"']*?\/media\/[^"']*?)\1/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'"\)]*?\/media\/[^'"\)]*?)\1\s*\)/gi;

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

// Uploaded images are stored as host-independent /media paths on the server.
// Embedding them as inline CID attachments makes them part of the template body
// in the message itself, so they display in every mail client (Gmail, Outlook,
// Apple Mail) without depending on remote server URLs being publicly reachable.
function mediaUrlsIn(html: string): Map<string, string> {
  const fileByMatchedUrl = new Map<string, string>();
  for (const pattern of [MEDIA_SRC_PATTERN, CSS_URL_PATTERN]) {
    for (const match of html.matchAll(pattern)) {
      const rawUrl = match[2];
      const file = rawUrl ? mediaFileName(rawUrl) : null;
      if (rawUrl && file) fileByMatchedUrl.set(rawUrl, file);
    }
  }
  return fileByMatchedUrl;
}

export function mediaFilesIn(html: string): string[] {
  return [...new Set(mediaUrlsIn(html).values())];
}

export async function embedUploadedImages(html: string): Promise<{ html: string; attachments: InlineImage[] }> {
  const fileByMatchedUrl = mediaUrlsIn(html);
  if (fileByMatchedUrl.size === 0) return { html, attachments: [] };

  const attachments: InlineImage[] = [];
  const cidByFile = new Map<string, string>();
  let totalBytes = 0;

  for (const file of new Set(fileByMatchedUrl.values())) {
    if (attachments.length >= MAX_IMAGES || totalBytes >= MAX_TOTAL_BYTES) break;
    // Missing from both disk and database - leave the remote URL as a fallback.
    const image = await loadAssetImage(file);
    if (!image) continue;
    totalBytes += image.content.length;
    const cid = `img${sha1(file).slice(0, 20)}`;
    cidByFile.set(file, cid);
    attachments.push({ filename: file, content: image.content, cid, contentType: image.mime });
  }

  if (attachments.length === 0) return { html, attachments: [] };

  let embedded = html.replace(MEDIA_SRC_PATTERN, (whole, quote: string, rawUrl: string) => {
    const file = fileByMatchedUrl.get(rawUrl);
    const cid = file ? cidByFile.get(file) : undefined;
    if (!cid) return whole;
    const prefix = whole.slice(0, whole.indexOf(quote));
    return `${prefix}${quote}cid:${cid}${quote}`;
  });

  embedded = embedded.replace(CSS_URL_PATTERN, (whole, quote: string, rawUrl: string) => {
    const file = fileByMatchedUrl.get(rawUrl);
    const cid = file ? cidByFile.get(file) : undefined;
    if (!cid) return whole;
    return `url(${quote}cid:${cid}${quote})`;
  });

  return { html: embedded, attachments };
}
