import { z } from "zod";

/**
 * Runtime configuration, read from environment variables.
 * Validated once at start-up so a misconfigured deployment fails fast with a clear message.
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("s3"),
  STORAGE_LOCAL_DIR: z.string().default("./data/storage"),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(3).default("openlabel"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  /** Public origin of the web app, used for cookies, redirects and OAuth callbacks. */
  APP_URL: z.url().default("http://localhost:3000"),
  /** Signs session cookies and encrypts two-factor secrets. Generate with `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  /** Set to "false" to allow only invited users (and the first user) to create accounts. */
  AUTH_ALLOW_SIGNUP: z.stringbool().default(true),
  /** Minimum password length for new and changed passwords (6–128). */
  AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(6).max(128).default(6),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Base URL of the OCR model service implementing POST /predict. */
  OCR_SERVICE_URL: z.url().default("http://ocr:8000"),
  /** Concurrent pre-label jobs per worker process. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
  /** How email leaves: "smtp" (any provider, e.g. Mailtrap or Mailpit), "log" (printed by the worker) or "noop". */
  MAIL_TRANSPORT: z.enum(["smtp", "log", "noop"]).default("log"),
  /** Sender shown to recipients, e.g. `OpenLabel <no-reply@example.com>`. */
  MAIL_FROM: z.string().min(3).default("OpenLabel <no-reply@openlabel.local>"),
  /** Send every message to this one inbox instead of the real recipient (staging, development). */
  MAIL_REDIRECT_ALL_TO: z.email().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  /** "true" for implicit TLS (port 465); otherwise STARTTLS is used when the server offers it. */
  SMTP_SECURE: z.stringbool().default(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  readonly code = "CONFIG_INVALID";
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/** Parses configuration and throws a readable {@link ConfigError} listing every problem. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  const cfg = result.data;
  if (cfg.STORAGE_DRIVER === "s3" && (!cfg.S3_ACCESS_KEY_ID || !cfg.S3_SECRET_ACCESS_KEY)) {
    throw new ConfigError(["S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3"]);
  }
  if (Boolean(cfg.GOOGLE_CLIENT_ID) !== Boolean(cfg.GOOGLE_CLIENT_SECRET)) {
    throw new ConfigError(["GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together"]);
  }
  if (cfg.MAIL_TRANSPORT === "smtp" && !cfg.SMTP_HOST) {
    throw new ConfigError(["SMTP_HOST is required when MAIL_TRANSPORT=smtp"]);
  }
  if (Boolean(cfg.SMTP_USER) !== Boolean(cfg.SMTP_PASSWORD)) {
    throw new ConfigError(["SMTP_USER and SMTP_PASSWORD must be set together"]);
  }
  return cfg;
}
