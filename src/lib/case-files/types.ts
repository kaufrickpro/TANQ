export const USER_ROLES = ['admin', 'editor', 'secretary', 'reviewer', 'author'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SUBMISSION_STAGES = [
  'draft',
  'submitted',
  'secretary_check',
  'editor_screening',
  'under_review',
  'editor_decision',
  'author_revision',
  'accepted',
  'production',
  'published',
  'rejected',
  'withdrawn',
] as const;
export type SubmissionStage = (typeof SUBMISSION_STAGES)[number];

export const DOCUMENT_VISIBILITIES = ['author', 'reviewer', 'editorial', 'evidence'] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const DOCUMENT_KINDS = [
  'manuscript',
  'title_page',
  'supplementary',
  'copyright_form',
  'similarity_report',
  'ethics_approval',
  'author_response',
  'reviewer_attachment',
  'editor_revision',
  'production_file',
  'final_proof',
  'published_pdf',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface CaseFileActor {
  id: number | null;
  name: string;
  role: UserRole | 'system' | 'auditor';
  email?: string;
}

export interface CaseFileEventInput {
  submissionId: number;
  eventType: string;
  actor: CaseFileActor;
  summary: string;
  fromStage?: string | null;
  toStage?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: Date;
}

