import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import {
  buildSubmissionUploadPath,
  MAX_SUBMISSION_FILE_SIZE,
  isInitialDocumentKind,
  submissionFileExtension,
  validateSubmissionFileMetadata,
  type InitialDocumentKind,
} from '@/lib/submissionFiles';

interface UploadClientPayload {
  draftId: number;
  kind: InitialDocumentKind;
  originalFilename: string;
  uploadId: string;
}

const MIME_TYPES_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

class UploadRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'UploadRequestError';
  }
}

function parseClientPayload(raw: string | null): UploadClientPayload {
  if (!raw) throw new UploadRequestError('Upload metadata is required.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new UploadRequestError('Upload metadata is invalid.');
  }
  if (!value || typeof value !== 'object') throw new UploadRequestError('Upload metadata is invalid.');
  const payload = value as Partial<UploadClientPayload>;
  if (!Number.isInteger(payload.draftId) || Number(payload.draftId) <= 0) {
    throw new UploadRequestError('A valid draft is required.');
  }
  if (!isInitialDocumentKind(payload.kind)) throw new UploadRequestError('Document type is invalid.');
  if (
    typeof payload.originalFilename !== 'string' ||
    payload.originalFilename.length === 0 ||
    payload.originalFilename.length > 255
  ) {
    throw new UploadRequestError('Filename is invalid.');
  }
  if (
    typeof payload.uploadId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.uploadId)
  ) {
    throw new UploadRequestError('Upload identifier is invalid.');
  }
  return payload as UploadClientPayload;
}

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !['blob.generate-client-token', 'blob.upload-completed'].includes(body.type)
  ) {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
  }

  if (body.type === 'blob.generate-client-token' && !validateSameOrigin(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await getSessionUser();
        if (!session) throw new UploadRequestError('Unauthorized', 401);
        if (session.role !== 'author') throw new UploadRequestError('Forbidden', 403);

        const payload = parseClientPayload(clientPayload);
        const extension = submissionFileExtension(payload.originalFilename);
        try {
          validateSubmissionFileMetadata({
            filename: payload.originalFilename,
            size: 1,
            kind: payload.kind,
          });
        } catch (error) {
          throw new UploadRequestError(error instanceof Error ? error.message : 'File metadata is invalid.');
        }
        if (payload.kind !== 'supplementary' && extension === 'zip') {
          throw new UploadRequestError('ZIP files are only allowed for supplementary files.');
        }

        const draft = (
          await db`
            SELECT public_id
            FROM submissions
            WHERE id = ${payload.draftId}
              AND status = 'draft'
              AND LOWER(TRIM(author_email)) = LOWER(TRIM(${session.email}))
          `
        ).rows[0];
        if (!draft) throw new UploadRequestError('Draft not found or no longer editable');

        const expectedPathname = buildSubmissionUploadPath({
          publicId: String(draft.public_id),
          kind: payload.kind,
          uploadId: payload.uploadId,
          originalFilename: payload.originalFilename,
        });
        if (pathname !== expectedPathname) {
          throw new UploadRequestError('Upload path does not belong to this draft.');
        }

        return {
          allowedContentTypes: MIME_TYPES_BY_EXTENSION[extension],
          maximumSizeInBytes: MAX_SUBMISSION_FILE_SIZE,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({
            userId: session.id,
            draftId: payload.draftId,
            kind: payload.kind,
          }),
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof UploadRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Unexpected direct-upload authorization error:', error);
    return NextResponse.json({ error: 'Upload authorization failed.' }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'author') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({
      error: 'File storage is not configured. Add BLOB_READ_WRITE_TOKEN to the deployment environment.',
    }, { status: 503 });
  }
  return NextResponse.json({ configured: true });
}
