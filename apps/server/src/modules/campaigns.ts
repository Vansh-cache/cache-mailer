import { Prisma } from "@prisma/client";
import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { pageParams, send } from "../http";
import { audit } from "../lib/audit";
import { assertSenderAccess, assertTeam, teamFilter } from "../lib/team";
import { wrap } from "../middleware/error";
import { audienceSchema, countNewManualReceivers, ensureManualContacts, resolveAudience } from "../campaigns/audience";
import { SEND_CHUNK_SIZE } from "../campaigns/chunks";
import { launchCampaign, loadCampaign } from "../campaigns/launch";
import { precheckCampaign } from "../campaigns/precheck";
import { parseCcEmails } from "../lib/email";
import { aggregateCampaign } from "../workers/aggregate";
import type { AuthUser } from "../types";

export const campaignsRouter = Router();

const campaignFields = {
  name: z.string().min(1).max(150),
  subject: z.string().max(255),
  preheader: z.string().max(255).nullable().optional(),
  templateId: z.number().int().positive(),
  audience: audienceSchema,
  fromName: z.string().trim().min(1).max(100).optional(),
  ccEmails: z.string().max(1000).optional(),
  useUtm: z.boolean().optional(),
  senderIds: z.array(z.number().int().positive()),
  teamId: z.number().int().positive().optional(),
};
const writeSchema = z.object({
  ...campaignFields,
  subject: campaignFields.subject.default(""),
  senderIds: campaignFields.senderIds.default([]),
});
// No defaults here: fields missing from a partial update must stay untouched.
const updateSchema = z.object(campaignFields).partial();

campaignsRouter.get(
  "/",
  wrap(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { ...teamFilter(req.user!), hidden: false },
      include: { stats: true, team: true },
      orderBy: { id: "desc" },
    });
    send(res, 200, { campaigns });
  }),
);

campaignsRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = writeSchema.parse(req.body);
    const teamId = req.user!.role === "admin" ? (body.teamId ?? req.user!.teamId) : req.user!.teamId;
    if (teamId == null) throw new AppError(400, "Choose a team");
    assertTeam(req.user!, teamId);
    let ccEmails: string | null = null;
    try {
      const parsed = parseCcEmails(body.ccEmails);
      ccEmails = parsed.length > 0 ? parsed.join(", ") : null;
    } catch (error) {
      throw new AppError(400, error instanceof Error ? error.message : "Invalid CC email");
    }
    const template = await prisma.template.findUnique({ where: { id: BigInt(body.templateId) } });
    if (!template) throw new AppError(400, "Template not found");
    const senders = await prisma.senderAccount.findMany({ where: { id: { in: body.senderIds.map((id) => BigInt(id)) } } });
    if (senders.length !== body.senderIds.length) throw new AppError(400, "One or more mailboxes were not found");
    if (senders.some((sender) => sender.teamId !== teamId)) throw new AppError(400, "Mailboxes must belong to the campaign team");
    for (const sender of senders) await assertSenderAccess(req.user!, sender.id, sender.teamId);
    await ensureManualContacts(body.audience.emails);
    const campaign = await prisma.campaign.create({
      data: {
        teamId,
        name: body.name,
        subject: body.subject || "Untitled",
        fromName: body.fromName ?? null,
        preheader: body.preheader ?? null,
        templateId: template.id,
        audience: body.audience,
        ccEmails,
        useUtm: body.useUtm ?? true,
        createdBy: req.user!.id,
        senders: { create: senders.map((sender) => ({ senderId: sender.id })) },
      },
    });
    send(res, 201, { campaign });
  }),
);

campaignsRouter.post(
  "/audience-preview",
  wrap(async (req, res) => {
    const audience = audienceSchema.parse(req.body);
    const people = await resolveAudience(req.user!, audience);
    const count = people.length + (await countNewManualReceivers(audience.emails));
    send(res, 200, {
      count,
      chunkSize: SEND_CHUNK_SIZE,
      chunks: count === 0 ? 0 : Math.ceil(count / SEND_CHUNK_SIZE),
    });
  }),
);

campaignsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    send(res, 200, { campaign });
  }),
);

campaignsRouter.put(
  "/:id",
  wrap(async (req, res) => {
    const existing = await loadCampaign(BigInt(req.params.id), req.user!);
    if (existing.status !== "draft") throw new AppError(400, "Only drafts can be edited");
    const body = updateSchema.parse(req.body);
    if (body.audience) await ensureManualContacts(body.audience.emails);
    if (body.senderIds) {
      const senders = await prisma.senderAccount.findMany({ where: { id: { in: body.senderIds.map((id) => BigInt(id)) } } });
      if (senders.some((sender) => sender.teamId !== existing.teamId)) throw new AppError(400, "Mailboxes must belong to the campaign team");
      await prisma.campaignSender.deleteMany({ where: { campaignId: existing.id } });
      await prisma.campaignSender.createMany({ data: senders.map((sender) => ({ campaignId: existing.id, senderId: sender.id })) });
    }
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        subject: body.subject,
        preheader: body.preheader,
        templateId: body.templateId ? BigInt(body.templateId) : undefined,
        audience: body.audience,
        useUtm: body.useUtm,
      },
    });
    send(res, 200, { campaign });
  }),
);

campaignsRouter.post(
  "/:id/precheck",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    send(res, 200, await precheckCampaign(campaign, req.user!));
  }),
);

campaignsRouter.post(
  "/:id/send",
  wrap(async (req, res) => {
    await launchCampaign(BigInt(req.params.id), req.user!);
    send(res, 200, { ok: true });
  }),
);

campaignsRouter.post(
  "/:id/schedule",
  wrap(async (req, res) => {
    const body = z.object({ scheduledAt: z.string().datetime() }).parse(req.body);
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    if (campaign.status !== "draft") throw new AppError(400, "Only drafts can be scheduled");
    const when = new Date(body.scheduledAt);
    if (when.getTime() <= Date.now()) throw new AppError(400, "Pick a time in the future");
    const check = await precheckCampaign(campaign, req.user!);
    if (!check.ok) throw new AppError(400, "Pre-send checks failed", check);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "scheduled", scheduledAt: when } });
    await audit(req.user!.id, "campaign.schedule", "campaign", campaign.id, { scheduledAt: when.toISOString() });
    send(res, 200, { ok: true });
  }),
);

async function move(id: bigint, user: AuthUser, status: "paused" | "sending" | "cancelled", from: string[]) {
  const campaign = await loadCampaign(id, user);
  if (!from.includes(campaign.status)) throw new AppError(400, `This campaign is ${campaign.status}`);
  await prisma.campaign.update({ where: { id }, data: { status } });
  await audit(user.id, `campaign.${status}`, "campaign", id);
}

campaignsRouter.post("/:id/pause", wrap(async (req, res) => {
  await move(BigInt(req.params.id), req.user!, "paused", ["sending"]);
  send(res, 200, { ok: true });
}));

campaignsRouter.post("/:id/resume", wrap(async (req, res) => {
  await move(BigInt(req.params.id), req.user!, "sending", ["paused"]);
  send(res, 200, { ok: true });
}));

campaignsRouter.post("/:id/cancel", wrap(async (req, res) => {
  await move(BigInt(req.params.id), req.user!, "cancelled", ["draft", "scheduled", "sending", "paused"]);
  send(res, 200, { ok: true });
}));

campaignsRouter.post(
  "/:id/duplicate",
  wrap(async (req, res) => {
    const existing = await loadCampaign(BigInt(req.params.id), req.user!);
    const copy = await prisma.campaign.create({
      data: {
        teamId: existing.teamId,
        name: `Copy of ${existing.name}`.slice(0, 150),
        subject: existing.subject,
        fromName: existing.fromName,
        preheader: existing.preheader,
        templateId: existing.templateId,
        audience: existing.audience ?? {},
        useUtm: existing.useUtm,
        createdBy: req.user!.id,
        senders: { create: existing.senders.map((row) => ({ senderId: row.senderId })) },
      },
    });
    send(res, 201, { campaign: copy });
  }),
);

campaignsRouter.get(
  "/:id/stats",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    const stats = await prisma.campaignStats.findUnique({ where: { campaignId: campaign.id } });
    if (!stats || Date.now() - stats.updatedAt.getTime() > 60_000) await aggregateCampaign(campaign.id);
    const fresh = await prisma.campaignStats.findUnique({ where: { campaignId: campaign.id } });
    const delivered = Math.max(0, (fresh?.sent ?? 0) - (fresh?.bouncedHard ?? 0) - (fresh?.bouncedSoft ?? 0));
    const rate = (part: number) => (delivered === 0 ? 0 : part / delivered);
    send(res, 200, {
      stats: fresh,
      delivered,
      rates: {
        bounce: fresh && fresh.sent ? (fresh.bouncedHard + fresh.bouncedSoft) / fresh.sent : 0,
        open: rate(fresh?.uniqueOpens ?? 0),
        ctr: rate(fresh?.uniqueClicks ?? 0),
        ctor: fresh && fresh.uniqueOpens ? fresh.uniqueClicks / fresh.uniqueOpens : 0,
        unsubscribe: rate(fresh?.unsubscribes ?? 0),
        reply: rate(fresh?.replies ?? 0),
      },
    });
  }),
);

campaignsRouter.get(
  "/:id/timeline",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    const points = await prisma.campaignStatsHourly.findMany({
      where: { campaignId: campaign.id },
      orderBy: { hourStart: "asc" },
    });
    send(res, 200, { points });
  }),
);

campaignsRouter.get(
  "/:id/links",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    const links = await prisma.$queryRaw<Array<{ id: bigint; original_url: string; total: bigint; uniq: bigint }>>`
      SELECT l.id, l.original_url,
             COUNT(e.id) AS total,
             COUNT(DISTINCT e.recipient_id) AS uniq
      FROM links l
      LEFT JOIN events e ON e.link_id = l.id AND e.type = 'click' AND e.is_bot = 0
      WHERE l.campaign_id = ${campaign.id}
      GROUP BY l.id, l.original_url
    `;
    send(res, 200, { links });
  }),
);

const recipientSelect = {
  id: true,
  status: true,
  skipReason: true,
  attempts: true,
  nextAttemptAt: true,
  lastError: true,
  sentAt: true,
  chunkIndex: true,
  contact: { select: { email: true, firstName: true } },
  sender: { select: { fromEmail: true } },
} satisfies Prisma.CampaignRecipientSelect;

campaignsRouter.get(
  "/:id/chunks",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    const grouped = await prisma.campaignRecipient.groupBy({
      by: ["chunkIndex", "status"],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    });
    const chunks = new Map<number, { index: number; total: number; queued: number; processing: number; sent: number; failed: number; skipped: number }>();
    for (const row of grouped) {
      const chunk = chunks.get(row.chunkIndex) ?? { index: row.chunkIndex, total: 0, queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
      chunk[row.status] += row._count._all;
      chunk.total += row._count._all;
      chunks.set(row.chunkIndex, chunk);
    }
    send(res, 200, { chunkSize: SEND_CHUNK_SIZE, chunks: [...chunks.values()].sort((a, b) => a.index - b.index) });
  }),
);

campaignsRouter.get(
  "/:id/recipients",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    const { page, take, skip } = pageParams(req);
    const rawStatus = String(req.query.status ?? "");
    const status = (["queued", "processing", "sent", "failed", "skipped"] as const).find((item) => item === rawStatus);
    const search = String(req.query.search ?? "").trim().replace(/[%_\\]/g, "");
    const chunk = Number(req.query.chunk);
    const chunkIndex = Number.isInteger(chunk) && chunk > 0 ? chunk : undefined;
    const sortSent = req.query.sort === "sent";
    const where: Prisma.CampaignRecipientWhereInput = {
      campaignId: campaign.id,
      ...(chunkIndex ? { chunkIndex } : {}),
      ...(rawStatus === "remaining" ? { status: { in: ["queued", "processing"] } } : status ? { status } : {}),
      ...(search ? { contact: { email: { contains: search } } } : {}),
    };
    const countWhere: Prisma.CampaignRecipientWhereInput = {
      campaignId: campaign.id,
      ...(chunkIndex ? { chunkIndex } : {}),
    };
    const [total, grouped] = await Promise.all([
      prisma.campaignRecipient.count({ where }),
      prisma.campaignRecipient.groupBy({ by: ["status"], where: countWhere, _count: { _all: true } }),
    ]);
    const counts = { queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;
    let recipients;
    if (sortSent) {
      const statusSql = rawStatus === "remaining"
        ? Prisma.sql`AND r.status IN ('queued', 'processing')`
        : status
          ? Prisma.sql`AND r.status = ${status}`
          : Prisma.empty;
      const idRows = await prisma.$queryRaw<Array<{ id: bigint }>>`
        SELECT r.id
        FROM campaign_recipients r
        INNER JOIN contacts c ON c.id = r.contact_id
        WHERE r.campaign_id = ${campaign.id}
          ${chunkIndex ? Prisma.sql`AND r.chunk_index = ${chunkIndex}` : Prisma.empty}
          ${statusSql}
          ${search ? Prisma.sql`AND c.email LIKE ${"%" + search + "%"}` : Prisma.empty}
        ORDER BY (r.status = 'sent') DESC, r.sent_at DESC, r.id ASC
        LIMIT ${take} OFFSET ${skip}
      `;
      const ids = idRows.map((row) => row.id);
      const found = ids.length === 0
        ? []
        : await prisma.campaignRecipient.findMany({ where: { id: { in: ids } }, select: recipientSelect });
      const byId = new Map(found.map((row) => [row.id.toString(), row]));
      recipients = ids.flatMap((id) => {
        const row = byId.get(id.toString());
        return row ? [row] : [];
      });
    } else {
      recipients = await prisma.campaignRecipient.findMany({
        where,
        select: recipientSelect,
        orderBy: rawStatus === "sent" ? { sentAt: "desc" } : { id: "asc" },
        skip,
        take,
      });
    }
    send(res, 200, { page, pageSize: take, total, counts, recipients });
  }),
);

campaignsRouter.get(
  "/:id/export",
  wrap(async (req, res) => {
    const campaign = await loadCampaign(BigInt(req.params.id), req.user!);
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
      include: { contact: true, events: true },
    });
    const csv = stringify(
      recipients.map((row) => ({
        email: row.contact.email,
        status: row.status,
        sent_at: row.sentAt?.toISOString() ?? "",
        opens: row.events.filter((event) => event.type === "open" && !event.isBot).length,
        clicks: row.events.filter((event) => event.type === "click" && !event.isBot).length,
        error: row.lastError ?? "",
      })),
      { header: true },
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);
  }),
);
