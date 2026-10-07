import "server-only";
import { loadConfig, type Config } from "@openlabel/contracts";

let cached: Config | undefined;

/** Validated runtime configuration; throws a readable ConfigError on first use if misconfigured. */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}
