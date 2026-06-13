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

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import db from '@/lib/db';
import { resetTestDatabase } from './helpers/db';
import { createSubmittedCaseFile, uploadDocumentVersion } from '@/lib/case-files/documents';
import { verifySubmissionEventChain } from '@/lib/case-files/audit';
import { transitionSubmission } from '@/lib/case-files/workflow';
import { assignReviewer, openReviewRound, releaseReviewReport, submitReviewReport } from '@/lib/case-files/reviews';
import { getCaseFile } from '@/lib/case-files/queries';
import { del } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://mock.blob.vercel.storage/${pathname}`,
    pathname,
    etag: `etag-${pathname}`,
  })),
  del: vi.fn(async () => ({ success: true })),
}));

describe('Immutable manuscript case-file core', () => {
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
        ('case_author', 'hash', 'Case Author', 'case-author@tanq.test', 'author', TRUE),
        ('case_editor', 'hash', 'Case Editor', 'case-editor@tanq.test', 'editor', TRUE),
        ('case_reviewer', 'hash', 'Case Reviewer', 'case-reviewer@tanq.test', 'reviewer', TRUE)
      RETURNING id, username, name, email, role
    `;
    [author, editor, reviewer] = users.rows;
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await db.end();
  });

  async function createCaseFile() {
    return createSubmittedCaseFile({
      metadata: {
        title: 'Immutable Evidence Study',
        abstract: 'An abstract with enough detail.',
        keywords: 'archive, peer review',
        authorName: author.name,
        authorEmail: author.email,
        submissionType: 'Research Article',
        language: 'English',
        coAuthors: [],
        checklistConfirmed: true,
      },
      files: [
        {
          kind: 'manuscript',
          file: new File(['version one'], 'anonymous-v1.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
        },
      ],
      actor: author,
    });
  }

  it('creates a verifiable audit chain and enforces immutable version rows in PostgreSQL', async () => {
    const submissionId = await createCaseFile();
    const chain = await verifySubmissionEventChain(db, submissionId);
    expect(chain.valid).toBe(true);
    expect(chain.eventCount).toBe(2);

    const version = await db`SELECT id FROM document_versions WHERE submission_id = ${submissionId}`;
    await expect(
      db`UPDATE document_versions SET original_filename = 'tampered.docx' WHERE id = ${version.rows[0].id}`,
    ).rejects.toThrow(/immutable case-file records/i);
  });

  it('permits only the one-time checksum backfill for a legacy version', async () => {
    const submissionId = await createCaseFile();
    const document = await db`
      INSERT INTO submission_documents (
        submission_id, kind, label, visibility, created_by_name, created_by_role
      )
      VALUES (${submissionId}, 'other', 'Legacy Attachment', 'editorial', 'TANQ Migration', 'system')
      RETURNING id
    `;
    const version = await db`
      INSERT INTO document_versions (
        submission_id, document_id, version_number, blob_url, blob_pathname,
        original_filename, content_type, size_bytes, uploaded_by_name, uploaded_by_role, legacy_import
      )
      VALUES (
        ${submissionId}, ${document.rows[0].id}, 1, 'https://legacy.test/attachment.pdf',
        'attachment.pdf', 'attachment.pdf', 'application/octet-stream', 0,
        'TANQ Migration', 'system', TRUE
      )
      RETURNING id
    `;
    const checksum = 'a'.repeat(64);
    const updated = await db`
      UPDATE document_versions
      SET sha256 = ${checksum}, size_bytes = 12, content_type = 'application/pdf'
      WHERE id = ${version.rows[0].id}
      RETURNING sha256
    `;
    expect(updated.rows[0].sha256).toBe(checksum);
    await expect(
      db`UPDATE document_versions SET size_bytes = 13 WHERE id = ${version.rows[0].id}`,
    ).rejects.toThrow(/immutable case-file records/i);
  });

  it('adds revisions as new versions without deleting the committed old blob', async () => {
    const submissionId = await createCaseFile();
    await uploadDocumentVersion({
      submissionId,
      kind: 'manuscript',
      file: new File(['version two'], 'anonymous-v2.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      actor: author,
      note: 'Author pre-review update',
    });

    const versions = await db`
      SELECT version_number, original_filename
      FROM document_versions
      WHERE submission_id = ${submissionId}
      ORDER BY version_number
    `;
    expect(versions.rows.map(row => row.original_filename)).toEqual(['anonymous-v1.docx', 'anonymous-v2.docx']);
    expect(del).not.toHaveBeenCalled();
    expect((await verifySubmissionEventChain(db, submissionId)).valid).toBe(true);
  });

  it('pins reviewer access to the manuscript version assigned to the review round', async () => {
    const submissionId = await createCaseFile();
    const firstVersion = await db`SELECT id FROM document_versions WHERE submission_id = ${submissionId}`;

    await expect(openReviewRound({
      submissionId,
      manuscriptVersionId: Number(firstVersion.rows[0].id),
      actor: editor,
    })).rejects.toThrow(/cannot be opened from workflow stage/i);

    await transitionSubmission({
      submissionId,
      toStage: 'editor_screening',
      actor: editor,
      summary: 'Editorial screening started.',
    });
    const round = await openReviewRound({
      submissionId,
      manuscriptVersionId: Number(firstVersion.rows[0].id),
      actor: editor,
    });
    await assignReviewer({
      submissionId,
      reviewRoundId: Number(round.id),
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    await uploadDocumentVersion({
      submissionId,
      kind: 'manuscript',
      file: new File(['editor-only newer version'], 'anonymous-v2.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      actor: editor,
    });

    const reviewerCaseFile = await getCaseFile(reviewer, submissionId);
    const visibleManuscripts = reviewerCaseFile?.documents.filter((document: any) => document.kind === 'manuscript');
    expect(visibleManuscripts).toHaveLength(1);
    expect(visibleManuscripts?.[0].original_filename).toBe('manuscript_v1.docx');
  });

  it('stores submitted reports immutably and exposes them to authors only after release', async () => {
    const submissionId = await createCaseFile();
    const firstVersion = await db`SELECT id FROM document_versions WHERE submission_id = ${submissionId}`;
    await transitionSubmission({ submissionId, toStage: 'editor_screening', actor: editor, summary: 'Screening complete.' });
    const round = await openReviewRound({ submissionId, manuscriptVersionId: Number(firstVersion.rows[0].id), actor: editor });
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
      commentsToAuthor: 'Please clarify the sampling method.',
      actor: reviewer,
    });

    expect((await db`SELECT COUNT(*)::integer AS count FROM review_report_releases`).rows[0].count).toBe(0);
    await releaseReviewReport({ reportId: Number(report.id), actor: editor });
    expect((await db`SELECT COUNT(*)::integer AS count FROM review_report_releases`).rows[0].count).toBe(1);
    await expect(
      db`UPDATE review_reports SET comments_to_author = 'changed' WHERE id = ${report.id}`,
    ).rejects.toThrow(/immutable case-file records/i);
  });

  it('requires a written reason for editor workflow overrides', async () => {
    const submissionId = await createCaseFile();
    await expect(transitionSubmission({
      submissionId,
      toStage: 'accepted',
      actor: editor,
      summary: 'Desk acceptance.',
    })).rejects.toThrow(/not allowed/i);

    await transitionSubmission({
      submissionId,
      toStage: 'accepted',
      actor: editor,
      summary: 'Desk acceptance.',
      overrideReason: 'Invited editorial with external peer-review evidence.',
    });
    const event = await db`
      SELECT event_type, payload
      FROM submission_events
      WHERE submission_id = ${submissionId}
      ORDER BY sequence_number DESC
      LIMIT 1
    `;
    expect(event.rows[0].event_type).toBe('workflow_override');
    expect(event.rows[0].payload.overrideReason).toContain('external peer-review evidence');
  });

  it('migrates legacy review rows into pinned rounds, assignments, and immutable reports', async () => {
    const legacy = await db`
      INSERT INTO submissions (
        title, abstract, keywords, author_name, author_email, file_path, status, current_stage, date_submitted
      )
      VALUES (
        'Legacy Reviewed Paper', 'Legacy abstract', 'legacy', 'Legacy Author',
        'legacy-author@tanq.test', 'https://legacy.test/manuscript.pdf', 'in_review', 'in_review', '2026-01-15'
      )
      RETURNING id
    `;
    await db`
      INSERT INTO reviews (
        submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed
      )
      VALUES (
        ${legacy.rows[0].id}, 'Legacy Reviewer', 'legacy-reviewer@tanq.test',
        'A completed legacy report.', 'accept', 5, '2026-02-15'
      )
    `;
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });

    expect((await db`SELECT COUNT(*)::integer AS count FROM review_rounds WHERE submission_id = ${legacy.rows[0].id}`).rows[0].count).toBe(1);
    expect((await db`SELECT COUNT(*)::integer AS count FROM review_assignments WHERE submission_id = ${legacy.rows[0].id}`).rows[0].count).toBe(1);
    expect((await db`SELECT COUNT(*)::integer AS count FROM review_reports WHERE submission_id = ${legacy.rows[0].id}`).rows[0].count).toBe(1);
  });

  it('enforces double-blind review constraints on queries, documents, timeline events and discussions', async () => {
    const submissionId = await createCaseFile();
    const firstVersion = await db`SELECT id FROM document_versions WHERE submission_id = ${submissionId}`;
    
    // Start screening
    await transitionSubmission({ submissionId, toStage: 'editor_screening', actor: editor, summary: 'Screening complete.' });
    // Open round
    const round = await openReviewRound({ submissionId, manuscriptVersionId: Number(firstVersion.rows[0].id), actor: editor });
    // Assign reviewer
    const assignment = await assignReviewer({
      submissionId,
      reviewRoundId: Number(round.id),
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
      actor: editor,
    });
    
    // Upload reviewer attachment
    await uploadDocumentVersion({
      submissionId,
      kind: 'reviewer_attachment',
      file: new File(['notes'], 'ReviewerNotes_John_Doe.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      actor: reviewer,
      reviewRoundId: Number(round.id),
      visibility: 'author',
    });

    // 1. Verify Reviewer's view of case file
    const reviewerCaseFile = await getCaseFile(reviewer, submissionId);
    expect(reviewerCaseFile).not.toBeNull();
    // Submissions details stripped
    expect(reviewerCaseFile!.submission.author_name).toBeUndefined();
    expect(reviewerCaseFile!.submission.author_email).toBeUndefined();
    expect(reviewerCaseFile!.submission.co_authors).toBeUndefined();
    
    // Document uploader name and filename masked
    const manuscriptDoc = reviewerCaseFile!.documents.find((d: any) => d.kind === 'manuscript');
    expect(manuscriptDoc.uploaded_by_name).toBe('Anonymous Author');
    expect(manuscriptDoc.original_filename).toBe('manuscript_v1.docx');
    
    // Rounds filename masked
    expect(reviewerCaseFile!.rounds[0].manuscript_filename).toBe('manuscript_v1.docx');

    // 2. Verify Author's view of case file
    const authorCaseFile = await getCaseFile(author, submissionId);
    expect(authorCaseFile).not.toBeNull();
    
    // Reviewer attachment uploader name and filename masked
    const attachmentDoc = authorCaseFile!.documents.find((d: any) => d.kind === 'reviewer_attachment');
    expect(attachmentDoc.uploaded_by_name).toBe('Anonymous Reviewer');
    expect(attachmentDoc.original_filename).toBe('reviewer_attachment_v1.docx');

    // Timeline events masked
    // We submit a report as reviewer
    await submitReviewReport({
      assignmentId: Number(assignment.id),
      recommendation: 'minor_revision',
      score: 4,
      commentsToAuthor: 'Looks good.',
      actor: reviewer,
    });
    
    const authorCaseFileWithReport = await getCaseFile(author, submissionId);
    // Find reviewer events (e.g., reviewer_assigned, review_report_submitted)
    const reviewerEvents = authorCaseFileWithReport!.events.filter((e: any) => e.actor_role === 'reviewer');
    expect(reviewerEvents.length).toBeGreaterThan(0);
    for (const e of reviewerEvents) {
      expect(e.actor_name).toBe('Anonymous Reviewer');
    }

    // 3. Verify Discussions anonymization
    const { createDiscussion, addDiscussionMessage, listDiscussions } = await import('@/lib/case-files/discussions');
    // Creator is Editor
    const discResult = await createDiscussion({
      submissionId,
      subject: 'Clarification',
      visibility: 'all_parties',
      body: 'Welcome to the peer discussion.',
      actor: editor,
    });

    // Author adds a message
    await addDiscussionMessage({
      submissionId,
      discussionId: Number(discResult.discussion.id),
      body: 'Can you clarify X?',
      actor: author,
    });
    
    // Reviewer lists discussions
    const reviewerDiscs = await listDiscussions({ submissionId, viewer: reviewer });
    expect(reviewerDiscs.length).toBeGreaterThan(0);
    const discForReviewer = reviewerDiscs.find((d: any) => Number(d.id) === Number(discResult.discussion.id));
    expect(discForReviewer.created_by_name).toBe(editor.name); // Editor name stays visible
    expect(discForReviewer.messages[1].sender_name).toBe('Anonymous Author');

    // Reviewer replies
    await addDiscussionMessage({
      submissionId,
      discussionId: Number(discResult.discussion.id),
      body: 'I meant Y.',
      actor: reviewer,
    });

    // Author lists discussions
    const authorDiscs = await listDiscussions({ submissionId, viewer: author });
    const discForAuthor = authorDiscs.find((d: any) => Number(d.id) === Number(discResult.discussion.id));
    expect(discForAuthor.created_by_name).toBe(editor.name);
    // Message 1 is from Author (self), so it shows author name
    expect(discForAuthor.messages[1].sender_name).toBe(author.name);
    // Message 2 is from Reviewer, so it is Anonymous Reviewer
    expect(discForAuthor.messages[2].sender_name).toBe('Anonymous Reviewer');
  });
});
