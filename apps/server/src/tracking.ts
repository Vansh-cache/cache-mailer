import express from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { prisma } from "./db";
import { hashIp, escapeHtml } from "./lib/crypto";
import { logger } from "./lib/logger";
import { isFastClick, isScannerUserAgent } from "./render/bounce";
import { appendUtm } from "./render/links";
import { captureLead } from "./sequences/intake";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>body{font-family:Arial,sans-serif;background:#f4f6f8;color:#122;display:grid;place-items:center;min-height:100vh;margin:0}
  main{background:#fff;padding:32px;border-radius:12px;max-width:420px}button{background:#0f766e;color:#fff;border:0;padding:10px 16px;border-radius:8px}</style>
  </head><body><main><h1>${escapeHtml(title)}</h1><div>${body}</div></main></body></html>`;
}

function buildTracking() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

  app.get("/o/:file", async (req, res) => {
    const token = String(req.params.file).replace(/\.gif$/i, "");
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store");
    try {
      const recipient = await prisma.campaignRecipient.findUnique({ where: { token } });
      if (recipient && token !== "preview") {
        const ua = (req.get("user-agent") ?? "").slice(0, 300);
        await prisma.event.create({
          data: {
            campaignId: recipient.campaignId,
            recipientId: recipient.id,
            type: "open",
            isBot: isScannerUserAgent(ua),
            userAgent: ua || null,
            ipHash: hashIp(req.ip ?? ""),
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, "open track failed");
    }
    res.send(GIF);
  });

  app.get("/c/:token/:linkId", async (req, res) => {
    try {
      const recipient = await prisma.campaignRecipient.findUnique({
        where: { token: req.params.token },
        include: { campaign: true },
      });
      const link = await prisma.link.findUnique({ where: { id: BigInt(req.params.linkId) } });
      if (!recipient || !link || link.campaignId !== recipient.campaignId) {
        res.redirect(config.companyWebsite);
        return;
      }
      const ua = (req.get("user-agent") ?? "").slice(0, 300);
      const recent = await prisma.event.count({
        where: { recipientId: recipient.id, type: "click", createdAt: { gte: new Date(Date.now() - 2000) } },
      });
      await prisma.event.create({
        data: {
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          type: "click",
          linkId: link.id,
          isBot: isScannerUserAgent(ua) || isFastClick(recipient.sentAt) || recent >= 2,
          userAgent: ua || null,
          ipHash: hashIp(req.ip ?? ""),
        },
      });
      const target = recipient.campaign.useUtm ? appendUtm(link.originalUrl, recipient.campaign.name) : link.originalUrl;
      res.redirect(target);
    } catch (error) {
      logger.error({ err: error }, "click track failed");
      res.redirect(config.companyWebsite);
    }
  });

  app.get("/u/:token", async (req, res) => {
    if (req.params.token === "preview") {
      res.send(page("Unsubscribe preview", "This link is a preview. No contact was changed."));
      return;
    }
    const recipient = await prisma.campaignRecipient.findUnique({ where: { token: req.params.token }, include: { contact: true } });
    if (!recipient) {
      res.status(200).send(page("Unsubscribe", "This link is not valid."));
      return;
    }
    if (recipient.contact.status === "unsubscribed") {
      res.send(page("Unsubscribed", "This address is already unsubscribed."));
      return;
    }
    res.send(page("Unsubscribe", `<form method="post"><button type="submit">Unsubscribe ${escapeHtml(recipient.contact.email)}</button></form>`));
  });

  app.post("/u/:token", async (req, res) => {
    if (req.params.token === "preview") {
      res.send(page("Unsubscribe preview", "This link is a preview. No contact was changed."));
      return;
    }
    const recipient = await prisma.campaignRecipient.findUnique({ where: { token: req.params.token }, include: { contact: true } });
    if (!recipient) {
      res.status(200).send(page("Unsubscribe", "This link is not valid."));
      return;
    }
    if (recipient.contact.status !== "unsubscribed") {
      await prisma.contact.update({ where: { id: recipient.contactId }, data: { status: "unsubscribed" } });
      await prisma.suppression.upsert({
        where: { email: recipient.contact.email },
        update: { reason: "unsubscribed", campaignId: recipient.campaignId },
        create: { email: recipient.contact.email, reason: "unsubscribed", campaignId: recipient.campaignId },
      });
      await prisma.event.create({
        data: { campaignId: recipient.campaignId, recipientId: recipient.id, type: "unsubscribe" },
      });
    }
    res.send(page("Unsubscribed", "You will not receive further campaign emails at this address."));
  });

  app.get("/g/:slug", async (req, res) => {
    const gate = await prisma.gate.findUnique({ where: { slug: String(req.params.slug) } });
    if (!gate || !gate.active) {
      res.status(404).send(page("Not available", "This page is not open."));
      return;
    }
    res.send(page(gate.title, `<p>${escapeHtml(gate.detail)}</p><form method="post"><input name="firstName" placeholder="Name" style="display:block;width:100%;margin:8px 0;padding:8px"><input name="email" type="email" required placeholder="Email" style="display:block;width:100%;margin:8px 0;padding:8px"><button type="submit">Continue</button></form>`));
  });

  app.post("/g/:slug", async (req, res) => {
    const gate = await prisma.gate.findUnique({ where: { slug: String(req.params.slug) } });
    if (!gate || !gate.active) {
      res.status(404).send(page("Not available", "This page is not open."));
      return;
    }
    const result = await captureLead({
      email: String(req.body.email ?? ""),
      firstName: String(req.body.firstName ?? ""),
      tagName: gate.tagName,
      source: "gate",
    });
    if (!result.ok) {
      res.status(400).send(page(gate.title, escapeHtml(result.error)));
      return;
    }
    res.send(page("You are in", `<p>Here is the link.</p><p><a href="${escapeHtml(gate.assetUrl)}">${escapeHtml(gate.assetUrl)}</a></p>`));
  });

  app.get("/r/:code", async (req, res) => {
    const referrer = await prisma.contact.findUnique({ where: { referralCode: String(req.params.code) } });
    if (!referrer) {
      res.status(404).send(page("Link not found", "This referral link is not valid."));
      return;
    }
    res.send(page("You were invited", `<form method="post"><input name="firstName" placeholder="Name" style="display:block;width:100%;margin:8px 0;padding:8px"><input name="email" type="email" required placeholder="Email" style="display:block;width:100%;margin:8px 0;padding:8px"><button type="submit">Join</button></form>`));
  });

  app.post("/r/:code", async (req, res) => {
    const referrer = await prisma.contact.findUnique({ where: { referralCode: String(req.params.code) } });
    if (!referrer) {
      res.status(404).send(page("Link not found", "This referral link is not valid."));
      return;
    }
    const result = await captureLead({
      email: String(req.body.email ?? ""),
      firstName: String(req.body.firstName ?? ""),
      tagName: "Referred",
      source: "referral",
      referredById: referrer.id,
    });
    if (!result.ok) {
      res.status(400).send(page("You were invited", escapeHtml(result.error)));
      return;
    }
    res.send(page("Welcome", "You are on the list."));
  });

  return app;
}

buildTracking().listen(config.trackingPort, "127.0.0.1", () => {
  logger.info({ port: config.trackingPort }, "tracking listening");
});
