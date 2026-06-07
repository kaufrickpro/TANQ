import 'server-only';
import crypto from 'crypto';
import { del, get, head, put } from '@vercel/blob';
import db from '@/lib/db';
import { appendSubmissionEvent } from './audit';
import type {
  CaseFileActor,
  DocumentKind,
  DocumentVisibility,
} from './types';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'zip']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
]);

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
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Only PDF, DOC, DOCX, and ZIP files are allowed.');
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) throw new Error('File MIME type is not allowed.');
  if (kind === 'similarity_report' && extension !== 'pdf') throw new Error('Similarity report must be a PDF.');
  if (file.size <= 0) throw new Error('File is empty.');
  if (file.size > MAX_FILE_SIZE) throw new Error('File size must be less than 20MB.');
}

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function pathnameFromUrl(url: string) {
  try {
    return new URL(url).pathname.replace(/^\/+/, '');
  } catch {
    return url.replace(/^\/+/, '');
  }
}

export async function createSubmittedCaseFile(input: {
  draftId?: number | null;
  metadata: {
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
  };
  files: Array<{ kind: DocumentKind; file: File; label?: string; visibility?: DocumentVisibility }>;
  actor: CaseFileActor;
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
      const pathname = `manuscripts/${publicId}/${item.kind}/${crypto.randomUUID()}-${safeFilename(item.file.name)}`;
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

      for (const item of uploaded) {
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
            ${submissionId}, ${documentId}, ${versionNumber}, ${item.blob.url}, ${item.blob.pathname},
            ${item.file.name}, ${item.file.type || 'application/octet-stream'}, ${item.file.size},
            ${item.sha256}, ${item.blob.etag}, ${input.actor.id}, ${input.actor.name}, ${input.actor.role}
          )
          RETURNING id
        `;
        if (item.kind === 'manuscript') {
          await client.sql`UPDATE submissions SET file_path = ${item.blob.url} WHERE id = ${submissionId}`;
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
            originalFilename: item.file.name,
            sizeBytes: item.file.size,
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
        payload: { documentCount: uploaded.length },
      });
      await client.sql`COMMIT`;
      return submissionId;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }
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
  const safeName = safeFilename(input.file.name);

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
          AND ra.status = 'assigned'
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
