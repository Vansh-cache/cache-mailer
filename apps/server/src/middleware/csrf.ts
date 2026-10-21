import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { AppError } from "../errors";

export const CSRF_COOKIE = "cdt_csrf";

export function cookieBase() {
  return {
    sameSite: "lax" as const,
    secure: config.nodeEnv === "production",
    path: "/",
  };
}

export function ensureCsrf(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    res.cookie(CSRF_COOKIE, token, { ...cookieBase(), httpOnly: false, maxAge: 12 * 60 * 60 * 1000 });
  }
  res.locals.csrfToken = token;
  next();
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get("x-csrf-token");
  if (!cookie || !header || cookie !== header) {
    next(new AppError(403, "CSRF check failed"));
    return;
  }
  next();
}
