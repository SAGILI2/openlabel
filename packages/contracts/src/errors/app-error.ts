import { z } from "zod";

/** RFC 9457 "problem details" body, returned by every API error (`application/problem+json`). */
export const problemSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Stable machine-readable code, e.g. `ASSET_NOT_FOUND`. Never changes once published. */
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  requestId: z.string().optional(),
});

export type Problem = z.infer<typeof problemSchema>;

/** Base class for errors that map to an HTTP problem response. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  toProblem(requestId?: string): Problem {
    return problemSchema.parse({
      title: this.message,
      status: this.status,
      code: this.code,
      ...(this.detail === undefined ? {} : { detail: this.detail }),
      ...(requestId === undefined ? {} : { requestId }),
    });
  }
}
