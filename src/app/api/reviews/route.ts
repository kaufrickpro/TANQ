import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('submission_id');

    if (!submissionId) {
      return NextResponse.json({ error: 'Submission ID is required' }, { status: 400 });
    }

    const submissionIdNumber = Number(submissionId);
    if (!Number.isFinite(submissionIdNumber)) {
      return NextResponse.json({ error: 'Submission ID must be a valid number' }, { status: 400 });
    }

    // Access control: editors can view all reviews; reviewers can only view if assigned to this paper
    if (session.role === 'admin' || session.role === 'editor') {
      const result = await db`SELECT * FROM reviews WHERE submission_id = ${submissionIdNumber}`;
      return NextResponse.json(result.rows);
    }

    if (session.role !== 'reviewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await db`
      SELECT *
      FROM reviews
      WHERE submission_id = ${submissionIdNumber}
        AND TRIM(LOWER(reviewer_email)) = TRIM(LOWER(${session.email}))
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // CSRF Check
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      error: 'This legacy mutable review endpoint is retired. Use /api/case-files/{id}/reviews.',
    }, { status: 410 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
