import bcrypt from "bcryptjs";
import { AppError } from "../errors";

const MIN_LENGTH = 10;

export function assertPassword(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new AppError(400, `Password must be at least ${MIN_LENGTH} characters`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
