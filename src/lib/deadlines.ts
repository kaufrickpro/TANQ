import 'server-only';
import db from '@/lib/db';
import { appendSubmissionEvent } from '@/lib/case-files/audit';
import { queueNotification } from '@/lib/notifications';

const SYSTEM_ACTOR = { id: null, name: 'TANQ Deadline Automation', role: 'system' as const };

const STAGE_ROLES: Record<string, string> = {
  submitted: 'secretary',
  secretary_check: 'secretary',
  editor_screening: 'editor',
  under_review: 'reviewer',
  editor_decision: 'editor',
  author_revision: 'author',
  accepted: 'editor',
  production: 'editor',
};

function stageRole(stage: string): string | null {
  return STAGE_ROLES[stage] ?? null;
}

function reviewerReminderVariables(row: any) {
  return {
    reviewer_name: row.reviewer_name,
    submission_title: row.title,
    review_deadline: row.review_deadline ? new Date(row.review_deadline).toISOString() : null,
  };
}

export async function setSubmissionDeadline(
  client: any,
  submissionId: number,
  stage: string,
): Promise<Date | null> {
  const role = stageRole(stage);
  const config = role
    ? await client.sql`
        SELECT default_days
        FROM deadline_configs
        WHERE stage = ${stage} AND role = ${role}
        LIMIT 1
      `
    : { rows: [] };
  const defaultDays = config.rows[0]?.default_days == null ? null : Number(config.rows[0].default_days);
  const deadline = defaultDays == null ? null : new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000);
  await client.sql`
    UPDATE submissions
    SET current_stage_entered_at = NOW(),
        current_stage_deadline = ${deadline?.toISOString() ?? null}
    WHERE id = ${submissionId}
  `;
  return deadline;
}

export async function getDefaultDeadline(
  client: any,
  stage: string,
  role: string,
  from = new Date(),
): Promise<Date | null> {
  const config = await client.sql`
    SELECT default_days
    FROM deadline_configs
    WHERE stage = ${stage} AND role = ${role}
    LIMIT 1
  `;
  if (config.rows[0]?.default_days == null) return null;
  return new Date(from.getTime() + Number(config.rows[0].default_days) * 24 * 60 * 60 * 1000);
}

async function recordReminderEvent(client: any, input: {
  submissionId: number;
  eventType: string;
  summary: string;
  payload: Record<string, unknown>;
}) {
  await appendSubmissionEvent(client, {
    submissionId: input.submissionId,
    eventType: input.eventType,
    actor: SYSTEM_ACTOR,
    summary: input.summary,
    payload: input.payload,
  });
}

async function processReviewerReminders(now: Date) {
  const result = await db`
    SELECT ra.id AS assignment_id, ra.submission_id, ra.reviewer_name, ra.reviewer_email,
           ra.review_deadline, ra.reminder_count, s.title
    FROM review_assignments ra
    JOIN submissions s ON s.id = ra.submission_id
    WHERE ra.status IN ('assigned', 'accepted')
      AND ra.review_deadline IS NOT NULL
  `;
  let queued = 0;
  for (const row of result.rows) {
    const config = await db`
      SELECT reminder_days_before
      FROM deadline_configs
      WHERE stage = 'under_review' AND role = 'reviewer'
      LIMIT 1
    `;
    const thresholds = (config.rows[0]?.reminder_days_before ?? []) as number[];
    const remainingMs = new Date(row.review_deadline).getTime() - now.getTime();
    if (remainingMs <= 0) {
      const deadlineKey = new Date(row.review_deadline).toISOString();
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        const locked = await client.sql`
          SELECT id
          FROM review_assignments
          WHERE id = ${row.assignment_id}
            AND status IN ('assigned', 'accepted')
          FOR UPDATE
        `;
        if (locked.rows.length > 0) {
          const dedupeKey = `reviewer-overdue:${row.assignment_id}:${deadlineKey}`;
          const notification = await queueNotification({
            templateKey: 'reviewer_urgent_reminder',
            recipientEmail: row.reviewer_email,
            submissionId: Number(row.submission_id),
            dedupeKey,
            variables: reviewerReminderVariables(row),
          }, client);
          if (notification) {
            await client.sql`
              UPDATE review_assignments
              SET reminder_count = reminder_count + 1, last_reminder_at = NOW()
              WHERE id = ${row.assignment_id}
            `;
            await recordReminderEvent(client, {
              submissionId: Number(row.submission_id),
              eventType: 'reviewer_deadline_overdue_reminder_queued',
              summary: 'An automated overdue reviewer deadline reminder was queued.',
              payload: { assignmentId: Number(row.assignment_id), dedupeKey },
            });
            queued += 1;
          }
        }
        await client.sql`COMMIT`;
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }
      continue;
    }
    for (const threshold of thresholds.map(Number).sort((a, b) => a - b)) {
      if (remainingMs > threshold * 24 * 60 * 60 * 1000) continue;
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        const locked = await client.sql`
          SELECT *
          FROM review_assignments
          WHERE id = ${row.assignment_id}
            AND status IN ('assigned', 'accepted')
          FOR UPDATE
        `;
        if (locked.rows.length === 0) {
          await client.sql`ROLLBACK`;
          break;
        }
        const deadlineKey = new Date(row.review_deadline).toISOString();
        const dedupeKey = `reviewer-deadline:${row.assignment_id}:${deadlineKey}:${threshold}`;
        const notification = await queueNotification({
          templateKey: threshold <= 1 ? 'reviewer_urgent_reminder' : 'reviewer_reminder',
          recipientEmail: row.reviewer_email,
          submissionId: Number(row.submission_id),
          dedupeKey,
          variables: reviewerReminderVariables(row),
        }, client);
        if (notification) {
          await client.sql`
            UPDATE review_assignments
            SET reminder_count = reminder_count + 1, last_reminder_at = NOW()
            WHERE id = ${row.assignment_id}
          `;
          await recordReminderEvent(client, {
            submissionId: Number(row.submission_id),
            eventType: 'reviewer_deadline_reminder_queued',
            summary: `An automated ${threshold}-day reviewer deadline reminder was queued.`,
            payload: { assignmentId: Number(row.assignment_id), thresholdDays: threshold, dedupeKey },
          });
          queued += 1;
        }
        await client.sql`COMMIT`;
      } catch (error) {
        await client.sql`ROLLBACK`;
        throw error;
      } finally {
        client.release();
      }
      break;
    }
  }
  return queued;
}

async function processSubmissionReminders(now: Date) {
  const result = await db`
    SELECT s.id AS submission_id, s.title, s.author_name, s.author_email, s.current_stage, s.status,
           s.current_stage_deadline, dc.role, dc.reminder_days_before
    FROM submissions s
    JOIN deadline_configs dc ON dc.stage = COALESCE(s.current_stage, s.status)
    WHERE s.current_stage_deadline IS NOT NULL
      AND s.current_stage_deadline > ${now.toISOString()}
      AND COALESCE(s.current_stage, s.status) NOT IN ('draft', 'under_review', 'published', 'rejected', 'withdrawn')
  `;
  let queued = 0;
  for (const row of result.rows) {
    const remainingMs = new Date(row.current_stage_deadline).getTime() - now.getTime();
    const thresholds = (row.reminder_days_before ?? []) as number[];
    const recipients = row.role === 'author'
      ? [{ name: row.author_name, email: row.author_email }]
      : (await db`
          SELECT name, email
          FROM users
          WHERE role = ${row.role} AND is_disabled = FALSE AND is_verified = TRUE
        `).rows;
    for (const threshold of thresholds.map(Number).sort((a, b) => a - b)) {
      if (remainingMs > threshold * 24 * 60 * 60 * 1000) continue;
      for (const recipient of recipients) {
        const dedupeKey =
          `submission-deadline:${row.submission_id}:${row.current_stage}:${new Date(row.current_stage_deadline).toISOString()}:${threshold}:${recipient.email}`;
        const client = await db.connect();
        try {
          await client.sql`BEGIN`;
          const notification = await queueNotification({
            templateKey: 'deadline_reminder',
            recipientEmail: recipient.email,
            submissionId: Number(row.submission_id),
            dedupeKey,
            variables: {
              recipient_name: recipient.name,
              submission_title: row.title,
              stage: row.current_stage || row.status,
              deadline: new Date(row.current_stage_deadline).toISOString(),
            },
          }, client);
          if (notification) {
            await recordReminderEvent(client, {
              submissionId: Number(row.submission_id),
              eventType: 'submission_deadline_reminder_queued',
              summary: `An automated ${threshold}-day ${row.role} deadline reminder was queued.`,
              payload: { role: row.role, thresholdDays: threshold, dedupeKey },
            });
            queued += 1;
          }
          await client.sql`COMMIT`;
        } catch (error) {
          await client.sql`ROLLBACK`;
          throw error;
        } finally {
          client.release();
        }
      }
      break;
    }
  }
  return queued;
}

export async function processDeadlineReminders(now = new Date()) {
  const [reviewerReminders, submissionReminders] = await Promise.all([
    processReviewerReminders(now),
    processSubmissionReminders(now),
  ]);
  return { reviewerReminders, submissionReminders };
}
