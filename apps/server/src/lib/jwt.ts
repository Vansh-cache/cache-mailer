import jwt from "jsonwebtoken";
import { config } from "../config";
import type { Role } from "../types";

export type JwtPayload = { sub: string; role: Role; teamId: number | null };

export function signSession(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "12h" });
}

export function readSession(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new Error("Invalid session");
  }
  const role = decoded.role;
  if (role !== "admin" && role !== "marketing" && role !== "sales") {
    throw new Error("Invalid session role");
  }
  const teamId = decoded.teamId;
  return {
    sub: decoded.sub,
    role,
    teamId: typeof teamId === "number" ? teamId : null,
  };
}
