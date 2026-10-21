import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { emptyDesign, type Design } from "../src/render/design";
import { renderDesign } from "../src/render/email";

const prisma = new PrismaClient();

function design(html: string, button?: { label: string; href: string }): Design {
  const base = emptyDesign();
  base.blocks = [
    {
      id: "copy",
      type: "text",
      html,
      style: { fontSize: 16, align: "left", padding: "28px 28px 8px", bg: "transparent" },
    },
  ];
  if (button) {
    base.blocks.push({
      id: "cta",
      type: "button",
      label: button.label,
      href: button.href,
      style: { bg: "#0f766e", color: "#ffffff", fontSize: 16, radius: 6, align: "center" },
    });
  }
  return base;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database");
  }
  // Bootstrap admin only. No demo or team user accounts are seeded — the
  // bootstrap admin creates real users from the Users page after sign-in.
  // Override both values with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env,
  // and change the bootstrap password immediately after the first sign-in.
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Qwe@123";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@mailer.com").toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.team.upsert({ where: { name: "Sales" }, update: {}, create: { name: "Sales" } });
  await prisma.team.upsert({ where: { name: "Marketing" }, update: {}, create: { name: "Marketing" } });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    // Never reset an existing admin's password on re-seed.
    update: { isActive: true, role: "admin" },
    create: { name: "Admin", email: adminEmail, passwordHash, role: "admin" },
  });

  const settings: Record<string, string> = {
    company_name: "Cachedigitech",
    company_address: "Update the company address in Settings before sending",
    default_footer: "",
    bounce_pause_threshold: "0.05",
    bounce_pause_min_sends: "100",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  for (const module of ["contacts", "leads"] as const) {
    await prisma.zohoSyncState.upsert({ where: { module }, update: {}, create: { module, lastStatus: "never" } });
  }

  const starters: Array<{ name: string; category: string; design: Design }> = [
    { name: "Plain personal", category: "general", design: design("<p>Hi {{first_name | there}},</p><p>I wanted to share a quick update.</p>") },
    {
      name: "Announcement",
      category: "launch",
      design: design("<p>Hi {{first_name | there}},</p><p>We have news from {{company | your team}}.</p>", {
        label: "Read the update",
        href: "https://cachedigitech.com",
      }),
    },
    {
      name: "Newsletter",
      category: "newsletter",
      design: design("<p>Hi {{first_name | there}},</p><p>Here is this month's note from Cachedigitech.</p>", {
        label: "Open the newsletter",
        href: "https://cachedigitech.com",
      }),
    },
  ];
  for (const starter of starters) {
    const existing = await prisma.template.findFirst({ where: { name: starter.name, visibility: "shared" } });
    const rendered = await renderDesign(starter.design, { company: "Cachedigitech", address: settings.company_address });
    if (existing) continue;
    await prisma.template.create({
      data: {
        name: starter.name,
        category: starter.category,
        kind: "template",
        visibility: "shared",
        designJson: rendered.design,
        html: rendered.html,
        textVersion: rendered.text,
        createdBy: admin.id,
      },
    });
  }
  console.log(`Seeded teams and starter templates. Bootstrap admin: ${adminEmail} (password from SEED_ADMIN_PASSWORD — change it after first sign-in).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
