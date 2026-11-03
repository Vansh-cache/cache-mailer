const HREF = /href\s*=\s*(["'])(.*?)\1/gi;

export function extractLinks(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(HREF)) {
    const url = match[2]?.trim() ?? "";
    if (!/^https?:\/\//i.test(url)) continue;
    if (url.includes("/u/") || url.includes("[[UNSUB]]")) continue;
    found.add(url);
  }
  return [...found];
}

// Only href values are rewritten: a plain text replace would also hit image
// src URLs that share a prefix with a link and break those images.
export function applyLinkMap(html: string, map: Map<string, string>): string {
  if (map.size === 0) return html;
  return html.replace(HREF, (whole, quote: string, value: string) => {
    const tracked = map.get(value.trim());
    if (!tracked) return whole;
    return whole.replace(`${quote}${value}${quote}`, `${quote}${tracked}${quote}`);
  });
}

export function appendUtm(url: string, campaignName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.searchParams.has("utm_source")) parsed.searchParams.set("utm_source", "cachedigitech");
  if (!parsed.searchParams.has("utm_medium")) parsed.searchParams.set("utm_medium", "email");
  if (!parsed.searchParams.has("utm_campaign")) {
    parsed.searchParams.set(
      "utm_campaign",
      campaignName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "campaign",
    );
  }
  return parsed.toString();
}
