import dns from "node:dns/promises";
import net from "node:net";
import sharp from "sharp";
import { logger } from "../lib/logger";
import { detectImage } from "./local";
import type { StoredImage } from "./assets";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;

const cache = new Map<string, { at: number; image: StoredImage | null }>();

function isPrivateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);
  return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

async function publicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return !isPrivateAddress(host);
  const addresses = await dns.lookup(host, { all: true }).catch(() => []);
  return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
}

async function readCapped(response: Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const MAX_SVG_BYTES = 512 * 1024;

// Gmail and Outlook do not render SVG, so self-contained SVGs (e.g. placeholder
// services) are turned into PNG. SVGs that script or reference other resources
// are refused rather than rendered.
async function rasterizeSvg(content: Buffer): Promise<StoredImage | null> {
  if (content.length > MAX_SVG_BYTES) return null;
  const text = content.toString("utf8");
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) return null;
  if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|\bon\w+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) return null;
  try {
    const png = await sharp(content, { density: 144, limitInputPixels: 40_000_000 })
      .resize({ width: 1200, withoutEnlargement: true })
      .png()
      .toBuffer();
    return { content: png, mime: "image/png" };
  } catch {
    return null;
  }
}

// Downloads an image referenced by URL so it can be embedded in the message.
// Only public hosts are fetched (no internal/metadata addresses), redirects are
// re-checked, and the response must really be a JPG/PNG/GIF/WebP.
async function download(rawUrl: string): Promise<StoredImage | null> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (!(await publicHost(url.hostname))) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/png,image/jpeg,image/gif,image/webp,image/*;q=0.8" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) return null;
    const content = await readCapped(response);
    if (!content) return null;
    const detected = detectImage(content);
    if (detected) return { content, mime: detected.mime };
    return rasterizeSvg(content);
  }
  return null;
}

export async function fetchRemoteImage(rawUrl: string): Promise<StoredImage | null> {
  const hit = cache.get(rawUrl);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.image;
  const image = await download(rawUrl).catch((err) => {
    logger.warn({ err, url: rawUrl.slice(0, 200) }, "remote image fetch failed");
    return null;
  });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(rawUrl, { at: Date.now(), image });
  return image;
}
