import bcrypt from "bcryptjs";
import { AppError } from "../errors";

export const MIN_PASSWORD_LENGTH = 12;
const MAX_LENGTH = 72;

export function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  // bcrypt silently ignores bytes beyond 72.
  if (Buffer.byteLength(password, "utf8") > MAX_LENGTH) {
    throw new AppError(400, `Password must be at most ${MAX_LENGTH} bytes`);
  }
  if (new Set(password).size < 4) {
    throw new AppError(400, "Password is too repetitive");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
