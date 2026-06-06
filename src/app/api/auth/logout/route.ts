import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeSession } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

const COOKIE_OPTIONS = {
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  expires: new Date(0),
  maxAge: 0,
};

export async function POST(request: Request) {
  try {
    // Validate Same-Origin
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('session_token');

    if (tokenCookie) {
      await revokeSession(tokenCookie.value);
    }

    const response = NextResponse.json({ success: true });

    // Explicitly delete session_token cookie
    response.cookies.set('session_token', '', {
      ...COOKIE_OPTIONS,
      httpOnly: true,
    });

    // Explicitly delete session_user cookie if it exists (cleanup legacy)
    response.cookies.set('session_user', '', {
      ...COOKIE_OPTIONS,
      httpOnly: false,
    });

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
