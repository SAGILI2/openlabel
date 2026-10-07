import "server-only";
import { hash, verify } from "@node-rs/argon2";

/** OWASP-recommended argon2id parameters (19 MiB, 2 passes, 1 lane). */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const MAX_PASSWORD_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword({ hash: digest, password }: { hash: string; password: string }) {
  try {
    return await verify(digest, password);
  } catch {
    // Malformed or foreign hash: treat as a failed match rather than a server error.
    return false;
  }
}
