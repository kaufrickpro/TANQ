import crypto, { randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getClientIp } from '@/lib/rateLimit';
import { createEvidenceAccessToken } from '@/lib/case-files/evidence';
import { sendEvidenceOtpEmail } from '@/lib/email-evidence';

async function getShare(rawToken: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const result = await db`
    SELECT es.*, s.title
    FROM evidence_shares es
    JOIN submissions s ON s.id = es.submission_id
    WHERE es.token_hash = ${tokenHash}
      AND es.revoked_at IS NULL
      AND es.expires_at > NOW()
  `;
  return result.rows[0] ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const share = await getShare(token);
    if (!share) return NextResponse.json({ error: 'Share is invalid or expired' }, { status: 404 });
    const body = await request.json();
    const ip = getClientIp(request);

    if (body.action === 'request') {
      const recent = await db`
        SELECT COUNT(*)::integer AS count
        FROM evidence_share_otps
        WHERE share_id = ${share.id}
          AND created_at > NOW() - INTERVAL '1 hour'
      `;
      if (Number(recent.rows[0].count) >= 5) {
        return NextResponse.json({ error: 'Too many OTP requests. Try again later.' }, { status: 429 });
      }
      const otp = randomInt(100000, 999999).toString();
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      await db`
        INSERT INTO evidence_share_otps (share_id, otp_hash, expires_at)
        VALUES (${share.id}, ${otpHash}, NOW() + INTERVAL '15 minutes')
      `;
      await db`
        INSERT INTO evidence_share_accesses (share_id, action, ip_address, user_agent)
        VALUES (${share.id}, 'otp_requested', ${ip}, ${request.headers.get('user-agent') || null})
      `;
      await sendEvidenceOtpEmail(share.auditor_email, otp, share.title);
      return NextResponse.json({ success: true, auditor_email_hint: share.auditor_email.replace(/(^.).*(@.*$)/, '$1***$2') });
    }

    if (body.action === 'verify') {
      const denied = await db`
        SELECT COUNT(*)::integer AS count
        FROM evidence_share_accesses
        WHERE share_id = ${share.id}
          AND action = 'denied'
          AND ip_address = ${ip}
          AND created_at > NOW() - INTERVAL '1 hour'
      `;
      if (Number(denied.rows[0].count) >= 10) {
        return NextResponse.json({ error: 'Too many failed verification attempts. Try again later.' }, { status: 429 });
      }
      const otpHash = crypto.createHash('sha256').update(String(body.otp || '')).digest('hex');
      const otpResult = await db`
        UPDATE evidence_share_otps
        SET consumed_at = NOW()
        WHERE id = (
          SELECT id
          FROM evidence_share_otps
          WHERE share_id = ${share.id}
            AND otp_hash = ${otpHash}
            AND consumed_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1
        )
        RETURNING id
      `;
      if (otpResult.rows.length === 0) {
        await db`
          INSERT INTO evidence_share_accesses (share_id, action, ip_address, user_agent)
          VALUES (${share.id}, 'denied', ${ip}, ${request.headers.get('user-agent') || null})
        `;
        return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
      }
      const expiresAt = new Date(Math.min(new Date(share.expires_at).getTime(), Date.now() + 12 * 60 * 60 * 1000));
      const accessToken = createEvidenceAccessToken(Number(share.id), expiresAt);
      const cookieStore = await cookies();
      cookieStore.set(`evidence_share_${share.id}`, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: expiresAt,
        path: `/api/evidence/share/${token}`,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'OTP action failed' }, { status: 400 });
  }
}
