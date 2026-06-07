import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { sendWithdrawalDecisionEmail } from '@/lib/email';
import { appendSubmissionEvent } from '@/lib/case-files/audit';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['admin', 'editor'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden: editor role required' }, { status: 403 });
    }

    const { id } = await params;
    const submissionId = Number(id);
    if (isNaN(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 });
    }

    const body = await request.json();
    const { decision, editor_note } = body;

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 });
    }

    // Fetch the submission
    const subResult = await db`SELECT * FROM submissions WHERE id = ${submissionId}`;
    if (subResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const sub = subResult.rows[0];

    if (sub.withdrawal_status !== 'requested') {
      return NextResponse.json(
        { error: 'No pending withdrawal request found for this submission' },
        { status: 409 }
      );
    }

    // Find the latest pending withdrawal request
    const wrResult = await db`
      SELECT * FROM withdrawal_requests
      WHERE submission_id = ${submissionId} AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (wrResult.rows.length === 0) {
      return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404 });
    }
    const wr = wrResult.rows[0];
    const resolvedAt = new Date().toISOString();
    const editorNote = editor_note?.trim() || null;

    const client = await db.connect();
    try {
      await client.sql`BEGIN`;
      await client.sql`
        UPDATE withdrawal_requests
        SET status = ${decision}, editor_note = ${editorNote}, resolved_at = ${resolvedAt}
        WHERE id = ${wr.id}
      `;
      if (decision === 'approved') {
        await client.sql`
          UPDATE submissions
          SET status = 'withdrawn', current_stage = 'withdrawn', withdrawal_status = 'approved',
              closed_at = NOW(), closed_reason = ${editorNote || wr.reason}, lock_version = lock_version + 1
          WHERE id = ${submissionId}
        `;
      } else {
        await client.sql`
          UPDATE submissions
          SET withdrawal_status = NULL, lock_version = lock_version + 1
          WHERE id = ${submissionId}
        `;
      }
      await appendSubmissionEvent(client, {
        submissionId,
        eventType: decision === 'approved' ? 'withdrawal_approved' : 'withdrawal_rejected',
        actor: { id: session.id, name: session.name, role: session.role as any, email: session.email },
        fromStage: sub.current_stage || sub.status,
        toStage: decision === 'approved' ? 'withdrawn' : (sub.current_stage || sub.status),
        summary: decision === 'approved'
          ? 'The editorial team approved the withdrawal request.'
          : 'The editorial team rejected the withdrawal request.',
        payload: { withdrawalRequestId: wr.id, editorNote },
      });
      await client.sql`COMMIT`;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }

    // Send email to author
    await sendWithdrawalDecisionEmail(
      sub.author_email,
      sub.author_name,
      sub.title,
      decision as 'approved' | 'rejected',
      editorNote ?? undefined
    );

    return NextResponse.json({
      decision,
      message: decision === 'approved'
        ? 'Withdrawal approved. Submission is now marked as withdrawn.'
        : 'Withdrawal rejected. Submission continues in review.',
    });
  } catch (error: any) {
    console.error('Error in withdrawal-decision POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
