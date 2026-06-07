import 'server-only';
import db from '@/lib/db';
import { appendSubmissionEvent } from './audit';
import type { CaseFileActor, SubmissionStage } from './types';

const NORMAL_TRANSITIONS: Record<string, SubmissionStage[]> = {
  draft: ['submitted'],
  submitted: ['secretary_check', 'editor_screening', 'author_revision', 'withdrawn'],
  secretary_check: ['editor_screening', 'author_revision', 'withdrawn'],
  editor_screening: ['under_review', 'author_revision', 'accepted', 'rejected', 'withdrawn'],
  in_review: ['editor_decision', 'author_revision', 'accepted', 'rejected', 'withdrawn'],
  under_review: ['editor_decision', 'withdrawn'],
  editor_decision: ['under_review', 'author_revision', 'accepted', 'rejected', 'withdrawn'],
  revision_requested: ['author_revision', 'editor_screening', 'under_review', 'accepted', 'rejected', 'withdrawn'],
  author_revision: ['editor_screening', 'under_review', 'withdrawn'],
  accepted: ['production', 'withdrawn'],
  production: ['published', 'withdrawn'],
  published: [],
  rejected: [],
  withdrawn: [],
};

function roleCanTransition(actor: CaseFileActor, from: string, to: string): boolean {
  if (actor.role === 'admin' || actor.role === 'editor') return true;
  if (actor.role === 'secretary') {
    return (
      (from === 'submitted' && ['secretary_check', 'editor_screening', 'author_revision'].includes(to)) ||
      (from === 'secretary_check' && ['editor_screening', 'author_revision'].includes(to))
    );
  }
  if (actor.role === 'author') {
    return (
      (from === 'draft' && to === 'submitted') ||
      (['revision_requested', 'author_revision'].includes(from) && to === 'editor_screening')
    );
  }
  return false;
}

export async function transitionSubmission(input: {
  submissionId: number;
  toStage: SubmissionStage;
  actor: CaseFileActor;
  summary: string;
  payload?: Record<string, unknown>;
  overrideReason?: string;
}) {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const locked = await client.sql`
      SELECT *
      FROM submissions
      WHERE id = ${input.submissionId}
      FOR UPDATE
    `;
    if (locked.rows.length === 0) throw new Error('Submission not found');

    const submission = locked.rows[0];
    const fromStage = submission.current_stage || submission.status;
    const allowedByState = (NORMAL_TRANSITIONS[fromStage] ?? []).includes(input.toStage);
    const allowedByRole = roleCanTransition(input.actor, fromStage, input.toStage);
    const override = !allowedByState || !allowedByRole;

    if (override) {
      if (!['admin', 'editor'].includes(input.actor.role) || !input.overrideReason?.trim()) {
        throw new Error(`Transition from "${fromStage}" to "${input.toStage}" is not allowed`);
      }
    }

    await client.sql`
      UPDATE submissions
      SET current_stage = ${input.toStage},
          status = ${input.toStage},
          lock_version = lock_version + 1,
          closed_at = CASE WHEN ${input.toStage} IN ('published','rejected','withdrawn') THEN NOW() ELSE closed_at END,
          closed_reason = CASE WHEN ${input.toStage} IN ('rejected','withdrawn') THEN ${input.summary} ELSE closed_reason END
      WHERE id = ${input.submissionId}
    `;

    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: override ? 'workflow_override' : 'stage_transitioned',
      actor: input.actor,
      fromStage,
      toStage: input.toStage,
      summary: input.summary,
      payload: {
        ...(input.payload ?? {}),
        ...(override ? { overrideReason: input.overrideReason } : {}),
      },
    });

    await client.sql`COMMIT`;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}
