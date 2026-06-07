import fs from 'fs';
import path from 'path';

// Load env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (matched) {
      const key = matched[1];
      let val = matched[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  }
}

if (process.env.TEST_DATABASE_URL) {
  process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;
}

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { execSync } from 'child_process';
import db from '@/lib/db';
import { createSession } from '@/lib/session';
import { hashPassword } from '@/lib/password';
import { del } from '@vercel/blob';
import { resetTestDatabase } from './helpers/db';

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => {
    return {
      get: (name: string) => {
        if (name === 'session_token') {
          return { value: globalThis.testSessionToken || '' };
        }
        return undefined;
      },
      set: vi.fn(),
      delete: vi.fn()
    };
  })
}));

// Mock Blob SDK
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path, data, options) => {
    return {
      url: `https://mock.blob.vercel.storage/manuscripts/${path}`,
      pathname: `manuscripts/${path}`,
      etag: 'mock-etag',
    };
  }),
  del: vi.fn(async (url) => {
    return { success: true };
  })
}));

describe('Submissions PATCH & DELETE Endpoints', () => {
  let authorId: number;
  let otherAuthorId: number;
  let adminId: number;
  let authorToken: string;
  let otherAuthorToken: string;
  let adminToken: string;
  let submissionsHandler: any;

  beforeAll(async () => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL }
    });
    submissionsHandler = await import('@/app/api/submissions/route');
  });

  beforeEach(async () => {
    await resetTestDatabase();

    const passHash = await hashPassword('TestPassword123!');
    
    // Create first author
    const authorRes = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES ('author1', ${passHash}, 'Author One', 'author1@tanq.com', 'author', TRUE)
      RETURNING id
    `;
    authorId = authorRes.rows[0].id;
    authorToken = await createSession(authorId);

    // Create second author
    const otherAuthorRes = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES ('author2', ${passHash}, 'Author Two', 'author2@tanq.com', 'author', TRUE)
      RETURNING id
    `;
    otherAuthorId = otherAuthorRes.rows[0].id;
    otherAuthorToken = await createSession(otherAuthorId);

    // Create Admin
    const adminRes = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES ('admin1', ${passHash}, 'Admin One', 'admin1@tanq.com', 'admin', TRUE)
      RETURNING id
    `;
    adminId = adminRes.rows[0].id;
    adminToken = await createSession(adminId);

    globalThis.testSessionToken = null;
    vi.clearAllMocks();
  });

  describe('PATCH /api/submissions (Replace File)', () => {
    it('should reject unauthenticated request', async () => {
      globalThis.testSessionToken = null;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });
      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(401);
    });

    it('should reject non-author request', async () => {
      globalThis.testSessionToken = adminToken;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH'
      });
      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(403);
    });

    it('should allow author to replace file on their own submission in "submitted" status', async () => {
      // 1. Create a submission under author1
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'submitted', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      // Mock FormData with new file
      const formData = new FormData();
      formData.append('submission_id', subId.toString());
      formData.append('file', new File(['new content'], 'manuscript_v2.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

      globalThis.testSessionToken = authorToken;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        },
        body: formData
      });

      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.file_name).toBe('manuscript_v2.docx');
      expect(data.status).toBe('submitted');

      // Verify DB path is updated
      const dbRes = await db`SELECT file_path FROM submissions WHERE id = ${subId}`;
      expect(dbRes.rows[0].file_path).toContain('manuscript_v2.docx');

      // Verify old file was retained and the new upload became the next immutable version.
      expect(del).not.toHaveBeenCalledWith('https://mock.blob/file.pdf');
      const versions = await db`
        SELECT version_number, original_filename, legacy_import
        FROM document_versions
        WHERE submission_id = ${subId}
        ORDER BY version_number ASC
      `;
      expect(versions.rows).toHaveLength(2);
      expect(versions.rows[0].legacy_import).toBe(true);
      expect(versions.rows[1].original_filename).toBe('manuscript_v2.docx');
    });

    it('should allow author to replace file on their own submission in "revision_requested" status', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'revision_requested', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      const formData = new FormData();
      formData.append('submission_id', subId.toString());
      formData.append('file', new File(['new content'], 'revision.pdf', { type: 'application/pdf' }));

      globalThis.testSessionToken = authorToken;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        },
        body: formData
      });

      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.file_name).toBe('revision.pdf');

      expect(del).not.toHaveBeenCalledWith('https://mock.blob/file.pdf');
    });

    it('should block author from replacing file on someone else\'s submission', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'submitted', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      const formData = new FormData();
      formData.append('submission_id', subId.toString());
      formData.append('file', new File(['new content'], 'attempt.pdf', { type: 'application/pdf' }));

      globalThis.testSessionToken = otherAuthorToken;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        },
        body: formData
      });

      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(403);
    });

    it('should block author from replacing file on a submission in "in_review" status', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'in_review', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      const formData = new FormData();
      formData.append('submission_id', subId.toString());
      formData.append('file', new File(['new content'], 'attempt.pdf', { type: 'application/pdf' }));

      globalThis.testSessionToken = authorToken;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        },
        body: formData
      });

      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Cannot replace file');
    });
  });

  describe('DELETE /api/submissions (Delete Submission)', () => {
    it('should reject unauthenticated request', async () => {
      globalThis.testSessionToken = null;
      const req = new Request('http://localhost/api/submissions?submission_id=123', {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });
      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(401);
    });

    it('should reject non-author, non-admin request (e.g. reviewer)', async () => {
      const passHash = await hashPassword('TestPassword123!');
      const reviewerRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('reviewer_test', ${passHash}, 'Reviewer Test', 'reviewer_test@tanq.com', 'reviewer', TRUE)
        RETURNING id
      `;
      const reviewerToken = await createSession(reviewerRes.rows[0].id);

      globalThis.testSessionToken = reviewerToken;
      const req = new Request('http://localhost/api/submissions?submission_id=123', {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });
      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(403);
    });

    it('should block author from deleting a submitted manuscript case file', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'submitted', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      // Add dummy review
      await db`
        INSERT INTO reviews (submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed)
        VALUES (${subId}, 'Reviewer', 'rev@tanq.com', 'Good', 'accept', 5, '2026-06-07')
      `;

      globalThis.testSessionToken = authorToken;
      const req = new Request(`http://localhost/api/submissions?submission_id=${subId}`, {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });

      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(409);

      const checkSub = await db`SELECT * FROM submissions WHERE id = ${subId}`;
      expect(checkSub.rows.length).toBe(1);

      const checkReviews = await db`SELECT * FROM reviews WHERE submission_id = ${subId}`;
      expect(checkReviews.rows.length).toBe(1);

      expect(del).not.toHaveBeenCalledWith('https://mock.blob/file.pdf');
    });

    it('should block author from deleting someone else\'s submission', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'submitted', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      globalThis.testSessionToken = otherAuthorToken;
      const req = new Request(`http://localhost/api/submissions?submission_id=${subId}`, {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });

      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(403);
    });

    it('should block author from deleting a submission in "accepted" status', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'accepted', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      globalThis.testSessionToken = authorToken;
      const req = new Request(`http://localhost/api/submissions?submission_id=${subId}`, {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });

      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('cannot be deleted');
    });

    it('should block admin from deleting any submitted manuscript case file', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'in_review', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      await db`
        INSERT INTO reviews (submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed)
        VALUES (${subId}, 'Reviewer', 'rev@tanq.com', 'Good', 'accept', 5, '2026-06-07')
      `;

      globalThis.testSessionToken = adminToken;
      const req = new Request(`http://localhost/api/submissions?submission_id=${subId}`, {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });

      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(409);

      const checkSub = await db`SELECT * FROM submissions WHERE id = ${subId}`;
      expect(checkSub.rows.length).toBe(1);

      const checkReviews = await db`SELECT * FROM reviews WHERE submission_id = ${subId}`;
      expect(checkReviews.rows.length).toBe(1);

      expect(del).not.toHaveBeenCalledWith('https://mock.blob/file.pdf');
    });

    it('should block admin from deleting a published submission', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'published', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      globalThis.testSessionToken = adminToken;
      const req = new Request(`http://localhost/api/submissions?submission_id=${subId}`, {
        method: 'DELETE',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        }
      });

      const res = await submissionsHandler.DELETE(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('cannot be deleted');
    });
  });

  describe('Reviewer GET Query Blinding', () => {
    it('should strip author_name and author_email for reviewer role', async () => {
      // 1. Create a submission
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper A', 'Abstract A', 'keys', 'Author Secret', 'secret@tanq.com', 'https://mock.blob/file.pdf', 'in_review', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      // 2. Create reviewer assignment
      await db`
        INSERT INTO reviews (submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed)
        VALUES (${subId}, 'Reviewer One', 'reviewer1@tanq.com', '', 'minor_revision', 3, '')
      `;

      // Log in as reviewer1
      const passHash = await hashPassword('TestPassword123!');
      const reviewerUser = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('reviewer1', ${passHash}, 'Reviewer One', 'reviewer1@tanq.com', 'reviewer', TRUE)
        RETURNING id
      `;
      const reviewerToken = await createSession(reviewerUser.rows[0].id);

      globalThis.testSessionToken = reviewerToken;
      const req = new Request('http://localhost/api/submissions?role=reviewer&email=reviewer1@tanq.com', {
        method: 'GET'
      });

      const res = await submissionsHandler.GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.length).toBe(1);
      
      const submission = data[0];
      expect(submission.title).toBe('Paper A');
      // Verify author name and email are stripped!
      expect(submission.author_name).toBeUndefined();
      expect(submission.author_email).toBeUndefined();
    });
  });

  describe('File Upload MIME-type Validation', () => {
    it('should reject file upload with valid extension but invalid MIME-type in PATCH', async () => {
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Paper 1', 'Abstract 1', 'keys', 'Author One', 'author1@tanq.com', 'https://mock.blob/file.pdf', 'submitted', '2026-06-07')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      const formData = new FormData();
      formData.append('submission_id', subId.toString());
      // File has pdf extension, but text/html mime-type
      formData.append('file', new File(['<html>code</html>'], 'malicious.pdf', { type: 'text/html' }));

      globalThis.testSessionToken = authorToken;
      const req = new Request('http://localhost/api/submissions', {
        method: 'PATCH',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost'
        },
        body: formData
      });

      const res = await submissionsHandler.PATCH(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('MIME-type check failed');
    });
  });
});

// ─── Withdrawal Flow Tests ─────────────────────────────────────────────────
describe('Withdrawal Flow', () => {
  let withdrawHandler: any;
  let decisionHandler: any;
  let authorId2: number;
  let adminId2: number;
  let authorToken2: string;
  let adminToken2: string;

  beforeAll(async () => {
    withdrawHandler = await import('@/app/api/submissions/[id]/withdraw/route');
    decisionHandler = await import('@/app/api/submissions/[id]/withdrawal-decision/route');
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await resetTestDatabase();

    const passHash = await hashPassword('TestPassword123!');

    const aRes = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES ('wauthor1', ${passHash}, 'W Author', 'wauthor@tanq.com', 'author', TRUE)
      RETURNING id
    `;
    authorId2 = aRes.rows[0].id;
    authorToken2 = await createSession(authorId2);

    const dRes = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES ('wadmin1', ${passHash}, 'W Admin', 'wadmin@tanq.com', 'admin', TRUE)
      RETURNING id
    `;
    adminId2 = dRes.rows[0].id;
    adminToken2 = await createSession(adminId2);

    globalThis.testSessionToken = null;
    vi.clearAllMocks();
  });

  const makeWithdrawReq = (submissionId: number, token: string, reason = 'I found a major error in my methodology.') => {
    (globalThis as any).testSessionToken = token;
    return new Request(`http://localhost/api/submissions/${submissionId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'host': 'localhost', 'origin': 'http://localhost' },
      body: JSON.stringify({ reason }),
    });
  };

  const makeDecisionReq = (submissionId: number, token: string, decision: 'approved' | 'rejected', editorNote?: string) => {
    (globalThis as any).testSessionToken = token;
    return new Request(`http://localhost/api/submissions/${submissionId}/withdrawal-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'host': 'localhost', 'origin': 'http://localhost' },
      body: JSON.stringify({ decision, editor_note: editorNote }),
    });
  };

  const makeParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

  it('should instantly withdraw a submission in "submitted" status', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'submitted', '2026-06-07')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;

    const res = await withdrawHandler.POST(makeWithdrawReq(subId, authorToken2), makeParams(subId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('instant');

    const check = await db`SELECT status, withdrawal_status FROM submissions WHERE id = ${subId}`;
    expect(check.rows[0].status).toBe('withdrawn');
    expect(check.rows[0].withdrawal_status).toBe('approved');
  });

  it('should create a withdrawal request for "in_review" status', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'in_review', '2026-06-07')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;

    const res = await withdrawHandler.POST(makeWithdrawReq(subId, authorToken2), makeParams(subId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('requested');

    const wr = await db`SELECT * FROM withdrawal_requests WHERE submission_id = ${subId}`;
    expect(wr.rows.length).toBe(1);
    expect(wr.rows[0].status).toBe('pending');

    const sub = await db`SELECT withdrawal_status FROM submissions WHERE id = ${subId}`;
    expect(sub.rows[0].withdrawal_status).toBe('requested');
  });

  it('should block withdrawal for "accepted" status', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'accepted', '2026-06-07')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;

    const res = await withdrawHandler.POST(makeWithdrawReq(subId, authorToken2), makeParams(subId));
    expect(res.status).toBe(400);
  });

  it('should block non-author from withdrawing', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'submitted', '2026-06-07')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;
    const res = await withdrawHandler.POST(makeWithdrawReq(subId, adminToken2), makeParams(subId));
    expect(res.status).toBe(403);
  });

  it('should block short reasons (< 10 chars)', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'submitted', '2026-06-07')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;
    const res = await withdrawHandler.POST(makeWithdrawReq(subId, authorToken2, 'short'), makeParams(subId));
    expect(res.status).toBe(400);
  });

  it('should allow editor to approve a withdrawal request', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted, withdrawal_status)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'in_review', '2026-06-07', 'requested')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;
    await db`
      INSERT INTO withdrawal_requests (submission_id, requested_by, reason, status)
      VALUES (${subId}, 'wauthor@tanq.com', 'Found a major error in my results section.', 'pending')
    `;

    const res = await decisionHandler.POST(makeDecisionReq(subId, adminToken2, 'approved', 'Approved given your justification.'), makeParams(subId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decision).toBe('approved');

    const sub = await db`SELECT status, withdrawal_status FROM submissions WHERE id = ${subId}`;
    expect(sub.rows[0].status).toBe('withdrawn');
    expect(sub.rows[0].withdrawal_status).toBe('approved');

    const wr = await db`SELECT status, editor_note FROM withdrawal_requests WHERE submission_id = ${subId}`;
    expect(wr.rows[0].status).toBe('approved');
    expect(wr.rows[0].editor_note).toBe('Approved given your justification.');
  });

  it('should allow editor to reject a withdrawal request', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted, withdrawal_status)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'in_review', '2026-06-07', 'requested')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;
    await db`
      INSERT INTO withdrawal_requests (submission_id, requested_by, reason, status)
      VALUES (${subId}, 'wauthor@tanq.com', 'Found a major error in my results section.', 'pending')
    `;

    const res = await decisionHandler.POST(makeDecisionReq(subId, adminToken2, 'rejected', 'Manuscript is too far in review.'), makeParams(subId));
    expect(res.status).toBe(200);

    const sub = await db`SELECT status, withdrawal_status FROM submissions WHERE id = ${subId}`;
    expect(sub.rows[0].status).toBe('in_review'); // unchanged
    expect(sub.rows[0].withdrawal_status).toBeNull();

    const wr = await db`SELECT status FROM withdrawal_requests WHERE submission_id = ${subId}`;
    expect(wr.rows[0].status).toBe('rejected');
  });

  it('should block non-admin from approving withdrawal', async () => {
    const subRes = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted, withdrawal_status)
      VALUES ('Test Paper', 'Abstract', 'keys', 'W Author', 'wauthor@tanq.com', 'https://blob/file.pdf', 'in_review', '2026-06-07', 'requested')
      RETURNING id
    `;
    const subId = subRes.rows[0].id;
    const res = await decisionHandler.POST(makeDecisionReq(subId, authorToken2, 'approved'), makeParams(subId));
    expect(res.status).toBe(403);
  });
});
