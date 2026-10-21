export function classifyBounce(statusCode: string | null): "hard" | "soft" | null {
  if (!statusCode) return null;
  if (statusCode.startsWith("5")) return "hard";
  if (statusCode.startsWith("4")) return "soft";
  return null;
}

export function extractStatusCode(text: string): string | null {
  return text.match(/\b([45]\.\d{1,3}\.\d{1,3})\b/)?.[1] ?? null;
}

export function extractRecipient(text: string): string | null {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return emails.find((email) => !/postmaster|mailer-daemon|microsoftexchange/i.test(email))?.toLowerCase() ?? null;
}

export function isNdr(from: string, subject: string): boolean {
  return (
    /postmaster|mailer-daemon|microsoftexchange/i.test(from) ||
    /undeliverable|delivery status notification|failure notice/i.test(subject)
  );
}

export function isAutoReply(subject: string, autoSubmitted: string | undefined): boolean {
  if (autoSubmitted && !/^no$/i.test(autoSubmitted.trim())) return true;
  return /out of office|automatic reply|autoreply/i.test(subject);
}

export function isScannerUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /proofpoint|mimecast|barracuda|googleimageproxy|scanner|bot|crawler|prefetch/i.test(userAgent);
}

export function isFastClick(sentAt: Date | null, now = Date.now()): boolean {
  if (!sentAt) return false;
  return now - sentAt.getTime() < 10_000;
}
