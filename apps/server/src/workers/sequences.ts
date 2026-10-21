import { prisma } from "../db";
import { randomToken } from "../lib/crypto";
import { logger } from "../lib/logger";

export async function runDueSequences(): Promise<void> {
  const due = await prisma.sequenceEnrollment.findMany({
    where: { status: "active", nextRunAt: { lte: new Date() } },
    include: {
      contact: true,
      sequence: { include: { steps: { orderBy: { position: "asc" } } } },
    },
    orderBy: { id: "asc" },
    take: 20,
  });
  for (const row of due) {
    try {
      await advance(row.id);
    } catch (error) {
      logger.error({ err: error, enrollmentId: row.id }, "sequence step failed");
    }
  }
}

async function advance(id: bigint): Promise<void> {
  const row = await prisma.sequenceEnrollment.findUnique({
    where: { id },
    include: { contact: true, sequence: { include: { steps: { orderBy: { position: "asc" } } } } },
  });
  if (!row || row.status !== "active") return;
  if (row.sequence.status !== "active" || row.contact.status !== "active") {
    await prisma.sequenceEnrollment.update({ where: { id }, data: { status: "stopped" } });
    return;
  }
  const blocked = await prisma.suppression.findUnique({ where: { email: row.contact.email } });
  if (blocked) {
    await prisma.sequenceEnrollment.update({ where: { id }, data: { status: "stopped" } });
    return;
  }
  const step = row.sequence.steps[row.nextStep];
  if (!step?.campaignId) {
    await prisma.sequenceEnrollment.update({ where: { id }, data: { status: "stopped" } });
    return;
  }
  await prisma.campaignRecipient.create({
    data: {
      campaignId: step.campaignId,
      contactId: row.contactId,
      senderId: row.sequence.senderId,
      token: randomToken(),
      status: "queued",
    },
  }).catch(() => undefined);
  const following = row.sequence.steps[row.nextStep + 1];
  if (!following) {
    await prisma.sequenceEnrollment.update({ where: { id }, data: { status: "done" } });
    return;
  }
  await prisma.sequenceEnrollment.update({
    where: { id },
    data: {
      nextStep: row.nextStep + 1,
      nextRunAt: new Date(Date.now() + following.waitDays * 24 * 60 * 60 * 1000),
    },
  });
}
