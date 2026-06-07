import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { canViewDocument, getSubmissionAccess } from '@/lib/case-files/access';
import { streamPrivateVersion } from '@/lib/case-files/documents';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, versionId } = await params;
  const submissionId = Number(id);
  const access = await getSubmissionAccess(session, submissionId);
  if (!access.allowed || !access.submission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await db`
    SELECT v.*, d.kind, d.visibility
    FROM document_versions v
    JOIN submission_documents d ON d.id = v.document_id
    WHERE v.id = ${Number(versionId)}
      AND v.submission_id = ${submissionId}
  `;
  if (result.rows.length === 0) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  const version = result.rows[0] as any;
  if (!canViewDocument(session, access.submission, version, access.assignedReviewer, {
    versionId: Number(version.id),
    reviewRoundId: version.review_round_id == null ? null : Number(version.review_round_id),
    assignedReviewRoundIds: access.assignedReviewRoundIds,
    assignedManuscriptVersionIds: access.assignedManuscriptVersionIds,
    legacyReviewer: access.legacyReviewer,
  })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const blob = await streamPrivateVersion(version);
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.blob.contentType || version.content_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(version.original_filename)}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
