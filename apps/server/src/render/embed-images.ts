import path from "node:path";
import sharp from "sharp";
import { config } from "../config";
import { sha1 } from "../lib/crypto";
import { logger } from "../lib/logger";
import { loadAssetImage, type StoredImage } from "../storage/assets";
import { fetchRemoteImage } from "../storage/remote-image";
import type { InlineImage } from "../providers/graph";

const SAFE_FILE = /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|gif|webp)$/i;
const MAX_IMAGES = 24;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
// Email bodies are ~600px wide; 1200px keeps images sharp on retina screens.
const EMAIL_MAX_WIDTH = 1200;
const OPTIMIZE_OVER_BYTES = 300 * 1024;
const OPTIMIZED_CACHE_MAX = 60;
const OPTIMIZED_CACHE_TTL_MS = 15 * 60 * 1000;

const ATTR_PATTERN = /(?<![\w-])(src|background)\s*=\s*(["'])(.*?)\2/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

type Source = { key: string; kind: "media"; file: string } | { key: string; kind: "remote"; url: string };
type ReadyImage = { content: Buffer; mime: string; filename: string };

const optimized = new Map<string, { at: number; image: ReadyImage }>();

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

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

function classify(rawUrl: string): Source | null {
  const url = decodeEntities(rawUrl.trim());
  const file = mediaFileName(url);
  if (file) return { key: `media:${file}`, kind: "media", file };
  if (!/^https?:\/\//i.test(url)) return null;
  // The open-tracking pixel must stay remote, otherwise opens are never seen.
  if (url.startsWith(config.trackingUrl)) return null;
  return { key: `remote:${url}`, kind: "remote", url };
}

function imageSourcesIn(html: string): Map<string, Source> {
  const sourceByRawUrl = new Map<string, Source>();
  for (const match of html.matchAll(ATTR_PATTERN)) {
    const raw = match[3];
    const source = raw ? classify(raw) : null;
    if (raw && source) sourceByRawUrl.set(raw, source);
  }
  for (const match of html.matchAll(CSS_URL_PATTERN)) {
    const raw = match[2];
    const source = raw ? classify(raw) : null;
    if (raw && source) sourceByRawUrl.set(raw, source);
  }
  return sourceByRawUrl;
}

export function mediaFilesIn(html: string): string[] {
  const files = new Set<string>();
  for (const source of imageSourcesIn(html).values()) if (source.kind === "media") files.add(source.file);
  return [...files];
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };

// Outlook desktop cannot display WebP, and very large images make messages
// heavy enough to be clipped or rejected, so everything is normalised to
// JPG/PNG/GIF at most EMAIL_MAX_WIDTH wide before it is attached.
async function emailSafe(image: StoredImage, baseName: string): Promise<ReadyImage> {
  const keep = (): ReadyImage => ({ content: image.content, mime: image.mime, filename: `${baseName}.${EXT[image.mime] ?? "img"}` });
  if (image.mime === "image/gif") return keep();
  const isWebp = image.mime === "image/webp";
  if (!isWebp && image.content.length <= OPTIMIZE_OVER_BYTES) return keep();
  try {
    const pipeline = sharp(image.content).rotate();
    const meta = await pipeline.metadata();
    if (meta.width && meta.width > EMAIL_MAX_WIDTH) pipeline.resize({ width: EMAIL_MAX_WIDTH, withoutEnlargement: true });
    // Large opaque PNGs are photos in practice; JPEG makes them several times
    // smaller. Images that really use transparency stay PNG.
    const asPng = Boolean(meta.hasAlpha) && !(await sharp(image.content).stats()).isOpaque;
    const content = asPng
      ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const mime = asPng ? "image/png" : "image/jpeg";
    if (!isWebp && content.length >= image.content.length) return keep();
    return { content, mime, filename: `${baseName}.${EXT[mime]}` };
  } catch (err) {
    logger.warn({ err, baseName }, "email image optimisation failed");
    return isWebp ? { content: image.content, mime: image.mime, filename: `${baseName}.webp` } : keep();
  }
}

async function loadSource(source: Source): Promise<ReadyImage | null> {
  const hit = optimized.get(source.key);
  if (hit && Date.now() - hit.at < OPTIMIZED_CACHE_TTL_MS) return hit.image;
  const raw = source.kind === "media" ? await loadAssetImage(source.file) : await fetchRemoteImage(source.url);
  if (!raw) return null;
  const baseName = source.kind === "media" ? path.parse(source.file).name : `image-${sha1(source.url).slice(0, 12)}`;
  const ready = await emailSafe(raw, baseName);
  if (optimized.size >= OPTIMIZED_CACHE_MAX) optimized.delete(optimized.keys().next().value!);
  optimized.delete(source.key);
  optimized.set(source.key, { at: Date.now(), image: ready });
  return ready;
}

export type ImageReport = { total: number; embedded: number; totalBytes: number; missing: string[] };

// Every image becomes an inline CID attachment of the message itself, so it is
// shown in Gmail, Outlook and Apple Mail without "download pictures" prompts and
// without the receiver needing to reach this server or the original host.
export async function embedUploadedImages(html: string): Promise<{ html: string; attachments: InlineImage[]; report: ImageReport }> {
  const sourceByRawUrl = imageSourcesIn(html);
  const unique = new Map<string, Source>();
  for (const source of sourceByRawUrl.values()) unique.set(source.key, source);
  const report: ImageReport = { total: unique.size, embedded: 0, totalBytes: 0, missing: [] };
  if (unique.size === 0) return { html, attachments: [], report };

  const attachments: InlineImage[] = [];
  const cidByKey = new Map<string, string>();
  for (const source of unique.values()) {
    const label = source.kind === "media" ? source.file : source.url;
    if (attachments.length >= MAX_IMAGES) {
      report.missing.push(`${label} (more than ${MAX_IMAGES} images)`);
      continue;
    }
    const image = await loadSource(source);
    if (!image) {
      report.missing.push(label);
      continue;
    }
    if (report.totalBytes + image.content.length > MAX_TOTAL_BYTES) {
      report.missing.push(`${label} (images exceed ${MAX_TOTAL_BYTES / 1024 / 1024} MB)`);
      continue;
    }
    report.totalBytes += image.content.length;
    const cid = `img${sha1(source.key).slice(0, 20)}`;
    cidByKey.set(source.key, cid);
    attachments.push({ filename: image.filename, content: image.content, cid, contentType: image.mime });
  }
  report.embedded = attachments.length;
  if (attachments.length === 0) return { html, attachments, report };

  const cidFor = (raw: string) => {
    const source = sourceByRawUrl.get(raw);
    return source ? cidByKey.get(source.key) : undefined;
  };
  const embedded = html
    .replace(ATTR_PATTERN, (whole, _name: string, quote: string, raw: string) => {
      const cid = cidFor(raw);
      return cid ? whole.replace(`${quote}${raw}${quote}`, `${quote}cid:${cid}${quote}`) : whole;
    })
    .replace(CSS_URL_PATTERN, (whole, quote: string, raw: string) => {
      const cid = cidFor(raw);
      return cid ? `url(${quote}cid:${cid}${quote})` : whole;
    });
  return { html: embedded, attachments, report };
}
