const STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function backoffMs(attempt: number): number | null {
  if (attempt < 1 || attempt > STEPS_MS.length) return null;
  return STEPS_MS[attempt - 1] ?? null;
}

export function randomDelay(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
