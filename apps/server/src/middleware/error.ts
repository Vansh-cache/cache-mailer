import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors";
import { logger } from "../lib/logger";

export function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, details: err.details ?? null });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid input", details: err.flatten() });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ error: "That value already exists" });
    return;
  }
  logger.error({ err }, "request failed");
  res.status(500).json({ error: "Something went wrong" });
}
