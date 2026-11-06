import { Router } from "express";
import { z } from "zod";
import { graphConfigured } from "../config";
import { prisma } from "../db";
import { AppError, assertNever } from "../errors";
import { audit } from "../lib/audit";
import { normalizeEmail } from "../lib/email";
import { getSetting } from "../lib/settings";
import { send } from "../http";
import { assertSenderAccess, assertTeam, senderWhere, teamFilter } from "../lib/team";
import { requireRoles } from "../middleware/auth";
import { wrap } from "../middleware/error";
import { graphCheck } from "../providers/graph";
import { sendMail } from "../providers/mail";
import { deleteMailboxSmtpPassword, mailboxPasswordFlags, mailboxSmtpSecretName, saveMailboxSmtpPassword, smtpConfigForMailbox, smtpPasswordSet, smtpVerify } from "../providers/smtp";
import { quotaAllows } from "../workers/quota";

export const sendersRouter = Router();

const smtpFields = {
  smtpHost: z.string().trim().min(1).max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpPassword: z.string().min(1).max(512).optional(),
};

type SmtpSource = "mailbox" | "settings" | "missing";

async function sharedSmtpLogin(): Promise<{ email: string; ready: boolean }> {
  const [email, ready] = await Promise.all([getSetting("smtp_email"), smtpPasswordSet()]);
  return { email: normalizeEmail(email), ready };
}

function smtpSource(
  sender: { id: bigint; fromEmail: string; smtpHost: string | null; smtpPort: number | null },
  saved: Set<string>,
  shared: { email: string; ready: boolean },
): SmtpSource {
  const own = Boolean(sender.smtpHost?.trim() && sender.smtpPort && saved.has(mailboxSmtpSecretName(sender.id)));
  if (own) return "mailbox";
  if (shared.ready && shared.email === normalizeEmail(sender.fromEmail)) return "settings";
  return "missing";
}

function requireMailboxSmtp(body: { smtpHost?: string; smtpPort?: number; smtpPassword?: string }): { smtpHost: string; smtpPort: number } {
  if (!body.smtpHost || body.smtpPort == null || !body.smtpPassword) {
    throw new AppError(400, "Add the SMTP host, port, and password for this mailbox");
  }
  return { smtpHost: body.smtpHost, smtpPort: body.smtpPort };
}

sendersRouter.get(
  "/",
  wrap(async (req, res) => {
    const senders = await prisma.senderAccount.findMany({
      where: await senderWhere(req.user!),
      include: { team: true },
      orderBy: { fromEmail: "asc" },
    });
    const [saved, shared] = await Promise.all([
      mailboxPasswordFlags(senders.map((sender) => sender.id)),
      sharedSmtpLogin(),
    ]);
    const withQuota = await Promise.all(
      senders.map(async (sender) => ({
        ...sender,
        smtpPasswordSet: saved.has(mailboxSmtpSecretName(sender.id)),
        smtpSource: smtpSource(sender, saved, shared),
        quotaOpen: await quotaAllows(sender.id, sender.dailyLimit, sender.perMinuteLimit),
      })),
    );
    send(res, 200, { senders: withQuota });
  }),
);

sendersRouter.post(
  "/",
  requireRoles("admin"),
  wrap(async (req, res) => {
    const body = z
      .object({
        teamId: z.number().int().positive(),
        fromName: z.string().min(1).max(100),
        fromEmail: z.string().email(),
        replyTo: z.string().email().nullable().optional(),
        dailyLimit: z.number().int().positive().max(10000).optional(),
        perMinuteLimit: z.number().int().positive().max(100).optional(),
        provider: z.enum(["graph", "smtp"]).default("smtp"),
        ...smtpFields,
      })
      .parse(req.body);
    const team = await prisma.team.findUnique({ where: { id: body.teamId } });
    if (!team) throw new AppError(400, "Unknown team");
    const ownSmtp = body.provider === "smtp" ? requireMailboxSmtp(body) : null;
    const sender = await prisma.senderAccount.create({
      data: {
        teamId: body.teamId,
        fromName: body.fromName,
        fromEmail: normalizeEmail(body.fromEmail),
        replyTo: body.replyTo ? normalizeEmail(body.replyTo) : null,
        dailyLimit: body.dailyLimit ?? 500,
        perMinuteLimit: body.perMinuteLimit ?? 20,
        provider: body.provider,
        smtpHost: ownSmtp?.smtpHost,
        smtpPort: ownSmtp?.smtpPort,
        smtpSecure: body.provider === "smtp" ? (body.smtpSecure ?? false) : false,
      },
    });
    if (ownSmtp && body.smtpPassword) await saveMailboxSmtpPassword(sender.id, body.smtpPassword);
    await audit(req.user!.id, "mailbox.create", "sender", sender.id, { email: sender.fromEmail, provider: sender.provider });
    const saved = await mailboxPasswordFlags([sender.id]);
    const shared = await sharedSmtpLogin();
    send(res, 201, {
      sender: {
        ...sender,
        smtpPasswordSet: saved.has(mailboxSmtpSecretName(sender.id)),
        smtpSource: smtpSource(sender, saved, shared),
      },
    });
  }),
);

sendersRouter.patch(
  "/:id",
  requireRoles("admin"),
  wrap(async (req, res) => {
    const body = z
      .object({
        fromName: z.string().min(1).max(100).optional(),
        replyTo: z.string().email().nullable().optional(),
        dailyLimit: z.number().int().positive().max(10000).optional(),
        perMinuteLimit: z.number().int().positive().max(100).optional(),
        provider: z.enum(["graph", "smtp"]).optional(),
        status: z.enum(["active", "paused", "error"]).optional(),
        ...smtpFields,
      })
      .parse(req.body);
    const senderId = BigInt(req.params.id);
    const existing = await prisma.senderAccount.findUnique({ where: { id: senderId } });
    if (!existing) throw new AppError(404, "Mailbox not found");
    if (body.smtpPassword) await saveMailboxSmtpPassword(senderId, body.smtpPassword);
    const smtpTouched = body.smtpHost !== undefined || body.smtpPort !== undefined || body.smtpSecure !== undefined || body.smtpPassword !== undefined;
    const sender = await prisma.senderAccount.update({
      where: { id: senderId },
      data: {
        fromName: body.fromName,
        replyTo: body.replyTo === undefined ? undefined : body.replyTo,
        dailyLimit: body.dailyLimit,
        perMinuteLimit: body.perMinuteLimit,
        provider: body.provider,
        status: body.status,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpSecure: body.smtpSecure,
        lastError: body.status === "active" || smtpTouched ? null : undefined,
      },
    });
    await audit(req.user!.id, "mailbox.update", "sender", sender.id, {
      status: sender.status,
      smtpLoginUpdated: Boolean(body.smtpPassword),
    });
    const [saved, shared] = await Promise.all([mailboxPasswordFlags([sender.id]), sharedSmtpLogin()]);
    send(res, 200, {
      sender: {
        ...sender,
        smtpPasswordSet: saved.has(mailboxSmtpSecretName(sender.id)),
        smtpSource: smtpSource(sender, saved, shared),
      },
    });
  }),
);

sendersRouter.delete(
  "/:id",
  requireRoles("admin"),
  wrap(async (req, res) => {
    const sender = await prisma.senderAccount.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { _count: { select: { campaignSenders: true, recipients: true, sequences: true } } },
    });
    if (!sender) throw new AppError(404, "Mailbox not found");
    const { campaignSenders, recipients, sequences } = sender._count;
    if (campaignSenders > 0 || recipients > 0 || sequences > 0) {
      const uses = [
        campaignSenders > 0 ? `${campaignSenders} campaign${campaignSenders === 1 ? "" : "s"}` : "",
        sequences > 0 ? `${sequences} sequence${sequences === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      throw new AppError(
        409,
        `This mailbox is used by ${uses.join(" and ") || "sent campaign history"}, so it can't be deleted. Pause it instead.`,
      );
    }
    await deleteMailboxSmtpPassword(sender.id);
    await prisma.senderAccount.delete({ where: { id: sender.id } });
    await audit(req.user!.id, "mailbox.delete", "sender", sender.id, { email: sender.fromEmail });
    send(res, 200, { ok: true });
  }),
);

sendersRouter.post(
  "/:id/check",
  wrap(async (req, res) => {
    const sender = await prisma.senderAccount.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!sender) throw new AppError(404, "Mailbox not found");
    await assertSenderAccess(req.user!, sender.id, sender.teamId);
    try {
      switch (sender.provider) {
        case "graph":
          if (!graphConfigured()) throw new AppError(400, "Microsoft 365 is not configured");
          await graphCheck(sender.fromEmail);
          break;
        case "smtp": {
          const config = await smtpConfigForMailbox(sender);
          if (!config) throw new Error("Add the SMTP host and password on this mailbox");
          await smtpVerify(config);
          break;
        }
        case "ses":
          throw new AppError(400, "Amazon SES is not connected yet");
        default:
          assertNever(sender.provider);
      }
      const updated = await prisma.senderAccount.update({
        where: { id: sender.id },
        data: { status: sender.status === "paused" ? "paused" : "active", lastError: null },
      });
      send(res, 200, { ok: true, sender: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      const updated = await prisma.senderAccount.update({
        where: { id: sender.id },
        data: { status: "error", lastError: message },
      });
      send(res, 200, { ok: false, sender: updated, error: message });
    }
  }),
);

sendersRouter.post(
  "/:id/test",
  wrap(async (req, res) => {
    const body = z.object({ to: z.string().email() }).parse(req.body);
    const sender = await prisma.senderAccount.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!sender) throw new AppError(404, "Mailbox not found");
    await assertSenderAccess(req.user!, sender.id, sender.teamId);
    const result = await sendMail(sender.provider, {
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      replyTo: sender.replyTo,
      to: body.to,
      subject: "Cachedigitech mailbox test",
      html: "<p>This mailbox can send mail.</p>",
      text: "This mailbox can send mail.",
    });
    if (!result.ok) throw new AppError(502, result.error);
    await audit(req.user!.id, "mailbox.test", "sender", sender.id, { to: body.to });
    send(res, 200, { ok: true });
  }),
);
