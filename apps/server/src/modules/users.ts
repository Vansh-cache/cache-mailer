import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { audit } from "../lib/audit";
import { hashPassword } from "../lib/password";
import { send } from "../http";
import { requireRoles } from "../middleware/auth";
import { wrap } from "../middleware/error";
import { createUser, publicUser } from "./auth";

export const usersRouter = Router();
usersRouter.use(requireRoles("admin"));

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(["admin", "marketing", "sales"]),
  teamId: z.number().int().positive().nullable(),
});

usersRouter.get(
  "/",
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({ include: { team: true }, orderBy: { id: "asc" } });
    send(res, 200, { users: users.map(publicUser) });
  }),
);

usersRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    const user = await createUser(body);
    await audit(req.user!.id, "user.create", "user", user.id, { email: user.email, role: user.role });
    send(res, 201, { user: publicUser(user) });
  }),
);

usersRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = BigInt(req.params.id);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        role: z.enum(["admin", "marketing", "sales"]).optional(),
        teamId: z.number().int().positive().nullable().optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(10).optional(),
      })
      .parse(req.body);
    if (body.isActive === false && id === req.user!.id) throw new AppError(400, "You cannot disable your own user");
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "User not found");
    const role = body.role ?? existing.role;
    const teamId = body.teamId === undefined ? existing.teamId : body.teamId;
    if (role !== "admin" && teamId == null) throw new AppError(400, "Choose a team");
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        role: body.role,
        teamId,
        isActive: body.isActive,
        passwordHash: body.password ? await hashPassword(body.password) : undefined,
      },
      include: { team: true },
    });
    await audit(req.user!.id, body.password ? "user.reset_password" : "user.update", "user", user.id);
    send(res, 200, { user: publicUser(user) });
  }),
);

export const teamsRouter = Router();

teamsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
    send(res, 200, { teams });
  }),
);
