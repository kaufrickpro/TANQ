import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { sendWithdrawalRequestEmail } from '@/lib/email';
import { appendSubmissionEvent } from '@/lib/case-files/audit';
import { setSubmissionDeadline } from '@/lib/deadlines';

// Statuses where the author can INSTANTLY withdraw (no editor approval needed)
const INSTANT_WITHDRAW_STATUSES = ['submitted'];

// Statuses where the author must REQUEST withdrawal (editor must approve)
const REQUEST_WITHDRAW_STATUSES = [
  'secretary_check', 'editor_screening', 'in_review', 'under_review',
  'editor_decision', 'revision_requested', 'author_revision',
];

// Statuses where withdrawal is NOT allowed at all
const NO_WITHDRAW_STATUSES = ['accepted', 'published', 'withdrawn'];

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
    if (session.role !== 'author') {
      return NextResponse.json({ error: 'Forbidden: only authors can request withdrawal' }, { status: 403 });
    }

    const { id } = await params;
    const submissionId = Number(id);
    if (isNaN(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 });
    }

    // Fetch the submission
    const subResult = await db`SELECT * FROM submissions WHERE id = ${submissionId}`;
    if (subResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const sub = subResult.rows[0];

    // Ownership check
    if (sub.author_email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: you do not own this submission' }, { status: 403 });
    }

    const { reason } = await request.json();
    if (!reason || reason.trim().length < 10) {
      return NextResponse.json({ error: 'A reason of at least 10 characters is required' }, { status: 400 });
    }

    const status: string = sub.status;

    // Block if already withdrawn or in no-withdraw statuses
    if (NO_WITHDRAW_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Withdrawal is not permitted for submissions with status "${status}"` },
        { status: 400 }
      );
    }

    // Block if there's already a pending withdrawal request
    if (sub.withdrawal_status === 'requested') {
      return NextResponse.json(
        { error: 'A withdrawal request is already pending for this submission' },
        { status: 409 }
      );
    }

    // INSTANT WITHDRAW — no editor approval needed
    if (INSTANT_WITHDRAW_STATUSES.includes(status)) {
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        await client.sql`
          UPDATE submissions
          SET status = 'withdrawn', current_stage = 'withdrawn', withdrawal_status = 'approved',
              closed_at = NOW(), closed_reason = ${reason.trim()}, lock_version = lock_version + 1
          WHERE id = ${submissionId}
        `;
        await setSubmissionDeadline(client, submissionId, 'withdrawn');
        await appendSubmissionEvent(client, {
          submissionId,
          eventType: 'submission_withdrawn',
          actor: { id: session.id, name: session.name, role: 'author', email: session.email },
          fromStage: sub.current_stage || status,
          toStage: 'withdrawn',
          summary: 'The author withdrew the submission before editorial processing.',
          payload: { reason: reason.trim() },
        });
        await client.sql`COMMIT`;
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }
      return NextResponse.json({
        type: 'instant',
        message: 'Submission has been withdrawn successfully.',
      });
    }

    // WITHDRAWAL REQUEST — editor must approve
    if (REQUEST_WITHDRAW_STATUSES.includes(status)) {
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        const requestResult = await client.sql`
          INSERT INTO withdrawal_requests (submission_id, requested_by, reason, status)
          VALUES (${submissionId}, ${session.email}, ${reason.trim()}, 'pending')
          RETURNING id
        `;
        await client.sql`
          UPDATE submissions
          SET withdrawal_status = 'requested', lock_version = lock_version + 1
          WHERE id = ${submissionId}
        `;
        await appendSubmissionEvent(client, {
          submissionId,
          eventType: 'withdrawal_requested',
          actor: { id: session.id, name: session.name, role: 'author', email: session.email },
          summary: 'The author requested withdrawal of the manuscript.',
          payload: { withdrawalRequestId: requestResult.rows[0].id, reason: reason.trim() },
        });
        await client.sql`COMMIT`;
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }

      // Notify enabled editors and administrators.
      const admins = await db`SELECT email FROM users WHERE role IN ('admin', 'editor') AND is_disabled = FALSE`;
      for (const admin of admins.rows) {
        await sendWithdrawalRequestEmail(
          admin.email,
          sub.author_name,
          sub.title,
          reason.trim()
        );
      }

      return NextResponse.json({
        type: 'requested',
        message: 'Withdrawal request submitted. The editorial team will respond within 15 days.',
      });
    }

    return NextResponse.json({ error: 'Unexpected submission status' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in withdrawal POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
