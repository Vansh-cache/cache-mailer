import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { encrypt } from "../lib/crypto";
import { getSetting, putSetting } from "../lib/settings";
import { SMTP_PASSWORD_SECRET, smtpPasswordSet } from "../providers/smtp";
import { send } from "../http";
import { requireRoles } from "../middleware/auth";
import { wrap } from "../middleware/error";

export const systemRouter = Router();

systemRouter.get(
  "/audit",
  requireRoles("admin"),
  wrap(async (_req, res) => {
    const rows = await prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 200 });
    const ids = [...new Set(rows.flatMap((row) => (row.userId == null ? [] : [row.userId])))];
    const users = ids.length === 0 ? [] : await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(users.map((user) => [String(user.id), user.name]));
    send(res, 200, {
      entries: rows.map((row) => ({
        id: Number(row.id),
        action: row.action,
        actor: row.userId == null ? "System" : names.get(String(row.userId)) ?? "Removed user",
        detail: auditDetail(row.meta),
        createdAt: row.createdAt,
      })),
    });
  }),
);

function auditDetail(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  return Object.entries(meta as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 80)}`)
    .join(" · ");
}

systemRouter.get(
  "/health",
  requireRoles("admin"),
  wrap(async (_req, res) => {
    let db = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = false;
    }
    const beat = await getSetting("worker_heartbeat");
    const workerOk = Boolean(beat) && Date.now() - new Date(beat).getTime() < 120_000;
    const [queued, processing, zoho] = await Promise.all([
      prisma.campaignRecipient.count({ where: { status: "queued" } }),
      prisma.campaignRecipient.count({ where: { status: "processing" } }),
      prisma.zohoSyncState.findMany(),
    ]);
    const ok = db && workerOk;
    send(res, ok ? 200 : 503, {
      ok,
      db,
      worker: { lastSeen: beat || null, ok: workerOk },
      queue: { queued, processing },
      zoho,
    });
  }),
);

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const keys = [
      "company_name",
      "company_address",
      "default_footer",
      "bounce_pause_threshold",
      "bounce_pause_min_sends",
      "smtp_host",
      "smtp_port",
      "smtp_secure",
      "smtp_email",
      "smtp_from_name",
    ];
    const [entries, passwordSet] = await Promise.all([
      Promise.all(keys.map(async (key) => [key, await getSetting(key)] as const)),
      smtpPasswordSet(),
    ]);
    send(res, 200, { settings: Object.fromEntries(entries), smtpPasswordSet: passwordSet });
  }),
);

settingsRouter.put(
  "/",
  requireRoles("admin"),
  wrap(async (req, res) => {
    const body = z
      .object({
        company_name: z.string().min(1).max(120).optional(),
        company_address: z.string().min(1).max(500).optional(),
        default_footer: z.string().max(1000).optional(),
        bounce_pause_threshold: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        bounce_pause_min_sends: z.string().regex(/^\d+$/).optional(),
        smtp_host: z.string().min(1).max(255).optional(),
        smtp_port: z.string().regex(/^\d+$/).optional(),
        smtp_secure: z.enum(["true", "false"]).optional(),
        smtp_email: z.string().email().or(z.literal("")).optional(),
        smtp_from_name: z.string().max(100).optional(),
        smtp_password: z.string().min(1).max(512).optional(),
        smtp_clear_password: z.boolean().optional(),
      })
      .parse(req.body);
    const { smtp_password: smtpPassword, smtp_clear_password: clearSmtpPassword, ...values } = body;
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) await putSetting(key, value);
    }
    if (clearSmtpPassword) {
      await prisma.integrationSecret.deleteMany({ where: { name: SMTP_PASSWORD_SECRET } });
    } else if (smtpPassword) {
      const encrypted = Uint8Array.from(encrypt(smtpPassword));
      await prisma.integrationSecret.upsert({
        where: { name: SMTP_PASSWORD_SECRET },
        update: { valueEncrypted: encrypted },
        create: { name: SMTP_PASSWORD_SECRET, valueEncrypted: encrypted },
      });
    }
    await audit(req.user!.id, "settings.update", "settings", null, {
      ...values,
      smtp_password_changed: Boolean(smtpPassword),
      smtp_password_cleared: Boolean(clearSmtpPassword),
    });
    send(res, 200, { ok: true });
  }),
);
