import 'server-only';
import db from '@/lib/db';
import { appendSubmissionEvent } from './audit';
import type { CaseFileActor } from './types';

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
    const result = await client.sql`
      INSERT INTO review_assignments (
        submission_id, review_round_id, reviewer_user_id, reviewer_name, reviewer_email,
        assigned_by_user_id, assigned_by_name
      )
      VALUES (
        ${input.submissionId}, ${input.reviewRoundId}, ${reviewerResult.rows[0]?.id ?? null},
        ${input.reviewerName.trim()}, ${cleanEmail}, ${input.actor.id}, ${input.actor.name}
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
      SELECT ra.*, rr.round_number
      FROM review_assignments ra
      JOIN review_rounds rr ON rr.id = ra.review_round_id
      WHERE ra.id = ${input.assignmentId}
      FOR UPDATE
    `;
    if (assignmentResult.rows.length === 0) throw new Error('Review assignment not found');
    const assignment = assignmentResult.rows[0];
    if (
      assignment.reviewer_email.trim().toLowerCase() !== input.actor.email?.trim().toLowerCase() ||
      assignment.status !== 'assigned'
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

    const pendingResult = await client.sql`
      SELECT COUNT(*)::integer AS count
      FROM review_assignments
      WHERE review_round_id = ${assignment.review_round_id}
        AND status = 'assigned'
    `;
    if (Number(pendingResult.rows[0].count) === 0) {
      await client.sql`
        UPDATE review_rounds
        SET status = 'awaiting_editor'
        WHERE id = ${assignment.review_round_id}
      `;
      const stageResult = await client.sql`
        SELECT current_stage, status
        FROM submissions
        WHERE id = ${assignment.submission_id}
        FOR UPDATE
      `;
      const fromStage = stageResult.rows[0].current_stage || stageResult.rows[0].status;
      await client.sql`
        UPDATE submissions
        SET current_stage = 'editor_decision', status = 'editor_decision', lock_version = lock_version + 1
        WHERE id = ${assignment.submission_id}
      `;
      await appendSubmissionEvent(client, {
        submissionId: assignment.submission_id,
        eventType: 'review_round_ready_for_decision',
        actor: { id: null, name: 'TANQ Workflow', role: 'system' },
        fromStage,
        toStage: 'editor_decision',
        summary: `All assigned reports for round ${assignment.round_number} have been submitted.`,
        payload: { reviewRoundId: assignment.review_round_id },
      });
    }

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
    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: 'editorial_decision_recorded',
      actor: input.actor,
      fromStage,
      toStage,
      summary: `Editorial decision recorded: ${input.decision.replace('_', ' ')}.`,
      payload: { decisionId: result.rows[0].id, decision: input.decision },
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
