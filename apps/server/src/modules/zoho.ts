import { Router } from "express";
import { z } from "zod";
import { config, zohoConfigured } from "../config";
import { prisma } from "../db";
import { AppError } from "../errors";
import { decrypt, encrypt, randomToken } from "../lib/crypto";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { notifyAdmins } from "../lib/notify";
import { getSetting, putSetting } from "../lib/settings";
import { send } from "../http";
import { requireRoles } from "../middleware/auth";
import { wrap } from "../middleware/error";

const SECRET = "zoho_refresh_token";
const LOCK = "zoho_lock";

type ZohoRow = Record<string, unknown>;

function zohoText(row: ZohoRow, key: string | undefined): string | null {
  if (!key) return null;
  const value = row[key];
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "name" in value && typeof (value as { name: unknown }).name === "string") {
    return (value as { name: string }).name;
  }
  return null;
}

async function accessToken(): Promise<string> {
  if (!zohoConfigured()) throw new AppError(400, "Zoho client id and secret are not configured");
  const secret = await prisma.integrationSecret.findUnique({ where: { name: SECRET } });
  if (!secret) throw new AppError(400, "Zoho is not connected");
  const refreshToken = decrypt(Buffer.from(secret.valueEncrypted));
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.zohoClientId,
    client_secret: config.zohoClientSecret,
    grant_type: "refresh_token",
  });
  const response = await fetch(`${config.zohoAccountsUrl}/oauth/v2/token`, { method: "POST", body });
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!json.access_token) throw new AppError(502, json.error || "Zoho token refresh failed");
  return json.access_token;
}

async function upsertRow(module: "contacts" | "leads", row: ZohoRow, map: Record<string, string>): Promise<void> {
  const email = normalizeEmail(zohoText(row, map.email) ?? "");
  if (!isValidEmail(email)) return;
  const zohoId = String(row.id ?? "");
  const optOut = row.Email_Opt_Out === true;
  const data = {
    email,
    firstName: zohoText(row, map.first_name),
    lastName: zohoText(row, map.last_name),
    company: zohoText(row, map.company),
    jobTitle: zohoText(row, map.job_title),
    source: "zoho",
    zohoId,
    zohoModule: module,
  };
  const existing = zohoId
    ? await prisma.contact.findFirst({ where: { zohoId, zohoModule: module } })
    : null;
  const byEmail = existing ?? (await prisma.contact.findUnique({ where: { email } }));
  if (!byEmail) {
    await prisma.contact.create({
      data: { ...data, status: optOut ? "unsubscribed" : "active" },
    });
  } else if (byEmail.status === "active" || optOut) {
    await prisma.contact.update({
      where: { id: byEmail.id },
      data: { ...data, status: optOut ? "unsubscribed" : byEmail.status },
    });
  } else {
    await prisma.contact.update({
      where: { id: byEmail.id },
      data: { zohoId, zohoModule: module, source: "zoho" },
    });
  }
  if (optOut) {
    await prisma.suppression.upsert({
      where: { email },
      update: { reason: "zoho_optout" },
      create: { email, reason: "zoho_optout" },
    });
  }
}

async function pullModule(module: "contacts" | "leads", token: string): Promise<void> {
  const map = JSON.parse(await getSetting("zoho_field_map")) as { contacts: Record<string, string>; leads: Record<string, string> };
  const fieldMap = map[module];
  const state = await prisma.zohoSyncState.findUnique({ where: { module } });
  const resource = module === "contacts" ? "Contacts" : "Leads";
  let page = 1;
  let newest: Date | null = state?.lastModifiedTime ?? null;
  while (page <= 50) {
    const url = new URL(`${config.zohoApiUrl}/crm/v6/${resource}${state?.lastModifiedTime ? "/search" : ""}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "200");
    if (state?.lastModifiedTime) {
      const stamp = state.lastModifiedTime.toISOString().replace(/\.\d{3}Z$/, "+00:00");
      url.searchParams.set("criteria", `(Modified_Time:greater_than:${stamp})`);
    } else {
      url.searchParams.set("fields", "Email,First_Name,Last_Name,Last_Name,Title,Account_Name,Company,Designation,Email_Opt_Out,Modified_Time,id");
    }
    const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (response.status === 204) break;
    const json = (await response.json()) as { data?: ZohoRow[]; message?: string };
    if (!response.ok) throw new AppError(502, json.message || `Zoho ${resource} sync failed`);
    const rows = json.data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      await upsertRow(module, row, fieldMap);
      if (typeof row.Modified_Time === "string") {
        const modified = new Date(row.Modified_Time);
        if (!newest || modified > newest) newest = modified;
      }
    }
    if (rows.length < 200) break;
    page += 1;
  }
  await prisma.zohoSyncState.upsert({
    where: { module },
    update: { lastModifiedTime: newest, lastRunAt: new Date(), lastStatus: "ok", lastError: null },
    create: { module, lastModifiedTime: newest, lastRunAt: new Date(), lastStatus: "ok" },
  });
}

export async function runZohoSync(): Promise<{ ok: boolean; error?: string }> {
  // Zoho is optional. Until it is configured AND connected, sync is disabled:
  // return quietly without recording an error or emailing the admins.
  if (!zohoConfigured()) return { ok: false, error: "Zoho is not configured" };
  const connected = await prisma.integrationSecret.findUnique({ where: { name: SECRET } });
  if (!connected) return { ok: false, error: "Zoho is not connected" };
  const lock = await getSetting(LOCK);
  if (lock && Date.now() - new Date(lock).getTime() < 10 * 60 * 1000) {
    return { ok: false, error: "Sync already running" };
  }
  await putSetting(LOCK, new Date().toISOString());
  try {
    const token = await accessToken();
    await pullModule("contacts", token);
    await pullModule("leads", token);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zoho sync failed";
    logger.error({ err: error }, "zoho sync failed");
    let shouldNotify = false;
    for (const module of ["contacts", "leads"] as const) {
      const previous = await prisma.zohoSyncState.findUnique({ where: { module } });
      await prisma.zohoSyncState.upsert({
        where: { module },
        update: { lastRunAt: new Date(), lastStatus: "error", lastError: message },
        create: { module, lastRunAt: new Date(), lastStatus: "error", lastError: message },
      });
      if (previous?.lastStatus === "error") shouldNotify = true;
    }
    if (shouldNotify) await notifyAdmins("Zoho sync failed", message);
    return { ok: false, error: message };
  } finally {
    await putSetting(LOCK, "");
  }
}

export const zohoRouter = Router();

zohoRouter.get(
  "/status",
  wrap(async (_req, res) => {
    const [states, secret] = await Promise.all([
      prisma.zohoSyncState.findMany(),
      prisma.integrationSecret.findUnique({ where: { name: SECRET } }),
    ]);
    send(res, 200, { configured: zohoConfigured(), connected: Boolean(secret), states });
  }),
);

zohoRouter.get(
  "/auth-url",
  requireRoles("admin"),
  wrap(async (_req, res) => {
    if (!zohoConfigured()) throw new AppError(400, "Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET first");
    const state = randomToken();
    await putSetting("zoho_oauth_state", state);
    const url = new URL(`${config.zohoAccountsUrl}/oauth/v2/auth`);
    url.searchParams.set("scope", "ZohoCRM.modules.contacts.READ,ZohoCRM.modules.leads.READ");
    url.searchParams.set("client_id", config.zohoClientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("redirect_uri", config.zohoRedirectUri);
    url.searchParams.set("state", state);
    send(res, 200, { url: url.toString() });
  }),
);

zohoRouter.get(
  "/callback",
  requireRoles("admin"),
  wrap(async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const expected = await getSetting("zoho_oauth_state");
    if (!code || !state || state !== expected) throw new AppError(400, "Zoho authorization did not match");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.zohoClientId,
      client_secret: config.zohoClientSecret,
      redirect_uri: config.zohoRedirectUri,
      code,
    });
    const response = await fetch(`${config.zohoAccountsUrl}/oauth/v2/token`, { method: "POST", body });
    const json = (await response.json()) as { refresh_token?: string; error?: string };
    if (!json.refresh_token) throw new AppError(502, json.error || "Zoho did not return a refresh token");
    await prisma.integrationSecret.upsert({
      where: { name: SECRET },
      update: { valueEncrypted: Uint8Array.from(encrypt(json.refresh_token)) },
      create: { name: SECRET, valueEncrypted: Uint8Array.from(encrypt(json.refresh_token)) },
    });
    res.redirect(`${config.appUrl}/settings?zoho=connected`);
  }),
);

zohoRouter.post(
  "/sync",
  requireRoles("admin", "marketing"),
  wrap(async (_req, res) => {
    const result = await runZohoSync();
    send(res, result.ok ? 200 : 409, result);
  }),
);

zohoRouter.put(
  "/mapping",
  requireRoles("admin"),
  wrap(async (req, res) => {
    const body = z.object({ contacts: z.record(z.string(), z.string()), leads: z.record(z.string(), z.string()) }).parse(req.body);
    await putSetting("zoho_field_map", JSON.stringify(body));
    send(res, 200, { ok: true });
  }),
);
