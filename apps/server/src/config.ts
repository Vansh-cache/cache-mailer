import fs from "fs";
import path from "path";
import dotenv from "dotenv";

function findRepoRoot(start: string): string {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, "docker-compose.yml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export const repoRoot = findRepoRoot(__dirname);

dotenv.config({ path: path.join(repoRoot, "apps", "server", ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function optional(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const encryptionKeyHex = required("ENCRYPTION_KEY");
if (!/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex)) {
  throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const jwtSecret = required("JWT_SECRET");
if (/[<>]/.test(jwtSecret)) throw new Error("JWT_SECRET still holds the .env.example placeholder");
if (isProduction && (/dev-only|change[-_ ]?this|secret/i.test(jwtSecret) || jwtSecret.length < 32)) {
  throw new Error("Refusing to start: JWT_SECRET must be a random value of at least 32 characters");
}
if (isProduction && (/^(.)\1+$/.test(encryptionKeyHex) || /0123456789abcdef0123456789abcdef/i.test(encryptionKeyHex))) {
  throw new Error("Refusing to start with a placeholder ENCRYPTION_KEY");
}

const WEAK_DB_PASSWORDS = new Set(["", "root", "mailer", "password", "admin", "123456", "changeme"]);

function assertProductionConfig(urls: Record<string, string>, databaseUrl: string): void {
  for (const [name, value] of Object.entries(urls)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${name} must be an absolute URL`);
    }
    if (parsed.protocol !== "https:") throw new Error(`${name} must use https in production`);
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) {
      throw new Error(`${name} must be a public host in production (receivers and browsers cannot reach ${parsed.hostname})`);
    }
  }
  let password = "";
  try {
    password = decodeURIComponent(new URL(databaseUrl).password);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (WEAK_DB_PASSWORDS.has(password.toLowerCase()) || password.length < 12 || /[<>]/.test(password)) {
    throw new Error("Refusing to start: the database password in DATABASE_URL is missing, a placeholder, or too weak");
  }
}

function resolveDir(envName: string, fallback: string): string {
  const raw = optional(envName);
  const dir = raw ? (path.isAbsolute(raw) ? raw : path.join(repoRoot, raw)) : path.join(repoRoot, fallback);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const config = {
  nodeEnv,
  apiPort: Number(process.env.API_PORT ?? 4000),
  trackingPort: Number(process.env.TRACKING_PORT ?? 4100),
  appUrl: optional("APP_URL") || "http://localhost:5173",
  trackingUrl: (optional("TRACKING_URL") || "http://127.0.0.1:4100").replace(/\/$/, ""),
  mediaUrl: (optional("MEDIA_URL") || "http://127.0.0.1:4000/media").replace(/\/$/, ""),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  encryptionKey: Buffer.from(encryptionKeyHex, "hex"),
  msTenantId: optional("MS_TENANT_ID"),
  msClientId: optional("MS_CLIENT_ID"),
  msClientSecret: optional("MS_CLIENT_SECRET"),
  zohoAccountsUrl: (optional("ZOHO_ACCOUNTS_URL") || "https://accounts.zoho.in").replace(/\/$/, ""),
  zohoApiUrl: (optional("ZOHO_API_URL") || "https://www.zohoapis.in").replace(/\/$/, ""),
  zohoClientId: optional("ZOHO_CLIENT_ID"),
  zohoClientSecret: optional("ZOHO_CLIENT_SECRET"),
  zohoRedirectUri: optional("ZOHO_REDIRECT_URI") || "http://127.0.0.1:4000/api/zoho/callback",
  uploadDir: resolveDir("UPLOAD_DIR", path.join("data", "uploads")),
  backupDir: resolveDir("BACKUP_DIR", path.join("data", "backups")),
  companyWebsite: optional("COMPANY_WEBSITE") || "https://cachedigitech.com",
  sendDelayMinMs: Number(process.env.SEND_DELAY_MIN_MS ?? (nodeEnv === "production" ? 2000 : 0)),
  sendDelayMaxMs: Number(process.env.SEND_DELAY_MAX_MS ?? (nodeEnv === "production" ? 8000 : 0)),
  workerId: optional("WORKER_ID") || `worker-${process.pid}`,
};

if (isProduction) {
  assertProductionConfig(
    { APP_URL: config.appUrl, TRACKING_URL: config.trackingUrl, MEDIA_URL: config.mediaUrl },
    config.databaseUrl,
  );
}

export function graphConfigured(): boolean {
  return Boolean(config.msTenantId && config.msClientId && config.msClientSecret);
}

export function zohoConfigured(): boolean {
  return Boolean(config.zohoClientId && config.zohoClientSecret);
}
