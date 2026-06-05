import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import db from '@/lib/db';
import { hashPassword, verifyPassword, validatePasswordQuality } from '@/lib/password';
import { sendVerificationEmail } from '@/lib/email';
import { encryptSession } from '@/lib/session';

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

  const token = encryptSession(user);
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
    const body = await request.json();
    const { action = 'login', username, password, name, email, role = 'author', token } = body;

    if (action === 'login' && (!username || !password)) {
      return NextResponse.json({ error: 'Username or email and password are required' }, { status: 400 });
    }

    if (action === 'register' && (!email || !password)) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (action === 'resend-otp') {
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }

      const userResult = await db`
        SELECT id, name, email, is_verified 
        FROM users 
        WHERE email = ${email.trim().toLowerCase()}
      `;

      if (userResult.rows.length === 0) {
        return NextResponse.json({ error: 'Account not found with this email' }, { status: 404 });
      }

      const dbUser = userResult.rows[0];
      if (dbUser.is_verified) {
        return NextResponse.json({ error: 'Account is already verified' }, { status: 400 });
      }

      const otpVal = randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db`
        UPDATE users
        SET verification_otp = ${otpVal}, otp_expires_at = ${expiresAt.toISOString()}
        WHERE id = ${dbUser.id}
      `;

      try {
        await sendVerificationEmail(dbUser.email, dbUser.name, otpVal);
      } catch (mailErr) {
        console.error('Failed to resend OTP email:', mailErr);
      }

      return NextResponse.json({ success: true, message: 'Verification code resent successfully' });
    }

    if (action === 'register') {
      if (!name || !email) {
        return NextResponse.json({ error: 'Full name and email are required' }, { status: 400 });
      }

      if (!['author', 'reviewer', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Invalid account type' }, { status: 400 });
      }

      // Privileged roles require a valid invitation token
      if (role === 'admin' || role === 'reviewer') {
        if (!token) {
          return NextResponse.json({ 
            error: 'An invitation token is required to register as a Peer Reviewer or Editor / Administrator.' 
          }, { status: 400 });
        }

        const inviteResult = await db`
          SELECT id, email, role, is_used 
          FROM invitations 
          WHERE token = ${token}
        `;

        if (inviteResult.rows.length === 0) {
          return NextResponse.json({ error: 'Invitation link is invalid or expired' }, { status: 400 });
        }

        const invitation = inviteResult.rows[0];
        if (invitation.is_used) {
          return NextResponse.json({ error: 'This invitation link has already been used' }, { status: 400 });
        }

        if (invitation.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
          return NextResponse.json({ error: 'Your email does not match the invitation email' }, { status: 400 });
        }

        if (invitation.role !== role) {
          return NextResponse.json({ error: 'Role discrepancy detected in invitation token' }, { status: 400 });
        }
      }

      const regUsername = (username?.trim() || email.trim()).trim();
      const regEmail = email.trim().toLowerCase();

      // Check if username is already taken (case-insensitive)
      const existingUserResult = await db`
        SELECT id FROM users WHERE LOWER(username) = LOWER(${regUsername})
      `;

      if (existingUserResult.rows.length > 0) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
      }

      // Check if email is already taken (case-insensitive)
      const existingEmailResult = await db`
        SELECT id FROM users WHERE LOWER(email) = LOWER(${regEmail})
      `;

      if (existingEmailResult.rows.length > 0) {
        return NextResponse.json({ error: 'Email address is already registered' }, { status: 409 });
      }

      // Validate password quality
      const passwordValidation = validatePasswordQuality(password);
      if (!passwordValidation.valid) {
        return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
      }

      // Hash the password securely
      const passwordHash = await hashPassword(password);

      let isVerified = false;
      let verificationOtp: string | null = null;
      let otpExpiresAt: Date | null = null;

      if (role === 'admin' || role === 'reviewer') {
        isVerified = true;
      } else {
        // Generate a 6-digit OTP code
        verificationOtp = randomInt(100000, 999999).toString();
        otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }

      const insertResult = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified, verification_otp, otp_expires_at)
        VALUES (${regUsername}, ${passwordHash}, ${name.trim()}, ${email.trim()}, ${role}, ${isVerified}, ${verificationOtp}, ${otpExpiresAt ? otpExpiresAt.toISOString() : null})
        RETURNING id, username, name, email, role, is_verified
      `;

      // Mark the invitation as used
      if (role === 'admin' || role === 'reviewer') {
        await db`
          UPDATE invitations
          SET is_used = TRUE
          WHERE token = ${token}
        `;
        
        const user = insertResult.rows[0] as AuthUser;
        return createSessionResponse(user);
      } else {
        // Send email with OTP (non-blocking for response speed)
        try {
          await sendVerificationEmail(email.trim(), name.trim(), verificationOtp!);
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

    // Query user by username or email (case-insensitive)
    const userResult = await db`
      SELECT id, username, password_hash, name, email, role, is_verified, verification_otp, otp_expires_at 
      FROM users 
      WHERE LOWER(username) = LOWER(${username.trim()}) OR LOWER(email) = LOWER(${username.trim()})
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const dbUser = userResult.rows[0];

    // Validate the password
    const isPasswordValid = await verifyPassword(password, dbUser.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Check if the user is verified
    if (!dbUser.is_verified) {
      let otpVal = dbUser.verification_otp;
      let expiresAt = dbUser.otp_expires_at;

      // Resend OTP code if it is expired or missing
      if (!otpVal || !expiresAt || new Date(expiresAt) < new Date()) {
        otpVal = randomInt(100000, 999999).toString();
        expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await db`
          UPDATE users
          SET verification_otp = ${otpVal}, otp_expires_at = ${expiresAt.toISOString()}
          WHERE id = ${dbUser.id}
        `;
      }

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

    const user: AuthUser = {
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role
    };
    
    return createSessionResponse(user);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

