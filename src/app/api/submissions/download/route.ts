import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const submissionIdStr = searchParams.get('submission_id');

    if (!submissionIdStr) {
      return NextResponse.json({ error: 'submission_id query parameter is required' }, { status: 400 });
    }

    const submissionId = Number(submissionIdStr);
    if (isNaN(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission_id' }, { status: 400 });
    }

    // Retrieve the submission
    const submissionResult = await db`
      SELECT id, title, author_email, file_path 
      FROM submissions 
      WHERE id = ${submissionId}
    `;

    if (submissionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const submission = submissionResult.rows[0];

    // Authorize requester
    let authorized = false;

    // 1. Check if user is Admin
    if (session.role === 'admin' || session.role === 'editor' || session.role === 'secretary') {
      authorized = true;
    }

    // 2. Check if user is Author
    if (!authorized && session.role === 'author') {
      if (session.email.trim().toLowerCase() === submission.author_email.trim().toLowerCase()) {
        authorized = true;
      }
    }

    // 3. Check if user is Assigned Reviewer
    if (!authorized && session.role === 'reviewer') {
      const reviewerResult = await db`
        SELECT id FROM reviews
        WHERE submission_id = ${submission.id}
          AND TRIM(LOWER(reviewer_email)) = TRIM(LOWER(${session.email}))
      `;
      if (reviewerResult.rows.length > 0) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden. You do not have permission to download this manuscript.' }, { status: 403 });
    }

    const filePath = submission.file_path;
    const fileName = filePath.split('/').pop() || 'manuscript';

    // Retrieve private blob content and stream it
    const result = await get(filePath, {
      access: 'private',
    });

    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: 'Manuscript file not found or unavailable.' }, { status: 404 });
    }

    const { stream, blob } = result;

    return new NextResponse(stream, {
      headers: {
        'Content-Type': blob.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store, max-age=0'
      },
    });
  } catch (error: any) {
    console.error('Error in manuscript download route:', error);
    return NextResponse.json({ error: 'File download failed or not found.' }, { status: 404 });
  }
}
