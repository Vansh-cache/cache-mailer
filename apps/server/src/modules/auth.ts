import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../lib/audit";
import { signSession } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { send } from "../http";
import { cookieBase } from "../middleware/csrf";
import { requireAuth, SESSION_COOKIE } from "../middleware/auth";
import { wrap } from "../middleware/error";

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(user: {
  id: bigint;
  name: string;
  email: string;
  role: "admin" | "marketing" | "sales";
  teamId: number | null;
  isActive?: boolean;
  team?: { name: string } | null;
  senders?: Array<{ sender: { id: bigint; fromEmail: string; fromName: string; teamId: number } }>;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    isActive: user.isActive ?? true,
    teamName: user.team?.name ?? null,
    mailboxes: (user.senders ?? []).map((row) => ({
      id: Number(row.sender.id),
      fromEmail: row.sender.fromEmail,
      fromName: row.sender.fromName,
      teamId: row.sender.teamId,
    })),
  };
}

authRouter.get(
  "/csrf",
  wrap(async (_req, res) => {
    send(res, 200, { csrfToken: res.locals.csrfToken ?? null });
  }),
);

authRouter.post(
  "/login",
  loginLimiter,
  wrap(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const recent = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM audit_log
      WHERE action = 'login_failed'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.email')) = ${email}
    `;
    if (Number(recent[0]?.c ?? 0) >= 5) {
      throw new AppError(429, "Too many failed logins. Try again in 15 minutes.");
    }
    const user = await prisma.user.findUnique({ where: { email }, include: { team: true } });
    const match = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !match || !user.isActive) {
      await audit(user?.id ?? null, "login_failed", "user", user?.id ?? null, { email });
      throw new AppError(401, "Invalid email or password");
    }
    const token = signSession({ sub: String(user.id), role: user.role, teamId: user.teamId });
    res.cookie(SESSION_COOKIE, token, { ...cookieBase(), httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, "login", "user", user.id);
    send(res, 200, { user: publicUser(user) });
  }),
);

authRouter.post(
  "/logout",
  wrap(async (req, res) => {
    if (req.user) await audit(req.user.id, "logout", "user", req.user.id);
    res.clearCookie(SESSION_COOKIE, { ...cookieBase(), httpOnly: true });
    send(res, 200, { ok: true });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    send(res, 200, { user: req.user });
  }),
);

const userInclude = {
  team: true,
  senders: { include: { sender: true }, orderBy: { sender: { fromEmail: "asc" as const } } },
} as const;

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "marketing" | "sales";
  teamId: number | null;
  senderIds?: number[];
}) {
  if (input.role !== "admin" && input.teamId == null) throw new AppError(400, "Choose a team");
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new AppError(400, "A user with this email already exists");
  if (input.teamId != null) {
    const team = await prisma.team.findUnique({ where: { id: input.teamId } });
    if (!team) throw new AppError(400, "Unknown team");
  }
  const senderIds = [...new Set(input.senderIds ?? [])].map((id) => BigInt(id));
  if (senderIds.length > 0) {
    const senders = await prisma.senderAccount.findMany({ where: { id: { in: senderIds } } });
    if (senders.length !== senderIds.length) throw new AppError(400, "One or more mailboxes were not found");
    if (input.role !== "admin" && input.teamId != null && senders.some((sender) => sender.teamId !== input.teamId)) {
      throw new AppError(400, "Assigned mailboxes must belong to the user's team");
    }
  }
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
      teamId: input.teamId,
      senders: senderIds.length > 0 ? { create: senderIds.map((senderId) => ({ senderId })) } : undefined,
    },
    include: userInclude,
  });
}

export { publicUser, userInclude };
