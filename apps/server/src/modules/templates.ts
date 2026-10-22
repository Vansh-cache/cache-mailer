import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../lib/audit";
import { send } from "../http";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { companyFooter } from "../lib/settings";
import { resolveAudience } from "../campaigns/audience";
import { assertSenderAccess, assertTeam, teamFilter } from "../lib/team";
import { wrap } from "../middleware/error";
import { sendMail } from "../providers/mail";
import { designSchema } from "../render/design";
import { embedUploadedImages } from "../render/embed-images";
import { renderDesign } from "../render/email";
import { contactFields, personalize, personalizeHtml } from "../render/personalize";

export const templatesRouter = Router();

function visible(userTeam: number | null, role: string, template: { teamId: number | null; visibility: "team" | "shared" }) {
  if (role === "admin" || template.visibility === "shared") return true;
  return template.teamId != null && template.teamId === userTeam;
}

templatesRouter.get(
  "/",
  wrap(async (req, res) => {
    const q = String(req.query.search ?? "").trim();
    const rows = await prisma.template.findMany({
      where: q ? { name: { contains: q } } : {},
      orderBy: { updatedAt: "desc" },
    });
    send(res, 200, { templates: rows.filter((row) => visible(req.user!.teamId, req.user!.role, row)) });
  }),
);

templatesRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(150),
        kind: z.enum(["draft", "template"]).optional(),
        category: z.string().max(40).optional(),
        visibility: z.enum(["team", "shared"]).optional(),
        design: designSchema,
      })
      .parse(req.body);
    const footer = await companyFooter();
    const rendered = await renderDesign(body.design, footer);
    const visibility = body.visibility === "shared" && req.user!.role === "admin" ? "shared" : (body.visibility ?? "team");
    const template = await prisma.template.create({
      data: {
        name: body.name,
        category: (body.category ?? "general").trim().toLowerCase().replace(/\s+/g, "-") || "general",
        kind: body.kind ?? "template",
        visibility,
        teamId: visibility === "shared" ? null : (teamFilter(req.user!).teamId ?? req.user!.teamId),
        designJson: rendered.design,
        html: rendered.html,
        textVersion: rendered.text,
        createdBy: req.user!.id,
      },
    });
    send(res, 201, { template });
  }),
);

templatesRouter.post(
  "/preview",
  wrap(async (req, res) => {
    const footer = await companyFooter();
    const rendered = await renderDesign(req.body.design ?? req.body, footer);
    send(res, 200, { html: rendered.html.split("[[UNSUB]]").join("#"), text: rendered.text.split("[[UNSUB]]").join("#") });
  }),
);

templatesRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const template = await prisma.template.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!template || !visible(req.user!.teamId, req.user!.role, template)) throw new AppError(404, "Template not found");
    send(res, 200, { template });
  }),
);

templatesRouter.put(
  "/:id",
  wrap(async (req, res) => {
    const existing = await prisma.template.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!existing || !visible(req.user!.teamId, req.user!.role, existing)) throw new AppError(404, "Template not found");
    const body = z
      .object({
        name: z.string().min(1).max(150).optional(),
        kind: z.enum(["draft", "template"]).optional(),
        category: z.string().max(40).optional(),
        visibility: z.enum(["team", "shared"]).optional(),
        design: designSchema.optional(),
      })
      .parse(req.body);
    const footer = await companyFooter();
    const rendered = body.design ? await renderDesign(body.design, footer) : null;
    const template = await prisma.template.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        kind: body.kind,
        category: body.category ? body.category.trim().toLowerCase().replace(/\s+/g, "-") || undefined : undefined,
        visibility: body.visibility,
        designJson: rendered?.design,
        html: rendered?.html,
        textVersion: rendered?.text,
      },
    });
    send(res, 200, { template });
  }),
);

templatesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const existing = await prisma.template.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!existing || !visible(req.user!.teamId, req.user!.role, existing)) throw new AppError(404, "Template not found");
    if (existing.teamId != null) assertTeam(req.user!, existing.teamId);
    await prisma.template.delete({ where: { id: existing.id } });
    await audit(req.user!.id, "template.delete", "template", existing.id);
    send(res, 200, { ok: true });
  }),
);

templatesRouter.post(
  "/:id/duplicate",
  wrap(async (req, res) => {
    const existing = await prisma.template.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!existing || !visible(req.user!.teamId, req.user!.role, existing)) throw new AppError(404, "Template not found");
    const template = await prisma.template.create({
      data: {
        name: `Copy of ${existing.name}`.slice(0, 150),
        kind: existing.kind,
        category: existing.category,
        visibility: "team",
        teamId: req.user!.role === "admin" ? existing.teamId : req.user!.teamId,
        designJson: existing.designJson ?? {},
        html: existing.html,
        textVersion: existing.textVersion,
        createdBy: req.user!.id,
      },
    });
    send(res, 201, { template });
  }),
);

templatesRouter.post(
  "/:id/test-send",
  wrap(async (req, res) => {
    const body = z.object({
      senderId: z.number().int().positive(),
      to: z.string().max(1000).optional(),
      recipients: z.array(z.string().max(190)).max(10).optional(),
      tagIds: z.array(z.number().int().positive()).max(20).optional(),
    }).parse(req.body);
    const template = await prisma.template.findUnique({ where: { id: BigInt(req.params.id) } });
    if (!template || !visible(req.user!.teamId, req.user!.role, template)) throw new AppError(404, "Template not found");
    const sender = await prisma.senderAccount.findUnique({ where: { id: BigInt(body.senderId) } });
    if (!sender) throw new AppError(404, "Mailbox not found");
    await assertSenderAccess(req.user!, sender.id, sender.teamId);
    const requested = body.recipients ?? (body.to ? body.to.split(/[,;\s]+/) : []);
    const manual = [...new Set(requested.map((email) => normalizeEmail(email)).filter(Boolean))];
    let matched = 0;
    let tagged: string[] = [];
    if (body.tagIds && body.tagIds.length > 0) {
      const people = await resolveAudience(req.user!, { tags: body.tagIds, excludeTags: [] });
      matched = people.length;
      if (matched === 0) throw new AppError(400, "No active, non-suppressed contacts found for the selected tag(s)");
      tagged = people.map((person) => person.email);
    }
    const recipients = [...new Set([...manual, ...tagged])].slice(0, 10);
    if (recipients.length === 0) recipients.push(normalizeEmail(req.user!.email));
    const invalid = recipients.find((email) => !isValidEmail(email));
    if (invalid) throw new AppError(400, `Enter a valid receiver email: ${invalid}`);
    const footer = await companyFooter();
    const rendered = await renderDesign(template.designJson, footer);
    const first = req.user!.name.split(" ")[0] || "there";
    const previewUnsub = `${config.trackingUrl}/u/preview`;
    const unsubscribe = rendered.html.includes("[[UNSUB]]");
    for (const email of recipients) {
      const contact = await prisma.contact.findUnique({ where: { email } });
      const fields = contact
        ? contactFields(contact)
        : { first_name: email === normalizeEmail(req.user!.email) ? first : "there", email };
      const personalized = personalizeHtml(rendered.html, fields).split("[[UNSUB]]").join(previewUnsub);
      const embedded = await embedUploadedImages(personalized);
      const result = await sendMail(sender.provider, {
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        replyTo: sender.replyTo,
        to: email,
        subject: `Test: ${template.name}`,
        html: embedded.html,
        attachments: embedded.attachments,
        text: unsubscribe ? personalize(rendered.text, fields).split("[[UNSUB]]").join(previewUnsub) : undefined,
        headers: unsubscribe
          ? [
              { name: "List-Unsubscribe", value: `<${previewUnsub}>` },
              { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
            ]
          : undefined,
      });
      if (!result.ok) throw new AppError(502, `${email}: ${result.error}`);
    }
    await audit(req.user!.id, "template.test_send", "template", template.id, { to: recipients.join(", "), count: recipients.length, tagIds: body.tagIds ?? [], matched });
    send(res, 200, { ok: true, sent: recipients, matched, truncated: matched > recipients.length });
  }),
);
