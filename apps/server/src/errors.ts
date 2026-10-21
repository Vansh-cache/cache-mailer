export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
