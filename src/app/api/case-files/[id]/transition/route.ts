import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { SUBMISSION_STAGES, type SubmissionStage } from '@/lib/case-files/types';
import { transitionSubmission } from '@/lib/case-files/workflow';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateSameOrigin(request)) return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    if (!SUBMISSION_STAGES.includes(body.to_stage as SubmissionStage) || !body.summary?.trim()) {
      return NextResponse.json({ error: 'Valid to_stage and summary are required' }, { status: 400 });
    }
    await transitionSubmission({
      submissionId: Number(id),
      toStage: body.to_stage,
      summary: body.summary.trim(),
      payload: body.payload,
      overrideReason: body.override_reason,
      actor: { id: session.id, name: session.name, role: session.role as any, email: session.email },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Transition failed' }, { status: 400 });
  }
}

