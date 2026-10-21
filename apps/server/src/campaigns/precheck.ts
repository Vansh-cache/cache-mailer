import { companyFooter } from "../lib/settings";
import type { AuthUser } from "../types";
import { renderDesign } from "../render/email";
import { audienceSchema, resolveAudience } from "./audience";

export type Precheck = { ok: boolean; checks: { id: string; ok: boolean; detail: string }[]; audienceCount: number };

type CampaignShape = {
  id: bigint;
  subject: string;
  teamId: number;
  audience: unknown;
  template: { designJson: unknown };
  senders: { sender: { status: string; teamId: number; fromEmail: string } }[];
};

export async function precheckCampaign(campaign: CampaignShape, user: AuthUser): Promise<Precheck> {
  const checks: Precheck["checks"] = [];
  checks.push({
    id: "subject",
    ok: campaign.subject.trim().length > 0,
    detail: campaign.subject.trim() ? "Subject is set" : "Add a subject",
  });
  const footer = await companyFooter();
  const addressOk = footer.address.trim().length > 8 && !footer.address.startsWith("Update the company address");
  checks.push({
    id: "address",
    ok: addressOk,
    detail: addressOk ? "Company address is in the footer" : "Set the company address in Settings",
  });
  let unsubOk = false;
  let unsubDetail = "The email could not be rendered";
  try {
    const html = await renderDesign(campaign.template.designJson, footer);
    if (!html.design.settings.includeUnsubscribe) {
      unsubOk = true;
      unsubDetail = "Unsubscribe link is off";
    } else if (html.text.toLowerCase().includes("unsubscribe")) {
      unsubOk = true;
      unsubDetail = "Unsubscribe link will be added";
    }
  } catch {
    unsubOk = false;
  }
  checks.push({
    id: "unsubscribe",
    ok: unsubOk,
    detail: unsubDetail,
  });
  const active = campaign.senders.filter((row) => row.sender.status === "active" && row.sender.teamId === campaign.teamId);
  checks.push({
    id: "mailbox",
    ok: active.length > 0,
    detail: active.length ? `${active.length} active mailbox${active.length === 1 ? "" : "es"}` : "Choose an active mailbox on this team",
  });
  let audienceCount = 0;
  try {
    const people = await resolveAudience(user, audienceSchema.parse(campaign.audience));
    audienceCount = people.length;
    checks.push({
      id: "audience",
      ok: audienceCount > 0,
      detail: audienceCount ? `${audienceCount} people after suppression` : "Nobody left after suppression and exclusions",
    });
  } catch (error) {
    checks.push({
      id: "audience",
      ok: false,
      detail: error instanceof Error ? error.message : "Audience is invalid",
    });
  }
  return { ok: checks.every((check) => check.ok), checks, audienceCount };
}
