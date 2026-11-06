import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { matchesRules, rulesSchema, type Rules } from "../audience/rules";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { assertTeam, canReadShared } from "../lib/team";
import type { AuthUser } from "../types";

const MAX_MANUAL_EMAILS = 2000;

export const audienceSchema = z.object({
  tags: z.array(z.number().int().positive()).default([]),
  segmentId: z.number().int().positive().nullable().optional(),
  excludeTags: z.array(z.number().int().positive()).default([]),
  emails: z.array(z.string().max(190)).max(MAX_MANUAL_EMAILS).default([]),
});

export type AudienceSpec = z.infer<typeof audienceSchema>;

export function manualEmails(raw: string[]): string[] {
  const emails = [...new Set(raw.map(normalizeEmail).filter(Boolean))];
  const invalid = emails.find((email) => !isValidEmail(email));
  if (invalid) throw new AppError(400, `Invalid receiver email: ${invalid}`);
  return emails;
}

// Campaign recipients must reference a contact row, so typed-in receivers
// become contacts. Existing contacts keep their status (unsubscribed stays out).
export async function ensureManualContacts(raw: string[]): Promise<number> {
  const emails = manualEmails(raw);
  if (emails.length === 0) return 0;
  const created = await prisma.contact.createMany({
    data: emails.map((email) => ({ email, source: "manual" })),
    skipDuplicates: true,
  });
  return created.count;
}

export async function countNewManualReceivers(raw: string[]): Promise<number> {
  const emails = manualEmails(raw);
  if (emails.length === 0) return 0;
  const [existing, suppressed] = await Promise.all([
    prisma.contact.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    prisma.suppression.findMany({ where: { email: { in: emails } }, select: { email: true } }),
  ]);
  const known = new Set([...existing, ...suppressed].map((row) => row.email));
  return emails.filter((email) => !known.has(email)).length;
}

export async function resolveAudience(user: AuthUser, input: AudienceSpec) {
  const manual = new Set(manualEmails(input.emails));
  if (input.tags.length === 0 && !input.segmentId && manual.size === 0) {
    throw new AppError(400, "Choose at least one tag, a saved segment, or add receivers manually");
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
  const hasFilter = input.tags.length > 0 || rules != null;
  return contacts.filter((contact) => {
    if (blocked.has(contact.email)) return false;
    if (manual.has(contact.email)) return true;
    if (!hasFilter) return false;
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
