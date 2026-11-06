import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { prisma } from "../db";
import { decrypt, encrypt } from "../lib/crypto";
import { normalizeEmail } from "../lib/email";
import { getSetting } from "../lib/settings";
import type { SendMessage, SendResult } from "./graph";

export const SMTP_PASSWORD_SECRET = "smtp_password";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
};

export type MailboxSmtp = {
  id: bigint;
  fromEmail: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
};

export function mailboxSmtpSecretName(senderId: bigint): string {
  return `smtp_mailbox_${senderId.toString()}`;
}

type SmtpError = Error & {
  code?: string;
  responseCode?: number;
  response?: string;
};

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const [host, portValue, secureValue, email, secret] = await Promise.all([
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_secure"),
    getSetting("smtp_email"),
    prisma.integrationSecret.findUnique({ where: { name: SMTP_PASSWORD_SECRET } }),
  ]);
  const port = Number(portValue);
  if (!host.trim() || !email.trim() || !secret || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    host: host.trim(),
    port,
    secure: secureValue === "true",
    email: normalizeEmail(email),
    password: decrypt(Buffer.from(secret.valueEncrypted)),
  };
}

export async function smtpPasswordSet(): Promise<boolean> {
  const secret = await prisma.integrationSecret.findUnique({
    where: { name: SMTP_PASSWORD_SECRET },
    select: { name: true },
  });
  return Boolean(secret);
}

export async function saveMailboxSmtpPassword(senderId: bigint, password: string): Promise<void> {
  const encrypted = Uint8Array.from(encrypt(password));
  const name = mailboxSmtpSecretName(senderId);
  await prisma.integrationSecret.upsert({
    where: { name },
    update: { valueEncrypted: encrypted },
    create: { name, valueEncrypted: encrypted },
  });
}

export async function deleteMailboxSmtpPassword(senderId: bigint): Promise<void> {
  await prisma.integrationSecret.deleteMany({ where: { name: mailboxSmtpSecretName(senderId) } });
}

export async function mailboxPasswordFlags(senderIds: bigint[]): Promise<Set<string>> {
  if (senderIds.length === 0) return new Set();
  const rows = await prisma.integrationSecret.findMany({
    where: { name: { in: senderIds.map(mailboxSmtpSecretName) } },
    select: { name: true },
  });
  return new Set(rows.map((row) => row.name));
}

// A mailbox with its own host and password signs in as that mailbox's From
// address. The Settings login is only a fallback when the emails match.
export async function smtpConfigForMailbox(sender: MailboxSmtp): Promise<SmtpConfig | null> {
  const port = sender.smtpPort;
  const host = sender.smtpHost?.trim() ?? "";
  if (host && port != null && Number.isInteger(port) && port >= 1 && port <= 65535) {
    const secret = await prisma.integrationSecret.findUnique({
      where: { name: mailboxSmtpSecretName(sender.id) },
    });
    if (secret) {
      return {
        host,
        port,
        secure: sender.smtpSecure,
        email: normalizeEmail(sender.fromEmail),
        password: decrypt(Buffer.from(secret.valueEncrypted)),
      };
    }
  }
  const shared = await getSmtpConfig();
  if (shared && shared.email === normalizeEmail(sender.fromEmail)) return shared;
  return null;
}

async function transporterFor(config: SmtpConfig) {
  let host = config.host;
  if (!isIP(host)) {
    try {
      // Use the operating system's IPv4 lookup. Nodemailer's own resolver can
      // wait on an unreachable IPv6/DNS response on office networks even when
      // the IPv4 address resolves normally through Windows.
      host = (await lookup(config.host, { family: 4 })).address;
    } catch {
      // Keep the hostname so Nodemailer reports the underlying lookup error.
    }
  }
  return nodemailer.createTransport({
    host,
    servername: config.host,
    tls: { servername: config.host },
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.email, pass: config.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export function isTemporarySmtpError(error: SmtpError): boolean {
  if (error.responseCode != null) return error.responseCode >= 400 && error.responseCode < 500;
  return ["ECONNECTION", "ECONNRESET", "ETIMEDOUT", "ESOCKET", "EAI_AGAIN", "EDNS"].includes(error.code ?? "");
}

function failed(error: unknown): SendResult {
  const smtpError = error as SmtpError;
  const detail = smtpError.response || smtpError.message || "SMTP send failed";
  return {
    ok: false,
    temporary: isTemporarySmtpError(smtpError),
    status: smtpError.responseCode ?? 0,
    error: detail.slice(0, 400),
  };
}

export async function smtpVerify(config: SmtpConfig): Promise<void> {
  const transporter = await transporterFor(config);
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

export async function smtpSend(message: SendMessage): Promise<SendResult> {
  const sender = await prisma.senderAccount.findUnique({
    where: { fromEmail: normalizeEmail(message.fromEmail) },
  });
  const config = sender ? await smtpConfigForMailbox(sender) : null;
  if (!config) {
    return { ok: false, temporary: true, status: 0, error: "Add the SMTP host and password on this mailbox" };
  }
  const transporter = await transporterFor(config);
  try {
    const headers = Object.fromEntries((message.headers ?? []).map((header) => [header.name, header.value]));
    await transporter.sendMail({
      from: { name: message.fromName, address: config.email },
      to: message.to,
      cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      html: message.format === "text" ? undefined : message.html,
      text: message.format === "text" ? (message.text || message.html) : message.text,
      headers,
      attachments: (message.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        cid: attachment.cid,
        contentType: attachment.contentType,
      })),
    });
    return { ok: true };
  } catch (error) {
    return failed(error);
  } finally {
    transporter.close();
  }
}
