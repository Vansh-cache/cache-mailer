import { Prisma } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../db";
import { AppError } from "../errors";
import { pageParams, send } from "../http";
import { audit } from "../lib/audit";
import { isValidEmail, normalizeEmail } from "../lib/email";
import {
  LIST_CATEGORIES,
  canonicalTagName,
  headerKey,
  readImportRows,
  resolveColumns,
  splitPersonName,
  splitTags,
  type ColumnField,
} from "../lib/import-columns";
import { wrap } from "../middleware/error";
import { enrollContactForTags } from "../sequences/enroll";
import { refreshScore } from "../lib/score";
import { ensureReferralCode } from "./growth";

export const contactsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const contactSchema = z.object({
  email: z.string().min(3),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  company: z.string().max(190).optional().nullable(),
  jobTitle: z.string().max(150).optional().nullable(),
  status: z.enum(["active", "unsubscribed", "bounced"]).optional(),
  source: z.string().max(50).optional().nullable(),
  consentNote: z.string().max(255).optional().nullable(),
  customFields: z.record(z.string(), z.string()).optional().nullable(),
});

function contactListWhere(search: string, tagId: number, status?: "active" | "unsubscribed" | "bounced"): Prisma.ContactWhereInput {
  const parts = search.trim().split(/\s+/).filter(Boolean);
  return {
    ...(status ? { status } : {}),
    ...(tagId ? { tags: { some: { tagId } } } : {}),
    ...(parts.length
      ? {
          AND: parts.map((part) => ({
            OR: [
              { email: { contains: part } },
              { firstName: { contains: part } },
              { lastName: { contains: part } },
              { company: { contains: part } },
            ],
          })),
        }
      : {}),
  };
}

async function deleteContactIds(ids: bigint[]): Promise<number> {
  if (ids.length === 0) return 0;
  await prisma.$transaction([
    prisma.campaignRecipient.deleteMany({ where: { contactId: { in: ids } } }),
    prisma.contact.deleteMany({ where: { id: { in: ids } } }),
  ]);
  await prisma.tag.deleteMany({ where: { contacts: { none: {} } } });
  return ids.length;
}

async function applyStatusSideEffects(email: string, status: "active" | "unsubscribed" | "bounced" | undefined) {
  if (status === "unsubscribed") {
    await prisma.suppression.upsert({
      where: { email },
      update: { reason: "unsubscribed" },
      create: { email, reason: "unsubscribed" },
    });
  }
  if (status === "bounced") {
    await prisma.suppression.upsert({
      where: { email },
      update: { reason: "hard_bounce" },
      create: { email, reason: "hard_bounce" },
    });
  }
}

contactsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { page, take, skip } = pageParams(req);
    const search = String(req.query.search ?? "").trim();
    const statusQuery = String(req.query.status ?? "");
    const status =
      statusQuery === "active" || statusQuery === "unsubscribed" || statusQuery === "bounced" ? statusQuery : undefined;
    const tagId = Number(req.query.tagId ?? 0);
    const where = contactListWhere(search, tagId, status);
    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        include: { tags: { include: { tag: true } } },
        orderBy: { id: "desc" },
        skip,
        take,
      }),
    ]);
    send(res, 200, {
      page,
      pageSize: take,
      total,
      contacts: contacts.map((contact) => ({
        ...contact,
        tags: contact.tags.map((row) => row.tag),
      })),
    });
  }),
);

const contactCreateSchema = contactSchema.extend({
  tagIds: z.array(z.number().int().positive()).max(200).optional(),
  newTags: z.array(z.string().max(80)).max(20).optional(),
});

contactsRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = contactCreateSchema.parse(req.body);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) throw new AppError(400, "Enter a valid email address");
    const existing = await prisma.contact.findUnique({ where: { email } });
    if (existing) throw new AppError(400, "This email is already a contact. Edit it instead.");
    const contact = await prisma.contact.create({
      data: {
        email,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        company: body.company ?? null,
        jobTitle: body.jobTitle ?? null,
        status: body.status ?? "active",
        source: body.source ?? "manual",
        consentNote: body.consentNote ?? null,
        customFields: body.customFields ?? undefined,
      },
    });
    await applyStatusSideEffects(email, body.status);
    const desiredIds = new Set<number>(body.tagIds ?? []);
    const newNames = splitTags((body.newTags ?? []).join(","));
    if (newNames.length > 0) {
      const knownTags = await prisma.tag.findMany();
      const cache = new Map(knownTags.map((tag) => [headerKey(tag.name), tag.id]));
      for (const name of newNames) desiredIds.add(await ensureTagId(cache, name));
    }
    if (desiredIds.size > 0) {
      const validTags = await prisma.tag.findMany({ where: { id: { in: [...desiredIds] } }, select: { id: true } });
      const validIds = validTags.map((tag) => tag.id);
      if (validIds.length > 0) {
        await prisma.contactTag.createMany({
          data: validIds.map((tagId) => ({ contactId: contact.id, tagId })),
          skipDuplicates: true,
        });
        await enrollContactForTags(contact.id, validIds);
      }
    }
    await audit(req.user!.id, "contact.create", "contact", contact.id, { tags: [...desiredIds], newTags: newNames });
    send(res, 201, { contact });
  }),
);

contactsRouter.get(
  "/export",
  wrap(async (_req, res) => {
    const contacts = await prisma.contact.findMany({
      include: { tags: { include: { tag: true } } },
      orderBy: { id: "asc" },
    });
    const csv = stringify(
      contacts.map((contact) => ({
        email: contact.email,
        first_name: contact.firstName ?? "",
        last_name: contact.lastName ?? "",
        company: contact.company ?? "",
        job_title: contact.jobTitle ?? "",
        status: contact.status,
        source: contact.source ?? "",
        consent_note: contact.consentNote ?? "",
        tags: contact.tags.map((row) => row.tag.name).join("|"),
      })),
      { header: true },
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
    res.send(csv);
  }),
);

contactsRouter.post(
  "/import",
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) throw new AppError(400, "Choose a CSV or Excel file");
    let rawMapping: unknown = {};
    try {
      rawMapping = JSON.parse(String(req.body.mapping ?? "{}"));
    } catch {
      throw new AppError(400, "Import options are invalid");
    }
    if (rawMapping && typeof rawMapping === "object" && "category" in rawMapping && (rawMapping as { category?: unknown }).category === "") {
      delete (rawMapping as { category?: string }).category;
    }
    const mapping = z
      .object({
        email: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        name: z.string().optional(),
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        tags: z.string().optional(),
        duplicate: z.enum(["skip", "update"]).default("update"),
        category: z.enum(["lead", "customer", "event_attendee", "demo_requested"]).optional(),
        label: z.string().trim().max(240).optional(),
        demo: z.boolean().optional(),
      })
      .parse(rawMapping);
    const rows = readImportRows(req.file.originalname, req.file.buffer);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const columns = resolveColumns(headers, {
      email: mapping.email,
      firstName: mapping.firstName,
      lastName: mapping.lastName,
      name: mapping.name,
      company: mapping.company,
      jobTitle: mapping.jobTitle,
      tags: mapping.tags,
    });
    if (!columns.email) throw new AppError(400, "Could not find an email column. Use a header such as Email or E-mail.");
    const categoryName = mapping.category ? LIST_CATEGORIES[mapping.category] : null;
    const extraTags = splitTags(mapping.label ?? "");
    const knownTags = await prisma.tag.findMany();
    const tagIds = new Map(knownTags.map((tag) => [headerKey(tag.name), tag.id]));
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let invalid = 0;
    for (const row of rows) {
      const email = normalizeEmail(row[columns.email] ?? "");
      if (!isValidEmail(email)) {
        invalid += 1;
        continue;
      }
      const data = fieldsFromRow(row, columns);
      const existing = await prisma.contact.findUnique({ where: { email } });
      let contactId: bigint;
      if (existing && mapping.duplicate === "skip") {
        skipped += 1;
        contactId = existing.id;
      } else if (existing) {
        await prisma.contact.update({ where: { id: existing.id }, data: { ...data, source: existing.source ?? "csv" } });
        updated += 1;
        contactId = existing.id;
      } else {
        const contact = await prisma.contact.create({
          data: { email, firstName: data.firstName ?? null, lastName: data.lastName ?? null, company: data.company ?? null, jobTitle: data.jobTitle ?? null, source: "csv" },
        });
        created += 1;
        contactId = contact.id;
      }
      const names = [
        ...(categoryName ? [categoryName] : []),
        ...extraTags,
        ...(mapping.demo ? ["Demo data"] : []),
        ...(columns.tags ? splitTags(row[columns.tags] ?? "") : []),
      ];
      const ids = new Set<number>();
      for (const name of names) ids.add(await ensureTagId(tagIds, name));
      if (ids.size > 0) {
        await prisma.contactTag.createMany({
          data: [...ids].map((tagId) => ({ contactId, tagId })),
          skipDuplicates: true,
        });
        await enrollContactForTags(contactId, [...ids]);
      }
    }
    await audit(req.user!.id, "contact.import", "contact", null, { created, updated, skipped, invalid, category: categoryName, labels: extraTags });
    send(res, 200, { created, updated, skipped, invalid, rows: rows.length, columns, category: categoryName, labels: extraTags, demo: mapping.demo === true });
  }),
);

function fieldsFromRow(row: Record<string, string>, columns: Partial<Record<ColumnField, string>>) {
  const fromName = columns.name ? splitPersonName(row[columns.name] ?? "") : { firstName: null, lastName: null };
  const data: { firstName?: string | null; lastName?: string | null; company?: string | null; jobTitle?: string | null } = {};
  if (columns.firstName || columns.name) {
    const first = columns.firstName ? row[columns.firstName] ?? "" : "";
    data.firstName = first || fromName.firstName;
  }
  if (columns.lastName) data.lastName = row[columns.lastName] || null;
  else if (columns.name) data.lastName = fromName.lastName;
  if (columns.company) data.company = row[columns.company] || null;
  if (columns.jobTitle) data.jobTitle = row[columns.jobTitle] || null;
  return data;
}

async function ensureTagId(cache: Map<string, number>, name: string): Promise<number> {
  const canonical = canonicalTagName(name);
  const key = headerKey(canonical);
  const existing = cache.get(key);
  if (existing) return existing;
  const created = await prisma.tag.create({ data: { name: canonical } });
  cache.set(key, created.id);
  return created.id;
}

contactsRouter.post(
  "/tags",
  wrap(async (req, res) => {
    const body = z
      .object({
        contactIds: z.array(z.number().int().positive()).min(1),
        tagId: z.number().int().positive(),
        action: z.enum(["add", "remove"]),
      })
      .parse(req.body);
    const tag = await prisma.tag.findUnique({ where: { id: body.tagId } });
    if (!tag) throw new AppError(404, "Tag not found");
    if (body.action === "add") {
      await prisma.contactTag.createMany({
        data: body.contactIds.map((id) => ({ contactId: BigInt(id), tagId: body.tagId })),
        skipDuplicates: true,
      });
      for (const id of body.contactIds) await enrollContactForTags(BigInt(id), [body.tagId]);
    } else {
      await prisma.contactTag.deleteMany({
        where: { tagId: body.tagId, contactId: { in: body.contactIds.map((id) => BigInt(id)) } },
      });
    }
    send(res, 200, { ok: true });
  }),
);

contactsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const contact = await prisma.contact.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { tags: { include: { tag: true } } },
    });
    if (!contact) throw new AppError(404, "Contact not found");
    const referralCode = await ensureReferralCode(contact.id);
    const score = await refreshScore(contact.id);
    const recipients = await prisma.campaignRecipient.findMany({
      where: { contactId: contact.id },
      include: { campaign: true, events: { orderBy: { createdAt: "desc" }, take: 50 } },
      orderBy: { id: "desc" },
      take: 50,
    });
    send(res, 200, {
      contact: { ...contact, referralCode, score, tags: contact.tags.map((row) => row.tag) },
      referralUrl: `${config.trackingUrl}/r/${referralCode}`,
      activity: recipients.flatMap((recipient) => [
        {
          id: `send-${recipient.id}`,
          type: recipient.status,
          isBot: false,
          campaignName: recipient.campaign.name,
          createdAt: (recipient.sentAt ?? recipient.campaign.startedAt ?? recipient.campaign.createdAt).toISOString(),
        },
        ...recipient.events.map((event) => ({
          id: `event-${event.id}`,
          type: event.type,
          isBot: event.isBot,
          campaignName: recipient.campaign.name,
          createdAt: event.createdAt.toISOString(),
        })),
      ]),
    });
  }),
);

const contactPatchSchema = contactSchema.partial().extend({
  tagIds: z.array(z.number().int().positive()).max(200).optional(),
  newTags: z.array(z.string().max(80)).max(20).optional(),
});

contactsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const body = contactPatchSchema.parse(req.body);
    const existing = await prisma.contact.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!existing) throw new AppError(404, "Contact not found");
    const email = body.email ? normalizeEmail(body.email) : existing.email;
    if (!isValidEmail(email)) throw new AppError(400, "Enter a valid email address");
    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        email,
        firstName: body.firstName,
        lastName: body.lastName,
        company: body.company,
        jobTitle: body.jobTitle,
        status: body.status,
        source: body.source,
        consentNote: body.consentNote,
        customFields: body.customFields ?? undefined,
      },
    });
    await applyStatusSideEffects(email, body.status);
    let tagsChanged: { added: string[]; removed: number } | null = null;
    if (body.tagIds !== undefined || (body.newTags && body.newTags.length > 0)) {
      const currentRows = await prisma.contactTag.findMany({ where: { contactId: contact.id }, select: { tagId: true } });
      const currentIds = new Set(currentRows.map((row) => row.tagId));
      const desiredIds = new Set<number>(body.tagIds ?? [...currentIds]);
      const newNames = splitTags((body.newTags ?? []).join(","));
      if (newNames.length > 0) {
        const knownTags = await prisma.tag.findMany();
        const cache = new Map(knownTags.map((tag) => [headerKey(tag.name), tag.id]));
        for (const name of newNames) desiredIds.add(await ensureTagId(cache, name));
      }
      const validTags = await prisma.tag.findMany({ where: { id: { in: [...desiredIds] } }, select: { id: true, name: true } });
      const validIds = new Set(validTags.map((tag) => tag.id));
      const addedIds = [...validIds].filter((tagId) => !currentIds.has(tagId));
      const removedIds = [...currentIds].filter((tagId) => !validIds.has(tagId));
      if (removedIds.length > 0) {
        await prisma.contactTag.deleteMany({ where: { contactId: contact.id, tagId: { in: removedIds } } });
      }
      if (addedIds.length > 0) {
        await prisma.contactTag.createMany({
          data: addedIds.map((tagId) => ({ contactId: contact.id, tagId })),
          skipDuplicates: true,
        });
        await enrollContactForTags(contact.id, addedIds);
      } else if (removedIds.length > 0) {
        await refreshScore(contact.id);
      }
      if (addedIds.length > 0 || removedIds.length > 0) {
        await prisma.tag.deleteMany({ where: { contacts: { none: {} } } });
        tagsChanged = {
          added: validTags.filter((tag) => addedIds.includes(tag.id)).map((tag) => tag.name),
          removed: removedIds.length,
        };
      }
    }
    await audit(req.user!.id, "contact.update", "contact", contact.id, tagsChanged ? { tags: tagsChanged } : undefined);
    send(res, 200, { contact });
  }),
);

contactsRouter.post(
  "/bulk-delete",
  wrap(async (req, res) => {
    const body = z
      .object({
        ids: z.array(z.number().int().positive()).min(1).max(500).optional(),
        search: z.string().max(200).optional(),
        tagId: z.number().int().nonnegative().optional(),
        allMatching: z.boolean().optional(),
      })
      .parse(req.body);
    let ids: bigint[] = [];
    if (body.ids?.length) {
      ids = body.ids.map((id) => BigInt(id));
    } else if (body.allMatching) {
      const matches = await prisma.contact.findMany({
        where: contactListWhere(body.search ?? "", body.tagId ?? 0),
        select: { id: true },
      });
      ids = matches.map((contact) => contact.id);
    } else {
      throw new AppError(400, "Choose contacts to delete");
    }
    const deleted = await deleteContactIds(ids);
    await audit(req.user!.id, "contact.bulk_delete", "contact", null, { deleted, allMatching: body.allMatching === true });
    send(res, 200, { deleted });
  }),
);

contactsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = BigInt(req.params.id);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "Contact not found");
    await deleteContactIds([id]);
    await audit(req.user!.id, "contact.delete", "contact", id, { email: existing.email });
    send(res, 200, { ok: true });
  }),
);

contactsRouter.post(
  "/:id/tags",
  wrap(async (req, res) => {
    const body = z.object({ tagId: z.number().int().positive() }).parse(req.body);
    await prisma.contactTag.create({ data: { contactId: BigInt(req.params.id), tagId: body.tagId } });
    send(res, 201, { ok: true });
  }),
);

contactsRouter.delete(
  "/:id/tags/:tagId",
  wrap(async (req, res) => {
    await prisma.contactTag.delete({
      where: { contactId_tagId: { contactId: BigInt(req.params.id), tagId: Number(req.params.tagId) } },
    });
    send(res, 200, { ok: true });
  }),
);

export const suppressionRouter = Router();

suppressionRouter.get(
  "/",
  wrap(async (_req, res) => {
    const rows = await prisma.suppression.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    send(res, 200, { suppression: rows });
  }),
);

suppressionRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = z.object({ email: z.string().min(3), reason: z.enum(["unsubscribed", "hard_bounce", "manual", "zoho_optout"]) }).parse(req.body);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) throw new AppError(400, "Enter a valid email address");
    const row = await prisma.suppression.upsert({
      where: { email },
      update: { reason: body.reason },
      create: { email, reason: body.reason },
    });
    await prisma.contact.updateMany({
      where: { email },
      data: { status: body.reason === "hard_bounce" ? "bounced" : "unsubscribed" },
    });
    await audit(req.user!.id, "suppression.add", "suppression", null, { email });
    send(res, 201, { suppression: row });
  }),
);

suppressionRouter.delete(
  "/:email",
  wrap(async (req, res) => {
    const email = normalizeEmail(req.params.email);
    await prisma.suppression.delete({ where: { email } });
    await audit(req.user!.id, "suppression.delete", "suppression", null, { email });
    send(res, 200, { ok: true });
  }),
);
