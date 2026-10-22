import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { prisma } from "../db";
import { decrypt } from "../lib/crypto";
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

export async function smtpCheck(): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) throw new Error("Add the SMTP host, email, and password in Settings first");
  const transporter = await transporterFor(config);
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

export async function smtpSend(message: SendMessage): Promise<SendResult> {
  const config = await getSmtpConfig();
  if (!config) {
    return { ok: false, temporary: true, status: 0, error: "SMTP is not configured in Settings" };
  }
  if (normalizeEmail(message.fromEmail) !== config.email) {
    return {
      ok: false,
      temporary: false,
      status: 400,
      error: `SMTP email in Settings (${config.email}) does not match this mailbox (${message.fromEmail})`,
    };
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
