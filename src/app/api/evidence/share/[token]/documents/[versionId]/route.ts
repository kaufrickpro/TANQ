import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { get } from '@/lib/blob';
import db from '@/lib/db';
import { getClientIp } from '@/lib/rateLimit';
import { verifyEvidenceAccessToken } from '@/lib/case-files/evidence';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; versionId: string }> },
) {
  const { token, versionId } = await params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await db`
    SELECT es.id AS share_id, es.submission_id, es.include_identities, v.*, d.kind
    FROM evidence_shares es
    JOIN document_versions v ON v.submission_id = es.submission_id
    JOIN submission_documents d ON d.id = v.document_id
    WHERE es.token_hash = ${tokenHash}
      AND es.revoked_at IS NULL
      AND es.expires_at > NOW()
      AND v.id = ${Number(versionId)}
      AND (es.include_identities OR d.kind NOT IN ('title_page','copyright_form','reviewer_attachment'))
  `;
  if (result.rows.length === 0) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const row = result.rows[0];
  const cookieStore = await cookies();
  if (!verifyEvidenceAccessToken(cookieStore.get(`evidence_share_${row.share_id}`)?.value, Number(row.share_id))) {
    return NextResponse.json({ error: 'OTP verification required' }, { status: 401 });
  }
  const blob = await get(row.blob_url, { access: 'private', useCache: false });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  await db`
    INSERT INTO evidence_share_accesses (share_id, action, ip_address, user_agent)
    VALUES (${row.share_id}, 'downloaded', ${getClientIp(request)}, ${request.headers.get('user-agent') || null})
  `;
  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.blob.contentType || row.content_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

