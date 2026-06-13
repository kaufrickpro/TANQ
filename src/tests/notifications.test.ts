import fs from 'fs';
import path from 'path';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!matched) continue;
    let value = matched[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[matched[1]] = value;
  }
}
if (process.env.TEST_DATABASE_URL) process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import db from '@/lib/db';
import {
  escapeTemplateValue,
  queueNotification,
  renderNotificationSubject,
  renderNotificationTemplate,
} from '@/lib/notifications';
import { resetTestDatabase } from './helpers/db';

describe('notification outbox', () => {
  beforeAll(() => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await db.end();
  });

  it('escapes every interpolated value', () => {
    expect(escapeTemplateValue(`<script>"x" & 'y'</script>`))
      .toBe('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
    expect(renderNotificationTemplate('<p>{{value}}</p>', { value: '<b>unsafe</b>' }))
      .toBe('<p>&lt;b&gt;unsafe&lt;/b&gt;</p>');
    expect(renderNotificationSubject('Hello {{value}}\r\nBcc: hidden', { value: 'A & B' }))
      .toBe('Hello A & B Bcc: hidden');
  });

  it('snapshots rendered output and returns null on a dedupe conflict', async () => {
    const first = await queueNotification({
      templateKey: 'deadline_reminder',
      recipientEmail: 'recipient@example.test',
      variables: {
        recipient_name: '<Recipient>',
        submission_title: 'A & B',
        stage: 'under_review',
        deadline: '2026-06-30',
      },
      dedupeKey: 'deadline-reminder:test',
    });
    const duplicate = await queueNotification({
      templateKey: 'deadline_reminder',
      recipientEmail: 'recipient@example.test',
      variables: {
        recipient_name: 'Changed',
        submission_title: 'Changed',
        stage: 'under_review',
        deadline: '2026-06-30',
      },
      dedupeKey: 'deadline-reminder:test',
    });

    expect(first).not.toBeNull();
    expect(first?.rendered_subject).toContain('A & B');
    expect(first?.rendered_html).toContain('&lt;Recipient&gt;');
    expect(duplicate).toBeNull();
    expect((await db`SELECT COUNT(*)::integer AS count FROM notification_outbox`).rows[0].count).toBe(1);
  });

  it('uses an optional transaction client', async () => {
    const client = await db.connect();
    try {
      await client.sql`BEGIN`;
      const queued = await queueNotification({
        templateKey: 'discussion_message',
        recipientEmail: 'participant@example.test',
        variables: {
          discussion_id: 42,
          discussion_subject: 'Methods',
          discussion_action: 'New reply',
        },
      }, client);
      expect(queued).not.toBeNull();
      await client.sql`ROLLBACK`;
    } finally {
      client.release();
    }

    expect((await db`SELECT COUNT(*)::integer AS count FROM notification_outbox`).rows[0].count).toBe(0);
  });

  it('seeds shared configuration, creates partial unique indexes, and remains cleanup-compatible', async () => {
    const indexes = await db`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('idx_assignments_invitation_token_hash', 'idx_notification_outbox_dedupe_key')
      ORDER BY indexname
    `;
    expect(indexes.rows).toHaveLength(2);
    for (const index of indexes.rows) {
      expect(index.indexdef).toContain('UNIQUE INDEX');
      expect(index.indexdef).toMatch(/WHERE \(.+ IS NOT NULL\)/);
    }

    const templates = await db`
      SELECT template_key
      FROM email_templates
      WHERE template_key IN (
        'deadline_reminder', 'discussion_message', 'discussion_closed', 'reviewer_invitation_response'
      )
      ORDER BY template_key
    `;
    expect(templates.rows.map(row => row.template_key)).toEqual([
      'deadline_reminder',
      'discussion_closed',
      'discussion_message',
      'reviewer_invitation_response',
    ]);
    expect((await db`
      SELECT variables
      FROM email_templates
      WHERE template_key = 'reviewer_invitation_response'
    `).rows[0].variables).toEqual([
      'editor_name',
      'reviewer_name',
      'submission_title',
      'response',
    ]);
    expect((await db`SELECT COUNT(*)::integer AS count FROM deadline_configs`).rows[0].count).toBe(6);
    expect((await db`
      SELECT auto_escalation_action
      FROM deadline_configs
      WHERE stage = 'under_review' AND role = 'reviewer'
    `).rows[0].auto_escalation_action).toBe('auto_uninvite_reviewer');

    const user = await db`
      INSERT INTO users (username, password_hash, name, email, role)
      VALUES ('notification_cleanup', 'hash', 'Cleanup User', 'cleanup@example.test', 'author')
      RETURNING id
    `;
    const submission = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email)
      VALUES ('Cleanup', 'Abstract', 'test', 'Cleanup User', 'cleanup@example.test')
      RETURNING id
    `;
    const discussion = await db`
      INSERT INTO discussions (
        submission_id, stage, subject, visibility, created_by_user_id, created_by_name
      )
      VALUES (
        ${submission.rows[0].id}, 'submitted', 'Cleanup', 'author_editor',
        ${user.rows[0].id}, 'Cleanup User'
      )
      RETURNING id
    `;
    await db`
      INSERT INTO discussion_messages (discussion_id, sender_user_id, sender_name, body)
      VALUES (${discussion.rows[0].id}, ${user.rows[0].id}, 'Cleanup User', 'Cleanup message')
    `;

    await resetTestDatabase();
    expect((await db`SELECT COUNT(*)::integer AS count FROM discussions`).rows[0].count).toBe(0);
    expect((await db`SELECT COUNT(*)::integer AS count FROM discussion_messages`).rows[0].count).toBe(0);
  });
});
