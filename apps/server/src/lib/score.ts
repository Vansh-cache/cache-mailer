import { prisma } from "../db";

export async function refreshScore(contactId: bigint): Promise<number> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { tags: { include: { tag: true } } },
  });
  if (!contact) return 0;
  const [opens, clicks] = await Promise.all([
    prisma.event.count({ where: { type: "open", isBot: false, recipient: { contactId } } }),
    prisma.event.count({ where: { type: "click", isBot: false, recipient: { contactId } } }),
  ]);
  const score = contact.tags.reduce((sum, row) => sum + row.tag.points, 0) + contact.bonusScore + opens + clicks * 2;
  await prisma.contact.update({ where: { id: contactId }, data: { score } });
  return score;
}
