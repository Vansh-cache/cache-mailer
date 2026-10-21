export type Role = "admin" | "marketing" | "sales";

export type AuthUser = {
  id: bigint;
  name: string;
  email: string;
  role: Role;
  teamId: number | null;
  teamName: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
