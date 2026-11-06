// A large audience is queued in blocks so the sender can watch each block fill.
export const SEND_CHUNK_SIZE = 500;

export function chunkIndexFor(position: number): number {
  return Math.floor(position / SEND_CHUNK_SIZE) + 1;
}
