import { randomBytes } from "node:crypto";
import type { SendMessage } from "./graph";

function encodeWord(value: string): string {
  const clean = value.replace(/[\r\n]/g, " ").trim();
  if (/^[\t\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function formatAddress(name: string, email: string): string {
  const clean = name.replace(/[\r\n]/g, " ").trim();
  if (!clean) return email;
  return `${encodeWord(clean)} <${email}>`;
}

function fold(value: string): string {
  return value.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

export function needsMime(headers: { name: string }[] | undefined): boolean {
  return (headers ?? []).some((header) => !header.name.toLowerCase().startsWith("x-"));
}

export function buildMime(message: SendMessage): string {
  const boundary = `cdt_${randomBytes(8).toString("hex")}`;
  const text = message.text?.trim() || "This message is best viewed as HTML.";
  const headerLines = [
    `From: ${formatAddress(message.fromName, message.fromEmail)}`,
    `To: ${message.to.replace(/[\r\n]/g, "")}`,
    message.replyTo ? `Reply-To: ${message.replyTo.replace(/[\r\n]/g, "")}` : "",
    `Subject: ${encodeWord(message.subject)}`,
    "MIME-Version: 1.0",
    ...(message.headers ?? []).map((header) => `${header.name.replace(/[\r\n]/g, "")}: ${header.value.replace(/[\r\n]/g, "")}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    fold(Buffer.from(text, "utf8").toString("base64")),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    fold(Buffer.from(message.html, "utf8").toString("base64")),
    `--${boundary}--`,
    "",
  ];
  return `${headerLines.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export function encodeMime(mime: string): string {
  return Buffer.from(mime, "utf8").toString("base64");
}
