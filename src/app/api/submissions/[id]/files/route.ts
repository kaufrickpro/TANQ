import { NextResponse } from 'next/server';
import { del, head } from '@/lib/blob';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import {
  isCanonicalSubmissionUploadPath,
  isInitialDocumentKind,
  validateSubmissionFileMetadata,
  type DraftSubmissionFile,
  type InitialDocumentKind,
} from '@/lib/submissionFiles';

class DraftFileRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'DraftFileRequestError';
  }
}

function parseSubmissionId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DraftFileRequestError('A valid draft is required.');
  }
  return id;
}

function parseRegistrationBody(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new DraftFileRequestError('Uploaded file metadata is invalid.');
  }
  const candidate = value as Partial<DraftSubmissionFile>;
  if (!isInitialDocumentKind(candidate.kind)) {
    throw new DraftFileRequestError('Document type is invalid.');
  }
  if (
    typeof candidate.url !== 'string' ||
    candidate.url.length === 0 ||
    typeof candidate.pathname !== 'string' ||
    candidate.pathname.length === 0 ||
    typeof candidate.originalFilename !== 'string' ||
    candidate.originalFilename.length === 0 ||
    candidate.originalFilename.length > 255
  ) {
    throw new DraftFileRequestError('Uploaded file metadata is invalid.');
  }
  return {
    kind: candidate.kind,
    url: candidate.url,
    pathname: candidate.pathname,
    originalFilename: candidate.originalFilename,
  };
}

function parseRemovalBody(value: unknown): InitialDocumentKind {
  if (!value || typeof value !== 'object' || !isInitialDocumentKind((value as { kind?: unknown }).kind)) {
    throw new DraftFileRequestError('Document type is invalid.');
  }
  return (value as { kind: InitialDocumentKind }).kind;
}

async function requireAuthor() {
  const session = await getSessionUser();
  if (!session) throw new DraftFileRequestError('Unauthorized', 401);
  if (session.role !== 'author') throw new DraftFileRequestError('Forbidden', 403);
  return session;
}

function draftFileMap(value: unknown): Record<string, DraftSubmissionFile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, DraftSubmissionFile>;
}

async function deleteReplacedBlob(url: string | undefined, replacementUrl?: string) {
  if (!url || url === replacementUrl) return;
  try {
    await del(url);
  } catch (error) {
    console.error('Failed to delete replaced draft blob:', url, error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const session = await requireAuthor();
    const { id } = await params;
    const draftId = parseSubmissionId(id);
    const uploaded = parseRegistrationBody(await request.json());

    const draft = (
      await db`
        SELECT public_id
        FROM submissions
        WHERE id = ${draftId}
          AND status = 'draft'
          AND LOWER(TRIM(author_email)) = LOWER(TRIM(${session.email}))
      `
    ).rows[0];
    if (!draft) throw new DraftFileRequestError('Draft not found or no longer editable', 404);

    if (!isCanonicalSubmissionUploadPath({
      publicId: String(draft.public_id),
      kind: uploaded.kind,
      pathname: uploaded.pathname,
      originalFilename: uploaded.originalFilename,
    })) {
      throw new DraftFileRequestError('Upload path does not belong to this draft.');
    }

    const blob = await head(uploaded.url, { abortSignal: AbortSignal.timeout(30_000) });
    if (blob.url !== uploaded.url || blob.pathname !== uploaded.pathname) {
      throw new DraftFileRequestError('Uploaded file metadata does not match the stored blob.');
    }
    try {
      validateSubmissionFileMetadata({
        filename: uploaded.originalFilename,
        contentType: blob.contentType,
        size: blob.size,
        kind: uploaded.kind,
      });
    } catch (error) {
      throw new DraftFileRequestError(
        error instanceof Error ? error.message : 'Uploaded file metadata is invalid.',
      );
    }

    const stored: DraftSubmissionFile = {
      ...uploaded,
      contentType: blob.contentType || 'application/octet-stream',
      size: Number(blob.size),
      etag: blob.etag ?? null,
    };

    const client = await db.connect();
    let previousUrl: string | undefined;
    try {
      await client.sql`BEGIN`;
      const locked = await client.sql`
        SELECT files_meta
        FROM submissions
        WHERE id = ${draftId}
          AND status = 'draft'
          AND LOWER(TRIM(author_email)) = LOWER(TRIM(${session.email}))
        FOR UPDATE
      `;
      if (locked.rows.length === 0) {
        throw new DraftFileRequestError('Draft not found or no longer editable', 404);
      }
      previousUrl = draftFileMap(locked.rows[0].files_meta)[uploaded.kind]?.url;
      await client.sql`
        UPDATE submissions
        SET files_meta = jsonb_set(
          COALESCE(files_meta, '{}'::jsonb),
          ARRAY[${uploaded.kind}]::text[],
          ${JSON.stringify(stored)}::jsonb,
          true
        )
        WHERE id = ${draftId}
      `;
      await client.sql`COMMIT`;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }

    await deleteReplacedBlob(previousUrl, stored.url);
    return NextResponse.json({ file: stored });
  } catch (error) {
    if (error instanceof DraftFileRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to save uploaded draft file:', error);
    return NextResponse.json({ error: 'Uploaded file could not be saved to the draft.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const session = await requireAuthor();
    const { id } = await params;
    const draftId = parseSubmissionId(id);
    const kind = parseRemovalBody(await request.json());

    const client = await db.connect();
    let previousUrl: string | undefined;
    try {
      await client.sql`BEGIN`;
      const locked = await client.sql`
        SELECT files_meta
        FROM submissions
        WHERE id = ${draftId}
          AND status = 'draft'
          AND LOWER(TRIM(author_email)) = LOWER(TRIM(${session.email}))
        FOR UPDATE
      `;
      if (locked.rows.length === 0) {
        throw new DraftFileRequestError('Draft not found or no longer editable', 404);
      }
      previousUrl = draftFileMap(locked.rows[0].files_meta)[kind]?.url;
      await client.sql`
        UPDATE submissions
        SET files_meta = COALESCE(files_meta, '{}'::jsonb) - ${kind}
        WHERE id = ${draftId}
      `;
      await client.sql`COMMIT`;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }

    await deleteReplacedBlob(previousUrl);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DraftFileRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to remove draft file:', error);
    return NextResponse.json({ error: 'Draft file could not be removed.' }, { status: 500 });
  }
}
