import crypto from 'crypto';
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getClientIp } from '@/lib/rateLimit';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { getReviewerInvitation, processInvitationResponse } from '@/lib/case-files/reviews';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
};

async function checkResponseRateLimit(request: Request, token: string) {
  const windowMs = 60 * 60 * 1000;
  const windowIndex = Math.floor(Date.now() / windowMs);
  const ip = getClientIp(request);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
  const key = `reviewer_invite_response:${ip}:${tokenHash}:${windowIndex}`;
  const expiresAt = new Date(Date.now() + windowMs);
  const result = await db`
    INSERT INTO auth_rate_limits (key, count, expires_at)
    VALUES (${key}, 1, ${expiresAt.toISOString()})
    ON CONFLICT (key) DO UPDATE SET count = auth_rate_limits.count + 1
    RETURNING count
  `;
  return Number(result.rows[0].count) <= 20;
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const invitation = await getReviewerInvitation(token);
    return NextResponse.json({ invitation }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Invitation is unavailable' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403, headers: NO_STORE_HEADERS });
    }
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token || !(await checkResponseRateLimit(request, token))) {
      return NextResponse.json(
        { error: token ? 'Too many invitation response attempts' : 'Invitation token is required' },
        { status: token ? 429 : 400, headers: NO_STORE_HEADERS },
      );
    }
    const result = await processInvitationResponse({
      token,
      action: body.action,
      coiDeclaration: body.coi_declaration,
      declineReason: body.decline_reason,
    });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Invitation response failed' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
