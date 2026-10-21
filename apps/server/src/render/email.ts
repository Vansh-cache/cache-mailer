import mjml2html from "mjml";
import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";
import { AppError, assertNever } from "../errors";
import { escapeHtml } from "../lib/crypto";
import { designSchema, SECTION_ORDER, type Block, type Design } from "./design";

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "a", "span", "ul", "ol", "li"],
    allowedAttributes: { a: ["href", "target"], span: ["style"] },
    allowedStyles: {
      span: {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        "font-size": [/^\d+px$/],
      },
    },
  });
}

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (trimmed.startsWith("{{") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

function attr(value: string): string {
  return escapeHtml(value);
}

function blockMjml(block: Block): string {
  switch (block.type) {
    case "text":
      return `<mj-text align="${block.style.align}" font-size="${block.style.fontSize}px" padding="${attr(block.style.padding)}"${
        block.style.bg !== "transparent" ? ` container-background-color="${attr(block.style.bg)}"` : ""
      }>${sanitizeRichText(block.html)}</mj-text>`;
    case "image": {
      const href = safeHref(block.href);
      const width = block.width === "100%" ? "" : ` width="${attr(block.width)}"`;
      return `<mj-image src="${attr(block.src)}" alt="${attr(block.alt)}" align="${block.align}"${width}${
        href ? ` href="${attr(href)}"` : ""
      } />`;
    }
    case "button": {
      const href = safeHref(block.href) ?? "https://cachedigitech.com";
      return `<mj-button href="${attr(href)}" background-color="${attr(block.style.bg)}" color="${attr(block.style.color)}" font-size="${block.style.fontSize}px" border-radius="${block.style.radius}px" align="${block.style.align}" inner-padding="12px 22px">${escapeHtml(block.label)}</mj-button>`;
    }
    case "divider":
      return `<mj-divider border-color="${attr(block.style.color)}" border-width="${block.style.height}px" />`;
    case "spacer":
      return `<mj-spacer height="${block.height}px" />`;
    default:
      return assertNever(block);
  }
}

export async function renderDesign(
  input: unknown,
  footer: { company: string; address: string },
) {
  const design = designSchema.parse(input);
  if (design.settings.compose === "plain") {
    const body = design.settings.plainBody.trim();
    const unsub = design.settings.includeUnsubscribe ? "\n\nUnsubscribe: [[UNSUB]]" : "";
    const text = `${body}\n\n${footer.company}\n${footer.address}${unsub}`;
    const html = `<!doctype html><html><body style="font-family:Georgia,serif;font-size:18px;line-height:1.6;color:#1f2937;max-width:640px;margin:0 auto;padding:24px"><div style="white-space:pre-wrap">${escapeHtml(body)}</div><p style="color:#6b7280;font-size:12px">${escapeHtml(footer.company)}<br/>${escapeHtml(footer.address)}${design.settings.includeUnsubscribe ? `<br/><a href="[[UNSUB]]">Unsubscribe</a>` : ""}</p></body></html>`;
    return { html, text, design };
  }
  const ordered = [...design.blocks].sort((a, b) => SECTION_ORDER[a.section ?? "body"] - SECTION_ORDER[b.section ?? "body"]);
  const mainBlocks = ordered.filter((block) => (block.section ?? "body") !== "footer");
  const footerBlocks = ordered.filter((block) => (block.section ?? "body") === "footer");
  const source = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="${attr(design.settings.fontFamily)}" />
      <mj-text color="${attr(design.settings.textColor)}" font-size="${design.settings.baseFontSize}px" />
    </mj-attributes>
  </mj-head>
  <mj-body width="${design.settings.width}px" background-color="${attr(design.settings.outerBg)}">
    <mj-section background-color="${attr(design.settings.contentBg)}" padding="0">
      <mj-column>
        ${mainBlocks.map(blockMjml).join("\n")}
      </mj-column>
    </mj-section>${footerBlocks.length > 0 ? `
    <mj-section background-color="#f3f4f6" padding="0">
      <mj-column>
        ${footerBlocks.map(blockMjml).join("\n")}
      </mj-column>
    </mj-section>` : ""}
    <mj-section padding="8px 16px 24px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#6b7280" line-height="18px">
          ${escapeHtml(footer.company)}<br/>${escapeHtml(footer.address)}${
            design.settings.includeUnsubscribe ? `<br/><a href="[[UNSUB]]" style="color:#6b7280">Unsubscribe</a>` : ""
          }
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
  const rendered = await mjml2html(source, { validationLevel: "soft" });
  if (!rendered.html) {
    throw new AppError(400, "Email render failed", rendered.errors);
  }
  const text = convert(rendered.html, { wordwrap: 80, selectors: [{ selector: "img", format: "skip" }] });
  if (design.settings.includeUnsubscribe && !rendered.html.includes("[[UNSUB]]")) {
    throw new AppError(500, "Rendered email is missing the unsubscribe link");
  }
  return { html: rendered.html, text, design };
}

export function injectPreheader(html: string, preheader: string): string {
  if (!preheader.trim()) return html;
  const hidden = `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>`;
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, `<body$1>${hidden}`);
  return hidden + html;
}

export function injectPixel(html: string, pixelUrl: string): string {
  const tag = `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:none" />`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`);
  return html + tag;
}
