import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export async function sentCount(senderId: bigint, sinceSql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*) AS c FROM campaign_recipients
    WHERE sender_id = ${senderId} AND status = 'sent' AND sent_at >= ${sinceSql}
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function quotaAllows(senderId: bigint, dailyLimit: number, perMinuteLimit: number): Promise<boolean> {
  const [today, minute] = await Promise.all([
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM campaign_recipients
      WHERE sender_id = ${senderId} AND status = 'sent' AND sent_at >= CURDATE()
    `,
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM campaign_recipients
      WHERE sender_id = ${senderId} AND status = 'sent' AND sent_at >= (NOW() - INTERVAL 1 MINUTE)
    `,
  ]);
  return Number(today[0]?.c ?? 0) < dailyLimit && Number(minute[0]?.c ?? 0) < perMinuteLimit;
}

export async function sentToday(senderId: bigint): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*) AS c FROM campaign_recipients
    WHERE sender_id = ${senderId} AND status = 'sent' AND sent_at >= CURDATE()
  `;
  return Number(rows[0]?.c ?? 0);
}
