import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import db from '@/lib/db';
import { createSession } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { getClientIp, checkOtpVerificationRateLimit, recordOtpFailure } from '@/lib/rateLimit';

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
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and verification code are required' }, { status: 400 });
    }

    const formattedEmail = email.trim().toLowerCase();

    // 2. OTP Verification Rate Limit Check
    const rateLimit = await checkOtpVerificationRateLimit(formattedEmail, ip);
    if (!rateLimit.success) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    // Retrieve the user from the database
    const userResult = await db`
      SELECT id, username, name, email, role, is_verified, is_disabled, verification_otp, otp_expires_at 
      FROM users 
      WHERE email = ${formattedEmail}
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'Account not found with this email' }, { status: 404 });
    }

    const dbUser = userResult.rows[0];

    // Reject if disabled
    if (dbUser.is_disabled) {
      return NextResponse.json({ error: 'Account is disabled. Please contact support.' }, { status: 403 });
    }

    // Validate OTP code and expiration
    const storedOtp = dbUser.verification_otp;
    const expiresAt = dbUser.otp_expires_at;

    const inputHashedOtp = createHash('sha256').update(otp.trim()).digest('hex');

    if (!storedOtp || storedOtp !== inputHashedOtp) {
      await recordOtpFailure(formattedEmail, ip);
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    if (expiresAt && new Date(expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    // Mark user as verified
    await db`
      UPDATE users 
      SET is_verified = TRUE, 
          verification_otp = NULL, 
          otp_expires_at = NULL 
      WHERE id = ${dbUser.id}
    `;

    const authUser: AuthUser = {
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role
    };

    return await createSessionResponse(authUser);
  } catch (error: any) {
    console.error('Detailed verification error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again later.' }, { status: 500 });
  }
}
