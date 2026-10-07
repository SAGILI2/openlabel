import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import type { Config } from "@openlabel/contracts";
import { countUsers, schema, type Database } from "@openlabel/db";
import { getConfig } from "../env";
import { getDb } from "../db";
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from "./password";

const DAY = 60 * 60 * 24;

/** Builds the auth instance for a given configuration and database (tests pass their own). */
export function createAuth(cfg: Config, db: Database) {
  return betterAuth({
    appName: "OpenLabel",
    baseURL: cfg.APP_URL,
    secret: cfg.AUTH_SECRET,
    trustedOrigins: [cfg.APP_URL],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, { provider: "pg", schema: schema.authSchema }),
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "openlabel",
      useSecureCookies: cfg.APP_URL.startsWith("https://"),
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: cfg.AUTH_PASSWORD_MIN_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // Duplicate sign-ups get the same response as new ones, so emails can't be enumerated.
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
    },
    rateLimit: {
      enabled: true,
      // Stored in Postgres so limits hold across every web replica (ADR-0005).
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/sign-up/*": { window: 60, max: 3 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },
    ...(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: { clientId: cfg.GOOGLE_CLIENT_ID, clientSecret: cfg.GOOGLE_CLIENT_SECRET },
          },
        }
      : {}),
    databaseHooks: {
      user: {
        create: {
          // With sign-up closed, only the very first user (the installer) may register.
          before: async () => {
            if (cfg.AUTH_ALLOW_SIGNUP) return;
            if ((await countUsers(db)) > 0) return false;
          },
        },
      },
    },
    plugins: [
      twoFactor({ issuer: "OpenLabel", backupCodeOptions: { amount: 10, length: 10 } }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { openlabelAuth?: Auth };

/** Lazily built so `next build` doesn't need runtime secrets. */
export function getAuth(): Auth {
  globalForAuth.openlabelAuth ??= createAuth(getConfig(), getDb().db);
  return globalForAuth.openlabelAuth;
}
