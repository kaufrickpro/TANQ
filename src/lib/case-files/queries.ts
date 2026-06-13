import 'server-only';
import db from '@/lib/db';
import type { AuthUser } from '@/lib/session';
import { canViewDocument, getSubmissionAccess } from './access';

function getAnonymousFilename(originalFilename: string, kind: string, versionNumber: number): string {
  const ext = originalFilename.split('.').pop()?.toLowerCase() || 'bin';
  return `${kind}_v${versionNumber}.${ext}`;
}

export async function getCaseFile(user: AuthUser, submissionId: number) {
  const access = await getSubmissionAccess(user, submissionId);
  if (!access.allowed || !access.submission) return null;

  const documentsResult = await db`
    SELECT d.*, v.id AS version_id, v.version_number, v.original_filename, v.content_type,
           v.size_bytes, v.sha256, v.etag, v.uploaded_by_name, v.uploaded_by_role,
           v.uploaded_by_user_id, v.upload_note, v.review_round_id, v.legacy_import, v.created_at AS version_created_at
    FROM submission_documents d
    JOIN document_versions v ON v.document_id = d.id
    WHERE d.submission_id = ${submissionId}
    ORDER BY d.kind ASC, v.version_number DESC
  `;
  const documents = documentsResult.rows
    .filter((row: any) => canViewDocument(user, access.submission, row, access.assignedReviewer, {
      versionId: Number(row.version_id),
      reviewRoundId: row.review_round_id == null ? null : Number(row.review_round_id),
      assignedReviewRoundIds: access.assignedReviewRoundIds,
      assignedManuscriptVersionIds: access.assignedManuscriptVersionIds,
      legacyReviewer: access.legacyReviewer,
    }))
    .map((row: any) => {
      const uploaderRole = row.uploaded_by_role;
      const uploaderUserId = row.uploaded_by_user_id ? Number(row.uploaded_by_user_id) : null;
      let uploadedByName = row.uploaded_by_name;
      let originalFilename = row.original_filename;

      const shouldAnonymizeAuthor = (user.role === 'reviewer' && uploaderRole === 'author');
      const shouldAnonymizeReviewer = (user.role === 'author' && uploaderRole === 'reviewer') ||
                                      (user.role === 'reviewer' && uploaderRole === 'reviewer' && uploaderUserId !== user.id);

      if (shouldAnonymizeAuthor) {
        uploadedByName = 'Anonymous Author';
        originalFilename = getAnonymousFilename(row.original_filename, row.kind, row.version_number);
      } else if (shouldAnonymizeReviewer) {
        uploadedByName = 'Anonymous Reviewer';
        originalFilename = getAnonymousFilename(row.original_filename, row.kind, row.version_number);
      }

      return {
        ...row,
        uploaded_by_name: uploadedByName,
        original_filename: originalFilename,
        download_url: `/api/case-files/${submissionId}/documents/${row.version_id}/download`,
      };
    });

  const eventsResult = await db`
    SELECT id, sequence_number, event_type, actor_name, actor_role, actor_user_id, from_stage, to_stage,
           summary, payload, previous_hash, event_hash, created_at
    FROM submission_events
    WHERE submission_id = ${submissionId}
    ORDER BY sequence_number ASC
  `;

  let events = eventsResult.rows;
  if (user.role === 'reviewer') {
    events = events.filter((event: any) => event.actor_role !== 'author' && event.actor_role !== 'auditor');
  }
  events = events.map((event: any) => {
    let actorName = event.actor_name;
    const isReviewerActor = event.actor_role === 'reviewer';
    if (isReviewerActor) {
      const isSelf = user.role === 'reviewer' && event.actor_user_id != null && Number(event.actor_user_id) === user.id;
      if (!isSelf) {
        actorName = 'Anonymous Reviewer';
      }
    }
    return {
      ...event,
      actor_name: actorName,
    };
  });

  const roundsResult = await db`
    SELECT rr.*, dv.original_filename AS manuscript_filename, dv.version_number AS manuscript_version_number
    FROM review_rounds rr
    JOIN document_versions dv ON dv.id = rr.manuscript_version_id
    WHERE rr.submission_id = ${submissionId}
    ORDER BY rr.round_number DESC
  `;

  const rounds = roundsResult.rows.map((row: any) => {
    let filename = row.manuscript_filename;
    if (user.role === 'reviewer') {
      filename = getAnonymousFilename(row.manuscript_filename, 'manuscript', row.manuscript_version_number);
    }
    return {
      ...row,
      manuscript_filename: filename,
    };
  });

  const submission = { ...access.submission };
  if (user.role === 'reviewer') {
    delete submission.author_name;
    delete submission.author_email;
    delete submission.co_authors;
  }

  return {
    submission,
    documents,
    events,
    rounds,
  };
}
