import { Prisma } from "@prisma/client";
import { config, graphConfigured } from "../config";
import { prisma } from "../db";
import { assertNever } from "../errors";
import { backoffMs, randomDelay, sleep } from "../lib/backoff";
import { sha1 } from "../lib/crypto";
import { logger } from "../lib/logger";
import { notifyAdmins } from "../lib/notify";
import { sentItemContainsToken } from "../providers/graph";
import { sendMail } from "../providers/mail";
import { embedUploadedImages } from "../render/embed-images";
import { applyLinkMap, extractLinks } from "../render/links";
import { contactFields, personalize, personalizeHtml } from "../render/personalize";
import { injectPixel, injectPreheader } from "../render/email";
import { quotaAllows } from "./quota";

export async function claimBatch(senderId: bigint, limit: number): Promise<bigint[]> {
  const take = Math.max(1, Math.min(limit, 10));
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT r.id
      FROM campaign_recipients r
      INNER JOIN campaigns c ON c.id = r.campaign_id
      WHERE r.status = 'queued'
        AND r.next_attempt_at <= NOW()
        AND r.sender_id = ${senderId}
        AND c.status = 'sending'
      ORDER BY r.id
      LIMIT ${Prisma.raw(String(take))}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];
    await tx.campaignRecipient.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "processing",
        lockedBy: config.workerId,
        lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return ids;
  });
}

export async function processSender(senderId: bigint): Promise<void> {
  const sender = await prisma.senderAccount.findUnique({ where: { id: senderId } });
  if (!sender || sender.status !== "active") return;
  if (!(await quotaAllows(sender.id, sender.dailyLimit, sender.perMinuteLimit))) return;
  const ids = await claimBatch(sender.id, 1);
  for (const id of ids) {
    await sendRecipient(id);
    await sleep(randomDelay(config.sendDelayMinMs, config.sendDelayMaxMs));
  }
}

export async function sendRecipient(id: bigint): Promise<void> {
  const row = await prisma.campaignRecipient.findUnique({
    where: { id },
    include: { contact: true, campaign: true, sender: true },
  });
  if (!row || row.status !== "processing") return;
  if (row.campaign.status !== "sending") {
    await requeue(row.id, new Date());
    return;
  }
  const suppressed = await prisma.suppression.findUnique({ where: { email: row.contact.email } });
  if (row.contact.status !== "active" || suppressed) {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: {
        status: "skipped",
        skipReason: suppressed ? "suppressed" : row.contact.status,
        lockedBy: null,
        lockedUntil: null,
      },
    });
    return;
  }

  const fields = contactFields(row.contact);
  let html = personalizeHtml(row.campaign.htmlSnapshot ?? "", fields);
  const subject = personalize(row.campaign.subject, fields);
  html = injectPreheader(html, personalize(row.campaign.preheader ?? "", fields));
  const unsub = `${config.trackingUrl}/u/${row.token}`;
  html = html.split("[[UNSUB]]").join(unsub);
  const map = new Map<string, string>();
  for (const url of extractLinks(html)) {
    const urlHash = sha1(url);
    const link = await prisma.link.upsert({
      where: { campaignId_urlHash: { campaignId: row.campaignId, urlHash } },
      update: {},
      create: { campaignId: row.campaignId, originalUrl: url.slice(0, 2000), urlHash },
    });
    map.set(url, `${config.trackingUrl}/c/${row.token}/${link.id}`);
  }
  html = injectPixel(applyLinkMap(html, map), `${config.trackingUrl}/o/${row.token}.gif`);

  switch (row.sender.provider) {
    case "graph":
    case "smtp":
      break;
    case "ses":
      await prisma.campaignRecipient.update({
        where: { id: row.id },
        data: { status: "failed", lastError: "Amazon SES is not connected yet", lockedBy: null, lockedUntil: null },
      });
      return;
    default:
      assertNever(row.sender.provider);
  }
  if (row.sender.provider === "graph" && !graphConfigured()) {
    await requeue(row.id, new Date(Date.now() + 10 * 60 * 1000), "Microsoft 365 is not configured");
    return;
  }

  const unsubscribe = (row.campaign.htmlSnapshot ?? "").includes("[[UNSUB]]");
  const text = personalize(row.campaign.textSnapshot ?? "", fields).split("[[UNSUB]]").join(unsub);
  // Embed server-saved images inside the message so they show for every
  // receiver, even when the public media URL is unreachable from their network.
  const embedded = row.campaign.sendFormat === "plain" ? { html, attachments: [] } : await embedUploadedImages(html);
  const result = await sendMail(row.sender.provider, {
    fromEmail: row.sender.fromEmail,
    fromName: row.sender.fromName,
    replyTo: row.sender.replyTo,
    to: row.contact.email,
    subject,
    html: embedded.html,
    attachments: embedded.attachments,
    text: row.campaign.sendFormat === "plain" || unsubscribe ? text : undefined,
    format: row.campaign.sendFormat === "plain" ? "text" : "html",
    headers: [
      { name: "x-cdt-campaign", value: String(row.campaignId) },
      { name: "x-cdt-token", value: row.token },
      ...(unsubscribe
        ? [
            { name: "List-Unsubscribe", value: `<${unsub}>` },
            { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
          ]
        : []),
    ],
  });
  if (result.ok) {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: { status: "sent", sentAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null },
    });
    return;
  }
  if (result.status === 401 || result.status === 403 || result.status === 530 || result.status === 535) {
    await prisma.senderAccount.update({ where: { id: row.senderId }, data: { status: "error", lastError: result.error } });
    await requeue(row.id, new Date(Date.now() + 10 * 60 * 1000), result.error);
    await notifyAdmins(`Mailbox ${row.sender.fromEmail} needs attention`, result.error);
    return;
  }
  const attempt = row.attempts + 1;
  if (result.temporary) {
    const delay = result.retryAfterMs ?? backoffMs(attempt);
    if (delay == null) {
      await prisma.campaignRecipient.update({
        where: { id: row.id },
        data: { status: "failed", attempts: attempt, lastError: result.error, lockedBy: null, lockedUntil: null },
      });
      return;
    }
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: {
        status: "queued",
        attempts: attempt,
        nextAttemptAt: new Date(Date.now() + delay),
        lastError: result.error,
        lockedBy: null,
        lockedUntil: null,
      },
    });
    return;
  }
  await prisma.campaignRecipient.update({
    where: { id: row.id },
    data: { status: "failed", attempts: attempt, lastError: result.error, lockedBy: null, lockedUntil: null },
  });
  logger.info({ id: row.id, status: result.status }, "recipient failed");
}

async function requeue(id: bigint, nextAttemptAt: Date, lastError?: string): Promise<void> {
  await prisma.campaignRecipient.update({
    where: { id },
    data: { status: "queued", nextAttemptAt, lastError: lastError ?? null, lockedBy: null, lockedUntil: null },
  });
}

export async function recoverStuck(): Promise<void> {
  const stuck = await prisma.campaignRecipient.findMany({
    where: { status: "processing", lockedUntil: { lt: new Date() } },
    include: { sender: true },
    take: 30,
  });
  for (const row of stuck) {
    if (graphConfigured() && row.sender.provider === "graph") {
      const found = await sentItemContainsToken(row.sender.fromEmail, row.token);
      if (found === true) {
        await prisma.campaignRecipient.update({
          where: { id: row.id },
          data: { status: "sent", sentAt: new Date(), lockedBy: null, lockedUntil: null },
        });
        continue;
      }
      if (found === null) {
        await prisma.campaignRecipient.update({
          where: { id: row.id },
          data: { lockedUntil: new Date(Date.now() + 2 * 60 * 1000) },
        });
        continue;
      }
    }
    await requeue(row.id, new Date());
  }
}

export async function sendLoop(): Promise<void> {
  const senders = await prisma.senderAccount.findMany({ where: { status: "active" } });
  await Promise.all(senders.map((sender) => processSender(sender.id).catch((err) => logger.error({ err }, "send loop"))));
}
