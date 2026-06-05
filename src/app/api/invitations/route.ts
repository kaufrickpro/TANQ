import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import crypto from 'crypto';

// Helper to authenticate editor (admin) session
async function getAdminSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session_user');
    if (!sessionCookie) return null;
    
    const user = JSON.parse(decodeURIComponent(sessionCookie.value));
    if (user && user.role === 'admin') {
      return user;
    }
  } catch (e) {
    console.error('Error parsing admin session:', e);
  }
  return null;
}

// GET handler
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Public verification endpoint: check if token is valid
    if (token) {
      const result = await db`
        SELECT email, role, is_used 
        FROM invitations 
        WHERE token = ${token}
      `;

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Invitation link is invalid or not found' }, { status: 404 });
      }

      const invitation = result.rows[0];
      if (invitation.is_used) {
        return NextResponse.json({ error: 'This invitation has already been used' }, { status: 400 });
      }

      return NextResponse.json({
        email: invitation.email,
        role: invitation.role,
      });
    }

    // Secured endpoint: list all invitations (Admins only)
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized. Editor session required.' }, { status: 401 });
    }

    const invitesResult = await db`
      SELECT id, email, role, token, is_used, created_at
      FROM invitations
      ORDER BY id DESC
    `;

    return NextResponse.json(invitesResult.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST handler
export async function POST(request: Request) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized. Editor session required.' }, { status: 401 });
    }

    const { action, email, role, id } = await request.json();

    if (action === 'create') {
      if (!email || !role) {
        return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
      }

      if (!['admin', 'reviewer'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role for invitation' }, { status: 400 });
      }

      const formattedEmail = email.trim().toLowerCase();
      
      // Basic email regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formattedEmail)) {
        return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 });
      }

      const token = crypto.randomUUID();

      const insertResult = await db`
        INSERT INTO invitations (email, role, token)
        VALUES (${formattedEmail}, ${role}, ${token})
        RETURNING id, email, role, token, is_used, created_at
      `;

      return NextResponse.json({
        success: true,
        invitation: insertResult.rows[0]
      });
    }

    if (action === 'revoke') {
      if (!id) {
        return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
      }

      // Delete the invitation
      await db`
        DELETE FROM invitations 
        WHERE id = ${Number(id)}
      `;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
