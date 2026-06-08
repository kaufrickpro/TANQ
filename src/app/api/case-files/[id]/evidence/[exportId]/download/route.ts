import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { canCreateEvidence } from '@/lib/case-files/access';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; exportId: string }> },
) {
  const session = await getSessionUser();
  if (!session || !canCreateEvidence(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, exportId } = await params;
  const result = await db`
    SELECT *
    FROM evidence_exports
    WHERE id = ${Number(exportId)}
      AND submission_id = ${Number(id)}
      AND status = 'ready'
  `;
  if (result.rows.length === 0) return NextResponse.json({ error: 'Evidence export not found' }, { status: 404 });
  const blob = await get(result.rows[0].blob_url, { access: 'private', useCache: false });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: 'Evidence file not found' }, { status: 404 });
  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="anq-evidence-${id}.zip"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

