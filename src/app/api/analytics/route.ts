import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'editor'].includes(session.role) || !session.is_verified) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [summary, pipeline, monthly, turnaround, reviewers, outbox] = await Promise.all([
      db`
        SELECT
          COUNT(*) FILTER (WHERE status != 'draft')::integer AS total_submissions,
          COUNT(*) FILTER (
            WHERE COALESCE(current_stage, status) NOT IN ('draft','published','rejected','withdrawn')
          )::integer AS active_submissions,
          COUNT(*) FILTER (WHERE COALESCE(current_stage, status) = 'accepted')::integer AS accepted,
          COUNT(*) FILTER (WHERE COALESCE(current_stage, status) = 'published')::integer AS published,
          COUNT(*) FILTER (WHERE COALESCE(current_stage, status) = 'rejected')::integer AS rejected,
          COUNT(*) FILTER (WHERE COALESCE(current_stage, status) = 'withdrawn')::integer AS withdrawn
        FROM submissions
      `,
      db`
        SELECT COALESCE(current_stage, status) AS stage, COUNT(*)::integer AS count
        FROM submissions
        WHERE status != 'draft'
        GROUP BY COALESCE(current_stage, status)
        ORDER BY count DESC, stage ASC
      `,
      db`
        SELECT TO_CHAR(DATE_TRUNC('month', submitted_at), 'YYYY-MM') AS month,
               COUNT(*)::integer AS submissions
        FROM submissions
        WHERE submitted_at IS NOT NULL
          AND submitted_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', submitted_at)
        ORDER BY DATE_TRUNC('month', submitted_at) ASC
      `,
      db`
        SELECT
          (
            SELECT ROUND(AVG(EXTRACT(EPOCH FROM (rp.submitted_at - ra.assigned_at)) / 86400)::numeric, 1)
            FROM review_reports rp
            JOIN review_assignments ra ON ra.id = rp.assignment_id
          ) AS avg_reviewer_days,
          (
            SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_decision.created_at - s.submitted_at)) / 86400)::numeric, 1)
            FROM submissions s
            JOIN LATERAL (
              SELECT MIN(ed.created_at) AS created_at
              FROM editorial_decisions ed
              WHERE ed.submission_id = s.id
            ) first_decision ON first_decision.created_at IS NOT NULL
            WHERE s.submitted_at IS NOT NULL
          ) AS avg_first_decision_days,
          (
            SELECT ROUND(AVG(EXTRACT(EPOCH FROM (final_decision.created_at - s.submitted_at)) / 86400)::numeric, 1)
            FROM submissions s
            JOIN LATERAL (
              SELECT MAX(ed.created_at) AS created_at
              FROM editorial_decisions ed
              WHERE ed.submission_id = s.id AND ed.decision IN ('accept','reject','withdraw')
            ) final_decision ON final_decision.created_at IS NOT NULL
            WHERE s.submitted_at IS NOT NULL
          ) AS avg_final_decision_days
      `,
      db`
        SELECT ra.reviewer_name, ra.reviewer_email,
               COUNT(*)::integer AS assignments,
               COUNT(rp.id)::integer AS completed,
               ROUND(AVG(EXTRACT(EPOCH FROM (rp.submitted_at - ra.assigned_at)) / 86400)::numeric, 1)
                 AS avg_turnaround_days
        FROM review_assignments ra
        LEFT JOIN review_reports rp ON rp.assignment_id = ra.id
        GROUP BY ra.reviewer_name, ra.reviewer_email
        ORDER BY completed DESC, avg_turnaround_days ASC NULLS LAST
        LIMIT 8
      `,
      db`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::integer AS processing,
          COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed,
          COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '7 days')::integer AS sent_last_7_days
        FROM notification_outbox
      `,
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: summary.rows[0],
      pipeline: pipeline.rows,
      monthly: monthly.rows,
      turnaround: turnaround.rows[0],
      reviewers: reviewers.rows,
      outbox: outbox.rows[0],
    });
  } catch (error) {
    console.error('Analytics query failed:', error);
    return NextResponse.json({ error: 'Unable to load analytics' }, { status: 500 });
  }
}
