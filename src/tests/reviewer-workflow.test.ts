import fs from 'fs';
import path from 'path';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!matched) continue;
    let value = matched[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[matched[1]] = value;
  }
}
if (process.env.TEST_DATABASE_URL) process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;

import crypto from 'crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import db from '@/lib/db';
import { resetTestDatabase } from './helpers/db';
import { createSubmittedCaseFile } from '@/lib/case-files/documents';
import { getSubmissionAccess } from '@/lib/case-files/access';
import { processDeadlineReminders } from '@/lib/deadlines';
import { transitionSubmission } from '@/lib/case-files/workflow';
import {
  createReviewerInvitation,
  openReviewRound,
  processInvitationResponse,
  submitReviewReport,
} from '@/lib/case-files/reviews';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://mock.blob.vercel.storage/${pathname}`,
    pathname,
    etag: `etag-${pathname}`,
  })),
  del: vi.fn(async () => ({ success: true })),
}));

describe('reviewer invitation and deadline workflow', () => {
  let author: any;
  let editor: any;
  let reviewer: any;
  let alternate: any;

  beforeAll(() => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });
  });

  beforeEach(async () => {
    await resetTestDatabase();
    const users = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES
        ('workflow_author', 'hash', 'Workflow Author', 'workflow-author@tanq.test', 'author', TRUE),
        ('workflow_editor', 'hash', 'Workflow Editor', 'workflow-editor@tanq.test', 'editor', TRUE),
        ('workflow_reviewer', 'hash', 'Workflow Reviewer', 'workflow-reviewer@tanq.test', 'reviewer', TRUE),
        ('workflow_alternate', 'hash', 'Workflow Alternate', 'workflow-alternate@tanq.test', 'reviewer', TRUE)
      RETURNING id, username, name, email, role
    `;
    [author, editor, reviewer, alternate] = users.rows;
  });

  async function openCase() {
    const submissionId = await createSubmittedCaseFile({
      metadata: {
        title: 'Invitation Workflow Study',
        abstract: 'A focused abstract for reviewer invitation testing.',
        keywords: 'review, workflow',
        authorName: author.name,
        authorEmail: author.email,
        submissionType: 'Research Article',
        language: 'English',
        coAuthors: [],
        checklistConfirmed: true,
      },
      files: [{
        kind: 'manuscript',
        file: new File(['anonymous manuscript'], 'anonymous.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      }],
      actor: author,
    });
    const version = await db`SELECT id FROM document_versions WHERE submission_id = ${submissionId}`;
    await transitionSubmission({
      submissionId,
      toStage: 'editor_screening',
      actor: editor,
      summary: 'Screening complete.',
    });
    const round = await openReviewRound({
      submissionId,
      manuscriptVersionId: Number(version.rows[0].id),
      actor: editor,
    });
    return { submissionId, roundId: Number(round.id) };
  }

  it('keeps invitees and alternates out of the case file, then promotes one alternate on decline', async () => {
    const { submissionId, roundId } = await openCase();
    const primary = await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: alternate.name,
      reviewerEmail: alternate.email,
      isAlternate: true,
      actor: editor,
    });

    expect(primary.assignment.invitation_token_hash).toBeUndefined();
    expect((await getSubmissionAccess(reviewer, submissionId)).allowed).toBe(false);
    expect((await getSubmissionAccess(alternate, submissionId)).allowed).toBe(false);

    await processInvitationResponse({
      token: primary.invitationToken!,
      action: 'decline',
      declineReason: 'Outside my current expertise.',
    });

    const assignments = await db`
      SELECT reviewer_email, status, invitation_token_hash
      FROM review_assignments
      WHERE review_round_id = ${roundId}
      ORDER BY assigned_at, id
    `;
    expect(assignments.rows[0].status).toBe('declined');
    expect(assignments.rows[1].status).toBe('invited');
    expect(assignments.rows[1].invitation_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect((await getSubmissionAccess(alternate, submissionId)).allowed).toBe(false);
    expect((await db`SELECT status FROM review_rounds WHERE id = ${roundId}`).rows[0].status).toBe('open');
    expect((await db`SELECT current_stage FROM submissions WHERE id = ${submissionId}`).rows[0].current_stage)
      .toBe('under_review');
  });

  it('accepts once with COI, consumes the token, and grants reviewer access', async () => {
    const { submissionId, roundId } = await openCase();
    const invitation = await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    await expect(processInvitationResponse({
      token: invitation.invitationToken!,
      action: 'accept',
      coiDeclaration: ' ',
    })).rejects.toThrow(/conflict-of-interest declaration/i);

    await processInvitationResponse({
      token: invitation.invitationToken!,
      action: 'accept',
      coiDeclaration: 'I have no conflicts of interest.',
    });
    await expect(processInvitationResponse({
      token: invitation.invitationToken!,
      action: 'accept',
      coiDeclaration: 'I have no conflicts of interest.',
    })).rejects.toThrow(/invalid|available/i);

    const assignment = await db`
      SELECT status, coi_declared, invitation_token_hash, response_at
      FROM review_assignments
      WHERE review_round_id = ${roundId} AND reviewer_email = ${reviewer.email}
    `;
    expect(assignment.rows[0].status).toBe('accepted');
    expect(assignment.rows[0].coi_declared).toBe(true);
    expect(assignment.rows[0].invitation_token_hash).toBeNull();
    expect(assignment.rows[0].response_at).toBeTruthy();
    expect((await getSubmissionAccess(reviewer, submissionId)).allowed).toBe(true);
    const acceptedEvents = await db`
      SELECT COUNT(*)::integer AS count
      FROM submission_events
      WHERE submission_id = ${submissionId} AND event_type = 'reviewer_invitation_accepted'
    `;
    expect(acceptedEvents.rows[0].count).toBe(1);
  });

  it('creates a one-time reviewer registration invitation when the invitee has no account', async () => {
    const { submissionId, roundId } = await openCase();
    const invitation = await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: 'External Reviewer',
      reviewerEmail: 'external-reviewer@tanq.test',
      actor: editor,
    });
    const response = await processInvitationResponse({
      token: invitation.invitationToken!,
      action: 'accept',
      coiDeclaration: 'I have no conflicts of interest.',
    });
    expect(response.registrationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(response.registrationUrl).toContain('#register?invite=');
    const tokenHash = crypto.createHash('sha256').update(response.registrationToken!).digest('hex');
    const registration = await db`
      SELECT email, role
      FROM invitations
      WHERE token_hash = ${tokenHash}
    `;
    expect(registration.rows).toEqual([expect.objectContaining({
      email: 'external-reviewer@tanq.test',
      role: 'reviewer',
    })]);
  });

  it('does not let alternates block completion and queues review notifications transactionally', async () => {
    const { submissionId, roundId } = await openCase();
    const primary = await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: alternate.name,
      reviewerEmail: alternate.email,
      isAlternate: true,
      actor: editor,
    });
    await processInvitationResponse({
      token: primary.invitationToken!,
      action: 'accept',
      coiDeclaration: 'I have no conflicts of interest.',
    });
    const assignment = await db`
      SELECT id
      FROM review_assignments
      WHERE review_round_id = ${roundId} AND reviewer_email = ${reviewer.email}
    `;
    await submitReviewReport({
      assignmentId: Number(assignment.rows[0].id),
      recommendation: 'minor_revision',
      score: 4,
      commentsToAuthor: 'Please clarify the method.',
      actor: reviewer,
    });

    expect((await db`SELECT status FROM review_rounds WHERE id = ${roundId}`).rows[0].status).toBe('awaiting_editor');
    expect((await db`SELECT current_stage FROM submissions WHERE id = ${submissionId}`).rows[0].current_stage)
      .toBe('editor_decision');
    const notifications = await db`
      SELECT template, COUNT(*)::integer AS count
      FROM notification_outbox
      WHERE submission_id = ${submissionId}
        AND template IN ('review_submitted', 'all_reviews_complete')
      GROUP BY template
      ORDER BY template
    `;
    expect(notifications.rows).toEqual([
      expect.objectContaining({ template: 'all_reviews_complete', count: 1 }),
      expect.objectContaining({ template: 'review_submitted', count: 1 }),
    ]);
  });

  it('queues submission and reviewer reminders idempotently', async () => {
    const { submissionId, roundId } = await openCase();
    expect((await db`
      SELECT COUNT(*)::integer AS count
      FROM notification_outbox
      WHERE submission_id = ${submissionId} AND template = 'submission_received'
    `).rows[0].count).toBe(1);
    const primary = await createReviewerInvitation({
      submissionId,
      reviewRoundId: roundId,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    await processInvitationResponse({
      token: primary.invitationToken!,
      action: 'accept',
      coiDeclaration: 'I have no conflicts of interest.',
    });
    await db`
      UPDATE review_assignments
      SET review_deadline = NOW() + INTERVAL '2 days'
      WHERE review_round_id = ${roundId} AND reviewer_email = ${reviewer.email}
    `;

    await processDeadlineReminders();
    await processDeadlineReminders();

    expect((await db`
      SELECT COUNT(*)::integer AS count
      FROM notification_outbox
      WHERE submission_id = ${submissionId} AND template = 'reviewer_reminder'
    `).rows[0].count).toBe(1);
    expect((await db`
      SELECT COUNT(*)::integer AS count
      FROM submission_events
      WHERE submission_id = ${submissionId} AND event_type = 'reviewer_deadline_reminder_queued'
    `).rows[0].count).toBe(1);
  });
});
