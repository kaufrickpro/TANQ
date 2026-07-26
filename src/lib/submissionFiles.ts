import type { DocumentKind } from '@/lib/case-files/types';

export const MAX_SUBMISSION_FILE_SIZE = 20 * 1024 * 1024;

export const INITIAL_DOCUMENT_KINDS = [
  'manuscript',
  'title_page',
  'supplementary',
  'copyright_form',
  'similarity_report',
  'ethics_approval',
] as const satisfies readonly DocumentKind[];

export type InitialDocumentKind = (typeof INITIAL_DOCUMENT_KINDS)[number];

export const ALLOWED_SUBMISSION_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'zip']);

export const ALLOWED_SUBMISSION_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
] as const;

export function isInitialDocumentKind(value: unknown): value is InitialDocumentKind {
  return typeof value === 'string' && INITIAL_DOCUMENT_KINDS.includes(value as InitialDocumentKind);
}

export function safeSubmissionFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function submissionFileExtension(filename: string) {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function validateSubmissionFileMetadata(input: {
  filename: string;
  contentType?: string | null;
  size: number;
  kind: DocumentKind;
}) {
  const extension = submissionFileExtension(input.filename);
  if (!ALLOWED_SUBMISSION_EXTENSIONS.has(extension)) {
    throw new Error('Only PDF, DOC, DOCX, and ZIP files are allowed.');
  }
  if (
    input.contentType &&
    !ALLOWED_SUBMISSION_MIME_TYPES.includes(input.contentType as (typeof ALLOWED_SUBMISSION_MIME_TYPES)[number])
  ) {
    throw new Error('File MIME type is not allowed.');
  }
  if (input.kind === 'similarity_report' && extension !== 'pdf') {
    throw new Error('Similarity report must be a PDF.');
  }
  if (input.size <= 0) throw new Error('File is empty.');
  if (input.size > MAX_SUBMISSION_FILE_SIZE) throw new Error('File size must be less than 20MB.');
}
