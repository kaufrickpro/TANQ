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

import { execSync } from 'child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '@/lib/db';
import { resetTestDatabase } from './helpers/db';
import { createSubmittedCaseFile } from '@/lib/case-files/documents';
import { transitionSubmission } from '@/lib/case-files/workflow';
import {
  assignReviewer,
  openReviewRound,
  recordEditorialDecision,
  releaseReviewReport,
  submitReviewReport,
} from '@/lib/case-files/reviews';
import { getRevisionResponse, saveRevisionResponse } from '@/lib/case-files/revisionResponses';
import {
  addDiscussionMessage,
  closeDiscussion,
  createDiscussion,
  listDiscussions,
} from '@/lib/case-files/discussions';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://mock.blob.vercel.storage/${pathname}`,
    pathname,
    etag: `etag-${pathname}`,
  })),
  del: vi.fn(async () => ({ success: true })),
}));

describe('Revision responses and discussions', () => {
  let author: any;
  let editor: any;
  let reviewer: any;

  beforeAll(() => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });
  });

  beforeEach(async () => {
    await resetTestDatabase();
    const users = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES
        ('revision_author', 'hash', 'Revision Author', 'revision-author@tanq.test', 'author', TRUE),
        ('revision_editor', 'hash', 'Revision Editor', 'revision-editor@tanq.test', 'editor', TRUE),
        ('revision_reviewer', 'hash', 'Named Reviewer', 'revision-reviewer@tanq.test', 'reviewer', TRUE)
      RETURNING id, username, name, email, role
    `;
    [author, editor, reviewer] = users.rows;
  });

  afterAll(async () => {
    await db.end();
  });

  async function createReviewedRevisionCase() {
    const submissionId = await createSubmittedCaseFile({
      metadata: {
        title: 'Structured Revision Study',
        abstract: 'An abstract for revision workflow tests.',
        keywords: 'revision, discussion',
        authorName: author.name,
        authorEmail: author.email,
        submissionType: 'Research Article',
        language: 'English',
        coAuthors: [],
        checklistConfirmed: true,
      },
      files: [{
        kind: 'manuscript',
        file: new File(['version one'], 'anonymous-v1.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      }],
      actor: author,
    });
    const version = await db`SELECT id FROM document_versions WHERE submission_id = ${submissionId}`;
    await transitionSubmission({
      submissionId,
      toStage: 'editor_screening',
      actor: editor,
      summary: 'Editorial screening started.',
    });
    const round = await openReviewRound({
      submissionId,
      manuscriptVersionId: Number(version.rows[0].id),
      actor: editor,
    });
    const assignment = await assignReviewer({
      submissionId,
      reviewRoundId: Number(round.id),
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    const report = await submitReviewReport({
      assignmentId: Number(assignment.id),
      recommendation: 'minor_revision',
      score: 4,
      commentsToAuthor: 'Clarify the sampling method.',
      actor: reviewer,
    });
    await releaseReviewReport({ reportId: Number(report.id), actor: editor });
    await recordEditorialDecision({
      submissionId,
      reviewRoundId: Number(round.id),
      decision: 'minor_revision',
      letter: 'Please submit a revised manuscript.',
      actor: editor,
    });
    return { submissionId, roundId: Number(round.id) };
  }

  it('submits one immutable current-round revision response and queues editor notification', async () => {
    const { submissionId, roundId } = await createReviewedRevisionCase();
    const responseItems = [{
      reviewer_id: 'reviewer-1',
      comment: 'Clarify the sampling method.',
      response: 'Section 3 now explains the sampling method.',
      status: 'addressed' as const,
    }];

    await saveRevisionResponse({
      submissionId,
      reviewRoundId: roundId,
      responseItems,
      action: 'save_draft',
      actor: author,
    });
    const submitted = await saveRevisionResponse({
      submissionId,
      reviewRoundId: roundId,
      responseItems,
      action: 'submit',
      actor: author,
    });

    expect(submitted.status).toBe('submitted');
    expect((await getRevisionResponse({ submissionId, reviewRoundId: roundId, actor: author }))?.status)
      .toBe('submitted');
    await expect(saveRevisionResponse({
      submissionId,
      reviewRoundId: roundId,
      responseItems,
      action: 'save_draft',
      actor: author,
    })).rejects.toThrow(/immutable/i);
    const notifications = await db`
      SELECT template, recipient_email
      FROM notification_outbox
      WHERE submission_id = ${submissionId}
        AND template = 'revision_received'
    `;
    expect(notifications.rows).toEqual([
      expect.objectContaining({ recipient_email: editor.email }),
    ]);
  });

  it('enforces discussion visibility and pseudonymizes reviewer messages for authors', async () => {
    const { submissionId } = await createReviewedRevisionCase();
    await expect(createDiscussion({
      submissionId,
      subject: 'Hidden attempt',
      visibility: 'all_parties',
      body: 'Authors cannot create this thread.',
      actor: author,
    })).rejects.toThrow(/forbidden/i);

    const created = await createDiscussion({
      submissionId,
      subject: 'Method clarification',
      visibility: 'all_parties',
      body: 'Please clarify the sampling frame.',
      actor: reviewer,
    });
    await addDiscussionMessage({
      submissionId,
      discussionId: Number(created.discussion.id),
      body: 'The clarification is now visible.',
      actor: author,
    });

    const authorThreads = await listDiscussions({ submissionId, viewer: author });
    expect(authorThreads[0].created_by_name).toBe('Anonymous Reviewer');
    expect(authorThreads[0].messages[0].sender_name).toBe('Anonymous Reviewer');
    const reviewerEvent = await db`
      SELECT actor_name
      FROM submission_events
      WHERE submission_id = ${submissionId}
        AND event_type = 'discussion_created'
    `;
    expect(reviewerEvent.rows[0].actor_name).toBe('Anonymous Reviewer');

    await closeDiscussion({
      submissionId,
      discussionId: Number(created.discussion.id),
      actor: editor,
    });
    await expect(addDiscussionMessage({
      submissionId,
      discussionId: Number(created.discussion.id),
      body: 'Late reply.',
      actor: author,
    })).rejects.toThrow(/closed/i);
  });
});
