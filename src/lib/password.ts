import { scrypt, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Hashes a plain-text password using Node.js native scrypt.
 * Returns a string formatted as "salt:hash".
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex');
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a plain-text password against a stored "salt:hash" password.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // If the stored hash is not in salt:hash format, it is invalid or plain text (which we don't allow anymore)
    if (!storedHash || !storedHash.includes(':')) {
      return resolve(false);
    }

    const [salt, hash] = storedHash.split(':');
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      
      const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
      const hashBuffer = Buffer.from(hash, 'hex');
      
      if (keyBuffer.length !== hashBuffer.length) {
        return resolve(false);
      }
      
      return resolve(timingSafeEqual(keyBuffer, hashBuffer));
    });
  });
}

/**
 * Validates a password against the quality requirements:
 * - At least 8 characters long
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */
export function validatePasswordQuality(password: string): { valid: boolean; error?: string } {
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number.' };
  }
  return { valid: true };
}
