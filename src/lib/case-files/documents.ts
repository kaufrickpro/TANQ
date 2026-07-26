import 'server-only';
import crypto from 'crypto';
import { del, get, head, put } from '@/lib/blob';
import db from '@/lib/db';
import { setSubmissionDeadline } from '@/lib/deadlines';
import { queueNotification } from '@/lib/notifications';
import { appendSubmissionEvent } from './audit';
import type {
  CaseFileActor,
  DocumentKind,
  DocumentVisibility,
} from './types';
import {
  INITIAL_DOCUMENT_KINDS,
  safeSubmissionFilename,
  validateSubmissionFileMetadata,
  type InitialDocumentKind,
} from '@/lib/submissionFiles';

export const DOCUMENT_KIND_DEFAULTS: Record<DocumentKind, { label: string; visibility: DocumentVisibility }> = {
  manuscript: { label: 'Blinded Manuscript', visibility: 'reviewer' },
  title_page: { label: 'Title Page', visibility: 'editorial' },
  supplementary: { label: 'Supplementary Files', visibility: 'reviewer' },
  copyright_form: { label: 'Copyright Transfer Form', visibility: 'editorial' },
  similarity_report: { label: 'Similarity Report', visibility: 'editorial' },
  ethics_approval: { label: 'Ethics Approval', visibility: 'editorial' },
  author_response: { label: 'Author Response Letter', visibility: 'reviewer' },
  reviewer_attachment: { label: 'Reviewer Attachment', visibility: 'editorial' },
  editor_revision: { label: 'Editorial Revision', visibility: 'reviewer' },
  production_file: { label: 'Production File', visibility: 'editorial' },
  final_proof: { label: 'Final Proof', visibility: 'author' },
  published_pdf: { label: 'Published PDF Evidence Copy', visibility: 'evidence' },
  other: { label: 'Other File', visibility: 'editorial' },
};

export function validateCaseFile(file: File, kind: DocumentKind) {
  validateSubmissionFileMetadata({
    filename: file.name,
    contentType: file.type,
    size: file.size,
    kind,
  });
}

function pathnameFromUrl(url: string) {
  try {
    return new URL(url).pathname.replace(/^\/+/, '');
  } catch {
    return url.replace(/^\/+/, '');
  }
}

interface SubmissionMetadata {
  title: string;
  abstract: string;
  keywords: string;
  authorName: string;
  authorEmail: string;
  submissionType: string;
  topic?: string | null;
  language: string;
  shortTitle?: string | null;
  coAuthors: unknown[];
  editorNote?: string | null;
  projectNumber?: string | null;
  ethicsStatement?: string | null;
  supportingInstitution?: string | null;
  acknowledgements?: string | null;
  checklistConfirmed: boolean;
}

interface PreparedDocument {
  kind: DocumentKind;
  originalFilename: string;
  contentType: string;
  size: number;
  sha256: string;
  etag: string | null;
  blobUrl: string;
  blobPathname: string;
  label: string;
  visibility: DocumentVisibility;
}

interface SubmittedCaseFileInput {
  draftId?: number | null;
  metadata: SubmissionMetadata;
  actor: CaseFileActor;
}

export interface DirectUploadedDocument {
  kind: InitialDocumentKind;
  url: string;
  pathname: string;
  originalFilename: string;
}

export class SubmissionFinalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionFinalizationError';
  }
}

async function persistSubmittedCaseFile(
  input: SubmittedCaseFileInput,
  publicId: string,
  documents: PreparedDocument[],
) {
  if (!input.metadata.title.trim() || !input.metadata.abstract.trim() || !input.metadata.keywords.trim()) {
    throw new Error('Title, abstract, and keywords are required');
  }
  if (!documents.some(item => item.kind === 'manuscript')) throw new Error('Blinded manuscript is required');

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    let submissionId: number;
    if (input.draftId) {
      const updated = await client.sql`
        UPDATE submissions
        SET title = ${input.metadata.title.trim()},
            abstract = ${input.metadata.abstract.trim()},
            keywords = ${input.metadata.keywords.trim()},
            author_name = ${input.metadata.authorName},
            author_email = ${input.metadata.authorEmail},
            status = 'submitted',
            current_stage = 'submitted',
            date_submitted = CURRENT_DATE::text,
            submitted_at = NOW(),
            submission_type = ${input.metadata.submissionType},
            topic = ${input.metadata.topic ?? null},
            language = ${input.metadata.language},
            short_title = ${input.metadata.shortTitle ?? null},
            co_authors = ${JSON.stringify(input.metadata.coAuthors)}::jsonb,
            editor_note = ${input.metadata.editorNote ?? null},
            project_number = ${input.metadata.projectNumber ?? null},
            ethics_statement = ${input.metadata.ethicsStatement ?? null},
            supporting_institution = ${input.metadata.supportingInstitution ?? null},
            acknowledgements = ${input.metadata.acknowledgements ?? null},
            checklist_confirmed = ${input.metadata.checklistConfirmed},
            draft_step = 5,
            lock_version = lock_version + 1
        WHERE id = ${input.draftId}
          AND status = 'draft'
          AND LOWER(TRIM(author_email)) = LOWER(TRIM(${input.metadata.authorEmail}))
        RETURNING id
      `;
      if (updated.rows.length === 0) throw new Error('Draft not found or no longer editable');
      submissionId = Number(updated.rows[0].id);
    } else {
      const inserted = await client.sql`
        INSERT INTO submissions (
          public_id, title, abstract, keywords, author_name, author_email,
          file_path, status, current_stage, date_submitted, submitted_at,
          submission_type, topic, language, short_title, co_authors, editor_note,
          project_number, ethics_statement, supporting_institution, acknowledgements,
          checklist_confirmed, draft_step
        )
        VALUES (
          ${publicId}, ${input.metadata.title.trim()}, ${input.metadata.abstract.trim()},
          ${input.metadata.keywords.trim()}, ${input.metadata.authorName}, ${input.metadata.authorEmail},
          '', 'submitted', 'submitted', CURRENT_DATE::text, NOW(),
          ${input.metadata.submissionType}, ${input.metadata.topic ?? null}, ${input.metadata.language},
          ${input.metadata.shortTitle ?? null}, ${JSON.stringify(input.metadata.coAuthors)}::jsonb,
          ${input.metadata.editorNote ?? null}, ${input.metadata.projectNumber ?? null},
          ${input.metadata.ethicsStatement ?? null}, ${input.metadata.supportingInstitution ?? null},
          ${input.metadata.acknowledgements ?? null}, ${input.metadata.checklistConfirmed}, 5
        )
        RETURNING id
      `;
      submissionId = Number(inserted.rows[0].id);
    }

    for (const item of documents) {
      const documentResult = await client.sql`
        INSERT INTO submission_documents (
          submission_id, kind, label, visibility,
          created_by_user_id, created_by_name, created_by_role
        )
        VALUES (
          ${submissionId}, ${item.kind}, ${item.label}, ${item.visibility},
          ${input.actor.id}, ${input.actor.name}, ${input.actor.role}
        )
        ON CONFLICT (submission_id, kind)
        DO UPDATE SET label = EXCLUDED.label
        RETURNING id
      `;
      const documentId = documentResult.rows[0].id;
      const nextVersionResult = await client.sql`
        SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
        FROM document_versions
        WHERE document_id = ${documentId}
      `;
      const versionNumber = Number(nextVersionResult.rows[0].next_version);
      const versionResult = await client.sql`
        INSERT INTO document_versions (
          submission_id, document_id, version_number, blob_url, blob_pathname,
          original_filename, content_type, size_bytes, sha256, etag,
          uploaded_by_user_id, uploaded_by_name, uploaded_by_role
        )
        VALUES (
          ${submissionId}, ${documentId}, ${versionNumber}, ${item.blobUrl}, ${item.blobPathname},
          ${item.originalFilename}, ${item.contentType}, ${item.size},
          ${item.sha256}, ${item.etag}, ${input.actor.id}, ${input.actor.name}, ${input.actor.role}
        )
        RETURNING id
      `;
      if (item.kind === 'manuscript') {
        await client.sql`UPDATE submissions SET file_path = ${item.blobUrl} WHERE id = ${submissionId}`;
      }
      await appendSubmissionEvent(client, {
        submissionId,
        eventType: 'document_version_uploaded',
        actor: input.actor,
        summary: `${item.label} version ${versionNumber} uploaded.`,
        payload: {
          documentId,
          versionId: versionResult.rows[0].id,
          kind: item.kind,
          versionNumber,
          originalFilename: item.originalFilename,
          sizeBytes: item.size,
          sha256: item.sha256,
        },
      });
    }
    await appendSubmissionEvent(client, {
      submissionId,
      eventType: 'submission_submitted',
      actor: input.actor,
      fromStage: 'draft',
      toStage: 'submitted',
      summary: 'The author submitted the manuscript case file.',
      payload: { documentCount: documents.length },
    });
    await setSubmissionDeadline(client, submissionId, 'submitted');
    await queueNotification({
      templateKey: 'submission_received',
      recipientEmail: input.metadata.authorEmail,
      submissionId,
      dedupeKey: `submission-received:${submissionId}`,
      variables: {
        author_name: input.metadata.authorName,
        submission_title: input.metadata.title.trim(),
      },
    }, client);
    await client.sql`COMMIT`;
    return submissionId;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

export async function createSubmittedCaseFile(input: SubmittedCaseFileInput & {
  files: Array<{ kind: DocumentKind; file: File; label?: string; visibility?: DocumentVisibility }>;
}) {
  if (!input.metadata.title.trim() || !input.metadata.abstract.trim() || !input.metadata.keywords.trim()) {
    throw new Error('Title, abstract, and keywords are required');
  }
  if (!input.files.some(item => item.kind === 'manuscript')) throw new Error('Blinded manuscript is required');
  for (const item of input.files) validateCaseFile(item.file, item.kind);

  const publicId = input.draftId
    ? (
        await db`
          SELECT public_id
          FROM submissions
          WHERE id = ${input.draftId}
            AND status = 'draft'
            AND LOWER(TRIM(author_email)) = LOWER(TRIM(${input.metadata.authorEmail}))
        `
      ).rows[0]?.public_id
    : crypto.randomUUID();
  if (!publicId) throw new Error('Draft not found or no longer editable');

  const uploaded: Array<{
    kind: DocumentKind;
    file: File;
    label: string;
    visibility: DocumentVisibility;
    sha256: string;
    blob: Awaited<ReturnType<typeof put>>;
  }> = [];
  try {
    for (const item of input.files) {
      const bytes = Buffer.from(await item.file.arrayBuffer());
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const defaults = DOCUMENT_KIND_DEFAULTS[item.kind];
      const pathname = `manuscripts/${publicId}/${item.kind}/${crypto.randomUUID()}-${safeSubmissionFilename(item.file.name)}`;
      const blob = await put(pathname, bytes, {
        access: 'private',
        allowOverwrite: false,
        contentType: item.file.type || undefined,
      });
      uploaded.push({
        kind: item.kind,
        file: item.file,
        label: item.label ?? defaults.label,
        visibility: item.visibility ?? defaults.visibility,
        sha256,
        blob,
      });
    }
    return await persistSubmittedCaseFile(
      input,
      publicId,
      uploaded.map(item => ({
        kind: item.kind,
        originalFilename: item.file.name,
        contentType: item.file.type || 'application/octet-stream',
        size: item.file.size,
        sha256: item.sha256,
        etag: item.blob.etag ?? null,
        blobUrl: item.blob.url,
        blobPathname: item.blob.pathname,
        label: item.label,
        visibility: item.visibility,
      })),
    );
  } catch (error) {
    if (uploaded.length > 0) {
      try {
        await del(uploaded.map(item => item.blob.url));
      } catch (cleanupError) {
        console.error('Failed to clean up uncommitted initial submission blobs:', cleanupError);
      }
    }
    throw error;
  }
}

async function sha256PrivateBlob(url: string, expected: {
  pathname: string;
  size: number;
  etag: string;
}) {
  const result = await get(url, {
    access: 'private',
    useCache: false,
    abortSignal: AbortSignal.timeout(60_000),
  });
  if (!result || result.statusCode !== 200) {
    throw new SubmissionFinalizationError('Uploaded file could not be read.');
  }
  if (
    result.blob.pathname !== expected.pathname ||
    result.blob.size !== expected.size ||
    result.blob.etag !== expected.etag
  ) {
    throw new SubmissionFinalizationError('Uploaded file changed during verification.');
  }

  const hash = crypto.createHash('sha256');
  const reader = result.stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hash.digest('hex');
}

export async function createSubmittedCaseFileFromBlobs(input: SubmittedCaseFileInput & {
  draftId: number;
  documents: DirectUploadedDocument[];
}) {
  if (!input.metadata.title.trim() || !input.metadata.abstract.trim() || !input.metadata.keywords.trim()) {
    throw new SubmissionFinalizationError('Title, abstract, and keywords are required');
  }
  if (!Number.isInteger(input.draftId) || input.draftId <= 0) {
    throw new SubmissionFinalizationError('A valid draft is required.');
  }
  if (!Array.isArray(input.documents)) {
    throw new SubmissionFinalizationError('Uploaded documents are required.');
  }

  const kinds = input.documents.map(item => item.kind);
  if (new Set(kinds).size !== kinds.length) {
    throw new SubmissionFinalizationError('Each document type may only be uploaded once.');
  }
  for (const kind of INITIAL_DOCUMENT_KINDS) {
    if (!kinds.includes(kind)) {
      throw new SubmissionFinalizationError(`${DOCUMENT_KIND_DEFAULTS[kind].label} is required.`);
    }
  }
  if (input.documents.length !== INITIAL_DOCUMENT_KINDS.length) {
    throw new SubmissionFinalizationError('Unexpected document type in initial submission.');
  }

  const draft = (
    await db`
      SELECT public_id
      FROM submissions
      WHERE id = ${input.draftId}
        AND status = 'draft'
        AND LOWER(TRIM(author_email)) = LOWER(TRIM(${input.metadata.authorEmail}))
    `
  ).rows[0];
  if (!draft) throw new SubmissionFinalizationError('Draft not found or no longer editable');

  const verifiedUrls: string[] = [];
  try {
    const prepared: PreparedDocument[] = [];
    for (const item of input.documents) {
      const defaults = DOCUMENT_KIND_DEFAULTS[item.kind];
      const prefix = `manuscripts/${draft.public_id}/${item.kind}/`;
      const safeName = safeSubmissionFilename(item.originalFilename);
      const suffix = `-${safeName}`;
      if (!item.pathname.startsWith(prefix) || !item.pathname.endsWith(suffix)) {
        throw new SubmissionFinalizationError('Uploaded file path does not belong to this draft.');
      }
      const uploadId = item.pathname.slice(prefix.length, -suffix.length);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
        throw new SubmissionFinalizationError('Uploaded file path is invalid.');
      }

      const blob = await head(item.url, { abortSignal: AbortSignal.timeout(30_000) });
      if (blob.url !== item.url || blob.pathname !== item.pathname) {
        throw new SubmissionFinalizationError('Uploaded file metadata does not match the stored blob.');
      }
      try {
        validateSubmissionFileMetadata({
          filename: item.originalFilename,
          contentType: blob.contentType,
          size: blob.size,
          kind: item.kind,
        });
      } catch (error) {
        throw new SubmissionFinalizationError(
          error instanceof Error ? error.message : 'Uploaded file metadata is invalid.',
        );
      }
      verifiedUrls.push(blob.url);
      const sha256 = await sha256PrivateBlob(blob.url, {
        pathname: blob.pathname,
        size: blob.size,
        etag: blob.etag,
      });
      prepared.push({
        kind: item.kind,
        originalFilename: item.originalFilename,
        contentType: blob.contentType,
        size: blob.size,
        sha256,
        etag: blob.etag,
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        label: defaults.label,
        visibility: defaults.visibility,
      });
    }

    return await persistSubmittedCaseFile(input, String(draft.public_id), prepared);
  } catch (error) {
    if (verifiedUrls.length > 0) {
      try {
        await del(verifiedUrls);
      } catch (cleanupError) {
        console.error('Failed to clean up uncommitted direct uploads:', cleanupError);
      }
    }
    throw error;
  }
}

export async function uploadDocumentVersion(input: {
  submissionId: number;
  kind: DocumentKind;
  file: File;
  actor: CaseFileActor;
  label?: string;
  visibility?: DocumentVisibility;
  note?: string;
  reviewRoundId?: number | null;
}) {
  validateCaseFile(input.file, input.kind);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const defaults = DOCUMENT_KIND_DEFAULTS[input.kind];
  const safeName = safeSubmissionFilename(input.file.name);

  const submissionResult = await db`
    SELECT id, public_id
    FROM submissions
    WHERE id = ${input.submissionId}
  `;
  if (submissionResult.rows.length === 0) throw new Error('Submission not found');

  const pathname = `manuscripts/${submissionResult.rows[0].public_id}/${input.kind}/${crypto.randomUUID()}-${safeName}`;
  const blob = await put(pathname, bytes, {
    access: 'private',
    allowOverwrite: false,
    contentType: input.file.type || undefined,
  });

  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const locked = await client.sql`
      SELECT id, current_stage, status, file_path
      FROM submissions
      WHERE id = ${input.submissionId}
      FOR UPDATE
    `;
    if (locked.rows.length === 0) throw new Error('Submission not found');
    const stage = locked.rows[0].current_stage || locked.rows[0].status;
    if (['published', 'rejected', 'withdrawn'].includes(stage)) {
      throw new Error('Closed manuscript case files cannot receive new document versions');
    }
    if (
      input.actor.role === 'author' &&
      !['submitted', 'revision_requested', 'author_revision', 'production'].includes(stage)
    ) {
      throw new Error('The author cannot upload a document in the current workflow stage');
    }
    if (input.actor.role === 'author' && stage === 'production' && input.kind !== 'final_proof') {
      throw new Error('Authors can only upload final-proof responses during production');
    }
    if (input.actor.role === 'author' && stage !== 'production' && input.kind === 'final_proof') {
      throw new Error('Final-proof responses can only be uploaded during production');
    }
    if (input.actor.role === 'reviewer') {
      if (input.kind !== 'reviewer_attachment' || !input.actor.email || !input.reviewRoundId) {
        throw new Error('Reviewer attachments require an active assigned review round');
      }
      const activeAssignment = await client.sql`
        SELECT ra.id
        FROM review_assignments ra
        JOIN review_rounds rr ON rr.id = ra.review_round_id
        WHERE ra.submission_id = ${input.submissionId}
          AND ra.review_round_id = ${input.reviewRoundId}
          AND LOWER(TRIM(ra.reviewer_email)) = LOWER(TRIM(${input.actor.email}))
          AND ra.status IN ('assigned', 'accepted')
          AND rr.status = 'open'
        LIMIT 1
      `;
      if (activeAssignment.rows.length === 0) {
        throw new Error('Reviewer attachments require an active assigned review round');
      }
    }

    await client.sql`
      INSERT INTO submission_documents (
        submission_id, kind, label, visibility,
        created_by_user_id, created_by_name, created_by_role
      )
      VALUES (
        ${input.submissionId}, ${input.kind}, ${input.label ?? defaults.label},
        ${input.visibility ?? defaults.visibility}, ${input.actor.id}, ${input.actor.name}, ${input.actor.role}
      )
      ON CONFLICT (submission_id, kind) DO NOTHING
    `;
    const documentResult = await client.sql`
      SELECT *
      FROM submission_documents
      WHERE submission_id = ${input.submissionId} AND kind = ${input.kind}
      FOR UPDATE
    `;
    const document = documentResult.rows[0];
    if (input.kind === 'manuscript' && locked.rows[0].file_path) {
      const existingVersions = await client.sql`
        SELECT COUNT(*)::integer AS count
        FROM document_versions
        WHERE document_id = ${document.id}
      `;
      if (Number(existingVersions.rows[0].count) === 0) {
        const originalFilename =
          pathnameFromUrl(locked.rows[0].file_path).split('/').pop() || 'legacy-manuscript';
        const legacyVersion = await client.sql`
          INSERT INTO document_versions (
            submission_id, document_id, version_number, blob_url, blob_pathname,
            original_filename, content_type, size_bytes,
            uploaded_by_user_id, uploaded_by_name, uploaded_by_role,
            upload_note, legacy_import
          )
          VALUES (
            ${input.submissionId}, ${document.id}, 1, ${locked.rows[0].file_path},
            ${pathnameFromUrl(locked.rows[0].file_path)}, ${originalFilename},
            'application/octet-stream', 0, ${input.actor.id}, ${input.actor.name}, ${input.actor.role},
            'Imported from submissions.file_path during first immutable revision upload; checksum pending verification.',
            TRUE
          )
          RETURNING id
        `;
        await appendSubmissionEvent(client, {
          submissionId: input.submissionId,
          eventType: 'legacy_document_version_imported',
          actor: { id: null, name: 'TANQ Workflow', role: 'system' },
          summary: 'Existing legacy manuscript file was preserved as immutable version 1.',
          payload: {
            documentId: document.id,
            versionId: legacyVersion.rows[0].id,
            blobUrl: locked.rows[0].file_path,
          },
        });
      }
    }
    const versionResult = await client.sql`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM document_versions
      WHERE document_id = ${document.id}
    `;
    const versionNumber = Number(versionResult.rows[0].next_version);

    const inserted = await client.sql`
      INSERT INTO document_versions (
        submission_id, document_id, version_number, blob_url, blob_pathname,
        original_filename, content_type, size_bytes, sha256, etag,
        uploaded_by_user_id, uploaded_by_name, uploaded_by_role, upload_note, review_round_id
      )
      VALUES (
        ${input.submissionId}, ${document.id}, ${versionNumber}, ${blob.url}, ${blob.pathname},
        ${input.file.name}, ${input.file.type || 'application/octet-stream'}, ${input.file.size},
        ${sha256}, ${blob.etag}, ${input.actor.id}, ${input.actor.name}, ${input.actor.role},
        ${input.note ?? null}, ${input.reviewRoundId ?? null}
      )
      RETURNING *
    `;

    if (input.kind === 'manuscript') {
      await client.sql`
        UPDATE submissions
        SET file_path = ${blob.url}, lock_version = lock_version + 1
        WHERE id = ${input.submissionId}
      `;
    }

    await appendSubmissionEvent(client, {
      submissionId: input.submissionId,
      eventType: 'document_version_uploaded',
      actor: input.actor,
      summary: `${defaults.label} version ${versionNumber} uploaded.`,
      payload: {
        documentId: document.id,
        versionId: inserted.rows[0].id,
        kind: input.kind,
        versionNumber,
        originalFilename: input.file.name,
        sizeBytes: input.file.size,
        sha256,
        reviewRoundId: input.reviewRoundId ?? null,
      },
    });

    await client.sql`COMMIT`;
    return { document, version: inserted.rows[0] };
  } catch (error) {
    await client.sql`ROLLBACK`;
    try {
      await del(blob.url);
    } catch (cleanupError) {
      console.error('Failed to clean up uncommitted blob:', blob.url, cleanupError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function streamPrivateVersion(version: { blob_url: string }) {
  return get(version.blob_url, { access: 'private', useCache: false });
}

export async function inspectPrivateVersion(version: { blob_url: string }) {
  return head(version.blob_url);
}
