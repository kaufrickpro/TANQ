import 'server-only';
import db from '@/lib/db';
import { queueNotification } from '@/lib/notifications';
import { appendSubmissionEvent } from './audit';
import type { CaseFileActor } from './types';

const RESPONSE_STATUSES = new Set(['addressed', 'partially_addressed', 'disagreed']);
const MAX_RESPONSE_ITEMS = 200;
const MAX_REVIEWER_ID_LENGTH = 100;
const MAX_COMMENT_LENGTH = 20_000;
const MAX_RESPONSE_LENGTH = 20_000;

export interface RevisionResponseItem {
  reviewer_id: string;
  comment: string;
  response: string;
  status: 'addressed' | 'partially_addressed' | 'disagreed';
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function requiredText(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text`);
  const text = value.trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} is too long`);
  return text;
}

function validateResponseItems(value: unknown, submitting: boolean): RevisionResponseItem[] {
  if (!Array.isArray(value)) throw new Error('response_items must be an array');
  if (value.length > MAX_RESPONSE_ITEMS) throw new Error(`response_items cannot exceed ${MAX_RESPONSE_ITEMS} items`);
  if (submitting && value.length === 0) throw new Error('At least one response item is required to submit');

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`response_items[${index}] must be an object`);
    }
    const candidate = item as Record<string, unknown>;
    const status = requiredText(candidate.status, `response_items[${index}].status`, 40);
    if (!RESPONSE_STATUSES.has(status)) {
      throw new Error(`response_items[${index}].status is invalid`);
    }
    return {
      reviewer_id: requiredText(
        candidate.reviewer_id,
        `response_items[${index}].reviewer_id`,
        MAX_REVIEWER_ID_LENGTH,
      ),
      comment: requiredText(candidate.comment, `response_items[${index}].comment`, MAX_COMMENT_LENGTH),
      response: requiredText(
        candidate.response,
        `response_items[${index}].response`,
        MAX_RESPONSE_LENGTH,
        !submitting,
      ),
      status: status as RevisionResponseItem['status'],
    };
  });
}

async function assertAuthorOwnsSubmission(
  client: any,
  submissionId: number,
  actor: CaseFileActor & { email?: string },
) {
  if (actor.role !== 'author' || !actor.email) throw new Error('Author role required');
  const submissionResult = await client.sql`
    SELECT id, title, author_name, author_email, current_stage, status, current_round_id
    FROM submissions
    WHERE id = ${submissionId}
    FOR UPDATE
  `;
  const submission = submissionResult.rows[0];
  if (
    !submission ||
    actor.email.trim().toLowerCase() !== submission.author_email.trim().toLowerCase()
  ) {
    throw new Error('Forbidden');
  }
  return submission;
}

async function assertRoundBelongsToSubmission(client: any, submissionId: number, reviewRoundId: number) {
  const roundResult = await client.sql`
    SELECT id, round_number
    FROM review_rounds
    WHERE id = ${reviewRoundId}
      AND submission_id = ${submissionId}
  `;
  if (roundResult.rows.length === 0) throw new Error('Review round not found for this submission');
  return roundResult.rows[0];
}

async function assertVersionBelongsToSubmission(
  client: any,
  submissionId: number,
  versionId: number | null,
  expectedKind: 'author_response' | 'manuscript',
) {
  if (versionId === null) return;
  const versionResult = await client.sql`
    SELECT v.id, v.uploaded_by_role, d.kind
    FROM document_versions v
    JOIN submission_documents d ON d.id = v.document_id
    WHERE v.id = ${versionId}
      AND v.submission_id = ${submissionId}
  `;
  const version = versionResult.rows[0];
  if (!version) throw new Error('Referenced document version does not belong to this submission');
  if (version.kind !== expectedKind || version.uploaded_by_role !== 'author') {
    throw new Error(`Referenced ${expectedKind.replace('_', ' ')} must be an author-uploaded document of that kind`);
  }
}

async function assertItemsMatchReleasedReviews(
  client: any,
  submissionId: number,
  reviewRoundId: number,
  responseItems: RevisionResponseItem[],
) {
  const releasedResult = await client.sql`
    SELECT rp.comments_to_author
    FROM review_reports rp
    JOIN review_report_releases rel ON rel.report_id = rp.id
    WHERE rp.submission_id = ${submissionId}
      AND rp.review_round_id = ${reviewRoundId}
    ORDER BY rp.submitted_at ASC, rp.id ASC
  `;
  if (releasedResult.rows.length === 0) {
    throw new Error('A released review report is required before submitting a revision response');
  }
  if (releasedResult.rows.length !== responseItems.length) {
    throw new Error('Revision response items must match all released reviewer comments');
  }
  for (const [index, report] of releasedResult.rows.entries()) {
    const item = responseItems[index];
    if (
      item.reviewer_id !== `reviewer-${index + 1}` ||
      item.comment !== String(report.comments_to_author).trim()
    ) {
      throw new Error('Revision response items do not match the released reviewer comments');
    }
  }
}

export async function getRevisionResponse(input: {
  submissionId: number;
  reviewRoundId: number;
  actor: CaseFileActor & { email?: string };
}) {
  const submissionId = positiveInteger(input.submissionId, 'submission_id');
  const reviewRoundId = positiveInteger(input.reviewRoundId, 'review_round_id');
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    await assertAuthorOwnsSubmission(client, submissionId, input.actor);
    await assertRoundBelongsToSubmission(client, submissionId, reviewRoundId);
    const result = await client.sql`
      SELECT id, submission_id, review_round_id, response_document_version_id,
             tracked_changes_document_version_id, clean_document_version_id,
             response_items, status, submitted_at, created_at, updated_at
      FROM revision_responses
      WHERE submission_id = ${submissionId}
        AND review_round_id = ${reviewRoundId}
    `;
    await client.sql`COMMIT`;
    return result.rows[0] ?? null;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function saveRevisionResponse(input: {
  submissionId: number;
  reviewRoundId: number;
  responseDocumentVersionId?: number | null;
  trackedChangesDocumentVersionId?: number | null;
  cleanDocumentVersionId?: number | null;
  responseItems: unknown;
  action: 'save_draft' | 'submit';
  actor: CaseFileActor & { email?: string };
}) {
  const submissionId = positiveInteger(input.submissionId, 'submission_id');
  const reviewRoundId = positiveInteger(input.reviewRoundId, 'review_round_id');
  const responseDocumentVersionId =
    input.responseDocumentVersionId == null
      ? null
      : positiveInteger(input.responseDocumentVersionId, 'response_document_version_id');
  const trackedChangesDocumentVersionId =
    input.trackedChangesDocumentVersionId == null
      ? null
      : positiveInteger(input.trackedChangesDocumentVersionId, 'tracked_changes_document_version_id');
  const cleanDocumentVersionId =
    input.cleanDocumentVersionId == null
      ? null
      : positiveInteger(input.cleanDocumentVersionId, 'clean_document_version_id');
  if (input.action !== 'save_draft' && input.action !== 'submit') throw new Error('Invalid revision response action');
  const submitting = input.action === 'submit';
  const responseItems = validateResponseItems(input.responseItems, submitting);

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const submission = await assertAuthorOwnsSubmission(client, submissionId, input.actor);
    const round = await assertRoundBelongsToSubmission(client, submissionId, reviewRoundId);
    await assertVersionBelongsToSubmission(client, submissionId, responseDocumentVersionId, 'author_response');
    await assertVersionBelongsToSubmission(client, submissionId, trackedChangesDocumentVersionId, 'manuscript');
    await assertVersionBelongsToSubmission(client, submissionId, cleanDocumentVersionId, 'manuscript');

    const stage = submission.current_stage || submission.status;
    if (submitting && stage !== 'author_revision') {
      throw new Error('Revision responses can only be submitted during author revision');
    }
    if (submitting && Number(submission.current_round_id) !== reviewRoundId) {
      throw new Error('Revision responses can only be submitted for the current review round');
    }
    if (!submitting && ['published', 'rejected', 'withdrawn'].includes(stage)) {
      throw new Error('Closed manuscript case files cannot save revision response drafts');
    }
    if (submitting) {
      await assertItemsMatchReleasedReviews(client, submissionId, reviewRoundId, responseItems);
    }

    const existingResult = await client.sql`
      SELECT id, status
      FROM revision_responses
      WHERE submission_id = ${submissionId}
        AND review_round_id = ${reviewRoundId}
      FOR UPDATE
    `;
    const existing = existingResult.rows[0];
    if (existing?.status === 'submitted') {
      throw new Error('Submitted revision responses are immutable');
    }

    const status = submitting ? 'submitted' : 'draft';
    const result = existing
      ? await client.sql`
          UPDATE revision_responses
          SET response_document_version_id = ${responseDocumentVersionId},
              tracked_changes_document_version_id = ${trackedChangesDocumentVersionId},
              clean_document_version_id = ${cleanDocumentVersionId},
              response_items = ${JSON.stringify(responseItems)}::jsonb,
              status = ${status},
              submitted_at = CASE WHEN ${submitting} THEN NOW() ELSE NULL END,
              updated_at = NOW()
          WHERE id = ${existing.id}
          RETURNING *
        `
      : await client.sql`
          INSERT INTO revision_responses (
            submission_id, review_round_id, response_document_version_id,
            tracked_changes_document_version_id, clean_document_version_id,
            response_items, status, created_by, submitted_at
          )
          VALUES (
            ${submissionId}, ${reviewRoundId}, ${responseDocumentVersionId},
            ${trackedChangesDocumentVersionId}, ${cleanDocumentVersionId},
            ${JSON.stringify(responseItems)}::jsonb, ${status}, ${input.actor.id},
            CASE WHEN ${submitting} THEN NOW() ELSE NULL END
          )
          RETURNING *
        `;
    const response = result.rows[0];

    await appendSubmissionEvent(client, {
      submissionId,
      eventType: submitting ? 'revision_response_submitted' : 'revision_response_draft_saved',
      actor: input.actor,
      summary: submitting
        ? `The author submitted a revision response for review round ${round.round_number}.`
        : `The author saved a revision response draft for review round ${round.round_number}.`,
      payload: {
        revisionResponseId: response.id,
        reviewRoundId,
        responseDocumentVersionId,
        trackedChangesDocumentVersionId,
        cleanDocumentVersionId,
        responseItemCount: responseItems.length,
      },
    });

    if (submitting) {
      const recipients = await client.sql`
        SELECT DISTINCT ON (LOWER(TRIM(email))) name, LOWER(TRIM(email)) AS email
        FROM users
        WHERE role IN ('admin', 'editor')
          AND is_disabled = FALSE
          AND is_verified = TRUE
        ORDER BY LOWER(TRIM(email)), id
      `;
      for (const recipient of recipients.rows) {
        await queueNotification({
          templateKey: 'revision_received',
          recipientEmail: recipient.email,
          submissionId,
          dedupeKey: `revision_received:${response.id}:${recipient.email}`,
          variables: {
            submission_title: submission.title,
            author_name: submission.author_name,
            editor_name: recipient.name,
            review_round: String(round.round_number),
            revision_response_id: String(response.id),
          },
        }, client);
      }
    }

    await client.sql`COMMIT`;
    return response;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}
