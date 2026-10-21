export type Role = "admin" | "marketing" | "sales";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  teamId: number | null;
  isActive?: boolean;
  teamName: string | null;
};

export type Design = {
  version: 1;
  settings: {
    outerBg: string;
    contentBg: string;
    width: number;
    fontFamily: string;
    baseFontSize: number;
    textColor: string;
    linkColor: string;
    includeUnsubscribe?: boolean;
    compose?: "blocks" | "plain";
    plainBody?: string;
  };
  blocks: Block[];
};

export type Section = "header" | "body" | "footer";

export type Block =
  | { id: string; section?: Section; type: "text"; html: string; style: { fontSize: number; align: "left" | "center" | "right"; padding: string; bg: string } }
  | { id: string; section?: Section; type: "image"; src: string; alt: string; width: string; align: "left" | "center" | "right"; href?: string }
  | { id: string; section?: Section; type: "button"; label: string; href: string; style: { bg: string; color: string; fontSize: number; radius: number; align: "left" | "center" | "right" } }
  | { id: string; section?: Section; type: "divider"; style: { color: string; height: number } }
  | { id: string; section?: Section; type: "spacer"; height: number };

let csrfToken = "";

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details ?? null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const mutating = method !== "GET" && method !== "HEAD";
  if (mutating && !csrfToken) await ensureCsrf();
  const attempt = async (): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (mutating && csrfToken) headers.set("x-csrf-token", csrfToken);
    return fetch(path, { ...init, method, headers, credentials: "include" });
  };
  let response = await attempt();
  if (response.status === 403 && mutating) {
    // A stale or raced CSRF token (common on the very first sign-in click):
    // the cookie is set by now, so refresh the token and retry exactly once.
    const peek = await response.clone().json().catch(() => null) as { error?: string } | null;
    if (peek?.error && peek.error.toLowerCase().includes("csrf")) {
      await ensureCsrf(true);
      response = await attempt();
    }
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new ApiError(response.status, data.error ?? "Request failed", data.details);
  return data as T;
}

let csrfPromise: Promise<void> | null = null;

export async function ensureCsrf(force = false): Promise<void> {
  if (csrfToken && !force) return;
  if (!csrfPromise || force) {
    csrfPromise = (async () => {
      const data = await request<{ csrfToken: string }>("/api/auth/csrf");
      csrfToken = data.csrfToken;
    })().finally(() => {
      csrfPromise = null;
    });
  }
  return csrfPromise;
}

export const api = {
  me: () => request<{ user: User }>("/api/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  teams: () => request<{ teams: { id: number; name: string }[] }>("/api/teams"),
  users: () => request<{ users: User[] }>("/api/users"),
  createUser: (body: unknown) => request("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: unknown) => request(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  contacts: (query: string) => request<{ contacts: Contact[]; total: number }>(`/api/contacts${query}`),
  contact: (id: number) => request<{ contact: Contact; activity: Activity[]; referralUrl: string }>(`/api/contacts/${id}`),
  createContact: (body: unknown) => request("/api/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: number, body: unknown) => request(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteContact: (id: number) => request(`/api/contacts/${id}`, { method: "DELETE" }),
  deleteContacts: (body: { ids?: number[]; search?: string; tagId?: number; allMatching?: boolean }) =>
    request<{ deleted: number }>("/api/contacts/bulk-delete", { method: "POST", body: JSON.stringify(body) }),
  importContacts: (file: File, mapping: unknown) => {
    const body = new FormData();
    body.set("file", file);
    body.set("mapping", JSON.stringify(mapping));
    return request<{ created: number; updated: number; skipped: number; invalid: number; category: string | null; labels: string[]; demo: boolean; columns: Record<string, string> }>("/api/contacts/import", { method: "POST", body });
  },
  tags: () => request<{ tags: { id: number; name: string; count: number; points: number }[] }>("/api/tags"),
  setTagPoints: (id: number, points: number) => request(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify({ points }) }),
  createTag: (name: string) => request("/api/tags", { method: "POST", body: JSON.stringify({ name }) }),
  deleteTag: (id: number) => request(`/api/tags/${id}`, { method: "DELETE" }),
  applyTags: (body: unknown) => request("/api/contacts/tags", { method: "POST", body: JSON.stringify(body) }),
  segments: () => request<{ segments: Segment[] }>("/api/segments"),
  createSegment: (body: unknown) => request("/api/segments", { method: "POST", body: JSON.stringify(body) }),
  deleteSegment: (id: number) => request(`/api/segments/${id}`, { method: "DELETE" }),
  previewSegment: (rules: unknown) => request<{ count: number }>("/api/segments/preview", { method: "POST", body: JSON.stringify({ rules }) }),
  suppression: () => request<{ suppression: Suppression[] }>("/api/suppression"),
  addSuppression: (email: string) => request("/api/suppression", { method: "POST", body: JSON.stringify({ email, reason: "manual" }) }),
  templates: (search = "") => request<{ templates: Template[] }>(`/api/templates?search=${encodeURIComponent(search)}`),
  template: (id: number) => request<{ template: Template }>(`/api/templates/${id}`),
  createTemplate: (body: unknown) => request<{ template: Template }>("/api/templates", { method: "POST", body: JSON.stringify(body) }),
  saveTemplate: (id: number, body: unknown) => request<{ template: Template }>(`/api/templates/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTemplate: (id: number) => request(`/api/templates/${id}`, { method: "DELETE" }),
  duplicateTemplate: (id: number) => request<{ template: Template }>(`/api/templates/${id}/duplicate`, { method: "POST" }),
  preview: (design: Design) => request<{ html: string; text: string }>("/api/templates/preview", { method: "POST", body: JSON.stringify({ design }) }),
  testSend: (id: number, senderId: number, receiver: string, tagIds: number[] = []) => request<{ ok: boolean; sent: string[]; matched: number; truncated: boolean }>(`/api/templates/${id}/test-send`, { method: "POST", body: JSON.stringify({ senderId, to: receiver, tagIds }) }),
  audiencePreview: (body: { tags: number[]; segmentId?: number | null; excludeTags?: number[] }) => request<{ count: number }>("/api/campaigns/audience-preview", { method: "POST", body: JSON.stringify(body) }),
  upload: (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return request<{ asset: { url: string } }>("/api/assets", { method: "POST", body });
  },
  senders: () => request<{ senders: Sender[] }>("/api/senders"),
  createSender: (body: unknown) => request("/api/senders", { method: "POST", body: JSON.stringify(body) }),
  updateSender: (id: number, body: unknown) => request(`/api/senders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  checkSender: (id: number) => request<{ ok: boolean; error?: string }>(`/api/senders/${id}/check`, { method: "POST" }),
  testSender: (id: number, to: string) => request(`/api/senders/${id}/test`, { method: "POST", body: JSON.stringify({ to }) }),
  campaigns: () => request<{ campaigns: Campaign[] }>("/api/campaigns"),
  campaign: (id: number) => request<{ campaign: Campaign }>(`/api/campaigns/${id}`),
  createCampaign: (body: unknown) => request<{ campaign: { id: number } }>("/api/campaigns", { method: "POST", body: JSON.stringify(body) }),
  precheck: (id: number) => request<Precheck>(`/api/campaigns/${id}/precheck`, { method: "POST" }),
  sendCampaign: (id: number) => request(`/api/campaigns/${id}/send`, { method: "POST" }),
  scheduleCampaign: (id: number, scheduledAt: string) => request(`/api/campaigns/${id}/schedule`, { method: "POST", body: JSON.stringify({ scheduledAt }) }),
  campaignAction: (id: number, action: "pause" | "resume" | "cancel" | "duplicate") =>
    request<{ campaign?: { id: number } }>(`/api/campaigns/${id}/${action}`, { method: "POST" }),
  stats: (id: number) => request<Stats>(`/api/campaigns/${id}/stats`),
  timeline: (id: number) => request<{ points: { hourStart: string; opens: number; clicks: number }[] }>(`/api/campaigns/${id}/timeline`),
  links: (id: number) => request<{ links: { id: number; original_url: string; total: number; uniq: number }[] }>(`/api/campaigns/${id}/links`),
  recipients: (id: number) => request<{ recipients: Recipient[] }>(`/api/campaigns/${id}/recipients?pageSize=100`),
  overview: () => request<Overview>("/api/analytics/overview"),
  retryDelivery: (id: number) => request(`/api/analytics/delivery/${id}/retry`, { method: "POST" }),
  settings: () => request<{ settings: Record<string, string>; smtpPasswordSet: boolean }>("/api/settings"),
  saveSettings: (body: unknown) => request("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  zohoStatus: () => request<{ configured: boolean; connected: boolean; states: { module: string; lastStatus: string | null; lastError: string | null; lastRunAt: string | null }[] }>("/api/zoho/status"),
  zohoAuthUrl: () => request<{ url: string }>("/api/zoho/auth-url"),
  zohoSync: () => request("/api/zoho/sync", { method: "POST" }),
  health: () => request<Health>("/api/system/health"),
  audit: () => request<{ entries: { id: number; action: string; actor: string; detail: string; createdAt: string }[] }>("/api/system/audit"),
  sequences: () => request<{ sequences: { id: number; name: string; status: string; tag: string; mailbox: string; steps: { waitDays: number; subject: string }[]; enrolled: number }[] }>("/api/growth/sequences"),
  createSequence: (body: unknown) => request<{ id: number }>("/api/growth/sequences", { method: "POST", body: JSON.stringify(body) }),
  toggleSequence: (id: number) => request<{ status: string }>(`/api/growth/sequences/${id}/pause`, { method: "POST" }),
  gates: () => request<{ gates: { id: number; title: string; slug: string; tagName: string; assetUrl: string; active: boolean; url: string }[] }>("/api/growth/gates"),
  createGate: (body: unknown) => request<{ id: number; url: string }>("/api/growth/gates", { method: "POST", body: JSON.stringify(body) }),
};

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new ApiError(response.status, "Download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type Contact = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  status: "active" | "unsubscribed" | "bounced";
  source: string | null;
  consentNote: string | null;
  customFields?: Record<string, string> | null;
  score?: number;
  tags: { id: number; name: string; points?: number }[];
};

export type Activity = { id: string; type: string; createdAt: string; campaignName: string; isBot: boolean };

export type Segment = { id: number; name: string; rules: { op: "and" | "or"; conditions: { field: string; op: string; value: string }[] }; teamId: number | null };

export type Suppression = { email: string; reason: string; createdAt: string };

export type Template = { id: number; name: string; category?: string; kind: string; visibility: string; designJson: Design; updatedAt: string };

export type Sender = {
  id: number;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  provider: "graph" | "smtp" | "ses";
  status: "active" | "paused" | "error";
  dailyLimit: number;
  perMinuteLimit: number;
  lastError: string | null;
  team: { name: string };
};

export type Campaign = {
  id: number;
  name: string;
  subject: string;
  status: string;
  team?: { name: string };
  stats?: { sent: number; uniqueOpens: number; uniqueClicks: number; unsubscribes: number; replies: number } | null;
};

export type Precheck = { ok: boolean; audienceCount: number; checks: { id: string; ok: boolean; detail: string }[] };

export type Stats = {
  delivered: number;
  stats: {
    sent: number;
    failed: number;
    bouncedHard: number;
    bouncedSoft: number;
    uniqueOpens: number;
    totalOpens: number;
    uniqueClicks: number;
    totalClicks: number;
    unsubscribes: number;
    replies: number;
  } | null;
  rates: { bounce: number; open: number; ctr: number; ctor: number; unsubscribe: number; reply: number };
};

export type Recipient = { id: number; status: string; sentAt: string | null; lastError: string | null; contact: { email: string; firstName: string | null } };

export type Overview = {
  scope: { role: Role; teamName: string | null };
  contacts: { total: number; active: number };
  sent: number;
  rates: { open: number; click: number; bounce: number };
  sentByCategory: { name: string; count: number }[];
  campaigns: { id: number; name: string; status: string; team: string; stats: { sent: number } | null }[];
  mailboxes: { id: number; fromEmail: string; status: string; team: string; sentToday: number; dailyLimit: number }[];
  queue: { queued: number; processing: number };
  growth: { month: string; count: number }[];
  bounces: { month: string; count: number }[];
  problems: { id: number; email: string; campaign: string; kind: "bounced" | "not_sent"; detail: string; canRetry: boolean }[];
};

export type Health = {
  ok: boolean;
  db: boolean;
  worker: { lastSeen: string | null; ok: boolean };
  queue: { queued: number; processing: number };
  zoho: { module: string; lastStatus: string | null; lastError: string | null }[];
};
