import { prisma } from "../db";

const DEFAULTS: Record<string, string> = {
  company_name: "Cachedigitech",
  company_address: "Update the company address in Settings before sending",
  default_footer: "",
  bounce_pause_threshold: "0.05",
  bounce_pause_min_sends: "100",
  smtp_host: "smtp.office365.com",
  smtp_port: "587",
  smtp_secure: "false",
  smtp_email: "",
  smtp_from_name: "",
  zoho_field_map: JSON.stringify({
    contacts: { email: "Email", first_name: "First_Name", last_name: "Last_Name", company: "Account_Name", job_title: "Title" },
    leads: { email: "Email", first_name: "First_Name", last_name: "Last_Name", company: "Company", job_title: "Designation" },
  }),
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function putSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function companyFooter(): Promise<{ company: string; address: string }> {
  const [company, address] = await Promise.all([getSetting("company_name"), getSetting("company_address")]);
  return { company, address };
}
