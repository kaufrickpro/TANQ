import { cookies } from 'next/headers';
import db from '@/lib/db';
import crypto from 'crypto';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  is_verified: boolean;
}

/**
 * Creates a new session in the database, generating a 256-bit opaque token
 * and returning it.
 */
export async function createSession(userId: number): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex'); // 256-bit
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days initial
  
  await db`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})
  `;
  
  return rawToken;
}

/**
 * Loads the current session user from the database.
 * Rejects disabled, revoked, or expired sessions.
 * Refreshes session expiry at most once every 24 hours.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('session_token');
    if (!tokenCookie) return null;

    const tokenHash = crypto.createHash('sha256').update(tokenCookie.value).digest('hex');
    const sessionResult = await db`
      SELECT s.id as session_id, s.expires_at, s.revoked_at, s.last_activity,
             u.id, u.username, u.name, u.email, u.role, u.is_disabled, u.is_verified
      FROM auth_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ${tokenHash}
    `;

    if (sessionResult.rows.length === 0) return null;

    const session = sessionResult.rows[0];

    // Reject disabled, revoked, or expired sessions
    if (session.is_disabled || session.revoked_at || new Date(session.expires_at) < new Date()) {
      return null;
    }

    // Refresh active session expiry at most once every 24 hours
    const now = new Date();
    const lastActivity = new Date(session.last_activity);
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    if (now.getTime() - lastActivity.getTime() > oneDayMs) {
      const newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await db`
        UPDATE auth_sessions
        SET expires_at = ${newExpiresAt.toISOString()}, last_activity = ${now.toISOString()}
        WHERE id = ${session.session_id}
      `;
    } else {
      // update last activity
      await db`
        UPDATE auth_sessions
        SET last_activity = ${now.toISOString()}
        WHERE id = ${session.session_id}
      `;
    }

    return {
      id: session.id,
      username: session.username,
      name: session.name,
      email: session.email,
      role: session.role,
      is_verified: Boolean(session.is_verified),
    };
  } catch (e) {
    console.error('Error fetching session user:', e);
    return null;
  }
}

/**
 * Revokes the session in the database.
 */
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db`
    UPDATE auth_sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = ${tokenHash}
  `;
}
