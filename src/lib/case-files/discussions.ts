import 'server-only';
import db from '@/lib/db';
import type { AuthUser } from '@/lib/session';
import { queueNotification } from '@/lib/notifications';
import { canViewDocument, getSubmissionAccess } from './access';
import { appendSubmissionEvent } from './audit';
import type { CaseFileActor } from './types';

export type DiscussionVisibility = 'editorial' | 'author_editor' | 'all_parties';

const DISCUSSION_VISIBILITIES = new Set<DiscussionVisibility>([
  'editorial',
  'author_editor',
  'all_parties',
]);
const MAX_SUBJECT_LENGTH = 300;
const MAX_MESSAGE_LENGTH = 20_000;

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${label} is too long`);
  return text;
}

function visibleToRole(visibility: DiscussionVisibility, role: string): boolean {
  if (role === 'admin' || role === 'editor') return true;
  if (role === 'secretary') return visibility === 'editorial' || visibility === 'all_parties';
  if (role === 'author') return visibility === 'author_editor' || visibility === 'all_parties';
  if (role === 'reviewer') return visibility === 'all_parties';
  return false;
}

function canCreateVisibility(visibility: DiscussionVisibility, role: string): boolean {
  if (role === 'admin' || role === 'editor') return true;
  if (role === 'secretary') return visibility === 'editorial' || visibility === 'all_parties';
  if (role === 'author') return visibility === 'author_editor';
  if (role === 'reviewer') return visibility === 'all_parties';
  return false;
}

async function assertSubmissionAccess(viewer: AuthUser, submissionId: number) {
  const access = await getSubmissionAccess(viewer, submissionId);
  if (!access.allowed || !access.submission) throw new Error('Forbidden');
  return access;
}

async function assertAttachmentAllowed(
  client: any,
  submissionId: number,
  attachmentVersionId: number | null,
  actor: AuthUser,
  access: Awaited<ReturnType<typeof getSubmissionAccess>>,
  visibility: DiscussionVisibility,
) {
  if (attachmentVersionId === null) return;
  const result = await client.sql`
    SELECT v.id, v.review_round_id, d.kind, d.visibility
    FROM document_versions v
    JOIN submission_documents d ON d.id = v.document_id
    WHERE v.id = ${attachmentVersionId}
      AND v.submission_id = ${submissionId}
  `;
  const document = result.rows[0];
  if (!document) throw new Error('Attachment document version does not belong to this submission');
  if (!canViewDocument(actor, access.submission, document, access.assignedReviewer, {
    versionId: Number(document.id),
    reviewRoundId: document.review_round_id == null ? null : Number(document.review_round_id),
    assignedReviewRoundIds: access.assignedReviewRoundIds,
    assignedManuscriptVersionIds: access.assignedManuscriptVersionIds,
    legacyReviewer: access.legacyReviewer,
  })) {
    throw new Error('The sender cannot access the attachment document version');
  }
  const audienceCompatible =
    (visibility === 'editorial' && document.visibility !== 'evidence') ||
    (visibility === 'author_editor' && (document.visibility === 'author' || document.kind === 'manuscript')) ||
    (visibility === 'all_parties' && document.visibility === 'reviewer' && document.kind === 'manuscript');
  if (!audienceCompatible) {
    throw new Error('The attachment visibility is incompatible with the discussion audience');
  }
  if (visibility === 'all_parties') {
    const incompatibleAssignments = await client.sql`
      SELECT COUNT(*)::integer AS count
      FROM review_assignments ra
      JOIN review_rounds rr ON rr.id = ra.review_round_id
      WHERE ra.submission_id = ${submissionId}
        AND ra.status IN ('assigned', 'accepted', 'submitted')
        AND rr.manuscript_version_id != ${attachmentVersionId}
    `;
    if (Number(incompatibleAssignments.rows[0].count) > 0) {
      throw new Error('The attachment is not available to every reviewer in this discussion');
    }
  }
}

function displayName(name: string, role: string | null, viewerRole: string, isSelf: boolean) {
  if (isSelf) return name;
  const shouldAnonymizeAuthor = (viewerRole === 'reviewer' && role === 'author');
  const shouldAnonymizeReviewer = (viewerRole === 'author' && role === 'reviewer') ||
                                  (viewerRole === 'reviewer' && role === 'reviewer');
  if (shouldAnonymizeAuthor) {
    return 'Anonymous Author';
  }
  if (shouldAnonymizeReviewer) {
    return 'Anonymous Reviewer';
  }
  return role ? name : 'Participant';
}

function discussionAuditActor(actor: AuthUser): CaseFileActor {
  return {
    id: actor.id,
    name: actor.role === 'reviewer' ? 'Anonymous Reviewer' : actor.name,
    role: actor.role as CaseFileActor['role'],
  };
}

async function queueDiscussionNotifications(
  client: any,
  input: {
    submissionId: number;
    discussionId: number;
    messageId?: number | null;
    subject: string;
    visibility: DiscussionVisibility;
    action: 'created' | 'message' | 'closed';
    actorEmail: string;
  },
) {
  const recipients = await client.sql`
    WITH recipients AS (
      SELECT email
      FROM users
      WHERE is_disabled = FALSE
        AND (
          role IN ('admin', 'editor')
          OR (role = 'secretary' AND ${input.visibility} IN ('editorial', 'all_parties'))
        )
      UNION
      SELECT author_email AS email
      FROM submissions
      WHERE id = ${input.submissionId}
        AND ${input.visibility} IN ('author_editor', 'all_parties')
      UNION
      SELECT reviewer_email AS email
      FROM review_assignments
      WHERE submission_id = ${input.submissionId}
        AND status IN ('assigned', 'accepted', 'submitted')
        AND ${input.visibility} = 'all_parties'
    )
    SELECT DISTINCT LOWER(TRIM(email)) AS email
    FROM recipients
    WHERE email IS NOT NULL
      AND LOWER(TRIM(email)) != LOWER(TRIM(${input.actorEmail}))
  `;
  const templateKey = input.action === 'closed' ? 'discussion_closed' : 'discussion_message';
  for (const recipient of recipients.rows) {
    await queueNotification({
      templateKey,
      recipientEmail: recipient.email,
      submissionId: input.submissionId,
      dedupeKey: `${templateKey}:${input.discussionId}:${input.messageId ?? input.action}:${recipient.email}`,
      variables: {
        discussion_id: String(input.discussionId),
        discussion_subject: input.subject,
        discussion_action: input.action,
      },
    }, client);
  }
}

export async function listDiscussions(input: { submissionId: number; viewer: AuthUser }) {
  const submissionId = positiveInteger(input.submissionId, 'submission_id');
  await assertSubmissionAccess(input.viewer, submissionId);
  const canSeeEditorial = input.viewer.role === 'admin' || input.viewer.role === 'editor' || input.viewer.role === 'secretary';
  const canSeeAuthorEditor = input.viewer.role === 'admin' || input.viewer.role === 'editor' || input.viewer.role === 'author';
  const canSeeAllParties = ['admin', 'editor', 'secretary', 'author', 'reviewer'].includes(input.viewer.role);

  const result = await db`
    SELECT d.id, d.submission_id, d.stage, d.subject, d.visibility, d.created_by_name,
           d.created_by_user_id, d.created_at, d.is_closed, creator.role AS created_by_role,
           m.id AS message_id, m.sender_name, m.sender_user_id, sender.role AS sender_role, m.body,
           m.attachment_version_id, m.created_at AS message_created_at
    FROM discussions d
    LEFT JOIN users creator ON creator.id = d.created_by_user_id
    LEFT JOIN discussion_messages m ON m.discussion_id = d.id
    LEFT JOIN users sender ON sender.id = m.sender_user_id
    WHERE d.submission_id = ${submissionId}
      AND (
        (${canSeeEditorial} AND d.visibility = 'editorial')
        OR (${canSeeAuthorEditor} AND d.visibility = 'author_editor')
        OR (${canSeeAllParties} AND d.visibility = 'all_parties')
      )
    ORDER BY d.created_at DESC, m.created_at ASC, m.id ASC
  `;

  const discussions = new Map<number, any>();
  for (const row of result.rows) {
    const discussionId = Number(row.id);
    if (!discussions.has(discussionId)) {
      const isCreatorSelf = row.created_by_user_id != null && Number(row.created_by_user_id) === input.viewer.id;
      discussions.set(discussionId, {
        id: discussionId,
        submission_id: Number(row.submission_id),
        stage: row.stage,
        subject: row.subject,
        visibility: row.visibility,
        created_by_name: displayName(row.created_by_name, row.created_by_role, input.viewer.role, isCreatorSelf),
        created_by_role: row.created_by_role,
        created_at: row.created_at,
        is_closed: row.is_closed,
        messages: [],
      });
    }
    if (row.message_id != null) {
      const isSenderSelf = row.sender_user_id != null && Number(row.sender_user_id) === input.viewer.id;
      discussions.get(discussionId).messages.push({
        id: Number(row.message_id),
        sender_name: displayName(row.sender_name, row.sender_role, input.viewer.role, isSenderSelf),
        sender_role: row.sender_role,
        body: row.body,
        attachment_version_id:
          row.attachment_version_id == null ? null : Number(row.attachment_version_id),
        created_at: row.message_created_at,
      });
    }
  }
  return [...discussions.values()];
}

export async function createDiscussion(input: {
  submissionId: number;
  subject: unknown;
  visibility: unknown;
  body: unknown;
  attachmentVersionId?: unknown;
  actor: AuthUser;
}) {
  const submissionId = positiveInteger(input.submissionId, 'submission_id');
  const subject = requiredText(input.subject, 'subject', MAX_SUBJECT_LENGTH);
  const body = requiredText(input.body, 'body', MAX_MESSAGE_LENGTH);
  if (typeof input.visibility !== 'string' || !DISCUSSION_VISIBILITIES.has(input.visibility as DiscussionVisibility)) {
    throw new Error('Invalid discussion visibility');
  }
  const visibility = input.visibility as DiscussionVisibility;
  if (!canCreateVisibility(visibility, input.actor.role)) throw new Error('Forbidden');
  const attachmentVersionId =
    input.attachmentVersionId == null
      ? null
      : positiveInteger(input.attachmentVersionId, 'attachment_version_id');
  const access = await assertSubmissionAccess(input.actor, submissionId);
  const submission = access.submission;

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    await assertAttachmentAllowed(client, submissionId, attachmentVersionId, input.actor, access, visibility);
    const discussionResult = await client.sql`
      INSERT INTO discussions (
        submission_id, stage, subject, visibility, created_by_user_id, created_by_name
      )
      VALUES (
        ${submissionId}, ${submission.current_stage || submission.status}, ${subject},
        ${visibility}, ${input.actor.id}, ${input.actor.name}
      )
      RETURNING *
    `;
    const discussion = discussionResult.rows[0];
    const messageResult = await client.sql`
      INSERT INTO discussion_messages (
        discussion_id, sender_user_id, sender_name, body, attachment_version_id
      )
      VALUES (${discussion.id}, ${input.actor.id}, ${input.actor.name}, ${body}, ${attachmentVersionId})
      RETURNING *
    `;
    const message = messageResult.rows[0];
    await appendSubmissionEvent(client, {
      submissionId,
      eventType: 'discussion_created',
      actor: discussionAuditActor(input.actor),
      summary: 'A case-file discussion was created.',
      payload: {
        discussionId: discussion.id,
        messageId: message.id,
        visibility,
        attachmentVersionId,
      },
    });
    await queueDiscussionNotifications(client, {
      submissionId,
      discussionId: Number(discussion.id),
      messageId: Number(message.id),
      subject,
      visibility,
      action: 'created',
      actorEmail: input.actor.email,
    });
    await client.sql`COMMIT`;
    return { discussion, message };
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function addDiscussionMessage(input: {
  submissionId: number;
  discussionId: number;
  body: unknown;
  attachmentVersionId?: unknown;
  actor: AuthUser;
}) {
  const submissionId = positiveInteger(input.submissionId, 'submission_id');
  const discussionId = positiveInteger(input.discussionId, 'discussion_id');
  const body = requiredText(input.body, 'body', MAX_MESSAGE_LENGTH);
  const attachmentVersionId =
    input.attachmentVersionId == null
      ? null
      : positiveInteger(input.attachmentVersionId, 'attachment_version_id');
  const access = await assertSubmissionAccess(input.actor, submissionId);

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const discussionResult = await client.sql`
      SELECT *
      FROM discussions
      WHERE id = ${discussionId}
        AND submission_id = ${submissionId}
      FOR UPDATE
    `;
    const discussion = discussionResult.rows[0];
    if (!discussion || !visibleToRole(discussion.visibility, input.actor.role)) throw new Error('Forbidden');
    if (discussion.is_closed) throw new Error('Closed discussions cannot receive new messages');
    await assertAttachmentAllowed(
      client,
      submissionId,
      attachmentVersionId,
      input.actor,
      access,
      discussion.visibility,
    );
    const result = await client.sql`
      INSERT INTO discussion_messages (
        discussion_id, sender_user_id, sender_name, body, attachment_version_id
      )
      VALUES (${discussionId}, ${input.actor.id}, ${input.actor.name}, ${body}, ${attachmentVersionId})
      RETURNING *
    `;
    const message = result.rows[0];
    await appendSubmissionEvent(client, {
      submissionId,
      eventType: 'discussion_message_added',
      actor: discussionAuditActor(input.actor),
      summary: 'A message was added to a case-file discussion.',
      payload: { discussionId, messageId: message.id, attachmentVersionId },
    });
    await queueDiscussionNotifications(client, {
      submissionId,
      discussionId,
      messageId: Number(message.id),
      subject: discussion.subject,
      visibility: discussion.visibility,
      action: 'message',
      actorEmail: input.actor.email,
    });
    await client.sql`COMMIT`;
    return message;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDiscussion(input: {
  submissionId: number;
  discussionId: number;
  actor: AuthUser;
}) {
  const submissionId = positiveInteger(input.submissionId, 'submission_id');
  const discussionId = positiveInteger(input.discussionId, 'discussion_id');
  await assertSubmissionAccess(input.actor, submissionId);

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const discussionResult = await client.sql`
      SELECT *
      FROM discussions
      WHERE id = ${discussionId}
        AND submission_id = ${submissionId}
      FOR UPDATE
    `;
    const discussion = discussionResult.rows[0];
    if (!discussion || !visibleToRole(discussion.visibility, input.actor.role)) throw new Error('Forbidden');
    const isEditorialStaff = ['admin', 'editor', 'secretary'].includes(input.actor.role);
    if (!isEditorialStaff && Number(discussion.created_by_user_id) !== input.actor.id) throw new Error('Forbidden');
    if (discussion.is_closed) throw new Error('Discussion is already closed');

    const result = await client.sql`
      UPDATE discussions
      SET is_closed = TRUE
      WHERE id = ${discussionId}
      RETURNING *
    `;
    await appendSubmissionEvent(client, {
      submissionId,
      eventType: 'discussion_closed',
      actor: discussionAuditActor(input.actor),
      summary: 'A case-file discussion was closed.',
      payload: { discussionId },
    });
    await queueDiscussionNotifications(client, {
      submissionId,
      discussionId,
      subject: discussion.subject,
      visibility: discussion.visibility,
      action: 'closed',
      actorEmail: input.actor.email,
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
