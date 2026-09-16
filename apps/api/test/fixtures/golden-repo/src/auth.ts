export interface User {
  id: string;
  email: string;
}

export class InvalidCredentialsError extends Error {}

/**
 * Verifies a user's password against the stored hash and returns a signed
 * session token. Throws InvalidCredentialsError if the email is unknown or
 * the password does not match.
 */
export async function login(email: string, password: string): Promise<string> {
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new InvalidCredentialsError('Invalid email or password');
  }
  return signSessionToken(user.id);
}

async function findUserByEmail(
  email: string,
): Promise<{ id: string; passwordHash: string } | null> {
  throw new Error(`not implemented in fixture: ${email}`);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  throw new Error(`not implemented in fixture: ${password} ${hash}`);
}

function signSessionToken(userId: string): string {
  return `token-for-${userId}`;
}
