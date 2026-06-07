import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getClientIp } from '@/lib/rateLimit';
import { verifyEvidenceAccessToken } from '@/lib/case-files/evidence';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const shareResult = await db`
    SELECT es.*, s.title, s.public_id, s.current_stage, s.status, s.submitted_at
    FROM evidence_shares es
    JOIN submissions s ON s.id = es.submission_id
    WHERE es.token_hash = ${tokenHash}
      AND es.revoked_at IS NULL
      AND es.expires_at > NOW()
  `;
  if (shareResult.rows.length === 0) return NextResponse.json({ error: 'Share is invalid or expired' }, { status: 404 });
  const share = shareResult.rows[0];
  const cookieStore = await cookies();
  if (!verifyEvidenceAccessToken(cookieStore.get(`evidence_share_${share.id}`)?.value, Number(share.id))) {
    return NextResponse.json({ error: 'OTP verification required' }, { status: 401 });
  }
  const events = await db`
    SELECT sequence_number, event_type, actor_role, from_stage, to_stage, summary, event_hash, created_at
    FROM submission_events
    WHERE submission_id = ${share.submission_id}
    ORDER BY sequence_number ASC
  `;
  const documents = await db`
    SELECT v.id AS version_id, d.kind, d.label, v.version_number, v.original_filename,
           v.content_type, v.size_bytes, v.sha256, v.created_at
    FROM submission_documents d
    JOIN document_versions v ON v.document_id = d.id
    WHERE d.submission_id = ${share.submission_id}
      AND (${share.include_identities} OR d.kind NOT IN ('title_page','copyright_form','reviewer_attachment'))
    ORDER BY d.kind ASC, v.version_number ASC
  `;
  const reports = await db`
    SELECT rp.id, rr.round_number, rp.recommendation, rp.score, rp.comments_to_author,
           rp.submitted_at, rel.released_at,
           CASE WHEN ${share.include_identities} THEN ra.reviewer_name ELSE NULL END AS reviewer_name
    FROM review_reports rp
    JOIN review_rounds rr ON rr.id = rp.review_round_id
    JOIN review_assignments ra ON ra.id = rp.assignment_id
    LEFT JOIN review_report_releases rel ON rel.report_id = rp.id
    WHERE rp.submission_id = ${share.submission_id}
    ORDER BY rr.round_number ASC, rp.submitted_at ASC
  `;
  await db`
    INSERT INTO evidence_share_accesses (share_id, action, ip_address, user_agent)
    VALUES (${share.id}, 'viewed', ${getClientIp(request)}, ${request.headers.get('user-agent') || null})
  `;
  return NextResponse.json({
    submission: {
      title: share.title,
      public_id: share.public_id,
      current_stage: share.current_stage || share.status,
      submitted_at: share.submitted_at,
    },
    events: events.rows,
    documents: documents.rows.map((document: any) => ({
      ...document,
      download_url: `/api/evidence/share/${token}/documents/${document.version_id}`,
    })),
    reports: reports.rows,
    expires_at: share.expires_at,
  });
}

