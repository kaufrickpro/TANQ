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
    const { action = 'login', username, password, name, email, role = 'author' } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (action === 'register') {
      if (!name || !email) {
        return NextResponse.json({ error: 'Full name and email are required' }, { status: 400 });
      }

      if (!['author', 'reviewer', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Invalid account type' }, { status: 400 });
      }

      const existingUserResult = await db`
        SELECT id FROM users WHERE username = ${username}
      `;

      if (existingUserResult.rows.length > 0) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
      }

      const insertResult = await db`
        INSERT INTO users (username, password_hash, name, email, role)
        VALUES (${username.trim()}, ${password}, ${name.trim()}, ${email.trim()}, ${role})
        RETURNING id, username, name, email, role
      `;

      const user = insertResult.rows[0] as AuthUser;
      return createSessionResponse(user);
    }

    // Query user using plain text matching for password validation
    const userResult = await db`
      SELECT id, username, name, email, role 
      FROM users 
      WHERE username = ${username} AND password_hash = ${password}
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = userResult.rows[0] as AuthUser;
    return createSessionResponse(user);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
