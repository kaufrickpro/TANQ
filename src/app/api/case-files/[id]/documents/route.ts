import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { getSubmissionAccess, isStaffRole } from '@/lib/case-files/access';
import { uploadDocumentVersion } from '@/lib/case-files/documents';
import { DOCUMENT_KINDS, DOCUMENT_VISIBILITIES, type DocumentKind, type DocumentVisibility } from '@/lib/case-files/types';

const AUTHOR_KINDS = new Set<DocumentKind>([
  'manuscript', 'title_page', 'supplementary', 'copyright_form', 'similarity_report',
  'ethics_approval', 'author_response', 'final_proof', 'other',
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateSameOrigin(request)) return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const submissionId = Number(id);
    const access = await getSubmissionAccess(session, submissionId);
    if (!access.allowed || !access.submission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file');
    const kind = formData.get('kind');
    const requestedVisibility = formData.get('visibility');
    if (!(file instanceof File) || typeof kind !== 'string' || !DOCUMENT_KINDS.includes(kind as DocumentKind)) {
      return NextResponse.json({ error: 'Valid file and document kind are required' }, { status: 400 });
    }
    if (session.role === 'author' && !AUTHOR_KINDS.has(kind as DocumentKind)) {
      return NextResponse.json({ error: 'Authors cannot upload this document type' }, { status: 403 });
    }
    if (session.role === 'reviewer' && kind !== 'reviewer_attachment') {
      return NextResponse.json({ error: 'Reviewers can only upload reviewer attachments' }, { status: 403 });
    }
    if (!isStaffRole(session.role) && session.role !== 'author' && session.role !== 'reviewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const visibility =
      typeof requestedVisibility === 'string' &&
      DOCUMENT_VISIBILITIES.includes(requestedVisibility as DocumentVisibility) &&
      isStaffRole(session.role)
        ? (requestedVisibility as DocumentVisibility)
        : undefined;
    const result = await uploadDocumentVersion({
      submissionId,
      kind: kind as DocumentKind,
      file,
      actor: { id: session.id, name: session.name, role: session.role as any, email: session.email },
      label: typeof formData.get('label') === 'string' ? String(formData.get('label')) : undefined,
      visibility,
      note: typeof formData.get('note') === 'string' ? String(formData.get('note')) : undefined,
      reviewRoundId: formData.get('review_round_id') ? Number(formData.get('review_round_id')) : null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 400 });
  }
}

