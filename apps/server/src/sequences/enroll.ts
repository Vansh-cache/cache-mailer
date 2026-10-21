import { prisma } from "../db";
import { refreshScore } from "../lib/score";

export async function enrollContactForTags(contactId: bigint, tagIds: number[]): Promise<void> {
  await refreshScore(contactId);
  if (tagIds.length === 0) return;
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.status !== "active") return;
  const sequences = await prisma.sequence.findMany({
    where: { status: "active", triggerTagId: { in: tagIds } },
    include: { steps: { orderBy: { position: "asc" }, take: 1 } },
  });
  for (const sequence of sequences) {
    const first = sequence.steps[0];
    if (!first) continue;
    const existing = await prisma.sequenceEnrollment.findUnique({
      where: { sequenceId_contactId: { sequenceId: sequence.id, contactId } },
    });
    if (existing) continue;
    await prisma.sequenceEnrollment.create({
      data: {
        sequenceId: sequence.id,
        contactId,
        nextStep: 0,
        nextRunAt: new Date(Date.now() + first.waitDays * 24 * 60 * 60 * 1000),
      },
    });
  }
}
