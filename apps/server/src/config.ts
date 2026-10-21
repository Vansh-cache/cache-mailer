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
const jwtSecret = required("JWT_SECRET");
if (nodeEnv === "production" && jwtSecret.includes("dev-only")) {
  throw new Error("Refusing to start with the development JWT secret");
}
if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("Refusing to start with a JWT secret shorter than 32 characters");
}
if (
  nodeEnv === "production" &&
  encryptionKeyHex.toLowerCase() === "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
) {
  throw new Error("Refusing to start with the example ENCRYPTION_KEY from .env.example");
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

export function graphConfigured(): boolean {
  return Boolean(config.msTenantId && config.msClientId && config.msClientSecret);
}

export function zohoConfigured(): boolean {
  return Boolean(config.zohoClientId && config.zohoClientSecret);
}
