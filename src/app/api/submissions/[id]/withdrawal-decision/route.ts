import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { sendWithdrawalDecisionEmail } from '@/lib/email';

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
    if (session.role !== 'admin') {
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

    if (decision === 'approved') {
      // Update withdrawal_requests row
      await db`
        UPDATE withdrawal_requests
        SET status = 'approved', editor_note = ${editorNote}, resolved_at = ${resolvedAt}
        WHERE id = ${wr.id}
      `;
      // Update submission
      await db`
        UPDATE submissions
        SET status = 'withdrawn', withdrawal_status = 'approved'
        WHERE id = ${submissionId}
      `;
    } else {
      // Rejected
      await db`
        UPDATE withdrawal_requests
        SET status = 'rejected', editor_note = ${editorNote}, resolved_at = ${resolvedAt}
        WHERE id = ${wr.id}
      `;
      // Clear the withdrawal_status flag so the submission can continue
      await db`
        UPDATE submissions SET withdrawal_status = NULL WHERE id = ${submissionId}
      `;
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
