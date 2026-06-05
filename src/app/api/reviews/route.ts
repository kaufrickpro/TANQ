import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { decryptSession } from '@/lib/session';

async function getSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session_token');
    if (!sessionCookie) return null;
    return decryptSession(sessionCookie.value);
  } catch (e) {
    console.error('Error fetching session:', e);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
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
    if (session.role === 'admin') {
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
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'assign') {
      // Only admins (editors) can assign reviewers
      if (session.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { submission_id, reviewer_name, reviewer_email } = body;

      if (!submission_id || !reviewer_name || !reviewer_email) {
        return NextResponse.json({ error: 'Missing required assignment fields' }, { status: 400 });
      }

      const cleanEmail = reviewer_email.trim().toLowerCase();

      // Insert a new row in the reviews table
      await db`
        INSERT INTO reviews (submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed)
        VALUES (${submission_id}, ${reviewer_name}, ${cleanEmail}, '', 'minor_revision', 3, '')
      `;

      // Change submission status to 'in_review'
      await db`UPDATE submissions SET status = 'in_review' WHERE id = ${submission_id}`;

      return NextResponse.json({ success: true, message: 'Reviewer assigned successfully' });
    }

    if (action === 'submit') {
      // Only reviewers can evaluate manuscripts
      if (session.role !== 'reviewer') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { review_id, submission_id, reviewer_email, comments, recommendation, score } = body;

      if (!comments || !recommendation || score === undefined) {
        return NextResponse.json({ error: 'Comments, recommendation, and score are required' }, { status: 400 });
      }

      const sessionEmail = session.email.trim().toLowerCase();

      // Verify ownership of the review being updated
      if (review_id) {
        const revCheck = await db`SELECT reviewer_email FROM reviews WHERE id = ${Number(review_id)}`;
        if (revCheck.rows.length === 0) {
          return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }
        if (revCheck.rows[0].reviewer_email.trim().toLowerCase() !== sessionEmail) {
          return NextResponse.json({ error: 'Forbidden. You are not assigned to this review.' }, { status: 403 });
        }
      } else {
        if (!submission_id || !reviewer_email) {
          return NextResponse.json({ error: 'Submission ID and Reviewer Email are required when Review ID is not provided' }, { status: 400 });
        }
        if (reviewer_email.trim().toLowerCase() !== sessionEmail) {
          return NextResponse.json({ error: 'Forbidden. Reviewer email mismatch.' }, { status: 403 });
        }
      }

      const currentDate = new Date().toISOString().split('T')[0];
      let subId = submission_id;

      // Update existing row in reviews
      if (review_id) {
        const result = await db`
          UPDATE reviews
          SET comments = ${comments}, recommendation = ${recommendation}, score = ${score}, date_reviewed = ${currentDate}
          WHERE id = ${review_id}
          RETURNING *
        `;

        if (result.rows.length === 0) {
          return NextResponse.json({ error: 'Review not found with the provided ID' }, { status: 404 });
        }

        if (!subId) {
          const revResult = await db`SELECT submission_id FROM reviews WHERE id = ${review_id}`;
          const rev = revResult.rows[0] as { submission_id: number } | undefined;
          if (rev) {
            subId = rev.submission_id;
          }
        }
      } else {
        const result = await db`
          UPDATE reviews
          SET comments = ${comments}, recommendation = ${recommendation}, score = ${score}, date_reviewed = ${currentDate}
          WHERE submission_id = ${submission_id} AND reviewer_email = ${reviewer_email}
          RETURNING *
        `;

        if (result.rows.length === 0) {
          return NextResponse.json({ error: 'Review not found with the provided Submission ID and Reviewer Email' }, { status: 404 });
        }
      }

      if (subId) {
        // Fetch all reviews for this submission
        const allReviewsResult = await db`SELECT * FROM reviews WHERE submission_id = ${subId}`;
        const allReviews = allReviewsResult.rows as Array<{
          id: number;
          submission_id: number;
          reviewer_name: string;
          reviewer_email: string;
          comments: string;
          recommendation: string;
          score: number;
          date_reviewed: string;
        }>;

        // Filter for any remaining pending reviews (where date_reviewed is empty or null)
        const pendingReviews = allReviews.filter(r => !r.date_reviewed || r.date_reviewed.trim() === '');

        // If all reviews are submitted, update the submission's status
        if (pendingReviews.length === 0) {
          let finalStatus = 'accepted';
          const recommendations = allReviews.map(r => r.recommendation);

          if (recommendations.includes('reject')) {
            finalStatus = 'rejected';
          } else if (recommendations.includes('major_revision') || recommendations.includes('minor_revision')) {
            finalStatus = 'revision_requested';
          } else {
            finalStatus = 'accepted';
          }

          await db`UPDATE submissions SET status = ${finalStatus} WHERE id = ${subId}`;
        }
      }

      return NextResponse.json({ success: true, message: 'Review submitted successfully' });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
