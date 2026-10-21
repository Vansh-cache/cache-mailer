import { prisma } from "../db";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { canonicalTagName, headerKey } from "../lib/import-columns";
import { refreshScore } from "../lib/score";
import { enrollContactForTags } from "./enroll";

export async function captureLead(input: {
  email: string;
  firstName?: string | null;
  tagName: string;
  source: string;
  referredById?: bigint | null;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address" };
  const blocked = await prisma.suppression.findUnique({ where: { email } });
  if (blocked) return { ok: false, error: "This address is not accepted" };
  const tagName = canonicalTagName(input.tagName);
  let tag = await prisma.tag.findFirst({ where: { name: tagName } });
  if (!tag) {
    const tags = await prisma.tag.findMany();
    tag = tags.find((item) => headerKey(item.name) === headerKey(tagName)) ?? null;
  }
  if (!tag) tag = await prisma.tag.create({ data: { name: tagName } });
  const existing = await prisma.contact.findUnique({ where: { email } });
  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: {
          firstName: existing.firstName || input.firstName || null,
          source: existing.source ?? input.source,
          referredById: existing.referredById ?? input.referredById ?? null,
        },
      })
    : await prisma.contact.create({
        data: {
          email,
          firstName: input.firstName || null,
          source: input.source,
          referredById: input.referredById ?? null,
        },
      });
  await prisma.contactTag.createMany({ data: [{ contactId: contact.id, tagId: tag.id }], skipDuplicates: true });
  if (input.referredById && input.referredById !== contact.id) {
    await prisma.contact.update({ where: { id: input.referredById }, data: { bonusScore: { increment: 5 } } });
    await refreshScore(input.referredById);
  }
  await enrollContactForTags(contact.id, [tag.id]);
  return { ok: true, email };
}
