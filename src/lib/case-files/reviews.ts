import 'server-only';
import crypto from 'crypto';
import db from '@/lib/db';
import { appendSubmissionEvent } from './audit';
import { getDefaultDeadline, setSubmissionDeadline } from '@/lib/deadlines';
import { queueNotification } from '@/lib/notifications';
import type { CaseFileActor } from './types';

export type ReviewAssignmentStatus =
  | 'assigned'
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'alternate'
  | 'submitted'
  | 'cancelled';

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function invitationUrl(token: string) {
  return `${appBaseUrl()}/reviewer-invite#token=${encodeURIComponent(token)}`;
}

function registrationUrl(token: string) {
  return `${appBaseUrl()}/dashboard/login#register?invite=${encodeURIComponent(token)}`;
}

async function createReviewerRegistrationInvitation(client: any, email: string) {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await client.sql`
    INSERT INTO invitations (email, role, token_hash, expires_at)
    VALUES (${email}, 'reviewer', ${hashToken(token)}, ${expiresAt.toISOString()})
  `;
  return { token, url: registrationUrl(token), expiresAt };
}

async function queueReviewerInvitation(client: any, assignment: any, rawToken: string) {
  await queueNotification({
    templateKey: 'reviewer_invitation',
    recipientEmail: assignment.reviewer_email,
    submissionId: Number(assignment.submission_id),
    dedupeKey: `reviewer-invitation:${assignment.id}:${assignment.invitation_sent_at ?? new Date().toISOString()}`,
    variables: {
      reviewer_name: assignment.reviewer_name,
      submission_title: assignment.title,
      invitation_url: invitationUrl(rawToken),
      review_deadline: assignment.review_deadline
        ? new Date(assignment.review_deadline).toISOString()
        : null,
    },
  }, client);
}

async function maybeMarkRoundReady(client: any, roundId: number, actor: CaseFileActor) {
  const roundResult = await client.sql`
    SELECT rr.*, rr.status AS round_status, s.title, s.current_stage, s.status AS submission_status
    FROM review_rounds rr
    JOIN submissions s ON s.id = rr.submission_id
    WHERE rr.id = ${roundId}
    FOR UPDATE OF rr, s
  `;
  if (roundResult.rows.length === 0) throw new Error('Review round not found');
  const round = roundResult.rows[0];
  const pending = await client.sql`
    SELECT COUNT(*)::integer AS count
    FROM review_assignments
    WHERE review_round_id = ${roundId}
      AND is_alternate = FALSE
      AND status IN ('assigned', 'invited', 'accepted')
  `;
  const reports = await client.sql`
    SELECT COUNT(*)::integer AS count
    FROM review_reports
    WHERE review_round_id = ${roundId}
  `;
  if (
    Number(pending.rows[0].count) > 0 ||
    Number(reports.rows[0].count) === 0 ||
    round.round_status === 'awaiting_editor' ||
    round.round_status === 'closed'
  ) {
    return false;
  }
  await client.sql`
    UPDATE review_rounds
    SET status = 'awaiting_editor'
    WHERE id = ${roundId}
  `;
  const fromStage = round.current_stage || round.submission_status;
  await client.sql`
    UPDATE submissions
    SET current_stage = 'editor_decision', status = 'editor_decision', lock_version = lock_version + 1
    WHERE id = ${round.submission_id}
  `;
  await setSubmissionDeadline(client, Number(round.submission_id), 'editor_decision');
  await appendSubmissionEvent(client, {
    submissionId: Number(round.submission_id),
    eventType: 'review_round_ready_for_decision',
    actor,
    fromStage,
    toStage: 'editor_decision',
    summary: `All active reports for round ${round.round_number} have been submitted or resolved.`,
    payload: { reviewRoundId: Number(round.id) },
  });
  const editors = await client.sql`
    SELECT name, email
    FROM users
    WHERE role IN ('admin', 'editor') AND is_disabled = FALSE AND is_verified = TRUE
  `;
  for (const editor of editors.rows) {
    await queueNotification({
      templateKey: 'all_reviews_complete',
      recipientEmail: editor.email,
      submissionId: Number(round.submission_id),
      dedupeKey: `all-reviews-complete:${round.id}:${editor.email}`,
      variables: {
        editor_name: editor.name,
        submission_title: round.title,
      },
    }, client);
  }
  return true;
}

async function promoteAlternateReviewerWithClient(client: any, roundId: number) {
  const alternate = await client.sql`
    SELECT ra.*, s.title, s.abstract
    FROM review_assignments ra
    JOIN submissions s ON s.id = ra.submission_id
    WHERE ra.review_round_id = ${roundId}
      AND ra.status = 'alternate'
    ORDER BY ra.assigned_at ASC, ra.id ASC
    LIMIT 1
    FOR UPDATE OF ra
  `;
  if (alternate.rows.length === 0) return null;
  const rawToken = newOpaqueToken();
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const updated = await client.sql`
    UPDATE review_assignments
    SET status = 'invited', is_alternate = FALSE, invitation_token_hash = ${hashToken(rawToken)},
        invitation_sent_at = ${sentAt.toISOString()}, invitation_expires_at = ${expiresAt.toISOString()},
        response_at = NULL, decline_reason = NULL, coi_declaration = NULL, coi_declared = FALSE
    WHERE id = ${alternate.rows[0].id}
    RETURNING *
  `;
  const assignment: any = { ...alternate.rows[0], ...updated.rows[0] };
  await queueReviewerInvitation(client, assignment, rawToken);
  await appendSubmissionEvent(client, {
    submissionId: Number(assignment.submission_id),
    eventType: 'alternate_reviewer_promoted',
    actor: { id: null, name: 'TANQ Workflow', role: 'system' },
    summary: 'The next alternate reviewer was promoted and invited.',
    payload: { assignmentId: Number(assignment.id), reviewRoundId: roundId },
  });
  return assignment;
}

export async function openReviewRound(input: {
  submissionId: number;
  manuscriptVersionId: number;
  actor: CaseFileActor;
}) {
  if (!['admin', 'editor'].includes(input.actor.role)) throw new Error('Editor role required');
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const submissionResult = await client.sql`
      SELECT *
      FROM submissions
      WHERE id = ${input.submissionId}
      FOR UPDATE
    `;
    if (submissionResult.rows.length === 0) throw new Error('Submission not found');
    const submission = submissionResult.rows[0];
    const stage = submission.current_stage || submission.status;
    if (['published', 'rejected', 'withdrawn'].includes(stage)) {
      throw new Error('Closed manuscript case files cannot enter peer review');
    }
    if (!['editor_screening', 'in_review', 'editor_decision', 'revision_requested', 'author_revision'].includes(stage)) {
      throw new Error(`A review round cannot be opened from workflow stage "${stage}"`);
    }
    const existingOpenRound = await client.sql`
      SELECT id
      FROM review_rounds
      WHERE submission_id = ${input.submissionId}
        AND status IN ('open', 'awaiting_editor')
      LIMIT 1
    `;
    if (existingOpenRound.rows.length > 0) {
      throw new Error('Close the current review round before opening a new one');
    }

    const versionResult = await client.sql`
      SELECT v.id, v.version_number, d.kind
      FROM document_versions v
      JOIN submission_documents d ON d.id = v.document_id
      WHERE v.id = ${input.manuscriptVersionId}
        AND v.submission_id = ${input.submissionId}
    `;
    if (versionResult.rows.length === 0 || versionResult.rows[0].kind !== 'manuscript') {
      throw new Error('A manuscript version from this submission is required');
    }

    const nextRoundResult = await client.sql`
      SELECT COALESCE(MAX(round_number), 0) + 1 AS next_round
      FROM review_rounds
      WHERE submission_id = ${input.submissionId}
    `;
    const roundNumber = Number(nextRoundResult.rows[0].next_round);
    const roundResult = await client.sql`
      INSERT INTO review_rounds (
        submission_id, round_number, manuscript_version_id,
        opened_by_user_id, opened_by_name
      )
      VALUES (
        ${input.submissionId}, ${roundNumber}, ${input.manuscriptVersionId},
        ${input.actor.id}, ${input.actor.name}
      )
      RETURNING *
    `;
    const round = roundResult.rows[0];
    const fromStage = submission.current_stage || submission.status;
    await client.sql`
      UPDATE submissions
      SET current_round_id = ${round.id}, current_stage = 'under_review',
          status = 'under_review', lock_version = lock_version + 1
      WHERE id = ${input.submissionId}
    `;
    await setSubmissionDeadline(client, input.submissionId, 'under_review');
    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: 'review_round_opened',
      actor: input.actor,
      fromStage,
      toStage: 'under_review',
      summary: `Review round ${roundNumber} opened for manuscript version ${versionResult.rows[0].version_number}.`,
      payload: {
        reviewRoundId: round.id,
        roundNumber,
        manuscriptVersionId: input.manuscriptVersionId,
      },
    });
    await client.sql`COMMIT`;
    return round;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function assignReviewer(input: {
  submissionId: number;
  reviewRoundId: number;
  reviewerName: string;
  reviewerEmail: string;
  actor: CaseFileActor;
}) {
  if (!['admin', 'editor'].includes(input.actor.role)) throw new Error('Editor role required');
  const cleanEmail = input.reviewerEmail.trim().toLowerCase();
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const roundResult = await client.sql`
      SELECT *
      FROM review_rounds
      WHERE id = ${input.reviewRoundId}
        AND submission_id = ${input.submissionId}
        AND status = 'open'
      FOR UPDATE
    `;
    if (roundResult.rows.length === 0) throw new Error('Open review round not found');
    const reviewerResult = await client.sql`
      SELECT id
      FROM users
      WHERE LOWER(TRIM(email)) = ${cleanEmail}
        AND role = 'reviewer'
        AND is_disabled = FALSE
      LIMIT 1
    `;
    const reviewDeadline = await getDefaultDeadline(client, 'under_review', 'reviewer');
    const result = await client.sql`
      INSERT INTO review_assignments (
        submission_id, review_round_id, reviewer_user_id, reviewer_name, reviewer_email,
        assigned_by_user_id, assigned_by_name, review_deadline
      )
      VALUES (
        ${input.submissionId}, ${input.reviewRoundId}, ${reviewerResult.rows[0]?.id ?? null},
        ${input.reviewerName.trim()}, ${cleanEmail}, ${input.actor.id}, ${input.actor.name},
        ${reviewDeadline?.toISOString() ?? null}
      )
      RETURNING *
    `;
    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: 'reviewer_assigned',
      actor: input.actor,
      summary: `A reviewer was assigned to review round ${roundResult.rows[0].round_number}.`,
      payload: {
        assignmentId: result.rows[0].id,
        reviewRoundId: input.reviewRoundId,
        reviewerEmail: cleanEmail,
      },
    });
    await client.sql`COMMIT`;
    return result.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function createReviewerInvitation(input: {
  submissionId: number;
  reviewRoundId: number;
  reviewerName: string;
  reviewerEmail: string;
  deadline?: Date | string | null;
  isAlternate?: boolean;
  actor: CaseFileActor;
}) {
  if (!['admin', 'editor'].includes(input.actor.role)) throw new Error('Editor role required');
  const reviewerName = input.reviewerName?.trim();
  const reviewerEmail = input.reviewerEmail?.trim().toLowerCase();
  if (!reviewerName || !reviewerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewerEmail)) {
    throw new Error('A valid reviewer name and email are required');
  }
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const round = await client.sql`
      SELECT rr.*, s.title, s.abstract
      FROM review_rounds rr
      JOIN submissions s ON s.id = rr.submission_id
      WHERE rr.id = ${input.reviewRoundId}
        AND rr.submission_id = ${input.submissionId}
        AND rr.status = 'open'
      FOR UPDATE OF rr
    `;
    if (round.rows.length === 0) throw new Error('Open review round not found');
    const existingUser = await client.sql`
      SELECT id, role, is_disabled, reviewer_availability
      FROM users
      WHERE LOWER(TRIM(email)) = ${reviewerEmail}
      LIMIT 1
    `;
    if (
      existingUser.rows[0] &&
      (
        existingUser.rows[0].role !== 'reviewer' ||
        existingUser.rows[0].is_disabled ||
        existingUser.rows[0].reviewer_availability === false
      )
    ) {
      throw new Error('Reviewer email belongs to an unavailable non-reviewer account');
    }
    const rawToken = input.isAlternate ? null : newOpaqueToken();
    const sentAt = input.isAlternate ? null : new Date();
    const expiresAt = input.isAlternate ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const reviewDeadline = input.deadline
      ? new Date(input.deadline)
      : await getDefaultDeadline(client, 'under_review', 'reviewer');
    if (reviewDeadline && Number.isNaN(reviewDeadline.getTime())) throw new Error('Review deadline is invalid');
    const result = await client.sql`
      INSERT INTO review_assignments (
        submission_id, review_round_id, reviewer_user_id, reviewer_name, reviewer_email,
        status, assigned_by_user_id, assigned_by_name, invitation_token_hash,
        invitation_sent_at, invitation_expires_at, review_deadline, is_alternate
      )
      VALUES (
        ${input.submissionId}, ${input.reviewRoundId}, ${existingUser.rows[0]?.id ?? null},
        ${reviewerName}, ${reviewerEmail}, ${input.isAlternate ? 'alternate' : 'invited'},
        ${input.actor.id}, ${input.actor.name}, ${rawToken ? hashToken(rawToken) : null},
        ${sentAt?.toISOString() ?? null}, ${expiresAt?.toISOString() ?? null},
        ${reviewDeadline?.toISOString() ?? null}, ${Boolean(input.isAlternate)}
      )
      RETURNING *
    `;
    const assignment: any = {
      ...result.rows[0],
      title: round.rows[0].title,
      abstract: round.rows[0].abstract,
    };
    if (rawToken) await queueReviewerInvitation(client, assignment, rawToken);
    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: input.isAlternate ? 'alternate_reviewer_added' : 'reviewer_invited',
      actor: input.actor,
      summary: input.isAlternate ? 'An alternate reviewer was added.' : 'A reviewer invitation was sent.',
      payload: {
        assignmentId: Number(assignment.id),
        reviewRoundId: input.reviewRoundId,
        isAlternate: Boolean(input.isAlternate),
        reviewDeadline: reviewDeadline?.toISOString() ?? null,
      },
    });
    await client.sql`COMMIT`;
    const { invitation_token_hash: _tokenHash, ...safeAssignment } = assignment;
    return {
      assignment: safeAssignment,
      invitationToken: rawToken,
      invitationUrl: rawToken ? invitationUrl(rawToken) : null,
    };
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function getReviewerInvitation(token: string) {
  if (!token) throw new Error('Invitation token is required');
  const result = await db`
    SELECT ra.id, ra.reviewer_name, ra.status, ra.invitation_expires_at, ra.review_deadline,
           ra.response_at, s.title, s.abstract, s.keywords
    FROM review_assignments ra
    JOIN submissions s ON s.id = ra.submission_id
    WHERE ra.invitation_token_hash = ${hashToken(token)}
    LIMIT 1
  `;
  if (result.rows.length === 0) throw new Error('Invitation is invalid or no longer available');
  const invitation = result.rows[0];
  if (invitation.status !== 'invited' || invitation.response_at) {
    throw new Error('Invitation has already been answered or is no longer available');
  }
  if (!invitation.invitation_expires_at || new Date(invitation.invitation_expires_at) <= new Date()) {
    throw new Error('Invitation has expired');
  }
  return invitation;
}

export async function processInvitationResponse(input: {
  token: string;
  action: 'accept' | 'decline';
  coiDeclaration?: string;
  declineReason?: string;
}) {
  if (!input.token) throw new Error('Invitation token is required');
  if (!['accept', 'decline'].includes(input.action)) throw new Error('Accept or decline is required');
  const coiDeclaration = input.coiDeclaration?.trim();
  const declineReason = input.declineReason?.trim();
  if (input.action === 'accept' && !coiDeclaration) {
    throw new Error('A conflict-of-interest declaration is required to accept');
  }
  if (input.action === 'decline' && !declineReason) {
    throw new Error('A decline reason is required');
  }
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await client.sql`
      SELECT ra.*, s.title, s.abstract
      FROM review_assignments ra
      JOIN submissions s ON s.id = ra.submission_id
      WHERE ra.invitation_token_hash = ${hashToken(input.token)}
      FOR UPDATE OF ra
    `;
    if (result.rows.length === 0) throw new Error('Invitation is invalid or no longer available');
    const assignment = result.rows[0];
    if (assignment.status !== 'invited' || assignment.response_at) {
      throw new Error('Invitation has already been answered or is no longer available');
    }
    if (!assignment.invitation_expires_at || new Date(assignment.invitation_expires_at) <= new Date()) {
      await client.sql`
        UPDATE review_assignments
        SET status = 'expired', response_at = NOW(), invitation_token_hash = NULL
        WHERE id = ${assignment.id}
      `;
      const promoted = await promoteAlternateReviewerWithClient(client, Number(assignment.review_round_id));
      await appendSubmissionEvent(client, {
        submissionId: Number(assignment.submission_id),
        eventType: 'reviewer_invitation_expired',
        actor: { id: null, name: 'TANQ Workflow', role: 'system' },
        summary: 'A reviewer invitation expired.',
        payload: { assignmentId: Number(assignment.id), promotedAssignmentId: promoted?.id ?? null },
      });
      await maybeMarkRoundReady(client, Number(assignment.review_round_id), {
        id: null,
        name: 'TANQ Workflow',
        role: 'system',
      });
      await client.sql`COMMIT`;
      return { action: 'expired', registrationToken: null, registrationUrl: null };
    }

    let registration: { token: string; url: string; expiresAt: Date } | null = null;
    if (input.action === 'accept') {
      const reviewer = await client.sql`
        SELECT id, role, is_disabled
        FROM users
        WHERE LOWER(TRIM(email)) = LOWER(TRIM(${assignment.reviewer_email}))
        LIMIT 1
      `;
      if (reviewer.rows[0] && (reviewer.rows[0].role !== 'reviewer' || reviewer.rows[0].is_disabled)) {
        throw new Error('This email cannot be used for reviewer access');
      }
      if (!reviewer.rows[0]) {
        registration = await createReviewerRegistrationInvitation(client, assignment.reviewer_email);
      }
      await client.sql`
        UPDATE review_assignments
        SET status = 'accepted', response_at = NOW(), invitation_token_hash = NULL,
            coi_declaration = ${coiDeclaration}, coi_declared = TRUE,
            reviewer_user_id = ${reviewer.rows[0]?.id ?? null}
        WHERE id = ${assignment.id}
      `;
    } else {
      await client.sql`
        UPDATE review_assignments
        SET status = 'declined', response_at = NOW(), invitation_token_hash = NULL,
            decline_reason = ${declineReason}
        WHERE id = ${assignment.id}
      `;
      await promoteAlternateReviewerWithClient(client, Number(assignment.review_round_id));
      await maybeMarkRoundReady(client, Number(assignment.review_round_id), {
        id: null,
        name: 'TANQ Workflow',
        role: 'system',
      });
    }
    await appendSubmissionEvent(client, {
      submissionId: Number(assignment.submission_id),
      eventType: input.action === 'accept' ? 'reviewer_invitation_accepted' : 'reviewer_invitation_declined',
      actor: { id: null, name: 'Invited Reviewer', role: 'system' },
      summary: input.action === 'accept' ? 'A reviewer accepted the invitation.' : 'A reviewer declined the invitation.',
      payload: { assignmentId: Number(assignment.id), reviewRoundId: Number(assignment.review_round_id) },
    });
    const editors = await client.sql`
      SELECT name, email
      FROM users
      WHERE role IN ('admin', 'editor') AND is_disabled = FALSE AND is_verified = TRUE
    `;
    for (const editor of editors.rows) {
      await queueNotification({
        templateKey: 'reviewer_invitation_response',
        recipientEmail: editor.email,
        submissionId: Number(assignment.submission_id),
        dedupeKey: `reviewer-invitation-response:${assignment.id}:${input.action}:${editor.email}`,
        variables: {
          editor_name: editor.name,
          reviewer_name: assignment.reviewer_name,
          submission_title: assignment.title,
          response: input.action === 'accept' ? 'accepted' : 'declined',
        },
      }, client);
    }
    await client.sql`COMMIT`;
    return {
      action: input.action,
      registrationToken: registration?.token ?? null,
      registrationUrl: registration?.url ?? null,
    };
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function promoteAlternateReviewer(roundId: number) {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await promoteAlternateReviewerWithClient(client, roundId);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function sendReviewerReminder(assignmentId: number, actor: CaseFileActor) {
  if (!['admin', 'editor'].includes(actor.role)) throw new Error('Editor role required');
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await client.sql`
      SELECT ra.*, s.title, s.abstract
      FROM review_assignments ra
      JOIN submissions s ON s.id = ra.submission_id
      WHERE ra.id = ${assignmentId}
        AND ra.status IN ('invited', 'assigned', 'accepted')
      FOR UPDATE OF ra
    `;
    if (result.rows.length === 0) throw new Error('Active reviewer assignment not found');
    const assignment = result.rows[0];
    await queueNotification({
      templateKey: 'reviewer_reminder',
      recipientEmail: assignment.reviewer_email,
      submissionId: Number(assignment.submission_id),
      dedupeKey: `manual-reviewer-reminder:${assignment.id}:${Number(assignment.reminder_count) + 1}`,
      variables: {
        reviewer_name: assignment.reviewer_name,
        submission_title: assignment.title,
        review_deadline: assignment.review_deadline
          ? new Date(assignment.review_deadline).toISOString()
          : null,
      },
    }, client);
    await client.sql`
      UPDATE review_assignments
      SET reminder_count = reminder_count + 1, last_reminder_at = NOW()
      WHERE id = ${assignmentId}
    `;
    await appendSubmissionEvent(client, {
      submissionId: Number(assignment.submission_id),
      eventType: 'reviewer_reminder_queued',
      actor,
      summary: 'A reviewer reminder was queued.',
      payload: { assignmentId },
    });
    await client.sql`COMMIT`;
    return { success: true };
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function expireReviewerInvitation(assignmentId: number) {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await client.sql`
      SELECT *
      FROM review_assignments
      WHERE id = ${assignmentId}
        AND status = 'invited'
        AND invitation_expires_at <= NOW()
      FOR UPDATE
    `;
    if (result.rows.length === 0) {
      await client.sql`ROLLBACK`;
      return null;
    }
    const assignment = result.rows[0];
    await client.sql`
      UPDATE review_assignments
      SET status = 'expired', response_at = NOW(), invitation_token_hash = NULL
      WHERE id = ${assignmentId}
    `;
    const promoted = await promoteAlternateReviewerWithClient(client, Number(assignment.review_round_id));
    await appendSubmissionEvent(client, {
      submissionId: Number(assignment.submission_id),
      eventType: 'reviewer_invitation_expired',
      actor: { id: null, name: 'TANQ Deadline Automation', role: 'system' },
      summary: 'A reviewer invitation expired automatically.',
      payload: { assignmentId, promotedAssignmentId: promoted?.id ?? null },
    });
    await maybeMarkRoundReady(client, Number(assignment.review_round_id), {
      id: null,
      name: 'TANQ Deadline Automation',
      role: 'system',
    });
    await client.sql`COMMIT`;
    return { assignmentId, promotedAssignmentId: promoted?.id ?? null };
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function expireOverdueReviewerAssignment(assignmentId: number) {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await client.sql`
      SELECT ra.*
      FROM review_assignments ra
      WHERE ra.id = ${assignmentId}
        AND ra.status IN ('assigned', 'accepted')
        AND ra.review_deadline <= NOW()
      FOR UPDATE
    `;
    if (result.rows.length === 0) {
      await client.sql`ROLLBACK`;
      return null;
    }
    const assignment = result.rows[0];
    const config = await client.sql`
      SELECT auto_escalation_action
      FROM deadline_configs
      WHERE stage = 'under_review' AND role = 'reviewer'
      LIMIT 1
    `;
    if (config.rows[0]?.auto_escalation_action !== 'auto_uninvite_reviewer') {
      await client.sql`ROLLBACK`;
      return null;
    }
    await client.sql`
      UPDATE review_assignments
      SET status = 'expired', response_at = COALESCE(response_at, NOW()), invitation_token_hash = NULL
      WHERE id = ${assignmentId}
    `;
    const promoted = await promoteAlternateReviewerWithClient(client, Number(assignment.review_round_id));
    await appendSubmissionEvent(client, {
      submissionId: Number(assignment.submission_id),
      eventType: 'reviewer_assignment_expired',
      actor: { id: null, name: 'TANQ Deadline Automation', role: 'system' },
      summary: 'An overdue reviewer assignment expired automatically.',
      payload: { assignmentId, promotedAssignmentId: promoted?.id ?? null },
    });
    await maybeMarkRoundReady(client, Number(assignment.review_round_id), {
      id: null,
      name: 'TANQ Deadline Automation',
      role: 'system',
    });
    await client.sql`COMMIT`;
    return { assignmentId, promotedAssignmentId: promoted?.id ?? null };
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function getReviewerStats(userId: number) {
  const user = await db`
    SELECT id, name, email, avg_review_days, total_reviews_completed
    FROM users
    WHERE id = ${userId} AND role = 'reviewer'
  `;
  if (user.rows.length === 0) throw new Error('Reviewer not found');
  const stats = await db`
    SELECT
      COUNT(*) FILTER (WHERE status = 'submitted')::integer AS completed,
      COUNT(*) FILTER (WHERE status = 'declined')::integer AS declined,
      COUNT(*) FILTER (WHERE status = 'accepted')::integer AS active,
      COUNT(*) FILTER (WHERE status = 'invited')::integer AS pending,
      AVG(EXTRACT(EPOCH FROM (submitted_at - COALESCE(response_at, assigned_at))) / 86400)
        FILTER (WHERE submitted_at IS NOT NULL) AS avg_review_days
    FROM review_assignments
    WHERE reviewer_user_id = ${userId}
       OR LOWER(TRIM(reviewer_email)) = LOWER(TRIM(${user.rows[0].email}))
  `;
  return { ...user.rows[0], ...stats.rows[0] };
}

export async function submitReviewReport(input: {
  assignmentId: number;
  recommendation: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
  score: number;
  commentsToAuthor: string;
  confidentialComments?: string;
  actor: CaseFileActor & { email?: string };
}) {
  if (input.actor.role !== 'reviewer') throw new Error('Reviewer role required');
  if (!input.commentsToAuthor?.trim()) throw new Error('Comments to author are required');
  if (!['accept', 'minor_revision', 'major_revision', 'reject'].includes(input.recommendation)) {
    throw new Error('Invalid review recommendation');
  }
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw new Error('Review score must be an integer from 1 to 5');
  }
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const assignmentResult = await client.sql`
      SELECT ra.*, rr.round_number, s.title AS submission_title
      FROM review_assignments ra
      JOIN review_rounds rr ON rr.id = ra.review_round_id
      JOIN submissions s ON s.id = ra.submission_id
      WHERE ra.id = ${input.assignmentId}
      FOR UPDATE
    `;
    if (assignmentResult.rows.length === 0) throw new Error('Review assignment not found');
    const assignment = assignmentResult.rows[0];
    if (
      assignment.reviewer_email.trim().toLowerCase() !== input.actor.email?.trim().toLowerCase() ||
      !['assigned', 'accepted'].includes(assignment.status)
    ) {
      throw new Error('This review assignment cannot be submitted');
    }

    const reportResult = await client.sql`
      INSERT INTO review_reports (
        submission_id, review_round_id, assignment_id, recommendation, score,
        comments_to_author, confidential_comments, submitted_by_user_id, submitted_by_name
      )
      VALUES (
        ${assignment.submission_id}, ${assignment.review_round_id}, ${assignment.id},
        ${input.recommendation}, ${input.score}, ${input.commentsToAuthor.trim()},
        ${input.confidentialComments?.trim() || null}, ${input.actor.id}, ${input.actor.name}
      )
      RETURNING *
    `;
    await client.sql`
      UPDATE review_assignments
      SET status = 'submitted', submitted_at = NOW()
      WHERE id = ${assignment.id}
    `;
    await appendSubmissionEvent(client, {
      submissionId: assignment.submission_id,
      eventType: 'review_report_submitted',
      actor: input.actor,
      summary: `A review report was submitted for round ${assignment.round_number}.`,
      payload: {
        reportId: reportResult.rows[0].id,
        assignmentId: assignment.id,
        reviewRoundId: assignment.review_round_id,
        recommendation: input.recommendation,
      },
    });

    await client.sql`
      UPDATE users
      SET total_reviews_completed = total_reviews_completed + 1,
          avg_review_days = (
            SELECT AVG(EXTRACT(EPOCH FROM (submitted_at - COALESCE(response_at, assigned_at))) / 86400)
            FROM review_assignments
            WHERE (reviewer_user_id = ${input.actor.id}
                OR LOWER(TRIM(reviewer_email)) = LOWER(TRIM(${input.actor.email ?? ''})))
              AND submitted_at IS NOT NULL
          )
      WHERE id = ${input.actor.id} AND role = 'reviewer'
    `;

    const editors = await client.sql`
      SELECT name, email
      FROM users
      WHERE role IN ('admin', 'editor') AND is_disabled = FALSE AND is_verified = TRUE
    `;
    for (const editor of editors.rows) {
      await queueNotification({
        templateKey: 'review_submitted',
        recipientEmail: editor.email,
        submissionId: Number(assignment.submission_id),
        dedupeKey: `review-submitted:${reportResult.rows[0].id}:${editor.email}`,
        variables: {
          editor_name: editor.name,
          reviewer_name: assignment.reviewer_name,
          submission_title: assignment.submission_title,
        },
      }, client);
    }
    await maybeMarkRoundReady(client, Number(assignment.review_round_id), {
      id: null,
      name: 'TANQ Workflow',
      role: 'system',
    });

    await client.sql`COMMIT`;
    return reportResult.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function addReviewAddendum(input: {
  reportId: number;
  body: string;
  actor: CaseFileActor & { email?: string };
}) {
  if (!input.body?.trim()) throw new Error('Addendum body is required');
  const reportResult = await db`
    SELECT rr.*, ra.reviewer_email
    FROM review_reports rr
    JOIN review_assignments ra ON ra.id = rr.assignment_id
    WHERE rr.id = ${input.reportId}
  `;
  if (reportResult.rows.length === 0) throw new Error('Review report not found');
  const report = reportResult.rows[0];
  const ownsReport =
    input.actor.role === 'reviewer' &&
    input.actor.email?.trim().toLowerCase() === report.reviewer_email.trim().toLowerCase();
  if (!ownsReport && !['admin', 'editor'].includes(input.actor.role)) throw new Error('Forbidden');

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await client.sql`
      INSERT INTO review_addenda (report_id, body, created_by_user_id, created_by_name)
      VALUES (${input.reportId}, ${input.body.trim()}, ${input.actor.id}, ${input.actor.name})
      RETURNING *
    `;
    await appendSubmissionEvent(client, {
      submissionId: report.submission_id,
      eventType: 'review_addendum_added',
      actor: input.actor,
      summary: 'An addendum was added to a submitted review report.',
      payload: { reportId: input.reportId, addendumId: result.rows[0].id },
    });
    await client.sql`COMMIT`;
    return result.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseReviewReport(input: {
  reportId: number;
  actor: CaseFileActor;
}) {
  if (!['admin', 'editor'].includes(input.actor.role)) throw new Error('Editor role required');
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const reportResult = await client.sql`
      SELECT *
      FROM review_reports
      WHERE id = ${input.reportId}
    `;
    if (reportResult.rows.length === 0) throw new Error('Review report not found');
    const report = reportResult.rows[0];
    const releaseResult = await client.sql`
      INSERT INTO review_report_releases (report_id, released_by_user_id, released_by_name)
      VALUES (${input.reportId}, ${input.actor.id}, ${input.actor.name})
      RETURNING *
    `;
    await appendSubmissionEvent(client, {
      submissionId: report.submission_id,
      eventType: 'review_report_released_to_author',
      actor: input.actor,
      summary: 'An anonymized review report was released to the author.',
      payload: { reportId: input.reportId, releaseId: releaseResult.rows[0].id },
    });
    await client.sql`COMMIT`;
    return releaseResult.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function recordEditorialDecision(input: {
  submissionId: number;
  reviewRoundId?: number | null;
  decision: 'technical_revision' | 'minor_revision' | 'major_revision' | 'accept' | 'reject' | 'withdraw';
  letter: string;
  actor: CaseFileActor;
}) {
  if (!['admin', 'editor'].includes(input.actor.role)) throw new Error('Editor role required');
  if (!input.letter?.trim()) throw new Error('Decision letter is required');
  if (!['technical_revision', 'minor_revision', 'major_revision', 'accept', 'reject', 'withdraw'].includes(input.decision)) {
    throw new Error('Invalid editorial decision');
  }
  const stageByDecision: Record<string, string> = {
    technical_revision: 'author_revision',
    minor_revision: 'author_revision',
    major_revision: 'author_revision',
    accept: 'accepted',
    reject: 'rejected',
    withdraw: 'withdrawn',
  };
  const templateByDecision: Partial<Record<typeof input.decision, string>> = {
    technical_revision: 'decision_minor_revision',
    minor_revision: 'decision_minor_revision',
    major_revision: 'decision_major_revision',
    accept: 'decision_accept',
    reject: 'decision_reject',
  };
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const submissionResult = await client.sql`
      SELECT *
      FROM submissions
      WHERE id = ${input.submissionId}
      FOR UPDATE
    `;
    if (submissionResult.rows.length === 0) throw new Error('Submission not found');
    const submission = submissionResult.rows[0];
    const stage = submission.current_stage || submission.status;
    if (!['editor_screening', 'in_review', 'under_review', 'editor_decision', 'revision_requested'].includes(stage)) {
      throw new Error(`An editorial decision cannot be recorded from workflow stage "${stage}"`);
    }
    const result = await client.sql`
      INSERT INTO editorial_decisions (
        submission_id, review_round_id, decision, letter,
        decided_by_user_id, decided_by_name, decided_by_role
      )
      VALUES (
        ${input.submissionId}, ${input.reviewRoundId ?? submission.current_round_id ?? null},
        ${input.decision}, ${input.letter.trim()}, ${input.actor.id}, ${input.actor.name}, ${input.actor.role}
      )
      RETURNING *
    `;
    if (input.reviewRoundId || submission.current_round_id) {
      await client.sql`
        UPDATE review_rounds
        SET status = 'closed', closed_at = NOW()
        WHERE id = ${input.reviewRoundId ?? submission.current_round_id}
          AND status != 'closed'
      `;
    }
    const toStage = stageByDecision[input.decision];
    const fromStage = submission.current_stage || submission.status;
    await client.sql`
      UPDATE submissions
      SET current_stage = ${toStage}, status = ${toStage}, lock_version = lock_version + 1,
          closed_at = CASE WHEN ${toStage} IN ('rejected','withdrawn') THEN NOW() ELSE closed_at END,
          closed_reason = CASE WHEN ${toStage} IN ('rejected','withdrawn') THEN ${input.letter.trim()} ELSE closed_reason END
      WHERE id = ${input.submissionId}
    `;
    await setSubmissionDeadline(client, input.submissionId, toStage);
    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: 'editorial_decision_recorded',
      actor: input.actor,
      fromStage,
      toStage,
      summary: `Editorial decision recorded: ${input.decision.replace('_', ' ')}.`,
      payload: { decisionId: result.rows[0].id, decision: input.decision },
    });
    const templateKey = templateByDecision[input.decision];
    if (templateKey) {
      await queueNotification({
        templateKey,
        recipientEmail: submission.author_email,
        submissionId: input.submissionId,
        dedupeKey: `editorial-decision:${result.rows[0].id}:${submission.author_email}`,
        variables: {
          author_name: submission.author_name,
          submission_title: submission.title,
          decision_letter: input.letter.trim(),
        },
      }, client);
    }
    await client.sql`COMMIT`;
    return result.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}
