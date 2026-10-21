import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { config } from "../config";
import { AppError } from "../errors";
import { send } from "../http";
import { audit } from "../lib/audit";
import { randomToken } from "../lib/crypto";
import { companyFooter } from "../lib/settings";
import { assertTeam, teamFilter } from "../lib/team";
import { wrap } from "../middleware/error";
import { renderDesign } from "../render/email";
import { canonicalTagName } from "../lib/import-columns";

export const growthRouter = Router();

const stepSchema = z.object({
  waitDays: z.number().int().min(0).max(365),
  templateId: z.number().int().positive(),
  subject: z.string().min(1).max(255),
});

growthRouter.get(
  "/sequences",
  wrap(async (req, res) => {
    const sequences = await prisma.sequence.findMany({
      where: teamFilter(req.user!),
      include: {
        triggerTag: true,
        sender: true,
        steps: { orderBy: { position: "asc" } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { id: "desc" },
    });
    send(res, 200, {
      sequences: sequences.map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
        status: sequence.status,
        tag: sequence.triggerTag.name,
        mailbox: sequence.sender.fromEmail,
        steps: sequence.steps.map((step) => ({ waitDays: step.waitDays, subject: step.subject })),
        enrolled: sequence._count.enrollments,
      })),
    });
  }),
);

growthRouter.post(
  "/sequences",
  wrap(async (req, res) => {
    const body = z.object({
      name: z.string().min(1).max(120),
      triggerTagId: z.number().int().positive(),
      senderId: z.number().int().positive(),
      teamId: z.number().int().positive().optional(),
      steps: z.array(stepSchema).min(1).max(8),
    }).parse(req.body);
    const teamId = req.user!.role === "admin" ? (body.teamId ?? req.user!.teamId) : req.user!.teamId;
    if (teamId == null) throw new AppError(400, "Choose a team");
    assertTeam(req.user!, teamId);
    const sender = await prisma.senderAccount.findUnique({ where: { id: BigInt(body.senderId) } });
    if (!sender || sender.teamId !== teamId) throw new AppError(400, "Choose a mailbox on this team");
    const tag = await prisma.tag.findUnique({ where: { id: body.triggerTagId } });
    if (!tag) throw new AppError(400, "Choose a tag");
    const footer = await companyFooter();
    const sequence = await prisma.sequence.create({
      data: {
        teamId,
        name: body.name,
        triggerTagId: tag.id,
        senderId: sender.id,
        createdBy: req.user!.id,
      },
    });
    for (let index = 0; index < body.steps.length; index += 1) {
      const step = body.steps[index]!;
      const template = await prisma.template.findUnique({ where: { id: BigInt(step.templateId) } });
      if (!template) throw new AppError(400, "Template not found");
      const rendered = await renderDesign(template.designJson, footer);
      const campaign = await prisma.campaign.create({
        data: {
          teamId,
          name: `${body.name} · step ${index + 1}`.slice(0, 150),
          subject: step.subject,
          templateId: template.id,
          audience: {},
          status: "sending",
          hidden: true,
          sendFormat: rendered.design.settings.compose === "plain" ? "plain" : "html",
          htmlSnapshot: rendered.html,
          textSnapshot: rendered.text,
          startedAt: new Date(),
          createdBy: req.user!.id,
          senders: { create: [{ senderId: sender.id }] },
          stats: { create: {} },
        },
      });
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          position: index,
          waitDays: step.waitDays,
          subject: step.subject,
          templateId: template.id,
          campaignId: campaign.id,
        },
      });
    }
    await audit(req.user!.id, "sequence.create", "sequence", BigInt(sequence.id), { name: body.name });
    send(res, 201, { id: sequence.id });
  }),
);

growthRouter.post(
  "/sequences/:id/pause",
  wrap(async (req, res) => {
    const sequence = await prisma.sequence.findUnique({ where: { id: Number(req.params.id) } });
    if (!sequence) throw new AppError(404, "Sequence not found");
    assertTeam(req.user!, sequence.teamId);
    const status = sequence.status === "active" ? "paused" : "active";
    await prisma.sequence.update({ where: { id: sequence.id }, data: { status } });
    send(res, 200, { status });
  }),
);

growthRouter.get(
  "/gates",
  wrap(async (req, res) => {
    const gates = await prisma.gate.findMany({ where: teamFilter(req.user!), orderBy: { id: "desc" } });
    send(res, 200, {
      trackingUrl: config.trackingUrl,
      gates: gates.map((gate) => ({
        id: gate.id,
        title: gate.title,
        slug: gate.slug,
        tagName: gate.tagName,
        assetUrl: gate.assetUrl,
        active: gate.active,
        url: `${config.trackingUrl}/g/${gate.slug}`,
      })),
    });
  }),
);

growthRouter.post(
  "/gates",
  wrap(async (req, res) => {
    const body = z.object({
      title: z.string().min(1).max(120),
      slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
      detail: z.string().max(500).default(""),
      tagName: z.string().min(1).max(80),
      assetUrl: z.string().url().max(2000),
      teamId: z.number().int().positive().optional(),
    }).parse(req.body);
    const teamId = req.user!.role === "admin" ? (body.teamId ?? req.user!.teamId) : req.user!.teamId;
    if (teamId == null) throw new AppError(400, "Choose a team");
    assertTeam(req.user!, teamId);
    const gate = await prisma.gate.create({
      data: {
        teamId,
        title: body.title,
        slug: body.slug,
        detail: body.detail,
        tagName: canonicalTagName(body.tagName),
        assetUrl: body.assetUrl,
      },
    });
    send(res, 201, { id: gate.id, url: `${config.trackingUrl}/g/${gate.slug}` });
  }),
);

export async function ensureReferralCode(contactId: bigint): Promise<string> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new AppError(404, "Contact not found");
  if (contact.referralCode) return contact.referralCode;
  const code = randomToken().slice(0, 10);
  await prisma.contact.update({ where: { id: contactId }, data: { referralCode: code } });
  return code;
}
