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

export function canReadShared(user: AuthUser, teamId: number | null): boolean {
  if (user.role === "admin" || teamId == null) return true;
  return user.teamId === teamId;
}
