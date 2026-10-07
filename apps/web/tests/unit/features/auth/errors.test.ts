import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/features/auth/errors";

describe("authErrorMessage", () => {
  it("gives the same message for an unknown user and a wrong password", () => {
    const unknown = authErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" });
    const wrong = authErrorMessage({ status: 401, code: "USER_NOT_FOUND" });
    expect(unknown).toBe("Email or password is incorrect.");
    expect(wrong).toBe(unknown);
  });

  it("explains rate limiting", () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("explains a bad two-factor code", () => {
    expect(authErrorMessage({ code: "INVALID_CODE" })).toMatch(/code didn't work/);
  });

  it("falls back when there is no error detail", () => {
    expect(authErrorMessage(null)).toMatch(/Something went wrong/);
  });
});
