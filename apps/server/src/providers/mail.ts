import type { SenderProvider } from "@prisma/client";
import { graphConfigured } from "../config";
import { assertNever } from "../errors";
import { graphSend, type SendMessage, type SendResult } from "./graph";
import { smtpSend } from "./smtp";

export async function sendMail(provider: SenderProvider, message: SendMessage): Promise<SendResult> {
  switch (provider) {
    case "graph":
      if (!graphConfigured()) {
        return { ok: false, temporary: true, status: 0, error: "Microsoft 365 is not configured" };
      }
      return graphSend(message);
    case "smtp":
      return smtpSend(message);
    case "ses":
      return { ok: false, temporary: false, status: 400, error: "Amazon SES is not connected yet" };
    default:
      return assertNever(provider);
  }
}
