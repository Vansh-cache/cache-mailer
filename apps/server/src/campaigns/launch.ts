import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../lib/audit";
import { randomToken } from "../lib/crypto";
import { companyFooter } from "../lib/settings";
import type { AuthUser } from "../types";
import { renderDesign } from "../render/email";
import { audienceSchema, resolveAudience } from "./audience";
import { precheckCampaign } from "./precheck";
import { sentToday } from "../workers/quota";

const campaignInclude = {
  template: true,
  senders: { include: { sender: true } },
} satisfies Prisma.CampaignInclude;

export async function loadCampaign(id: bigint, user: AuthUser) {
  const campaign = await prisma.campaign.findUnique({ where: { id }, include: campaignInclude });
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (user.role !== "admin" && campaign.teamId !== user.teamId) throw new AppError(404, "Campaign not found");
  return campaign;
}

export async function launchCampaign(id: bigint, user: AuthUser): Promise<void> {
  const campaign = await loadCampaign(id, user);
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw new AppError(400, "Only a draft or scheduled campaign can start");
  }
  const check = await precheckCampaign(campaign, user);
  if (!check.ok) throw new AppError(400, "Pre-send checks failed", check);
  const footer = await companyFooter();
  const rendered = await renderDesign(campaign.template.designJson, footer);
  const people = await resolveAudience(user, audienceSchema.parse(campaign.audience));
  const mailboxes = campaign.senders.map((row) => row.sender).filter((sender) => sender.status === "active");
  const assignment = await assignMailboxes(mailboxes, people.length);
  const rows = people.map((contact, index) => ({
    campaignId: campaign.id,
    contactId: contact.id,
    senderId: assignment[index]!,
    token: randomToken(),
    status: "queued" as const,
  }));
  await prisma.$transaction(async (tx) => {
    const current = await tx.campaign.findUnique({ where: { id } });
    if (!current || (current.status !== "draft" && current.status !== "scheduled")) {
      throw new AppError(409, "Campaign is already running");
    }
    await tx.campaignRecipient.deleteMany({ where: { campaignId: id } });
    for (let index = 0; index < rows.length; index += 500) {
      await tx.campaignRecipient.createMany({ data: rows.slice(index, index + 500) });
    }
    await tx.campaign.update({
      where: { id },
      data: {
        status: "sending",
        startedAt: new Date(),
        htmlSnapshot: rendered.html,
        textSnapshot: rendered.text,
        sendFormat: rendered.design.settings.compose === "plain" ? "plain" : "html",
      },
    });
    await tx.campaignStats.upsert({
      where: { campaignId: id },
      update: { totalRecipients: rows.length },
      create: { campaignId: id, totalRecipients: rows.length },
    });
  }, { timeout: 120_000 });
  await audit(user.id, "campaign.send", "campaign", id, { recipients: rows.length });
}

async function assignMailboxes(
  mailboxes: { id: bigint; dailyLimit: number }[],
  count: number,
): Promise<bigint[]> {
  const remaining = new Map<bigint, number>();
  for (const mailbox of mailboxes) {
    remaining.set(mailbox.id, Math.max(0, mailbox.dailyLimit - (await sentToday(mailbox.id))));
  }
  const assigned: bigint[] = [];
  while (assigned.length < count) {
    let progressed = false;
    for (const mailbox of mailboxes) {
      const left = remaining.get(mailbox.id) ?? 0;
      if (left <= 0) continue;
      assigned.push(mailbox.id);
      remaining.set(mailbox.id, left - 1);
      progressed = true;
      if (assigned.length === count) break;
    }
    if (!progressed) break;
  }
  for (let index = assigned.length; index < count; index += 1) {
    assigned.push(mailboxes[index % mailboxes.length]!.id);
  }
  return assigned;
}
