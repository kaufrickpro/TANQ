import db from '@/lib/db';

export async function resetTestDatabase() {
  await db.query(`
    TRUNCATE TABLE
      evidence_share_accesses,
      evidence_share_otps,
      evidence_shares,
      evidence_exports,
      integrity_checks,
      notification_outbox,
      review_report_releases,
      review_addenda,
      review_reports,
      editorial_decisions,
      review_assignments,
      review_rounds,
      document_versions,
      submission_events,
      submission_documents,
      articles,
      withdrawal_requests,
      reviews,
      submissions,
      auth_sessions,
      auth_rate_limits,
      invitations,
      users
    RESTART IDENTITY CASCADE
  `);
}
