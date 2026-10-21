import { prisma } from "../db";
import { logger } from "../lib/logger";
import type { AuthUser } from "../types";
import { launchCampaign } from "../campaigns/launch";

export async function startScheduled(): Promise<void> {
  const due = await prisma.campaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
    include: { author: { include: { team: true } } },
  });
  for (const campaign of due) {
    const user: AuthUser = {
      id: campaign.author.id,
      name: campaign.author.name,
      email: campaign.author.email,
      role: campaign.author.role,
      teamId: campaign.author.teamId,
      teamName: campaign.author.team?.name ?? null,
    };
    try {
      await launchCampaign(campaign.id, user);
    } catch (error) {
      logger.error({ err: error, campaignId: campaign.id }, "scheduled campaign did not start");
    }
  }
}
