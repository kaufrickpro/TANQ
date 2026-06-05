import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getSessionKey(): Buffer {
  const secretKey = process.env.SESSION_SECRET;
  if (!secretKey) {
    throw new Error('SESSION_SECRET is required for encrypted session cookies.');
  }
  // Ensure key is exactly 32 bytes
  return Buffer.concat([Buffer.from(secretKey), Buffer.alloc(32)], 32);
}

export interface SessionPayload {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Encrypts a session payload into a secure token string.
 */
export function encryptSession(payload: SessionPayload): string {
  const iv = randomBytes(12);
  const key = getSessionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv_hex:auth_tag_hex:encrypted_hex
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a secure token string back into a session payload.
 * Returns null if the token is invalid or tampered with.
 */
export function decryptSession(token: string): SessionPayload | null {
  try {
    if (!token) return null;
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const key = getSessionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted) as SessionPayload;
  } catch {
    return null;
  }
}
