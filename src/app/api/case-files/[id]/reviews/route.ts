import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import {
  addReviewAddendum,
  createReviewerInvitation,
  getReviewerStats,
  openReviewRound,
  recordEditorialDecision,
  releaseReviewReport,
  sendReviewerReminder,
  submitReviewReport,
} from '@/lib/case-files/reviews';
import { getSubmissionAccess } from '@/lib/case-files/access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const submissionId = Number(id);
  const access = await getSubmissionAccess(session, submissionId);
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const reviewerUserId = new URL(request.url).searchParams.get('reviewer_user_id');
  if (reviewerUserId && ['admin', 'editor'].includes(session.role)) {
    return NextResponse.json({ stats: await getReviewerStats(Number(reviewerUserId)) });
  }

  if (session.role === 'author') {
    const released = await db`
      SELECT rr.id, rr.review_round_id, rr.recommendation, rr.score, rr.comments_to_author,
             rr.submitted_at, rra.body AS addendum_body, rra.created_at AS addendum_created_at
      FROM review_reports rr
      JOIN review_report_releases rel ON rel.report_id = rr.id
      LEFT JOIN review_addenda rra ON rra.report_id = rr.id
      WHERE rr.submission_id = ${submissionId}
      ORDER BY rr.submitted_at ASC, rra.created_at ASC
    `;
    return NextResponse.json({ reports: released.rows });
  }
  if (session.role === 'reviewer') {
    const assignments = await db`
      SELECT ra.id, ra.submission_id, ra.review_round_id, ra.reviewer_name, ra.reviewer_email,
             CASE WHEN ra.status = 'assigned' THEN 'accepted' ELSE ra.status END AS status,
             ra.response_at, ra.review_deadline, ra.reminder_count, ra.last_reminder_at,
             rr.round_number, rr.manuscript_version_id,
             rp.id AS report_id, rp.recommendation, rp.score, rp.comments_to_author,
             rp.confidential_comments, rp.submitted_at
      FROM review_assignments ra
      JOIN review_rounds rr ON rr.id = ra.review_round_id
      LEFT JOIN review_reports rp ON rp.assignment_id = ra.id
      WHERE ra.submission_id = ${submissionId}
        AND LOWER(TRIM(ra.reviewer_email)) = LOWER(TRIM(${session.email}))
        AND ra.status IN ('assigned', 'accepted', 'submitted')
      ORDER BY rr.round_number DESC
    `;
    return NextResponse.json({ assignments: assignments.rows });
  }
  const reports = await db`
    SELECT rp.*, ra.reviewer_name, ra.reviewer_email, rr.round_number,
           rel.released_at, rel.released_by_name
    FROM review_reports rp
    JOIN review_assignments ra ON ra.id = rp.assignment_id
    JOIN review_rounds rr ON rr.id = rp.review_round_id
    LEFT JOIN review_report_releases rel ON rel.report_id = rp.id
    WHERE rp.submission_id = ${submissionId}
    ORDER BY rr.round_number DESC, rp.submitted_at ASC
  `;
  const assignments = await db`
    SELECT ra.id, ra.submission_id, ra.review_round_id, ra.reviewer_user_id,
           ra.reviewer_name, ra.reviewer_email,
           CASE WHEN ra.status = 'assigned' THEN 'accepted' ELSE ra.status END AS status,
           ra.assigned_by_user_id, ra.assigned_by_name, ra.assigned_at, ra.submitted_at,
           ra.invitation_sent_at, ra.invitation_expires_at, ra.response_at, ra.decline_reason,
           ra.coi_declaration, ra.coi_declared, ra.reminder_count, ra.last_reminder_at,
           ra.review_deadline, ra.is_alternate, rr.round_number
    FROM review_assignments ra
    JOIN review_rounds rr ON rr.id = ra.review_round_id
    WHERE ra.submission_id = ${submissionId}
    ORDER BY rr.round_number DESC, ra.assigned_at ASC
  `;
  return NextResponse.json({ reports: reports.rows, assignments: assignments.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateSameOrigin(request)) return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const submissionId = Number(id);
    const body = await request.json();
    const actor = { id: session.id, name: session.name, role: session.role as any, email: session.email };
    let result: any;
    if (body.action === 'open_round') {
      result = await openReviewRound({ submissionId, manuscriptVersionId: Number(body.manuscript_version_id), actor });
    } else if (body.action === 'assign') {
      result = await createReviewerInvitation({
        submissionId,
        reviewRoundId: Number(body.review_round_id),
        reviewerName: body.reviewer_name,
        reviewerEmail: body.reviewer_email,
        actor,
      });
    } else if (body.action === 'invite') {
      result = await createReviewerInvitation({
        submissionId,
        reviewRoundId: Number(body.review_round_id),
        reviewerName: body.reviewer_name,
        reviewerEmail: body.reviewer_email,
        deadline: body.review_deadline || null,
        isAlternate: Boolean(body.is_alternate),
        actor,
      });
    } else if (body.action === 'remind') {
      result = await sendReviewerReminder(Number(body.assignment_id), actor);
    } else if (body.action === 'submit_report') {
      result = await submitReviewReport({
        assignmentId: Number(body.assignment_id),
        recommendation: body.recommendation,
        score: Number(body.score),
        commentsToAuthor: body.comments_to_author,
        confidentialComments: body.confidential_comments,
        actor,
      });
    } else if (body.action === 'add_addendum') {
      result = await addReviewAddendum({ reportId: Number(body.report_id), body: body.body, actor });
    } else if (body.action === 'release_report') {
      result = await releaseReviewReport({ reportId: Number(body.report_id), actor });
    } else if (body.action === 'decision') {
      result = await recordEditorialDecision({
        submissionId,
        reviewRoundId: body.review_round_id ? Number(body.review_round_id) : null,
        decision: body.decision,
        letter: body.letter,
        actor,
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Review action failed' }, { status: 400 });
  }
}
