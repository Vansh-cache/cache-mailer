import type { Request, Response } from "express";

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  return value;
}

export function send(res: Response, status: number, body: unknown): void {
  res.status(status).json(JSON.parse(JSON.stringify(body, replacer)));
}

export function pageParams(req: Request): { page: number; take: number; skip: number } {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const take = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25) || 25));
  return { page, take, skip: (page - 1) * take };
}
