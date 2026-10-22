import { config, graphConfigured } from "../config";
import { AppError } from "../errors";
import { buildMime, encodeMime, needsMime } from "./mime";

export type InlineImage = {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
};

export type SendMessage = {
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  format?: "html" | "text";
  headers?: { name: string; value: string }[];
  attachments?: InlineImage[];
};

export type SendResult =
  | { ok: true }
  | { ok: false; temporary: boolean; status: number; error: string; retryAfterMs?: number };

type TokenCache = { token: string; expiresAt: number };
let cached: TokenCache | null = null;

export async function graphToken(): Promise<string> {
  if (!graphConfigured()) throw new AppError(400, "Microsoft 365 is not configured");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const body = new URLSearchParams({
    client_id: config.msClientId,
    client_secret: config.msClientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new AppError(502, json.error_description || "Microsoft token request failed");
  }
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

async function graphFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await graphToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function graphCheck(fromEmail: string): Promise<void> {
  const response = await graphFetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}?$select=id,mail,userPrincipalName`,
  );
  if (response.status === 401 || response.status === 403) {
    throw new AppError(response.status, "Graph refused this mailbox. Check admin consent and the mailbox access policy.");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new AppError(502, `Mailbox check failed (${response.status}): ${text.slice(0, 300)}`);
  }
}

export async function graphSend(message: SendMessage): Promise<SendResult> {
  if (needsMime(message.headers)) return graphSendMime(message);
  try {
    const response = await graphFetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(message.fromEmail)}/sendMail`,
      {
        method: "POST",
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: {
              contentType: message.format === "text" ? "Text" : "HTML",
              content: message.format === "text" ? (message.text || message.html) : message.html,
            },
            toRecipients: [{ emailAddress: { address: message.to } }],
            ccRecipients: (message.cc ?? []).map((address) => ({ emailAddress: { address } })),
            from: { emailAddress: { address: message.fromEmail, name: message.fromName } },
            replyTo: message.replyTo ? [{ emailAddress: { address: message.replyTo } }] : undefined,
            internetMessageHeaders: message.headers ?? [],
            attachments: (message.attachments ?? []).map((attachment) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachment.filename,
              contentType: attachment.contentType,
              contentBytes: attachment.content.toString("base64"),
              isInline: true,
              contentId: attachment.cid,
            })),
          },
          saveToSentItems: true,
        }),
      },
    );
    if (response.ok) return { ok: true };
    const text = await response.text();
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    const temporary = response.status === 429 || response.status >= 500;
    return {
      ok: false,
      temporary,
      status: response.status,
      error: text.slice(0, 400) || `Graph error ${response.status}`,
      retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : undefined,
    };
  } catch (error) {
    return { ok: false, temporary: true, status: 0, error: error instanceof Error ? error.message : "Network error" };
  }
}

async function graphSendMime(message: SendMessage): Promise<SendResult> {
  try {
    const token = await graphToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(message.fromEmail)}/sendMail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
        body: encodeMime(buildMime(message)),
      },
    );
    if (response.ok) return { ok: true };
    const text = await response.text();
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    const temporary = response.status === 429 || response.status >= 500;
    return {
      ok: false,
      temporary,
      status: response.status,
      error: text.slice(0, 400) || `Graph error ${response.status}`,
      retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : undefined,
    };
  } catch (error) {
    return { ok: false, temporary: true, status: 0, error: error instanceof Error ? error.message : "Network error" };
  }
}

export type GraphMessage = {
  id: string;
  subject?: string;
  body?: { content?: string };
  bodyPreview?: string;
  internetMessageId?: string;
  from?: { emailAddress?: { address?: string } };
  internetMessageHeaders?: { name: string; value: string }[];
};

export async function graphDelta(
  fromEmail: string,
  deltaLink: string | null,
): Promise<{ messages: GraphMessage[]; deltaLink: string | null }> {
  const url =
    deltaLink ||
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/mailFolders/inbox/messages/delta?$select=id,subject,bodyPreview,body,from,internetMessageId,internetMessageHeaders&$top=50`;
  const response = await graphFetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new AppError(502, `Mailbox read failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    value?: GraphMessage[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  };
  return { messages: json.value ?? [], deltaLink: json["@odata.deltaLink"] ?? json["@odata.nextLink"] ?? deltaLink };
}

export async function sentItemContainsToken(fromEmail: string, token: string): Promise<boolean | null> {
  try {
    const response = await graphFetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/mailFolders/sentitems/messages?$top=20&$select=body,subject,internetMessageId&$orderby=sentDateTime desc`,
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { value?: GraphMessage[] };
    return (json.value ?? []).some((message) => (message.body?.content ?? "").includes(token));
  } catch {
    return null;
  }
}
