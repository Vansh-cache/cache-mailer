import { graphConfigured } from "../config";
import { prisma } from "../db";
import { logger } from "../lib/logger";
import { extractRecipient, extractStatusCode, isAutoReply, isNdr, classifyBounce } from "../render/bounce";
import { graphDelta, type GraphMessage } from "../providers/graph";

function header(message: GraphMessage, name: string): string {
  return message.internetMessageHeaders?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function recordBounce(email: string, kind: "hard" | "soft", campaignId: bigint | null, recipientId: bigint): Promise<void> {
  const type = kind === "hard" ? "bounce_hard" : "bounce_soft";
  const existing = await prisma.event.findFirst({
    where: { recipientId, type, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (existing || !campaignId) return;
  await prisma.event.create({ data: { campaignId, recipientId, type } });
  if (kind === "hard") {
    await prisma.contact.updateMany({ where: { email }, data: { status: "bounced" } });
    await prisma.suppression.upsert({
      where: { email },
      update: { reason: "hard_bounce", campaignId },
      create: { email, reason: "hard_bounce", campaignId },
    });
  }
}

async function handleMessage(message: GraphMessage): Promise<void> {
  const from = message.from?.emailAddress?.address ?? "";
  const subject = message.subject ?? "";
  const body = `${message.body?.content ?? ""}\n${message.bodyPreview ?? ""}`;
  const token = body.match(/\/(?:o|c|u)\/([a-f0-9]{32})/i)?.[1];
  const byToken = token ? await prisma.campaignRecipient.findUnique({ where: { token }, include: { contact: true } }) : null;

  if (isNdr(from, subject)) {
    const email = extractRecipient(body);
    const kind = classifyBounce(extractStatusCode(body));
    if (!email || !kind) return;
    const recipient =
      byToken ??
      (await prisma.campaignRecipient.findFirst({
        where: {
          status: "sent",
          contact: { email },
          sentAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { sentAt: "desc" },
        include: { contact: true },
      }));
    if (!recipient) return;
    await recordBounce(email, kind, recipient.campaignId, recipient.id);
    return;
  }

  if (isAutoReply(subject, header(message, "auto-submitted"))) return;
  const replyTo = header(message, "in-reply-to") || header(message, "references");
  const byMessage = replyTo
    ? await prisma.campaignRecipient.findFirst({ where: { internetMessageId: replyTo }, include: { contact: true } })
    : null;
  const recipient = byToken ?? byMessage;
  if (!recipient) return;
  const existing = await prisma.event.findFirst({ where: { recipientId: recipient.id, type: "reply" } });
  if (existing) return;
  await prisma.event.create({ data: { campaignId: recipient.campaignId, recipientId: recipient.id, type: "reply" } });
}

export async function readMailboxes(): Promise<void> {
  if (!graphConfigured()) return;
  const mailboxes = await prisma.senderAccount.findMany({ where: { provider: "graph", status: { in: ["active", "paused"] } } });
  for (const mailbox of mailboxes) {
    try {
      let link = mailbox.inboxDeltaLink;
      for (let page = 0; page < 3; page += 1) {
        const batch = await graphDelta(mailbox.fromEmail, link);
        for (const message of batch.messages) await handleMessage(message);
        link = batch.deltaLink;
        if (!batch.deltaLink || batch.deltaLink === mailbox.inboxDeltaLink) break;
      }
      if (link && link !== mailbox.inboxDeltaLink) {
        await prisma.senderAccount.update({ where: { id: mailbox.id }, data: { inboxDeltaLink: link } });
      }
    } catch (error) {
      logger.error({ err: error, mailbox: mailbox.fromEmail }, "mailbox reader failed");
    }
  }
}
