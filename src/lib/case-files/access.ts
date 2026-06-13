import 'server-only';
import db from '@/lib/db';
import type { AuthUser } from '@/lib/session';
import type { DocumentVisibility, UserRole } from './types';

export function isStaffRole(role: string): role is Extract<UserRole, 'admin' | 'editor' | 'secretary'> {
  return role === 'admin' || role === 'editor' || role === 'secretary';
}

export function canManageEditorial(role: string): boolean {
  return role === 'admin' || role === 'editor';
}

export function canManageSystem(role: string): boolean {
  return role === 'admin';
}

export function canCreateEvidence(role: string): boolean {
  return role === 'admin' || role === 'editor';
}

export async function getSubmissionAccess(
  user: AuthUser,
  submissionId: number,
): Promise<{
  allowed: boolean;
  submission: any | null;
  assignedReviewer: boolean;
  assignedReviewRoundIds: number[];
  assignedManuscriptVersionIds: number[];
  legacyReviewer: boolean;
}> {
  const result = await db`
    SELECT *
    FROM submissions
    WHERE id = ${submissionId}
  `;
  const submission = result.rows[0] ?? null;
  const denied = {
    allowed: false,
    submission: null,
    assignedReviewer: false,
    assignedReviewRoundIds: [],
    assignedManuscriptVersionIds: [],
    legacyReviewer: false,
  };
  if (!submission) return denied;

  if (isStaffRole(user.role)) {
    return { ...denied, allowed: true, submission };
  }

  if (
    user.role === 'author' &&
    user.email.trim().toLowerCase() === submission.author_email.trim().toLowerCase()
  ) {
    return { ...denied, allowed: true, submission };
  }

  if (user.role === 'reviewer') {
    const assignments = await db`
      SELECT ra.review_round_id, rr.manuscript_version_id
      FROM review_assignments ra
      JOIN review_rounds rr ON rr.id = ra.review_round_id
      WHERE ra.submission_id = ${submissionId}
        AND LOWER(TRIM(ra.reviewer_email)) = LOWER(TRIM(${user.email}))
        AND ra.status IN ('assigned', 'accepted', 'submitted')
    `;
    if (assignments.rows.length > 0) {
      return {
        ...denied,
        allowed: true,
        submission,
        assignedReviewer: true,
        assignedReviewRoundIds: assignments.rows.map(row => Number(row.review_round_id)),
        assignedManuscriptVersionIds: assignments.rows.map(row => Number(row.manuscript_version_id)),
      };
    }

    // Compatibility during rollout for legacy reviewer assignments.
    const legacy = await db`
      SELECT id
      FROM reviews
      WHERE submission_id = ${submissionId}
        AND LOWER(TRIM(reviewer_email)) = LOWER(TRIM(${user.email}))
      LIMIT 1
    `;
    return {
      ...denied,
      allowed: legacy.rows.length > 0,
      submission,
      assignedReviewer: legacy.rows.length > 0,
      legacyReviewer: legacy.rows.length > 0,
    };
  }

  return { ...denied, submission };
}

export function canViewDocument(
  user: AuthUser,
  submission: any,
  document: { kind: string; visibility: DocumentVisibility },
  assignedReviewer: boolean,
  reviewerScope?: {
    versionId?: number;
    reviewRoundId?: number | null;
    assignedReviewRoundIds: number[];
    assignedManuscriptVersionIds: number[];
    legacyReviewer: boolean;
  },
): boolean {
  if (user.role === 'admin' || user.role === 'editor') return true;
  if (user.role === 'secretary') return document.visibility !== 'evidence';

  if (user.role === 'author') {
    const ownsSubmission =
      user.email.trim().toLowerCase() === submission.author_email.trim().toLowerCase();
    if (!ownsSubmission) return false;
    return document.visibility === 'author' || document.kind === 'manuscript';
  }

  if (user.role === 'reviewer' && assignedReviewer) {
    if (document.visibility !== 'reviewer' || document.kind === 'title_page') return false;
    if (reviewerScope?.legacyReviewer) return true;
    if (document.kind === 'manuscript') {
      return !!reviewerScope?.versionId &&
        reviewerScope.assignedManuscriptVersionIds.includes(reviewerScope.versionId);
    }
    return (
      reviewerScope?.reviewRoundId == null ||
      reviewerScope.assignedReviewRoundIds.includes(reviewerScope.reviewRoundId)
    );
  }

  return false;
}
