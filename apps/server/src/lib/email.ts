export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Split a typed CC list (comma or semicolon). Caps at 10 unique addresses. */
export function parseCcEmails(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[,;]+/)) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) continue;
    if (!isValidEmail(email)) throw new Error(`Invalid CC email: ${part.trim()}`);
    seen.add(email);
    emails.push(email);
    if (emails.length >= 10) break;
  }
  return emails;
}
