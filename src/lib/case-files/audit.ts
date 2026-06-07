import 'server-only';
import crypto from 'crypto';
import type { CaseFileEventInput } from './types';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
    .join(',')}}`;
}

export async function appendSubmissionEvent(client: any, input: CaseFileEventInput) {
  // Serialize every event append on the parent submission, including the first event.
  // Locking only the previous event is insufficient when the chain is still empty.
  const submissionLock = await client.sql`
    SELECT id
    FROM submissions
    WHERE id = ${input.submissionId}
    FOR UPDATE
  `;
  if (submissionLock.rows.length === 0) throw new Error('Submission not found');

  const previous = await client.sql`
    SELECT sequence_number, event_hash
    FROM submission_events
    WHERE submission_id = ${input.submissionId}
    ORDER BY sequence_number DESC
    LIMIT 1
    FOR UPDATE
  `;
  const sequenceNumber = previous.rows.length > 0 ? Number(previous.rows[0].sequence_number) + 1 : 1;
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const createdAt = input.createdAt ?? new Date();
  const payload = input.payload ?? {};

  const material = canonicalize({
    submissionId: input.submissionId,
    sequenceNumber,
    eventType: input.eventType,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    fromStage: input.fromStage ?? null,
    toStage: input.toStage ?? null,
    summary: input.summary,
    payload,
    previousHash,
    createdAt: createdAt.toISOString(),
  });
  const eventHash = crypto.createHash('sha256').update(material).digest('hex');

  const result = await client.sql`
    INSERT INTO submission_events (
      submission_id, sequence_number, event_type, actor_user_id, actor_name, actor_role,
      from_stage, to_stage, summary, payload, previous_hash, event_hash, created_at
    )
    VALUES (
      ${input.submissionId}, ${sequenceNumber}, ${input.eventType}, ${input.actor.id},
      ${input.actor.name}, ${input.actor.role}, ${input.fromStage ?? null}, ${input.toStage ?? null},
      ${input.summary}, ${JSON.stringify(payload)}::jsonb, ${previousHash}, ${eventHash},
      ${createdAt.toISOString()}
    )
    RETURNING *
  `;
  return result.rows[0];
}

export async function verifySubmissionEventChain(client: any, submissionId: number) {
  const result = await client.sql`
    SELECT *
    FROM submission_events
    WHERE submission_id = ${submissionId}
    ORDER BY sequence_number ASC
  `;

  let previousHash: string | null = null;
  for (const event of result.rows) {
    if (event.previous_hash !== previousHash) {
      return { valid: false, brokenAt: event.sequence_number, reason: 'previous_hash mismatch' };
    }
    const material = canonicalize({
      submissionId,
      sequenceNumber: Number(event.sequence_number),
      eventType: event.event_type,
      actorId: event.actor_user_id,
      actorName: event.actor_name,
      actorRole: event.actor_role,
      fromStage: event.from_stage,
      toStage: event.to_stage,
      summary: event.summary,
      payload: event.payload ?? {},
      previousHash,
      createdAt: new Date(event.created_at).toISOString(),
    });
    let expected = crypto.createHash('sha256').update(material).digest('hex');
    // The rollout migration imported the first legacy marker before the canonical
    // event serializer existed. Preserve and verify that documented legacy format.
    if (Number(event.sequence_number) === 1 && event.event_type === 'legacy_history_imported') {
      expected = crypto
        .createHash('sha256')
        .update(`${submissionId}|1|legacy_history_imported|${event.to_stage ?? ''}|TANQ Migration`)
        .digest('hex');
    }
    if (expected !== event.event_hash) {
      return { valid: false, brokenAt: event.sequence_number, reason: 'event_hash mismatch' };
    }
    previousHash = event.event_hash;
  }

  return { valid: true, eventCount: result.rows.length, headHash: previousHash };
}
