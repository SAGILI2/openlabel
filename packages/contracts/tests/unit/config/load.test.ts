import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/config/load.js";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/openlabel",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.STORAGE_DRIVER).toBe("s3");
    expect(cfg.S3_FORCE_PATH_STYLE).toBe(true);
    expect(cfg.LOG_LEVEL).toBe("info");
  });

  it("rejects a non-postgres database URL", () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: "mysql://x/y" })).toThrow(ConfigError);
  });

  it("requires S3 credentials for the s3 driver", () => {
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/S3_ACCESS_KEY_ID/);
  });

  it("does not require S3 credentials for the local driver", () => {
    const cfg = loadConfig({ DATABASE_URL: base.DATABASE_URL, STORAGE_DRIVER: "local" });
    expect(cfg.STORAGE_DRIVER).toBe("local");
  });

  it("lists every problem", () => {
    try {
      loadConfig({ DATABASE_URL: "nope", LOG_LEVEL: "loud" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
