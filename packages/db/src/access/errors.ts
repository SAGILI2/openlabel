/** Failures from the data-access layer, with stable codes the API maps to HTTP statuses. */
export type AccessErrorCode =
  "NOT_A_MEMBER" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVITATION_INVALID" | "LAST_OWNER";

export class AccessError extends Error {
  constructor(
    readonly code: AccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}
