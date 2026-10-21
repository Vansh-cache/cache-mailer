import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { matchesRules, rulesSchema, type Rules } from "../audience/rules";
import { assertTeam, canReadShared } from "../lib/team";
import type { AuthUser } from "../types";

export const audienceSchema = z.object({
  tags: z.array(z.number().int().positive()).default([]),
  segmentId: z.number().int().positive().nullable().optional(),
  excludeTags: z.array(z.number().int().positive()).default([]),
});

export type AudienceSpec = z.infer<typeof audienceSchema>;

export async function resolveAudience(user: AuthUser, input: AudienceSpec) {
  if (input.tags.length === 0 && !input.segmentId) {
    throw new AppError(400, "Choose at least one tag or a saved segment");
  }
  let rules: Rules | null = null;
  if (input.segmentId) {
    const segment = await prisma.segment.findUnique({ where: { id: input.segmentId } });
    if (!segment || !canReadShared(user, segment.teamId)) throw new AppError(400, "Segment not found");
    if (segment.teamId != null) assertTeam(user, segment.teamId);
    rules = rulesSchema.parse(segment.rules);
  }
  const [includeTags, excludeTags, contacts, suppressed] = await Promise.all([
    input.tags.length ? prisma.tag.findMany({ where: { id: { in: input.tags } } }) : Promise.resolve([]),
    input.excludeTags.length ? prisma.tag.findMany({ where: { id: { in: input.excludeTags } } }) : Promise.resolve([]),
    prisma.contact.findMany({ where: { status: "active" }, include: { tags: { include: { tag: true } } } }),
    prisma.suppression.findMany({ select: { email: true } }),
  ]);
  const includeNames = new Set(includeTags.map((tag) => tag.name.toLowerCase()));
  const excludeNames = new Set(excludeTags.map((tag) => tag.name.toLowerCase()));
  const blocked = new Set(suppressed.map((row) => row.email));
  return contacts.filter((contact) => {
    if (blocked.has(contact.email)) return false;
    const names = contact.tags.map((row) => row.tag.name.toLowerCase());
    // Tags were requested but none exist (e.g. deleted): match nobody, never everybody.
    if (input.tags.length > 0 && (includeNames.size === 0 || !names.some((name) => includeNames.has(name)))) return false;
    if (names.some((name) => excludeNames.has(name))) return false;
    if (!rules) return true;
    return matchesRules(
      {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        jobTitle: contact.jobTitle,
        status: contact.status,
        tags: contact.tags.map((row) => row.tag.name),
      },
      rules,
    );
  });
}
