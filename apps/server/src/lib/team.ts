import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { AuthUser } from "../types";
import { AppError } from "../errors";

export function assertTeam(user: AuthUser, teamId: number | null | undefined): void {
  if (user.role === "admin") return;
  if (teamId == null || user.teamId !== teamId) {
    throw new AppError(403, "That record belongs to another team");
  }
}

export function teamFilter(user: AuthUser): { teamId?: number } {
  if (user.role === "admin") return {};
  if (user.teamId == null) throw new AppError(403, "Your user is not on a team");
  return { teamId: user.teamId };
}

/** Mailboxes this user may pick in campaigns / test send. Admins see all. */
export async function senderWhere(user: AuthUser): Promise<Prisma.SenderAccountWhereInput> {
  if (user.role === "admin") return {};
  if (user.teamId == null) throw new AppError(403, "Your user is not on a team");
  const assigned = await prisma.userSender.findMany({
    where: { userId: user.id },
    select: { senderId: true },
  });
  if (assigned.length === 0) {
    // Legacy users with no assignments yet still see their team's mailboxes.
    return { teamId: user.teamId };
  }
  return { teamId: user.teamId, id: { in: assigned.map((row) => row.senderId) } };
}

export async function assertSenderAccess(user: AuthUser, senderId: bigint, senderTeamId: number): Promise<void> {
  assertTeam(user, senderTeamId);
  if (user.role === "admin") return;
  const assigned = await prisma.userSender.count({ where: { userId: user.id } });
  if (assigned === 0) return;
  const allowed = await prisma.userSender.findUnique({
    where: { userId_senderId: { userId: user.id, senderId } },
  });
  if (!allowed) throw new AppError(403, "This mailbox is not assigned to your user");
}

export function canReadShared(user: AuthUser, teamId: number | null): boolean {
  if (user.role === "admin" || teamId == null) return true;
  return user.teamId === teamId;
}
