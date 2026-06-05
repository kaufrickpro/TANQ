import { NextResponse } from 'next/server';
import db from '@/lib/db';

type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
};

function createSessionResponse(user: AuthUser) {
  const response = NextResponse.json(user);
  const sessionStr = JSON.stringify(user);

  response.cookies.set('session_user', sessionStr, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
    sameSite: 'lax',
  });

  return response;
}

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and verification code are required' }, { status: 400 });
    }

    const formattedEmail = email.trim().toLowerCase();

    // Retrieve the user from the database
    const userResult = await db`
      SELECT id, username, name, email, role, is_verified, verification_otp, otp_expires_at 
      FROM users 
      WHERE email = ${formattedEmail}
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'Account not found with this email' }, { status: 404 });
    }

    const dbUser = userResult.rows[0];

    // If already verified, log them in immediately for convenience
    if (dbUser.is_verified) {
      const authUser: AuthUser = {
        id: dbUser.id,
        username: dbUser.username,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role
      };
      return createSessionResponse(authUser);
    }

    // Validate OTP code and expiration
    const storedOtp = dbUser.verification_otp;
    const expiresAt = dbUser.otp_expires_at;

    if (!storedOtp || storedOtp !== otp.trim()) {
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

    return createSessionResponse(authUser);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
