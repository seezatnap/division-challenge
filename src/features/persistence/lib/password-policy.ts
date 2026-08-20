/**
 * Password rules shared by the server (hashing/registration) and the browser
 * (form validation). No Node-only imports so client components can use it.
 */

export const MIN_PLAYER_PASSWORD_LENGTH = 4;
export const MAX_PLAYER_PASSWORD_LENGTH = 128;

/**
 * Validates a candidate password against the policy and returns a message
 * describing the violation, or `null` when it is acceptable.
 */
export function describePasswordPolicyViolation(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Password is required.";
  }

  if (password.length < MIN_PLAYER_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PLAYER_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PLAYER_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

export function assertPasswordMeetsPolicy(password: unknown): asserts password is string {
  const violation = describePasswordPolicyViolation(password);
  if (violation) {
    throw new Error(violation);
  }
}
