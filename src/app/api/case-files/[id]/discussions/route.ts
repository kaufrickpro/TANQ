import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import {
  addDiscussionMessage,
  closeDiscussion,
  createDiscussion,
  listDiscussions,
} from '@/lib/case-files/discussions';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const discussions = await listDiscussions({ submissionId: Number(id), viewer: session });
    return NextResponse.json({ discussions });
  } catch (error: any) {
    const status = error.message === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: error.message || 'Unable to retrieve discussions' }, { status });
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
    const submissionId = Number(id);
    const body = await request.json();

    if (body.action === 'create') {
      const result = await createDiscussion({
        submissionId,
        subject: body.subject,
        visibility: body.visibility,
        body: body.body,
        attachmentVersionId: body.attachment_version_id,
        actor: session,
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (body.action === 'message') {
      const result = await addDiscussionMessage({
        submissionId,
        discussionId: body.discussion_id,
        body: body.body,
        attachmentVersionId: body.attachment_version_id,
        actor: session,
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (body.action === 'close') {
      const result = await closeDiscussion({
        submissionId,
        discussionId: body.discussion_id,
        actor: session,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    const status = error.message === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: error.message || 'Discussion action failed' }, { status });
  }
}
