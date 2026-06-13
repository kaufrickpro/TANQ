import db from '@/lib/db';
import { isAuthorizedCronRequest } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CLAIM_LIMIT = 25;
const SEND_CONCURRENCY = 5;
const MAX_ATTEMPTS = 3;
const STALE_LOCK_MINUTES = 15;
const RESEND_TIMEOUT_MS = 10_000;

interface ClaimedNotification {
  id: string | number;
  recipient_email: string;
  rendered_subject: string | null;
  rendered_html: string | null;
  attempts: number;
}

async function claimNotifications(): Promise<ClaimedNotification[]> {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const claimed = await client.sql<ClaimedNotification>`
      WITH claimable AS (
        SELECT id
        FROM notification_outbox
        WHERE attempts < ${MAX_ATTEMPTS}
          AND available_at <= NOW()
          AND (
            status IN ('pending', 'failed')
            OR (
              status = 'processing'
              AND locked_at < NOW() - (${STALE_LOCK_MINUTES} * INTERVAL '1 minute')
            )
          )
        ORDER BY available_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${CLAIM_LIMIT}
      )
      UPDATE notification_outbox AS outbox
      SET status = 'processing',
          attempts = outbox.attempts + 1,
          locked_at = NOW(),
          last_error = NULL
      FROM claimable
      WHERE outbox.id = claimable.id
      RETURNING outbox.id, outbox.recipient_email, outbox.rendered_subject,
                outbox.rendered_html, outbox.attempts
    `;
    await client.sql`COMMIT`;
    return claimed.rows;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}

async function markSent(id: ClaimedNotification['id'], providerMessageId: string | null) {
  await db`
    UPDATE notification_outbox
    SET status = 'sent',
        provider_message_id = ${providerMessageId},
        sent_at = NOW(),
        locked_at = NULL,
        last_error = NULL
    WHERE id = ${id}
      AND status = 'processing'
  `;
}

async function markFailed(id: ClaimedNotification['id'], error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db`
    UPDATE notification_outbox
    SET status = 'failed',
        locked_at = NULL,
        last_error = ${message.slice(0, 2000)},
        available_at = CASE
          WHEN attempts >= ${MAX_ATTEMPTS} THEN available_at
          ELSE NOW() + (LEAST(POWER(2, attempts - 1), 30)::integer * INTERVAL '1 minute')
        END
    WHERE id = ${id}
      AND status = 'processing'
  `;
}

async function sendNotification(notification: ClaimedNotification): Promise<'sent' | 'failed'> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
    if (!notification.rendered_subject || !notification.rendered_html) {
      throw new Error('Notification does not have a rendered subject and HTML snapshot');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Idempotency-Key': `notification-outbox/${notification.id}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'ANQ <noreply@anq.aftap.org>',
        to: notification.recipient_email,
        subject: notification.rendered_subject,
        html: notification.rendered_html,
      }),
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      throw new Error(`Resend API error ${response.status}: ${details}`);
    }

    const result = await response.json() as { id?: string };
    await markSent(notification.id, result.id ?? null);
    return 'sent';
  } catch (error) {
    await markFailed(notification.id, error);
    return 'failed';
  }
}

async function processClaimedNotifications(notifications: ClaimedNotification[]) {
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < notifications.length; index += SEND_CONCURRENCY) {
    const batch = notifications.slice(index, index + SEND_CONCURRENCY);
    const results = await Promise.all(batch.map(sendNotification));
    sent += results.filter(result => result === 'sent').length;
    failed += results.filter(result => result === 'failed').length;
  }

  return { sent, failed };
}

async function processOutbox(request: Request) {
  if (!process.env.CRON_SECRET || !isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const claimed = await claimNotifications();
  const result = await processClaimedNotifications(claimed);
  return Response.json({ claimed: claimed.length, ...result });
}

export async function GET(request: Request) {
  return processOutbox(request);
}

export async function POST(request: Request) {
  return processOutbox(request);
}
