import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

export interface ManagedAccount {
  id: number;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'reviewer' | 'author';
  isVerified: boolean;
  isDisabled: boolean;
  submissionCount: number;
  reviewCount: number;
  isCurrentUser: boolean;
  canDisable: boolean;
  canRestore: boolean;
  canDelete: boolean;
  deleteBlockReason: string | null;
}

export async function GET() {
  try {
    const admin = await getSessionUser();
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Single query counting history using case-insensitive, trimmed email comparisons
    const result = await db`
      SELECT 
        u.id, 
        u.username, 
        u.name, 
        u.email, 
        u.role, 
        u.is_verified, 
        u.is_disabled,
        (SELECT COUNT(*) FROM submissions s WHERE LOWER(TRIM(s.author_email)) = LOWER(TRIM(u.email))) as submission_count,
        (SELECT COUNT(*) FROM reviews r WHERE LOWER(TRIM(r.reviewer_email)) = LOWER(TRIM(u.email))) as review_count
      FROM users u
      ORDER BY u.id ASC
    `;

    const totalEnabledAdmins = result.rows.filter(
      (row: any) => row.role === 'admin' && !row.is_disabled
    ).length;

    const managedAccounts: ManagedAccount[] = result.rows.map((row: any) => {
      const isCurrentUser = row.id === admin.id;
      const submissionCount = parseInt(row.submission_count, 10);
      const reviewCount = parseInt(row.review_count, 10);
      const isDisabled = !!row.is_disabled;
      const isVerified = !!row.is_verified;
      const role = row.role as 'admin' | 'reviewer' | 'author';

      const isLastEnabledAdmin = role === 'admin' && !isDisabled && totalEnabledAdmins <= 1;

      let deleteBlockReason: string | null = null;
      if (isCurrentUser) {
        deleteBlockReason = 'You cannot delete your own account.';
      } else if (isLastEnabledAdmin) {
        deleteBlockReason = 'Cannot delete the last enabled administrator.';
      } else if (submissionCount > 0 || reviewCount > 0) {
        deleteBlockReason = 'This account has submission or review history and must be disabled instead of deleted.';
      }

      const canDisable = !isCurrentUser && !isDisabled && !isLastEnabledAdmin;
      const canRestore = isDisabled;
      const canDelete = !isCurrentUser && !isLastEnabledAdmin && submissionCount === 0 && reviewCount === 0;

      return {
        id: row.id,
        username: row.username,
        name: row.name,
        email: row.email,
        role,
        isVerified,
        isDisabled,
        submissionCount,
        reviewCount,
        isCurrentUser,
        canDisable,
        canRestore,
        canDelete,
        deleteBlockReason,
      };
    });

    return NextResponse.json(managedAccounts);
  } catch (error: any) {
    console.error('Error fetching managed accounts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. Same-Origin Validation
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed. Insecure origin.' }, { status: 403 });
    }

    // 2. Authenticate admin
    const admin = await getSessionUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (admin.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Input validation
    const body = await request.json();
    const { action, userId, confirmationEmail } = body;

    if (!action || !['disable', 'restore', 'delete'].includes(action) || typeof userId !== 'number') {
      return NextResponse.json({ error: 'Malformed input parameters' }, { status: 400 });
    }

    const client = await db.connect();
    try {
      await client.sql`BEGIN`;

      // Lock the target user row
      const targetUserResult = await client.sql`
        SELECT id, username, name, email, role, is_disabled, is_verified 
        FROM users 
        WHERE id = ${userId}
        FOR UPDATE
      `;

      if (targetUserResult.rows.length === 0) {
        await client.sql`ROLLBACK`;
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const targetUser = targetUserResult.rows[0];

      // Block self-disable and self-delete
      if (userId === admin.id && (action === 'disable' || action === 'delete')) {
        await client.sql`ROLLBACK`;
        return NextResponse.json({ error: 'Cannot perform this action on your own account' }, { status: 409 });
      }

      // Block actions that would leave no enabled administrator
      if (targetUser.role === 'admin' && !targetUser.is_disabled && (action === 'disable' || action === 'delete')) {
        const enabledAdminsResult = await client.sql`
          SELECT COUNT(*) as count 
          FROM users 
          WHERE role = 'admin' AND is_disabled = FALSE
        `;
        const enabledAdminsCount = parseInt(enabledAdminsResult.rows[0].count, 10);
        if (enabledAdminsCount <= 1) {
          await client.sql`ROLLBACK`;
          return NextResponse.json({ error: 'Cannot leave the system with no enabled administrator' }, { status: 409 });
        }
      }

      if (action === 'disable') {
        await client.sql`
          UPDATE users 
          SET is_disabled = TRUE 
          WHERE id = ${userId}
        `;
        // Revoke all active sessions
        await client.sql`
          UPDATE auth_sessions
          SET revoked_at = CURRENT_TIMESTAMP
          WHERE user_id = ${userId} AND revoked_at IS NULL
        `;
        await client.sql`COMMIT`;
        return NextResponse.json({ success: true });
      }

      if (action === 'restore') {
        await client.sql`
          UPDATE users 
          SET is_disabled = FALSE 
          WHERE id = ${userId}
        `;
        await client.sql`COMMIT`;
        return NextResponse.json({ success: true });
      }

      if (action === 'delete') {
        // Require trimmed case-insensitive confirmation email to match
        const cleanedConfirm = (confirmationEmail || '').trim().toLowerCase();
        const cleanedUserEmail = (targetUser.email || '').trim().toLowerCase();

        if (cleanedConfirm !== cleanedUserEmail) {
          await client.sql`ROLLBACK`;
          return NextResponse.json({ error: 'Confirmation email does not match' }, { status: 400 });
        }

        // Reject deletion if history exists
        const subCountResult = await client.sql`
          SELECT COUNT(*) as count 
          FROM submissions 
          WHERE LOWER(TRIM(author_email)) = LOWER(TRIM(${targetUser.email}))
        `;
        const reviewCountResult = await client.sql`
          SELECT COUNT(*) as count 
          FROM reviews 
          WHERE LOWER(TRIM(reviewer_email)) = LOWER(TRIM(${targetUser.email}))
        `;
        const subCount = parseInt(subCountResult.rows[0].count, 10);
        const reviewCount = parseInt(reviewCountResult.rows[0].count, 10);

        if (subCount > 0 || reviewCount > 0) {
          await client.sql`ROLLBACK`;
          return NextResponse.json({ error: 'Cannot delete account with submission or review history' }, { status: 409 });
        }

        // Delete user row (cascades to auth_sessions, and invitations references set to NULL)
        await client.sql`
          DELETE FROM users 
          WHERE id = ${userId}
        `;
        await client.sql`COMMIT`;
        return NextResponse.json({ success: true });
      }

      await client.sql`ROLLBACK`;
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (txnErr) {
      await client.sql`ROLLBACK`;
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error in account mutation:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
