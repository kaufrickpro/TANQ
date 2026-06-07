import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getCaseFile } from '@/lib/case-files/queries';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const caseFile = await getCaseFile(session, Number(id));
  if (!caseFile) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
  return NextResponse.json(caseFile);
}

