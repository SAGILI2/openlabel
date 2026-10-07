import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("produces an argon2id hash with OWASP parameters", async () => {
    const digest = await hashPassword("correct horse");
    expect(digest).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const digest = await hashPassword("correct horse");
    await expect(verifyPassword({ hash: digest, password: "correct horse" })).resolves.toBe(true);
    await expect(verifyPassword({ hash: digest, password: "wrong horse" })).resolves.toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("treats a malformed hash as a failed match instead of throwing", async () => {
    await expect(verifyPassword({ hash: "not-a-hash", password: "x" })).resolves.toBe(false);
  });
});
