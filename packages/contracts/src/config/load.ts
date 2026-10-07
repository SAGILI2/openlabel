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
  return cfg;
}
