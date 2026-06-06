import { NextResponse } from 'next/server';
import db from '@/lib/db';
import crypto from 'crypto';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

// GET handler
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Public verification endpoint: check if token is valid
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await db`
        SELECT email, role, is_used, expires_at, revoked_at 
        FROM invitations 
        WHERE token_hash = ${tokenHash}
      `;

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Invitation link is invalid or not found' }, { status: 404 });
      }

      const invitation = result.rows[0];
      if (invitation.is_used) {
        return NextResponse.json({ error: 'This invitation has already been used' }, { status: 400 });
      }
      if (invitation.revoked_at) {
        return NextResponse.json({ error: 'This invitation has been revoked' }, { status: 400 });
      }
      if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        return NextResponse.json({ error: 'This invitation has expired' }, { status: 400 });
      }

      return NextResponse.json({
        email: invitation.email,
        role: invitation.role,
      });
    }

    // Secured endpoint: list all invitations (Admins only)
    const admin = await getSessionUser();
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Editor session required.' }, { status: 401 });
    }

    const invitesResult = await db`
      SELECT id, email, role, is_used, created_at, expires_at, used_at, revoked_at, created_by_user_id
      FROM invitations
      ORDER BY id DESC
    `;

    return NextResponse.json(invitesResult.rows);
  } catch (error: any) {
    console.error('Error in invitations GET:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST handler
export async function POST(request: Request) {
  try {
    // Same-origin check
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const admin = await getSessionUser();
    if (!admin || admin.role !== 'admin') {
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

      // Generate 256-bit raw opaque token (32 bytes = 64 hex chars)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration

      const insertResult = await db`
        INSERT INTO invitations (email, role, token_hash, expires_at, created_by_user_id)
        VALUES (${formattedEmail}, ${role}, ${tokenHash}, ${expiresAt.toISOString()}, ${admin.id})
        RETURNING id, email, role, is_used, created_at, expires_at, used_at, revoked_at, created_by_user_id
      `;

      const row = insertResult.rows[0];

      return NextResponse.json({
        success: true,
        invitation: {
          ...row,
          token: rawToken // Return raw token only once on creation
        }
      });
    }

    if (action === 'revoke') {
      if (!id) {
        return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
      }

      // Set revoked_at timestamp
      await db`
        UPDATE invitations
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = ${Number(id)}
      `;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in invitations POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
