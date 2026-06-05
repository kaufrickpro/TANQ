import { NextResponse } from 'next/server';

const COOKIE_OPTIONS = {
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  expires: new Date(0),
  maxAge: 0,
};

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set('session_user', '', {
    ...COOKIE_OPTIONS,
    httpOnly: false,
  });

  response.cookies.set('session_token', '', {
    ...COOKIE_OPTIONS,
    httpOnly: true,
  });

  return response;
}
