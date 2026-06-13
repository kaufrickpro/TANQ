import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { isAuthorizedCronRequest } from '@/lib/cron';
import { processDeadlineReminders } from '@/lib/deadlines';
import {
  expireOverdueReviewerAssignment,
  expireReviewerInvitation,
} from '@/lib/case-files/reviews';

async function processDeadlines(request: Request) {
  if (!process.env.CRON_SECRET || !isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const expiredInvitations = await db`
    SELECT id
    FROM review_assignments
    WHERE status = 'invited' AND invitation_expires_at <= NOW()
    ORDER BY id
  `;
  let invitationsExpired = 0;
  for (const row of expiredInvitations.rows) {
    if (await expireReviewerInvitation(Number(row.id))) invitationsExpired += 1;
  }
  const overdueAssignments = await db`
    SELECT ra.id
    FROM review_assignments ra
    JOIN deadline_configs dc ON dc.stage = 'under_review' AND dc.role = 'reviewer'
    WHERE ra.status IN ('assigned', 'accepted')
      AND ra.review_deadline <= NOW()
      AND dc.auto_escalation_action = 'auto_uninvite_reviewer'
    ORDER BY ra.id
  `;
  let assignmentsExpired = 0;
  for (const row of overdueAssignments.rows) {
    if (await expireOverdueReviewerAssignment(Number(row.id))) assignmentsExpired += 1;
  }
  const reminders = await processDeadlineReminders();
  return NextResponse.json({ ...reminders, invitationsExpired, assignmentsExpired });
}

export async function GET(request: Request) {
  return processDeadlines(request);
}

export async function POST(request: Request) {
  return processDeadlines(request);
}
