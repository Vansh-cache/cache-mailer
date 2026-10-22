import { Router } from "express";
import { z } from "zod";
import { graphConfigured } from "../config";
import { prisma } from "../db";
import { AppError, assertNever } from "../errors";
import { audit } from "../lib/audit";
import { normalizeEmail } from "../lib/email";
import { send } from "../http";
import { assertSenderAccess, assertTeam, senderWhere, teamFilter } from "../lib/team";
import { requireRoles } from "../middleware/auth";
import { wrap } from "../middleware/error";
import { graphCheck } from "../providers/graph";
import { sendMail } from "../providers/mail";
import { getSmtpConfig, smtpCheck } from "../providers/smtp";
import { quotaAllows } from "../workers/quota";

export const sendersRouter = Router();

sendersRouter.get(
  "/",
  wrap(async (req, res) => {
    const senders = await prisma.senderAccount.findMany({
      where: await senderWhere(req.user!),
      include: { team: true },
      orderBy: { fromEmail: "asc" },
    });
    const withQuota = await Promise.all(
      senders.map(async (sender) => ({
        ...sender,
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
      })
      .parse(req.body);
    const team = await prisma.team.findUnique({ where: { id: body.teamId } });
    if (!team) throw new AppError(400, "Unknown team");
    const sender = await prisma.senderAccount.create({
      data: {
        teamId: body.teamId,
        fromName: body.fromName,
        fromEmail: normalizeEmail(body.fromEmail),
        replyTo: body.replyTo ? normalizeEmail(body.replyTo) : null,
        dailyLimit: body.dailyLimit ?? 500,
        perMinuteLimit: body.perMinuteLimit ?? 20,
        provider: body.provider,
      },
    });
    await audit(req.user!.id, "mailbox.create", "sender", sender.id, { email: sender.fromEmail });
    send(res, 201, { sender });
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
      })
      .parse(req.body);
    const sender = await prisma.senderAccount.update({
      where: { id: BigInt(req.params.id) },
      data: {
        fromName: body.fromName,
        replyTo: body.replyTo === undefined ? undefined : body.replyTo,
        dailyLimit: body.dailyLimit,
        perMinuteLimit: body.perMinuteLimit,
        provider: body.provider,
        status: body.status,
        lastError: body.status === "active" ? null : undefined,
      },
    });
    await audit(req.user!.id, "mailbox.update", "sender", sender.id, { status: sender.status });
    send(res, 200, { sender });
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
          const config = await getSmtpConfig();
          if (!config) throw new AppError(400, "Add the SMTP host, email, and password in Settings first");
          if (config.email !== sender.fromEmail) {
            throw new Error(`SMTP email in Settings (${config.email}) does not match this mailbox (${sender.fromEmail})`);
          }
          await smtpCheck();
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
