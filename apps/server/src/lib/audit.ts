import { prisma } from "../db";
import { Prisma } from "@prisma/client";

export async function audit(
  userId: bigint | null,
  action: string,
  entity?: string,
  entityId?: bigint | null,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity: entity ?? null,
      entityId: entityId ?? null,
      meta: meta ?? undefined,
    },
  });
}
