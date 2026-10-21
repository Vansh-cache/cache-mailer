import { prisma } from "../db";
import { logger } from "../lib/logger";
import { notifyAdmins } from "../lib/notify";
import { getSetting } from "../lib/settings";

async function count(query: Promise<Array<{ c: bigint }>>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.c ?? 0);
}

export async function aggregateCampaign(campaignId: bigint): Promise<void> {
  const [total, sent, failed, hard, soft, uniqueOpens, totalOpens, uniqueClicks, totalClicks, unsubs, replies] = await Promise.all([
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM campaign_recipients WHERE campaign_id = ${campaignId}`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM campaign_recipients WHERE campaign_id = ${campaignId} AND status = 'sent'`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM campaign_recipients WHERE campaign_id = ${campaignId} AND status = 'failed'`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'bounce_hard'`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'bounce_soft'`),
    count(prisma.$queryRaw`SELECT COUNT(DISTINCT recipient_id) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'open' AND is_bot = 0`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'open' AND is_bot = 0`),
    count(prisma.$queryRaw`SELECT COUNT(DISTINCT recipient_id) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'click' AND is_bot = 0`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'click' AND is_bot = 0`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'unsubscribe'`),
    count(prisma.$queryRaw`SELECT COUNT(*) AS c FROM events WHERE campaign_id = ${campaignId} AND type = 'reply'`),
  ]);
  await prisma.campaignStats.upsert({
    where: { campaignId },
    update: {
      totalRecipients: total,
      sent,
      failed,
      bouncedHard: hard,
      bouncedSoft: soft,
      uniqueOpens,
      totalOpens,
      uniqueClicks,
      totalClicks,
      unsubscribes: unsubs,
      replies,
    },
    create: {
      campaignId,
      totalRecipients: total,
      sent,
      failed,
      bouncedHard: hard,
      bouncedSoft: soft,
      uniqueOpens,
      totalOpens,
      uniqueClicks,
      totalClicks,
      unsubscribes: unsubs,
      replies,
    },
  });
  const hourly = await prisma.$queryRaw<Array<{ hour_start: Date | string; opens: bigint | number; clicks: bigint | number }>>`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour_start,
           SUM(type = 'open' AND is_bot = 0) AS opens,
           SUM(type = 'click' AND is_bot = 0) AS clicks
    FROM events
    WHERE campaign_id = ${campaignId}
    GROUP BY hour_start
  `;
  for (const row of hourly) {
    const hourStart = new Date(row.hour_start);
    await prisma.campaignStatsHourly.upsert({
      where: { campaignId_hourStart: { campaignId, hourStart } },
      update: { opens: Number(row.opens), clicks: Number(row.clicks) },
      create: { campaignId, hourStart, opens: Number(row.opens), clicks: Number(row.clicks) },
    });
  }
  const pending = await count(
    prisma.$queryRaw`SELECT COUNT(*) AS c FROM campaign_recipients WHERE campaign_id = ${campaignId} AND status IN ('queued', 'processing')`,
  );
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign?.status === "sending" && pending === 0 && total > 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: sent === 0 && failed > 0 ? "failed" : "sent", finishedAt: new Date() },
    });
  }
}

export async function aggregateActive(): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const campaigns = await prisma.campaign.findMany({
    where: { OR: [{ status: { in: ["sending", "paused"] } }, { startedAt: { gte: since } }] },
    select: { id: true },
  });
  for (const campaign of campaigns) {
    await aggregateCampaign(campaign.id).catch((err) => logger.error({ err, campaignId: campaign.id }, "aggregate failed"));
  }
}

export async function autoPause(): Promise<void> {
  const threshold = Number(await getSetting("bounce_pause_threshold")) || 0.05;
  const minimum = Number(await getSetting("bounce_pause_min_sends")) || 100;
  const campaigns = await prisma.campaign.findMany({ where: { status: "sending" }, include: { stats: true } });
  for (const campaign of campaigns) {
    if (!campaign.stats || campaign.stats.sent < minimum) continue;
    const rate = campaign.stats.bouncedHard / campaign.stats.sent;
    if (rate < threshold) continue;
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "paused" } });
    await notifyAdmins(
      `Campaign paused: ${campaign.name}`,
      `Hard bounces are ${(rate * 100).toFixed(1)}% after ${campaign.stats.sent} sends.`,
    );
  }
}
