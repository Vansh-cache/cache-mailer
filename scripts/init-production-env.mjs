#!/usr/bin/env node
// Creates .env.production from .env.production.example with fresh random secrets.
// Usage: node scripts/init-production-env.mjs <domain> <acme-email|--local-certs> [https-port]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".env.production");
const [domain, acme, httpsPort = "443"] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!domain || !acme) fail("Usage: node scripts/init-production-env.mjs <domain> <acme-email|--local-certs> [https-port]");
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) fail(`"${domain}" is not a valid public hostname`);
if (acme !== "--local-certs" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acme)) fail(`"${acme}" is not a valid email address`);
if (!/^\d{1,5}$/.test(httpsPort)) fail(`"${httpsPort}" is not a valid port`);
if (fs.existsSync(target)) fail(".env.production already exists. Delete it first if you really want new secrets (this invalidates sessions and stored mailbox passwords).");

// Hex/base64url only: safe inside DATABASE_URL without escaping.
const secret = (bytes) => crypto.randomBytes(bytes).toString("base64url");
const origin = httpsPort === "443" ? `https://${domain}` : `https://${domain}:${httpsPort}`;
const values = {
  APP_DOMAIN: domain,
  CADDY_GLOBAL_OPTIONS: acme === "--local-certs" ? "local_certs" : `email ${acme}`,
  HTTPS_PORT: httpsPort,
  APP_URL: origin,
  TRACKING_URL: origin,
  MEDIA_URL: `${origin}/media`,
  ZOHO_REDIRECT_URI: `${origin}/api/zoho/callback`,
  MYSQL_ROOT_PASSWORD: secret(24),
  MYSQL_PASSWORD: secret(24),
  JWT_SECRET: secret(48),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
};

const template = fs.readFileSync(path.join(root, ".env.production.example"), "utf8");
const output = template
  .split(/\r?\n/)
  .map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    return match && match[1] in values ? `${match[1]}=${values[match[1]]}` : line;
  })
  .join("\n");

fs.writeFileSync(target, output, { mode: 0o600 });
console.log(`Wrote ${path.relative(process.cwd(), target)} for ${origin}`);
console.log("Next: docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build");
