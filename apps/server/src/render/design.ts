import { z } from "zod";

export const sectionSchema = z.enum(["header", "body", "footer"]);
export type Section = z.infer<typeof sectionSchema>;
export const SECTION_ORDER: Record<Section, number> = { header: 0, body: 1, footer: 2 };

export const designSchema = z.object({
  version: z.literal(1),
  settings: z.object({
    outerBg: z.string().min(1),
    contentBg: z.string().min(1),
    width: z.number().int().min(320).max(800),
    fontFamily: z.string().min(1),
    baseFontSize: z.number().int().min(12).max(28),
    textColor: z.string().min(1),
    linkColor: z.string().min(1),
    includeUnsubscribe: z.boolean().default(false),
    compose: z.enum(["blocks", "plain"]).default("blocks"),
    plainBody: z.string().max(20000).default(""),
  }),
  blocks: z.array(
    z.discriminatedUnion("type", [
      z.object({
        id: z.string().min(1),
        section: sectionSchema.default("body"),
        type: z.literal("text"),
        html: z.string(),
        style: z.object({
          fontSize: z.number().int().min(10).max(40),
          align: z.enum(["left", "center", "right"]),
          padding: z.string().min(1),
          bg: z.string().min(1),
        }),
      }),
      z.object({
        id: z.string().min(1),
        section: sectionSchema.default("body"),
        type: z.literal("image"),
        src: z.string().min(1),
        alt: z.string(),
        width: z.string().min(1),
        align: z.enum(["left", "center", "right"]),
        href: z.string().optional(),
        overlayHeading: z.string().max(200).optional(),
        overlayText: z.string().max(500).optional(),
        overlayColor: z.string().max(40).optional(),
        overlayBg: z.string().max(40).optional(),
      }),
      z.object({
        id: z.string().min(1),
        section: sectionSchema.default("body"),
        type: z.literal("button"),
        label: z.string().min(1),
        href: z.string().min(1),
        style: z.object({
          bg: z.string().min(1),
          color: z.string().min(1),
          fontSize: z.number().int().min(10).max(32),
          radius: z.number().int().min(0).max(40),
          align: z.enum(["left", "center", "right"]),
        }),
      }),
      z.object({
        id: z.string().min(1),
        section: sectionSchema.default("body"),
        type: z.literal("divider"),
        style: z.object({
          color: z.string().min(1),
          height: z.number().int().min(1).max(12),
        }),
      }),
      z.object({
        id: z.string().min(1),
        section: sectionSchema.default("body"),
        type: z.literal("spacer"),
        height: z.number().int().min(4).max(120),
      }),
    ]),
  ),
});

export type Design = z.infer<typeof designSchema>;
export type Block = Design["blocks"][number];

export function emptyDesign(): Design {
  return {
    version: 1,
    settings: {
      outerBg: "#f3f4f6",
      contentBg: "#ffffff",
      width: 600,
      fontFamily: "Arial, Helvetica, sans-serif",
      baseFontSize: 16,
      textColor: "#1f2937",
      linkColor: "#0f766e",
      includeUnsubscribe: false,
      compose: "blocks",
      plainBody: "",
    },
    blocks: [
      {
        id: "intro",
        section: "body",
        type: "text",
        html: "<p>Hi {{first_name | there}},</p><p>Write your message here.</p>",
        style: { fontSize: 16, align: "left", padding: "24px 28px 8px", bg: "transparent" },
      },
    ],
  };
}
