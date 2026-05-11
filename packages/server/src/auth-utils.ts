import crypto from "node:crypto";
import {
  type ClientTokenScope,
  type PublicClientToken,
  type User,
  type UserRole,
} from "@agent-workloops/api";

export interface StoredUser extends User {
  passwordHash: string;
}

export interface StoredSession {
  id: string;
  userId: string;
  secretHash: string;
  createdAt: string;
}

export interface StoredClientToken extends PublicClientToken {
  userId: string;
  secretHash: string;
  scopes: ClientTokenScope[];
}

export interface AuthState {
  users: StoredUser[];
  sessions: StoredSession[];
  tokens: StoredClientToken[];
}

export const emptyAuthState = (): AuthState => ({ users: [], sessions: [], tokens: [] });

export async function makeUser(input: {
  email: string;
  password: string;
  name?: string;
  roles: UserRole[];
}): Promise<StoredUser> {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    email: input.email,
    name: input.name,
    roles: input.roles,
    passwordHash: await hashSecret(input.password),
    createdAt: now,
    updatedAt: now,
  };
}

export function hashToken(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) {
    return false;
  }
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(secret, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

export function newSecret(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}_${crypto.randomBytes(24).toString("base64url")}`;
}

async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(secret, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
  return `${salt}:${hash.toString("hex")}`;
}
