import crypto from 'crypto';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { canCreateEvidence } from '@/lib/case-files/access';
import { appendSubmissionEvent } from '@/lib/case-files/audit';
import { createEvidenceExport } from '@/lib/case-files/evidence';

export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session || !canCreateEvidence(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const submissionId = Number(id);
  const exportsResult = await db`
    SELECT id, status, requested_by_name, include_identities, manifest_sha256,
           error_message, requested_at, completed_at, expires_at,
           CASE WHEN status = 'ready' THEN '/api/case-files/' || submission_id || '/evidence/' || id || '/download' END AS download_url
    FROM evidence_exports
    WHERE submission_id = ${submissionId}
    ORDER BY requested_at DESC
  `;
  const sharesResult = await db`
    SELECT id, auditor_email, include_identities, expires_at, revoked_at, created_by_name, created_at
    FROM evidence_shares
    WHERE submission_id = ${submissionId}
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ exports: exportsResult.rows, shares: sharesResult.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateSameOrigin(request)) return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    const session = await getSessionUser();
    if (!session || !canCreateEvidence(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const submissionId = Number(id);
    const body = await request.json();
    const actor = { id: session.id, name: session.name, role: session.role as any, email: session.email };

    if (body.action === 'export') {
      const result = await createEvidenceExport({
        submissionId,
        actor,
        includeIdentities: !!body.include_identities,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (body.action === 'create_share') {
      const email = String(body.auditor_email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid auditor email is required');
      const requestedDays = Number(body.expires_in_days || 7);
      const days = Math.max(1, Math.min(30, requestedDays));
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        const share = await client.sql`
          INSERT INTO evidence_shares (
            submission_id, token_hash, auditor_email, include_identities, expires_at,
            created_by_user_id, created_by_name
          )
          VALUES (
            ${submissionId}, ${tokenHash}, ${email}, ${!!body.include_identities},
            ${expiresAt.toISOString()}, ${session.id}, ${session.name}
          )
          RETURNING id, auditor_email, include_identities, expires_at, created_at
        `;
        await appendSubmissionEvent(client, {
          submissionId,
          eventType: 'evidence_share_created',
          actor,
          summary: 'A time-limited auditor evidence share was created.',
          payload: {
            shareId: share.rows[0].id,
            auditorEmail: email,
            expiresAt: expiresAt.toISOString(),
            includeIdentities: !!body.include_identities,
          },
        });
        await client.sql`COMMIT`;
        return NextResponse.json({
          share: share.rows[0],
          url: `${new URL(request.url).origin}/evidence/${rawToken}`,
        }, { status: 201 });
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }
    }

    if (body.action === 'revoke_share') {
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        const result = await client.sql`
          UPDATE evidence_shares
          SET revoked_at = NOW()
          WHERE id = ${Number(body.share_id)}
            AND submission_id = ${submissionId}
            AND revoked_at IS NULL
          RETURNING id
        `;
        if (result.rows.length === 0) throw new Error('Active evidence share not found');
        await appendSubmissionEvent(client, {
          submissionId,
          eventType: 'evidence_share_revoked',
          actor,
          summary: 'A time-limited auditor evidence share was revoked.',
          payload: { shareId: result.rows[0].id },
        });
        await client.sql`COMMIT`;
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Evidence action failed' }, { status: 400 });
  }
}
