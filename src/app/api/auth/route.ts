import { NextResponse } from 'next/server';
import { randomInt, createHash } from 'crypto';
import db from '@/lib/db';
import { hashPassword, verifyPassword, validatePasswordQuality } from '@/lib/password';
import { sendVerificationEmail } from '@/lib/email';
import { createSession } from '@/lib/session';
import { 
  getClientIp, 
  checkLoginRateLimit, 
  recordLoginAttempt, 
  recordLoginFailure,
  checkOtpResendRateLimit,
  recordOtpResend,
  checkRegistrationRateLimit,
  recordRegistrationAttempt
} from '@/lib/rateLimit';
import { validateSameOrigin } from '@/lib/sameOrigin';

type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
};

async function createSessionResponse(user: AuthUser) {
  const token = await createSession(user.id);
  const response = NextResponse.json(user);

  response.cookies.set('session_token', token, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  });

  return response;
}

export async function POST(request: Request) {
  try {
    // 1. Same-Origin Validation
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed. Insecure origin.' }, { status: 403 });
    }

    const ip = getClientIp(request);
    const body = await request.json();
    const { action = 'login', username, password, name, email, role = 'author', token } = body;

    // ─────────────────────────────────────────────────────────────────────────
    // Action: Resend OTP
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'resend-otp') {
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }

      // Check OTP resend limits
      const resendLimit = await checkOtpResendRateLimit(email, ip);
      if (!resendLimit.success) {
        return NextResponse.json({ error: resendLimit.error }, { status: 429 });
      }

      // Record resend attempt
      await recordOtpResend(email, ip);

      // Query user
      const userResult = await db`
        SELECT id, name, email, is_verified 
        FROM users 
        WHERE email = ${email.trim().toLowerCase()}
      `;

      if (userResult.rows.length > 0) {
        const dbUser = userResult.rows[0];
        if (!dbUser.is_verified) {
          const otpVal = randomInt(100000, 999999).toString();
          const hashedOtp = createHash('sha256').update(otpVal).digest('hex');
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

          await db`
            UPDATE users
            SET verification_otp = ${hashedOtp}, otp_expires_at = ${expiresAt.toISOString()}
            WHERE id = ${dbUser.id}
          `;

          try {
            await sendVerificationEmail(dbUser.email, dbUser.name, otpVal);
          } catch (mailErr) {
            console.error('Failed to resend OTP email:', mailErr);
          }
        }
      }

      // Generic response to prevent account enumeration
      return NextResponse.json({ 
        success: true, 
        message: 'If the account exists and is not verified, a verification code has been sent.' 
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action: Register
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'register') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json({ error: 'Full name and email are required' }, { status: 400 });
      }
      if (!['author', 'reviewer', 'secretary', 'editor', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Invalid account type' }, { status: 400 });
      }

      // Rate limit check
      const regLimit = await checkRegistrationRateLimit(ip);
      if (!regLimit.success) {
        return NextResponse.json({ error: regLimit.error }, { status: 429 });
      }
      await recordRegistrationAttempt(ip);

      // Validate password quality
      const passwordValidation = validatePasswordQuality(password);
      if (!passwordValidation.valid) {
        return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
      }

      // Hash password
      const passwordHash = await hashPassword(password);
      const regUsername = (username?.trim() || email.trim()).trim();
      const regEmail = email.trim().toLowerCase();

      // For privileged roles, complete invitation verification & registration inside a transaction
      if (role === 'admin' || role === 'editor' || role === 'secretary' || role === 'reviewer') {
        if (!token) {
          return NextResponse.json({ 
            error: 'An invitation token is required to register as editorial staff or a peer reviewer.'
          }, { status: 400 });
        }

        const client = await db.connect();
        try {
          await client.sql`BEGIN`;

          const tokenHash = createHash('sha256').update(token).digest('hex');
          const inviteResult = await client.sql`
            SELECT id, email, role, is_used, expires_at, revoked_at 
            FROM invitations 
            WHERE token_hash = ${tokenHash}
            FOR UPDATE
          `;

          if (inviteResult.rows.length === 0) {
            throw new Error('Invitation link is invalid or expired');
          }

          const invitation = inviteResult.rows[0];
          if (invitation.is_used || invitation.used_at) {
            throw new Error('This invitation link has already been used');
          }
          if (invitation.revoked_at) {
            throw new Error('This invitation link has been revoked');
          }
          if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
            throw new Error('This invitation link has expired');
          }
          if (invitation.email.trim().toLowerCase() !== regEmail) {
            throw new Error('Your email does not match the invitation email');
          }
          if (invitation.role !== role) {
            throw new Error('Role discrepancy detected in invitation token');
          }

          // Unique username check (case-insensitive)
          const dupUserResult = await client.sql`
            SELECT id FROM users WHERE LOWER(username) = LOWER(${regUsername})
          `;
          if (dupUserResult.rows.length > 0) {
            throw new Error('Username is already taken');
          }

          // Unique email check (case-insensitive)
          const dupEmailResult = await client.sql`
            SELECT id FROM users WHERE LOWER(email) = LOWER(${regEmail})
          `;
          if (dupEmailResult.rows.length > 0) {
            throw new Error('Email address is already registered');
          }

          // Insert user
          const insertResult = await client.sql`
            INSERT INTO users (username, password_hash, name, email, role, is_verified)
            VALUES (${regUsername}, ${passwordHash}, ${name.trim()}, ${email.trim()}, ${role}, TRUE)
            RETURNING id, username, name, email, role, is_verified
          `;

          // Mark invitation used
          await client.sql`
            UPDATE invitations
            SET is_used = TRUE, used_at = CURRENT_TIMESTAMP
            WHERE id = ${invitation.id}
          `;

          await client.sql`COMMIT`;

          const user = insertResult.rows[0] as AuthUser;
          return await createSessionResponse(user);
        } catch (txnErr: any) {
          await client.sql`ROLLBACK`;
          return NextResponse.json({ error: txnErr.message || 'Registration failed' }, { status: 400 });
        } finally {
          client.release();
        }
      } else {
        // Standard author registration
        // Check username taken
        const existingUserResult = await db`
          SELECT id FROM users WHERE LOWER(username) = LOWER(${regUsername})
        `;
        if (existingUserResult.rows.length > 0) {
          return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
        }

        // Check email taken
        const existingEmailResult = await db`
          SELECT id FROM users WHERE LOWER(email) = LOWER(${regEmail})
        `;
        if (existingEmailResult.rows.length > 0) {
          return NextResponse.json({ error: 'Email address is already registered' }, { status: 409 });
        }

        const verificationOtp = randomInt(100000, 999999).toString();
        const hashedOtp = createHash('sha256').update(verificationOtp).digest('hex');
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified, verification_otp, otp_expires_at)
          VALUES (${regUsername}, ${passwordHash}, ${name.trim()}, ${email.trim()}, ${role}, FALSE, ${hashedOtp}, ${otpExpiresAt.toISOString()})
        `;

        try {
          await sendVerificationEmail(email.trim(), name.trim(), verificationOtp);
        } catch (mailErr) {
          console.error('Email sending failed during registration:', mailErr);
        }

        return NextResponse.json({
          success: true,
          requiresVerification: true,
          email: email.trim(),
          message: 'Registration successful. A verification code has been sent to your email.'
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action: Login (Default)
    // ─────────────────────────────────────────────────────────────────────────
    if (!username || !password) {
      return NextResponse.json({ error: 'Username or email and password are required' }, { status: 400 });
    }

    // Rate limit check
    const loginLimit = await checkLoginRateLimit(username, ip);
    if (!loginLimit.success) {
      return NextResponse.json({ error: loginLimit.error }, { status: 429 });
    }
    await recordLoginAttempt(ip);

    // Query user by username or email
    const userResult = await db`
      SELECT id, username, password_hash, name, email, role, is_verified, is_disabled, verification_otp, otp_expires_at 
      FROM users 
      WHERE LOWER(username) = LOWER(${username.trim()}) OR LOWER(email) = LOWER(${username.trim()})
    `;

    if (userResult.rows.length === 0) {
      await recordLoginFailure(username, ip);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const dbUser = userResult.rows[0];

    // Reject if account is disabled
    if (dbUser.is_disabled) {
      return NextResponse.json({ error: 'Account is disabled. Please contact support.' }, { status: 403 });
    }

    // Validate password
    const isPasswordValid = await verifyPassword(password, dbUser.password_hash);
    if (!isPasswordValid) {
      await recordLoginFailure(username, ip);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Check verification status
    if (!dbUser.is_verified) {
      // If verification_otp or expiry is missing or expired, generate a new one
      let otpVal = randomInt(100000, 999999).toString();
      const hashedOtp = createHash('sha256').update(otpVal).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db`
        UPDATE users
        SET verification_otp = ${hashedOtp}, otp_expires_at = ${expiresAt.toISOString()}
        WHERE id = ${dbUser.id}
      `;

      try {
        await sendVerificationEmail(dbUser.email, dbUser.name, otpVal);
      } catch (mailErr) {
        console.error('Email sending failed during login verification resend:', mailErr);
      }

      return NextResponse.json({ 
        error: 'Verification required. A code has been sent to your email.', 
        requiresVerification: true, 
        email: dbUser.email 
      }, { status: 403 });
    }

    // Successful login
    const user: AuthUser = {
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role
    };

    return await createSessionResponse(user);
  } catch (error: any) {
    console.error('Detailed server login error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again later.' }, { status: 500 });
  }
}
