import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { AppError } from "../errors";
import { readSession } from "../lib/jwt";
import type { Role } from "../types";

export const SESSION_COOKIE = "cdt_session";

export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    next();
    return;
  }
  try {
    const payload = readSession(token);
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      include: { team: true },
    });
    if (user?.isActive) {
      req.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        teamName: user.team?.name ?? null,
      };
    }
  } catch {
    req.user = undefined;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, "Login required"));
    return;
  }
  next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "Login required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "You cannot do that"));
      return;
    }
    next();
  };
}
