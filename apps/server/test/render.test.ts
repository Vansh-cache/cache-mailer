import assert from "node:assert/strict";
import test from "node:test";
import { matchesRules } from "../src/audience/rules";
import { backoffMs } from "../src/lib/backoff";
import { classifyBounce, extractRecipient, extractStatusCode, isAutoReply, isNdr } from "../src/render/bounce";
import { applyLinkMap, extractLinks } from "../src/render/links";
import { buildMime, encodeMime, needsMime } from "../src/providers/mime";
import { isTemporarySmtpError } from "../src/providers/smtp";
import fs from "node:fs";
import path from "node:path";
import { personalize, personalizeHtml } from "../src/render/personalize";
import { publicImageSrc } from "../src/render/email";
import { embedUploadedImages } from "../src/render/embed-images";
import { buildMime } from "../src/providers/mime";
import { config } from "../src/config";
import { emptyDesign } from "../src/render/design";
import { renderDesign } from "../src/render/email";

test("sections render header first and footer last regardless of stored order", async () => {
  const design = emptyDesign();
  design.blocks = [
    { id: "f", section: "footer", type: "text", html: "<p>FOOTER-TEXT</p>", style: { fontSize: 13, align: "left", padding: "12px 28px", bg: "transparent" } },
    { id: "b", section: "body", type: "text", html: "<p>BODY-TEXT</p>", style: { fontSize: 16, align: "left", padding: "12px 28px", bg: "transparent" } },
    { id: "h", section: "header", type: "text", html: "<p>HEADER-TEXT</p>", style: { fontSize: 20, align: "center", padding: "12px 28px", bg: "transparent" } },
  ];
  const rendered = await renderDesign(design, { company: "Cachedigitech", address: "Some address" });
  const headerAt = rendered.html.indexOf("HEADER-TEXT");
  const bodyAt = rendered.html.indexOf("BODY-TEXT");
  const footerAt = rendered.html.indexOf("FOOTER-TEXT");
  assert.ok(headerAt >= 0 && bodyAt > headerAt && footerAt > bodyAt);
});

test("merge tags use the value or the fallback", () => {
  assert.equal(personalize("Hi {{first_name | there}}", { first_name: "Asha" }), "Hi Asha");
  assert.equal(personalize("Hi {{first_name | there}}", { first_name: "  " }), "Hi there");
  assert.equal(personalize("{{company}}", {}), "");
});

test("personalizeHtml escapes contact data but keeps template markup", () => {
  const out = personalizeHtml("<p>Hi {{first_name}}</p>", { first_name: '<img src=x onerror="x">' });
  assert.equal(out, "<p>Hi &lt;img src=x onerror=&quot;x&quot;&gt;</p>");
  assert.equal(personalize("Hi {{first_name}}", { first_name: "<b>Nora</b>" }), "Hi <b>Nora</b>");
});

test("uploaded images render against the configured public media base", () => {
  assert.equal(publicImageSrc("/media/abc123.png"), `${config.mediaUrl}/abc123.png`);
  assert.equal(publicImageSrc("http://127.0.0.1:4000/media/abc123.png"), `${config.mediaUrl}/abc123.png`);
  assert.equal(publicImageSrc("http://172.16.200.30:4000/media/abc123.png?x=1"), `${config.mediaUrl}/abc123.png`);
  assert.equal(publicImageSrc("https://placehold.co/600x200/png"), "https://placehold.co/600x200/png");
});

test("uploaded images embed as CID attachments and MIME carries them inline", async () => {
  const fileName = "0123456789abcdef0123456789abcdef.png";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
  const filePath = path.join(config.uploadDir, fileName);
  await fs.promises.mkdir(config.uploadDir, { recursive: true });
  await fs.promises.writeFile(filePath, png);
  try {
    const result = await embedUploadedImages(`<p>x</p><img src="http://127.0.0.1:4000/media/${fileName}" alt="a" />`);
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0]?.contentType, "image/png");
    assert.match(result.html, /src="cid:img[0-9a-f]{20}"/);
    assert.ok(!result.html.includes("/media/"));
    const mime = buildMime({
      fromEmail: "a@example.com",
      fromName: "A",
      to: "b@example.com",
      subject: "Hi",
      html: result.html,
      text: "x",
      attachments: result.attachments,
    });
    assert.match(mime, /multipart\/related/);
    assert.match(mime, new RegExp(`Content-ID: <${result.attachments[0]?.cid}>`));
  } finally {
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
});

test("link rewrite replaces longer urls first", () => {
  const html = '<a href="https://a.example/b">x</a><a href="https://a.example">y</a>';
  const map = new Map([
    ["https://a.example", "https://track/short"],
    ["https://a.example/b", "https://track/long"],
  ]);
  const rewritten = applyLinkMap(html, map);
  assert.match(rewritten, /https:\/\/track\/long/);
  assert.match(rewritten, /https:\/\/track\/short/);
  assert.equal(rewritten.includes("https://a.example/b"), false);
  assert.equal(rewritten.includes('href="https://a.example"'), false);
});

test("bounce classification", () => {
  assert.equal(classifyBounce(extractStatusCode("550 5.1.1 user unknown")), "hard");
  assert.equal(classifyBounce("4.2.2"), "soft");
  assert.equal(extractRecipient("postmaster@example.com rejected asha@client.com"), "asha@client.com");
  assert.equal(isNdr("postmaster@cachedigitech.com", "hello"), true);
  assert.equal(isAutoReply("Out of office", undefined), true);
  assert.equal(isAutoReply("Re: pricing", "no"), false);
});

test("unsubscribe mail carries a one-click header and a text part", () => {
  const mime = buildMime({
    fromEmail: "marketing@cachedigitech.com",
    fromName: "Cachedigitech",
    replyTo: "replies@cachedigitech.com",
    to: "asha@client.com",
    subject: "October update",
    html: "<p>Hello</p>",
    text: "Hello",
    headers: [
      { name: "List-Unsubscribe", value: "<https://track.example/u/abc>" },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ],
  });
  assert.equal(needsMime([{ name: "x-cdt-token" }]), false);
  assert.equal(needsMime([{ name: "List-Unsubscribe" }]), true);
  assert.match(mime, /List-Unsubscribe: <https:\/\/track\.example\/u\/abc>/);
  assert.match(mime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(mime, /text\/plain/);
  assert.match(mime, /text\/html/);
  assert.equal(Buffer.from(encodeMime(mime), "base64").toString("utf8"), mime);
});

test("smtp temporary failures are retryable and auth failures are not", () => {
  assert.equal(isTemporarySmtpError(Object.assign(new Error("busy"), { responseCode: 451 })), true);
  assert.equal(isTemporarySmtpError(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), true);
  assert.equal(isTemporarySmtpError(Object.assign(new Error("bad login"), { responseCode: 535 })), false);
});

test("segment rules combine tag and company", () => {
  const contact = {
    email: "a@b.com",
    firstName: "Asha",
    lastName: null,
    company: "Tech Co",
    jobTitle: null,
    status: "active",
    tags: ["Lead"],
  };
  const rules = {
    op: "and" as const,
    conditions: [
      { field: "tag" as const, op: "eq" as const, value: "Lead" },
      { field: "company" as const, op: "contains" as const, value: "tech" },
    ],
  };
  assert.equal(matchesRules(contact, rules), true);
  assert.equal(matchesRules({ ...contact, company: "Food" }, rules), false);
});

test("retry backoff stops after four attempts", () => {
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(4), 3_600_000);
  assert.equal(backoffMs(5), null);
});
