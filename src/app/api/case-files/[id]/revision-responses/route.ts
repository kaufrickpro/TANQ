import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { getRevisionResponse, saveRevisionResponse } from '@/lib/case-files/revisionResponses';

function actorFromSession(session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  return { id: session.id, name: session.name, role: session.role as any, email: session.email };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const reviewRoundId = Number(new URL(request.url).searchParams.get('review_round_id'));
    const response = await getRevisionResponse({
      submissionId: Number(id),
      reviewRoundId,
      actor: actorFromSession(session),
    });
    return NextResponse.json({ response });
  } catch (error: any) {
    const status = error.message === 'Forbidden' || error.message === 'Author role required' ? 403 : 400;
    return NextResponse.json({ error: error.message || 'Unable to retrieve revision response' }, { status });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const response = await saveRevisionResponse({
      submissionId: Number(id),
      reviewRoundId: body.review_round_id,
      responseDocumentVersionId: body.response_document_version_id,
      trackedChangesDocumentVersionId: body.tracked_changes_document_version_id,
      cleanDocumentVersionId: body.clean_document_version_id,
      responseItems: body.response_items,
      action: body.action,
      actor: actorFromSession(session),
    });
    return NextResponse.json(response);
  } catch (error: any) {
    const status = error.message === 'Forbidden' || error.message === 'Author role required' ? 403 : 400;
    return NextResponse.json({ error: error.message || 'Revision response action failed' }, { status });
  }
}
