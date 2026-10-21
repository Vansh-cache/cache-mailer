import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { AppError } from "../errors";
import { send } from "../http";
import { assertTeam, teamFilter } from "../lib/team";
import { wrap } from "../middleware/error";
import type { AuthUser } from "../types";

export const analyticsRouter = Router();

function teamSql(user: AuthUser): Prisma.Sql {
  const filter = teamFilter(user);
  return filter.teamId == null ? Prisma.empty : Prisma.sql`AND c.team_id = ${filter.teamId}`;
}

analyticsRouter.get(
  "/overview",
  wrap(async (req, res) => {
    const user = req.user!;
    const campaignWhere = teamFilter(user);
    const scope = teamSql(user);
    const [total, active, campaigns, mailboxes, queued, processing, growth, sentRows, openRows, clickRows, bounceRows, sentByTag, bounceMonths, problems] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { status: "active" } }),
      prisma.campaign.findMany({
        where: { ...campaignWhere, hidden: false },
        include: { stats: true, team: true },
        orderBy: { id: "desc" },
        take: 8,
      }),
      prisma.senderAccount.findMany({ where: campaignWhere, include: { team: true } }),
      prisma.campaignRecipient.count({ where: { status: "queued", campaign: campaignWhere } }),
      prisma.campaignRecipient.count({ where: { status: "processing", campaign: campaignWhere } }),
      prisma.$queryRaw<Array<{ month: string; c: bigint }>>`
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS c
        FROM contacts GROUP BY month ORDER BY month
      `,
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM campaign_recipients r
        INNER JOIN campaigns c ON c.id = r.campaign_id
        WHERE r.status = 'sent' ${scope}
      `,
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT e.recipient_id) AS c FROM events e
        INNER JOIN campaigns c ON c.id = e.campaign_id
        WHERE e.type = 'open' AND e.is_bot = 0 ${scope}
      `,
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT e.recipient_id) AS c FROM events e
        INNER JOIN campaigns c ON c.id = e.campaign_id
        WHERE e.type = 'click' AND e.is_bot = 0 ${scope}
      `,
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM events e
        INNER JOIN campaigns c ON c.id = e.campaign_id
        WHERE e.type IN ('bounce_hard', 'bounce_soft') ${scope}
      `,
      prisma.$queryRaw<Array<{ name: string; c: bigint }>>`
        SELECT t.name AS name, COUNT(DISTINCT r.id) AS c
        FROM campaign_recipients r
        INNER JOIN campaigns c ON c.id = r.campaign_id
        INNER JOIN contact_tags ct ON ct.contact_id = r.contact_id
        INNER JOIN tags t ON t.id = ct.tag_id
        WHERE r.status = 'sent' ${scope}
        GROUP BY t.id, t.name
        ORDER BY c DESC
      `,
      prisma.$queryRaw<Array<{ month: string; c: bigint }>>`
        SELECT DATE_FORMAT(e.created_at, '%Y-%m') AS month, COUNT(*) AS c
        FROM events e
        INNER JOIN campaigns c ON c.id = e.campaign_id
        WHERE e.type IN ('bounce_hard', 'bounce_soft') ${scope}
        GROUP BY month ORDER BY month
      `,
      deliveryProblems(user),
    ]);
    const sentToday = await Promise.all(
      mailboxes.map(async (mailbox) => {
        const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
          SELECT COUNT(*) AS c FROM campaign_recipients
          WHERE sender_id = ${mailbox.id} AND status = 'sent' AND sent_at >= CURDATE()
        `;
        return { id: Number(mailbox.id), fromEmail: mailbox.fromEmail, status: mailbox.status, team: mailbox.team.name, sentToday: Number(rows[0]?.c ?? 0), dailyLimit: mailbox.dailyLimit };
      }),
    );
    const sent = Number(sentRows[0]?.c ?? 0);
    const opens = Number(openRows[0]?.c ?? 0);
    const clicks = Number(clickRows[0]?.c ?? 0);
    const bounced = Number(bounceRows[0]?.c ?? 0);
    const rate = (part: number) => (sent === 0 ? 0 : part / sent);
    send(res, 200, {
      scope: { role: user.role, teamName: user.teamName },
      contacts: { total, active },
      sent,
      rates: { open: rate(opens), click: rate(clicks), bounce: rate(bounced) },
      sentByCategory: sentByTag.map((row) => ({ name: row.name, count: Number(row.c) })),
      campaigns: campaigns.map((campaign) => ({
        id: Number(campaign.id),
        name: campaign.name,
        status: campaign.status,
        team: campaign.team.name,
        stats: campaign.stats ? { sent: campaign.stats.sent } : null,
      })),
      mailboxes: sentToday,
      queue: { queued, processing },
      growth: growth.map((row) => ({ month: row.month, count: Number(row.c) })),
      bounces: bounceMonths.map((row) => ({ month: row.month, count: Number(row.c) })),
      problems,
    });
  }),
);

analyticsRouter.post(
  "/delivery/:id/retry",
  wrap(async (req, res) => {
    const user = req.user!;
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { campaign: true, contact: true, events: true },
    });
    if (!recipient) throw new AppError(404, "That send was not found");
    assertTeam(user, recipient.campaign.teamId);
    const suppression = await prisma.suppression.findUnique({ where: { email: recipient.contact.email } });
    if (suppression && suppression.reason !== "hard_bounce") {
      throw new AppError(400, "This address is blocked and cannot be retried");
    }
    const bounced = recipient.events.some((event) => event.type === "bounce_hard" || event.type === "bounce_soft") || recipient.contact.status === "bounced";
    const notSent = recipient.status === "failed" || recipient.status === "skipped";
    if (!bounced && !notSent) throw new AppError(400, "This message does not need a retry");
    if (suppression?.reason === "hard_bounce") {
      await prisma.suppression.delete({ where: { email: recipient.contact.email } });
    }
    if (recipient.contact.status === "bounced") {
      await prisma.contact.update({ where: { id: recipient.contactId }, data: { status: "active" } });
    }
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "queued", nextAttemptAt: new Date(), lastError: null, lockedBy: null, lockedUntil: null },
    });
    if (recipient.campaign.status === "sent" || recipient.campaign.status === "failed" || recipient.campaign.status === "paused") {
      await prisma.campaign.update({ where: { id: recipient.campaignId }, data: { status: "sending", finishedAt: null } });
    }
    send(res, 200, { ok: true });
  }),
);

async function deliveryProblems(user: AuthUser) {
  const rows = await prisma.campaignRecipient.findMany({
    where: {
      campaign: teamFilter(user),
      OR: [
        { status: { in: ["failed", "skipped"] } },
        { events: { some: { type: { in: ["bounce_hard", "bounce_soft"] } } } },
        { contact: { status: "bounced" }, status: "sent" },
      ],
    },
    include: {
      contact: true,
      campaign: { select: { name: true } },
      events: { where: { type: { in: ["bounce_hard", "bounce_soft"] } }, orderBy: { id: "desc" }, take: 1 },
    },
    orderBy: { id: "desc" },
    take: 100,
  });
  const blocked = rows.length === 0
    ? []
    : await prisma.suppression.findMany({
        where: { email: { in: rows.map((row) => row.contact.email) }, reason: { not: "hard_bounce" } },
        select: { email: true },
      });
  const blockedEmails = new Set(blocked.map((row) => row.email));
  return rows.map((row) => {
    const bounce = row.events[0];
    const kind = bounce || row.contact.status === "bounced" ? "bounced" : "not_sent";
    return {
      id: Number(row.id),
      email: row.contact.email,
      campaign: row.campaign.name,
      kind,
      detail: row.lastError || row.skipReason || (bounce ? bounce.type.replace("_", " ") : "Not sent"),
      canRetry: !blockedEmails.has(row.contact.email),
    };
  });
}
