/** Error shape returned by the auth client. */
export interface AuthClientError {
  status?: number;
  code?: string | undefined;
  message?: string | undefined;
}

/**
 * Maps auth failures to user-facing text. Credential failures always get the same generic
 * message so the form never reveals whether an account exists.
 */
export function authErrorMessage(error: AuthClientError | null | undefined): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.status === 429) return "Too many attempts. Wait a minute, then try again.";
  switch (error.code) {
    case "PASSWORD_TOO_SHORT":
      return "That password is too short.";
    case "PASSWORD_TOO_LONG":
      return "Use 128 characters or fewer.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_COOKIE":
    case "INVALID_BACKUP_CODE":
      return "That code didn't work. Check your authenticator app and try again.";
    case "INVALID_PASSWORD":
      return "Password is incorrect.";
    default:
      return "Email or password is incorrect.";
  }
}
