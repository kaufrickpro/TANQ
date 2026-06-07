import db from '@/lib/db';

export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.trim();
  }
  return '127.0.0.1';
}

async function isBlocked(key: string): Promise<boolean> {
  const result = await db`
    SELECT count FROM auth_rate_limits
    WHERE key = ${key} AND expires_at > CURRENT_TIMESTAMP
  `;
  return result.rows.length > 0;
}

async function blockKey(key: string, blockDurationMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + blockDurationMs);
  await db`
    INSERT INTO auth_rate_limits (key, count, expires_at)
    VALUES (${key}, 1, ${expiresAt.toISOString()})
    ON CONFLICT (key) DO UPDATE
    SET expires_at = EXCLUDED.expires_at
  `;
}

async function getCount(key: string, windowMs: number): Promise<number> {
  const windowIndex = Math.floor(Date.now() / windowMs);
  const rateLimitKey = `${key}:${windowIndex}`;
  const result = await db`
    SELECT count FROM auth_rate_limits
    WHERE key = ${rateLimitKey} AND expires_at > CURRENT_TIMESTAMP
  `;
  return result.rows.length > 0 ? result.rows[0].count : 0;
}

async function incrementCount(key: string, windowMs: number): Promise<number> {
  // Prune expired records to keep table clean
  await db`
    DELETE FROM auth_rate_limits WHERE expires_at < CURRENT_TIMESTAMP
  `;

  const windowIndex = Math.floor(Date.now() / windowMs);
  const rateLimitKey = `${key}:${windowIndex}`;
  const expiresAt = new Date(Date.now() + windowMs);

  const result = await db`
    INSERT INTO auth_rate_limits (key, count, expires_at)
    VALUES (${rateLimitKey}, 1, ${expiresAt.toISOString()})
    ON CONFLICT (key) DO UPDATE
    SET count = auth_rate_limits.count + 1
    RETURNING count
  `;
  return result.rows[0].count;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-Level Rate Limiting Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks login rate limit.
 * Login: 5 failures per identifier/IP per 15 minutes, plus 30 attempts per IP per hour.
 */
export async function checkLoginRateLimit(identifier: string, ip: string): Promise<{ success: boolean; error?: string }> {
  const cleanId = identifier.trim().toLowerCase();

  // 1. IP Attempts in 1 hour
  const ipAttempts = await getCount(`login_attempts:ip:${ip}`, 3600000);
  if (ipAttempts >= 30) {
    return { success: false, error: 'Too many login attempts. Please try again in an hour.' };
  }

  // 2. Failures for identifier in 15 minutes
  const idFailures = await getCount(`login_failures:id:${cleanId}`, 900000);
  if (idFailures >= 5) {
    return { success: false, error: 'Too many failed login attempts. Please try again in 15 minutes.' };
  }

  // 3. Failures for IP in 15 minutes
  const ipFailures = await getCount(`login_failures:ip:${ip}`, 900000);
  if (ipFailures >= 5) {
    return { success: false, error: 'Too many failed login attempts from this IP. Please try again in 15 minutes.' };
  }

  return { success: true };
}

export async function recordLoginAttempt(ip: string): Promise<void> {
  await incrementCount(`login_attempts:ip:${ip}`, 3600000);
}

export async function recordLoginFailure(identifier: string, ip: string): Promise<void> {
  const cleanId = identifier.trim().toLowerCase();
  await incrementCount(`login_failures:id:${cleanId}`, 900000);
  await incrementCount(`login_failures:ip:${ip}`, 900000);
}

/**
 * Checks OTP verification rate limit.
 * OTP verification: 5 failures per email/IP per 15 minutes, then invalidate and block for 30 minutes.
 */
export async function checkOtpVerificationRateLimit(email: string, ip: string): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (await isBlocked(`otp_blocked:email:${cleanEmail}`)) {
    return { success: false, error: 'OTP verification is blocked for this email. Please try again in 30 minutes.' };
  }

  if (await isBlocked(`otp_blocked:ip:${ip}`)) {
    return { success: false, error: 'OTP verification is blocked for this IP. Please try again in 30 minutes.' };
  }

  const emailFailures = await getCount(`otp_failures:email:${cleanEmail}`, 900000);
  if (emailFailures >= 5) {
    return { success: false, error: 'Too many verification failures. Account blocked for 30 minutes.' };
  }

  const ipFailures = await getCount(`otp_failures:ip:${ip}`, 900000);
  if (ipFailures >= 5) {
    return { success: false, error: 'Too many verification failures from this IP. Blocked for 30 minutes.' };
  }

  return { success: true };
}

export async function recordOtpFailure(email: string, ip: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailFailCount = await incrementCount(`otp_failures:email:${cleanEmail}`, 900000);
  const ipFailCount = await incrementCount(`otp_failures:ip:${ip}`, 900000);

  if (emailFailCount >= 5 || ipFailCount >= 5) {
    // Invalidate OTP in database
    await db`
      UPDATE users 
      SET verification_otp = NULL, 
          otp_expires_at = NULL 
      WHERE email = ${cleanEmail}
    `;

    // Block for 30 minutes (1,800,000 ms)
    await blockKey(`otp_blocked:email:${cleanEmail}`, 1800000);
    await blockKey(`otp_blocked:ip:${ip}`, 1800000);
  }
}

/**
 * Checks OTP resend rate limit.
 * OTP resend: minimum 60-second delay, maximum 3 per email and 10 per IP per hour.
 */
export async function checkOtpResendRateLimit(email: string, ip: string): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (await isBlocked(`otp_resend_delay:${cleanEmail}`)) {
    return { success: false, error: 'Please wait 60 seconds before requesting another code.' };
  }

  const emailResends = await getCount(`otp_resend_count:email:${cleanEmail}`, 3600000);
  if (emailResends >= 3) {
    return { success: false, error: 'Maximum resend attempts reached for this email. Please try again in an hour.' };
  }

  const ipResends = await getCount(`otp_resend_count:ip:${ip}`, 3600000);
  if (ipResends >= 10) {
    return { success: false, error: 'Maximum resend attempts reached from this IP. Please try again in an hour.' };
  }

  return { success: true };
}

export async function recordOtpResend(email: string, ip: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  // Set 60 seconds delay
  await blockKey(`otp_resend_delay:${cleanEmail}`, 60000);
  // Increment hourly counts
  await incrementCount(`otp_resend_count:email:${cleanEmail}`, 3600000);
  await incrementCount(`otp_resend_count:ip:${ip}`, 3600000);
}

/**
 * Checks Registration rate limit.
 * Registration: maximum 15 attempts per IP per hour.
 */
export async function checkRegistrationRateLimit(ip: string): Promise<{ success: boolean; error?: string }> {
  const regAttempts = await getCount(`registration_attempts:ip:${ip}`, 3600000);
  if (regAttempts >= 15) {
    return { success: false, error: 'Too many registration attempts from this IP. Please try again in an hour.' };
  }

  return { success: true };
}

export async function recordRegistrationAttempt(ip: string): Promise<void> {
  await incrementCount(`registration_attempts:ip:${ip}`, 3600000);
}
