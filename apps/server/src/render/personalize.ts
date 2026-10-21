import { escapeHtml } from "../lib/crypto";

const TAG = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;

export function personalize(input: string, fields: Record<string, string | null | undefined>): string {
  return input.replace(TAG, (_match, key: string, fallback: string | undefined) => {
    const value = fields[key];
    if (value != null && String(value).trim() !== "") return String(value);
    return fallback?.trim() ?? "";
  });
}

// Use for HTML bodies: contact data (names, companies, custom fields) is
// untrusted — importing a crafted contact must never inject markup into mail.
export function personalizeHtml(input: string, fields: Record<string, string | null | undefined>): string {
  const escaped: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    escaped[key] = value == null ? null : escapeHtml(String(value));
  }
  return personalize(input, escaped);
}

export function contactFields(contact: {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  customFields: unknown;
}): Record<string, string | null> {
  const custom =
    contact.customFields && typeof contact.customFields === "object" && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  const fields: Record<string, string | null> = {
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    company: contact.company,
    job_title: contact.jobTitle,
  };
  for (const [key, value] of Object.entries(custom)) {
    fields[key] = value == null ? null : String(value);
  }
  return fields;
}
