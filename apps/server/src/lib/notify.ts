import { prisma } from "../db";
import { logger } from "./logger";
import { sendMail } from "../providers/mail";

export async function notifyAdmins(subject: string, text: string): Promise<void> {
  logger.error({ subject }, text);
  await prisma.auditLog.create({ data: { action: "admin.notify", meta: { subject, text } } });
  const [admins, sender] = await Promise.all([
    prisma.user.findMany({ where: { role: "admin", isActive: true } }),
    prisma.senderAccount.findFirst({ where: { status: "active" }, orderBy: { id: "asc" } }),
  ]);
  if (!sender) return;
  for (const admin of admins) {
    const result = await sendMail(sender.provider, {
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      replyTo: sender.replyTo,
      to: admin.email,
      subject,
      html: `<p>${text}</p>`,
    });
    if (!result.ok) logger.error({ status: result.status, error: result.error }, "admin notification failed");
  }
}
