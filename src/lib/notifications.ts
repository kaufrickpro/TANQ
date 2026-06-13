import 'server-only';
import type { QueryResultRow, VercelClientBase } from '@vercel/postgres';
import db from '@/lib/db';

export interface QueueNotificationInput {
  templateKey: string;
  recipientEmail: string;
  variables: Record<string, unknown>;
  submissionId?: number | null;
  dedupeKey?: string | null;
  availableAt?: Date | string | null;
}

export interface NotificationOutboxRow extends QueryResultRow {
  id: string | number;
  submission_id: string | number | null;
  recipient_email: string;
  template: string;
  payload: Record<string, unknown>;
  rendered_subject: string;
  rendered_html: string;
  dedupe_key: string | null;
  available_at: Date | string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
}

export type NotificationSqlClient = Pick<VercelClientBase, 'sql'>;

const TEMPLATE_VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function escapeTemplateValue(value: unknown): string {
  return stringifyTemplateValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderNotificationTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(TEMPLATE_VARIABLE_PATTERN, (_placeholder, variableName: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, variableName)) {
      throw new Error(`Missing notification template variable: ${variableName}`);
    }
    return escapeTemplateValue(variables[variableName]);
  });
}

export function renderNotificationSubject(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(TEMPLATE_VARIABLE_PATTERN, (_placeholder, variableName: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, variableName)) {
      throw new Error(`Missing notification template variable: ${variableName}`);
    }
    return stringifyTemplateValue(variables[variableName]);
  }).replace(/[\r\n]+/g, ' ');
}

function normalizeAvailableAt(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('availableAt must be a valid date');
  return date.toISOString();
}

function serializeVariables(variables: Record<string, unknown>): string {
  return JSON.stringify(variables, (_key, value) => (
    typeof value === 'bigint' ? value.toString() : value
  ));
}

export async function queueNotification(
  input: QueueNotificationInput,
  client?: NotificationSqlClient,
): Promise<NotificationOutboxRow | null> {
  const executor = client ?? db;
  const templateKey = input.templateKey.trim();
  const recipientEmail = input.recipientEmail.trim();
  const dedupeKey = input.dedupeKey?.trim() || null;
  const availableAt = normalizeAvailableAt(input.availableAt);

  if (!templateKey) throw new Error('templateKey is required');
  if (!recipientEmail) throw new Error('recipientEmail is required');

  const templateResult = await executor.sql<{
    template_key: string;
    subject: string;
    body_html: string;
  }>`
    SELECT template_key, subject, body_html
    FROM email_templates
    WHERE template_key = ${templateKey}
  `;
  if (templateResult.rows.length === 0) {
    throw new Error(`Unknown notification template: ${templateKey}`);
  }

  const template = templateResult.rows[0];
  const renderedSubject = renderNotificationSubject(template.subject, input.variables);
  const renderedHtml = renderNotificationTemplate(template.body_html, input.variables);
  const payload = serializeVariables(input.variables);

  const inserted = await executor.sql<NotificationOutboxRow>`
    INSERT INTO notification_outbox (
      submission_id,
      recipient_email,
      template,
      payload,
      rendered_subject,
      rendered_html,
      dedupe_key,
      available_at
    )
    VALUES (
      ${input.submissionId ?? null},
      ${recipientEmail},
      ${template.template_key},
      ${payload}::jsonb,
      ${renderedSubject},
      ${renderedHtml},
      ${dedupeKey},
      COALESCE(${availableAt}::timestamptz, NOW())
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `;

  return inserted.rows[0] ?? null;
}
