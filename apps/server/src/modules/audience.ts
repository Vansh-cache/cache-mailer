import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { send } from "../http";
import { canReadShared, teamFilter } from "../lib/team";
import { requireRoles } from "../middleware/auth";
import { wrap } from "../middleware/error";
import { matchesRules, rulesSchema, type Rules } from "../audience/rules";
import { refreshScore } from "../lib/score";

export const tagsRouter = Router();

tagsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { contacts: true } } } });
    send(res, 200, { tags: tags.map((tag) => ({ id: tag.id, name: tag.name, count: tag._count.contacts, points: tag.points })) });
  }),
);

tagsRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
    const tag = await prisma.tag.create({ data: { name: body.name.trim() } });
    send(res, 201, { tag });
  }),
);

tagsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const body = z.object({ points: z.number().int().min(0).max(1000) }).parse(req.body);
    const tag = await prisma.tag.update({ where: { id: Number(req.params.id) }, data: { points: body.points } });
    const links = await prisma.contactTag.findMany({ where: { tagId: tag.id }, select: { contactId: true } });
    for (const link of links) await refreshScore(link.contactId);
    send(res, 200, { ok: true });
  }),
);

tagsRouter.delete(
  "/:id",
  requireRoles("admin", "marketing"),
  wrap(async (req, res) => {
    await prisma.tag.delete({ where: { id: Number(req.params.id) } });
    send(res, 200, { ok: true });
  }),
);

export const segmentsRouter = Router();

async function countRules(rules: Rules): Promise<number> {
  const contacts = await prisma.contact.findMany({ include: { tags: { include: { tag: true } } } });
  return contacts.filter((contact) =>
    matchesRules(
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
    ),
  ).length;
}

segmentsRouter.get(
  "/",
  wrap(async (req, res) => {
    const all = await prisma.segment.findMany({ include: { team: true }, orderBy: { name: "asc" } });
    const segments = all.filter((segment) => canReadShared(req.user!, segment.teamId));
    send(res, 200, { segments });
  }),
);

segmentsRouter.post(
  "/preview",
  wrap(async (req, res) => {
    const rules = rulesSchema.parse(req.body.rules ?? req.body);
    send(res, 200, { count: await countRules(rules) });
  }),
);

segmentsRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = z.object({ name: z.string().min(1).max(120), rules: rulesSchema, shared: z.boolean().optional() }).parse(req.body);
    const segment = await prisma.segment.create({
      data: {
        name: body.name,
        rules: body.rules,
        teamId: body.shared && req.user!.role === "admin" ? null : teamFilter(req.user!).teamId ?? req.user!.teamId,
        createdBy: req.user!.id,
      },
    });
    send(res, 201, { segment });
  }),
);

segmentsRouter.put(
  "/:id",
  wrap(async (req, res) => {
    const segment = await prisma.segment.findUnique({ where: { id: Number(req.params.id) } });
    if (!segment || !canReadShared(req.user!, segment.teamId)) throw new AppError(404, "Segment not found");
    const body = z.object({ name: z.string().min(1).max(120).optional(), rules: rulesSchema.optional() }).parse(req.body);
    const updated = await prisma.segment.update({
      where: { id: segment.id },
      data: { name: body.name, rules: body.rules },
    });
    send(res, 200, { segment: updated });
  }),
);

segmentsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const segment = await prisma.segment.findUnique({ where: { id: Number(req.params.id) } });
    if (!segment || !canReadShared(req.user!, segment.teamId)) throw new AppError(404, "Segment not found");
    await prisma.segment.delete({ where: { id: segment.id } });
    send(res, 200, { ok: true });
  }),
);
