import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/config/load.js";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/openlabel",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  AUTH_SECRET: "x".repeat(32),
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
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL, AUTH_SECRET: base.AUTH_SECRET })).toThrow(
      /S3_ACCESS_KEY_ID/,
    );
  });

  it("does not require S3 credentials for the local driver", () => {
    const cfg = loadConfig({
      DATABASE_URL: base.DATABASE_URL,
      AUTH_SECRET: base.AUTH_SECRET,
      STORAGE_DRIVER: "local",
    });
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

  it("requires a long auth secret", () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("requires both Google OAuth values or neither", () => {
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).GOOGLE_CLIENT_ID).toBe(
      "id",
    );
  });

  it("defaults the minimum password length to 6 and refuses anything shorter", () => {
    expect(loadConfig(base).AUTH_PASSWORD_MIN_LENGTH).toBe(6);
    expect(loadConfig({ ...base, AUTH_PASSWORD_MIN_LENGTH: "10" }).AUTH_PASSWORD_MIN_LENGTH).toBe(10);
    expect(() => loadConfig({ ...base, AUTH_PASSWORD_MIN_LENGTH: "4" })).toThrow(/AUTH_PASSWORD_MIN_LENGTH/);
  });

  it("logs mail by default and needs a host for SMTP", () => {
    expect(loadConfig(base).MAIL_TRANSPORT).toBe("log");
    expect(() => loadConfig({ ...base, MAIL_TRANSPORT: "smtp" })).toThrow(/SMTP_HOST/);
    const smtp = loadConfig({ ...base, MAIL_TRANSPORT: "smtp", SMTP_HOST: "mailpit", SMTP_PORT: "1025" });
    expect([smtp.SMTP_HOST, smtp.SMTP_PORT, smtp.SMTP_SECURE]).toEqual(["mailpit", 1025, false]);
    expect(() => loadConfig({ ...base, SMTP_USER: "u" })).toThrow(/SMTP_PASSWORD/);
    expect(() => loadConfig({ ...base, MAIL_REDIRECT_ALL_TO: "not-an-email" })).toThrow(
      /MAIL_REDIRECT_ALL_TO/,
    );
  });
});
