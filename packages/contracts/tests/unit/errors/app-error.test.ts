import { describe, expect, it } from "vitest";
import { AppError, problemSchema } from "../../../src/errors/app-error.js";

describe("AppError", () => {
  it("converts to an RFC 9457 problem", () => {
    const p = new AppError("ASSET_NOT_FOUND", 404, "Asset not found", "id abc").toProblem("req-1");
    expect(p).toEqual({
      type: "about:blank",
      title: "Asset not found",
      status: 404,
      code: "ASSET_NOT_FOUND",
      detail: "id abc",
      requestId: "req-1",
    });
  });

  it("rejects lower-case error codes", () => {
    expect(problemSchema.safeParse({ title: "x", status: 400, code: "bad_code" }).success).toBe(false);
  });

  it("rejects non-error status codes", () => {
    expect(() => new AppError("OK_CODE", 200, "fine").toProblem()).toThrow();
  });
});
