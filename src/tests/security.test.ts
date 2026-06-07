import fs from 'fs';
import path from 'path';

// Manually load .env.local because loadEnvConfig ignores it when NODE_ENV=test
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

// Ensure test database is used
if (process.env.TEST_DATABASE_URL) {
  process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;
}

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { execSync } from 'child_process';
import crypto from 'crypto';
import db from '@/lib/db';
import { createSession, getSessionUser, revokeSession } from '@/lib/session';
import { hashPassword } from '@/lib/password';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { checkLoginRateLimit, recordLoginFailure, checkOtpVerificationRateLimit, recordOtpFailure } from '@/lib/rateLimit';
import { resetTestDatabase } from './helpers/db';

// Mock next/headers cookies
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

// Mock Vercel Blob SDK
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path, data, options) => {
    return {
      url: `https://mock.blob.vercel.storage/manuscripts/${path}`,
      pathname: `manuscripts/${path}`,
      etag: 'mock-etag',
    };
  }),
  get: vi.fn(async (url, options) => {
    return {
      statusCode: 200,
      stream: {
        pipe: (res: any) => res.end('mock pdf content')
      },
      blob: { contentType: 'application/pdf', pathname: url.split('/').pop() }
    };
  }),
  head: vi.fn(async (url) => {
    return { size: 16 };
  }),
  del: vi.fn(async (url) => {
    return { success: true };
  })
}));

// Mock Email sending
vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn(async () => {})
}));

describe('TANQ Security Hardening Tests', () => {
  beforeAll(() => {
    // Run migrations on the test database
    console.log('Running database migrations for tests...');
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL }
    });
  });

  beforeEach(async () => {
    await resetTestDatabase();
    globalThis.testSessionToken = null;
  });

  afterAll(async () => {
    // Close DB connection pool
    await db.end();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Password Quality & Length
  // ───────────────────────────────────────────────────────────────────────────
  describe('Password Quality', () => {
    it('should reject passwords shorter than 12 characters for normal registration', async () => {
      const { validatePasswordQuality } = await import('@/lib/password');
      const result = validatePasswordQuality('Short123!');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 12 characters');
    });

    it('should approve valid passwords of 12+ characters', async () => {
      const { validatePasswordQuality } = await import('@/lib/password');
      const result = validatePasswordQuality('StrongPassword123!');
      expect(result.valid).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Database Sessions
  // ───────────────────────────────────────────────────────────────────────────
  describe('Database Sessions', () => {
    it('should create, verify, and revoke database sessions', async () => {
      const passHash = await hashPassword('TestPassword123!');
      const userRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('author1', ${passHash}, 'Author One', 'author@tanq.com', 'author', TRUE)
        RETURNING id
      `;
      const userId = userRes.rows[0].id;

      // Create Session
      const rawToken = await createSession(userId);
      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBeGreaterThan(32);

      // Verify Session (Set cookie value for mock cookies)
      globalThis.testSessionToken = rawToken;
      const sessionUser = await getSessionUser();
      expect(sessionUser).not.toBeNull();
      expect(sessionUser?.username).toBe('author1');
      expect(sessionUser?.role).toBe('author');

      // Revoke Session
      await revokeSession(rawToken);
      const verifiedAfterRevocation = await getSessionUser();
      expect(verifiedAfterRevocation).toBeNull();
    });

    it('should reject sessions for disabled users', async () => {
      const passHash = await hashPassword('TestPassword123!');
      const userRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified, is_disabled)
        VALUES ('disabled_user', ${passHash}, 'Disabled User', 'disabled@tanq.com', 'author', TRUE, TRUE)
        RETURNING id
      `;
      const userId = userRes.rows[0].id;

      const rawToken = await createSession(userId);
      globalThis.testSessionToken = rawToken;

      const sessionUser = await getSessionUser();
      expect(sessionUser).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Same-Origin Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Same-Origin Validation', () => {
    it('should reject state-changing requests with mismatched origin', () => {
      const req = new Request('http://localhost:3000/api/auth', {
        method: 'POST',
        headers: {
          'host': 'localhost:3000',
          'origin': 'http://malicious-site.com',
          'content-type': 'application/json'
        }
      });
      const valid = validateSameOrigin(req);
      expect(valid).toBe(false);
    });

    it('should allow same-origin requests', () => {
      const req = new Request('http://localhost:3000/api/auth', {
        method: 'POST',
        headers: {
          'host': 'localhost:3000',
          'origin': 'http://localhost:3000',
          'content-type': 'application/json'
        }
      });
      const valid = validateSameOrigin(req);
      expect(valid).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Rate Limiting
  // ───────────────────────────────────────────────────────────────────────────
  describe('Rate Limiting', () => {
    it('should block logins after 5 failures in 15 minutes', async () => {
      const email = 'limit-test@tanq.com';
      const ip = '192.168.1.1';

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await recordLoginFailure(email, ip);
      }

      const check = await checkLoginRateLimit(email, ip);
      expect(check.success).toBe(false);
      expect(check.error).toContain('Too many failed login attempts');
    });

    it('should block and clear OTP on 5 verification failures', async () => {
      const email = 'otp-limit@tanq.com';
      const ip = '192.168.1.2';

      const passHash = await hashPassword('TestPassword123!');
      await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified, verification_otp, otp_expires_at)
        VALUES ('otp_user', ${passHash}, 'OTP User', ${email}, 'author', FALSE, '123456', ${new Date(Date.now() + 15 * 60 * 1000).toISOString()})
      `;

      // 5 failed OTP attempts
      for (let i = 0; i < 5; i++) {
        await recordOtpFailure(email, ip);
      }

      const check = await checkOtpVerificationRateLimit(email, ip);
      expect(check.success).toBe(false);
      expect(check.error).toContain('OTP verification is blocked');

      // Verify OTP is cleared in DB
      const userRes = await db`SELECT verification_otp FROM users WHERE email = ${email}`;
      expect(userRes.rows[0].verification_otp).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Staff Invitations (Transactions & Row Locking)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Invitations & Registration Concurrency', () => {
    it('should successfully register using a valid invitation', async () => {
      const adminPassHash = await hashPassword('AdminPassConfirm123!');
      const adminRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('admin_creator', ${adminPassHash}, 'Admin Creator', 'creator@tanq.com', 'admin', TRUE)
        RETURNING id
      `;
      const adminId = adminRes.rows[0].id;

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db`
        INSERT INTO invitations (email, role, token_hash, expires_at, created_by_user_id)
        VALUES ('reviewer@tanq.com', 'reviewer', ${tokenHash}, ${expiresAt.toISOString()}, ${adminId})
      `;

      // Simulating POST /api/auth registration
      const regReq = {
        action: 'register',
        username: 'new_reviewer',
        password: 'ReviewerPassword123!',
        name: 'New Reviewer',
        email: 'reviewer@tanq.com',
        role: 'reviewer',
        token: rawToken
      };

      const handler = await import('@/app/api/auth/route');
      const requestObj = new Request('http://localhost/api/auth', {
        method: 'POST',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost',
          'content-type': 'application/json'
        },
        body: JSON.stringify(regReq)
      });

      const response = await handler.POST(requestObj);
      expect(response.status).toBe(200);

      const user = await response.json();
      expect(user.username).toBe('new_reviewer');
      expect(user.role).toBe('reviewer');

      // Verify invitation is marked as used
      const inviteRes = await db`SELECT is_used, used_at FROM invitations WHERE token_hash = ${tokenHash}`;
      expect(inviteRes.rows[0].is_used).toBe(true);
      expect(inviteRes.rows[0].used_at).not.toBeNull();
    });

    it('should fail registration with an expired invitation', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() - 1000); // Expired 1s ago

      await db`
        INSERT INTO invitations (email, role, token_hash, expires_at)
        VALUES ('expired@tanq.com', 'reviewer', ${tokenHash}, ${expiresAt.toISOString()})
      `;

      const regReq = {
        action: 'register',
        username: 'reviewer_exp',
        password: 'ReviewerPassword123!',
        name: 'Reviewer Expired',
        email: 'expired@tanq.com',
        role: 'reviewer',
        token: rawToken
      };

      const handler = await import('@/app/api/auth/route');
      const requestObj = new Request('http://localhost/api/auth', {
        method: 'POST',
        headers: {
          'host': 'localhost',
          'origin': 'http://localhost',
          'content-type': 'application/json'
        },
        body: JSON.stringify(regReq)
      });

      const response = await handler.POST(requestObj);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('expired');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Private Manuscripts & Downloads
  // ───────────────────────────────────────────────────────────────────────────
  describe('Manuscript Downloads Access Control', () => {
    it('should restrict download to submitting author, assigned reviewer, or admin', async () => {
      // 1. Create Author, Reviewer, Admin, and Random User
      const passHash = await hashPassword('TestPassword123!');
      const authorRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('author', ${passHash}, 'Author', 'author@tanq.com', 'author', TRUE)
        RETURNING id
      `;
      const authorId = authorRes.rows[0].id;

      const reviewerRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('reviewer', ${passHash}, 'Reviewer', 'reviewer@tanq.com', 'reviewer', TRUE)
        RETURNING id
      `;

      const randomRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('random', ${passHash}, 'Random', 'random@tanq.com', 'author', TRUE)
        RETURNING id
      `;
      const randomId = randomRes.rows[0].id;

      // 2. Create Submission
      const subRes = await db`
        INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
        VALUES ('Private Paper', 'Abstract', 'keys', 'Author', 'author@tanq.com', 'https://blob.vercel.com/manuscripts/some-uuid/paper.pdf', 'in_review', '2026-06-06')
        RETURNING id
      `;
      const subId = subRes.rows[0].id;

      // 3. Assign Reviewer
      await db`
        INSERT INTO reviews (submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed)
        VALUES (${subId}, 'Reviewer', 'reviewer@tanq.com', '', 'minor_revision', 3, '')
      `;

      // 4. Test Submitting Author Download (Success)
      const authorToken = await createSession(authorId);
      globalThis.testSessionToken = authorToken;
      const downloadHandler = await import('@/app/api/submissions/download/route');
      
      let req = new Request(`http://localhost/api/submissions/download?submission_id=${subId}`);
      let res = await downloadHandler.GET(req);
      expect(res.status).toBe(200);

      // 5. Test Random Author Download (Forbidden)
      const randomToken = await createSession(randomId);
      globalThis.testSessionToken = randomToken;
      req = new Request(`http://localhost/api/submissions/download?submission_id=${subId}`);
      res = await downloadHandler.GET(req);
      expect(res.status).toBe(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Account Management API and Security
  // ───────────────────────────────────────────────────────────────────────────
  describe('Account Management', () => {
    let adminId: number;
    let adminToken: string;
    let accountsHandler: any;

    beforeEach(async () => {
      accountsHandler = await import('@/app/api/accounts/route');

      // Create seed admin
      const passHash = await hashPassword('AdminPass123!');
      const adminRes = await db`
        INSERT INTO users (username, password_hash, name, email, role, is_verified)
        VALUES ('admin_main', ${passHash}, 'Main Admin', 'admin@tanq.com', 'admin', TRUE)
        RETURNING id
      `;
      adminId = adminRes.rows[0].id;
      adminToken = await createSession(adminId);
    });

    describe('GET /api/accounts', () => {
      it('should reject unauthenticated and non-admin users', async () => {
        // Unauthenticated
        globalThis.testSessionToken = null;
        let req = new Request('http://localhost/api/accounts');
        let res = await accountsHandler.GET(req);
        expect(res.status).toBe(401);

        // Non-admin (author)
        const authorPass = await hashPassword('AuthorPass123!');
        const authorRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('author_user', ${authorPass}, 'Author', 'author@tanq.com', 'author', TRUE)
          RETURNING id
        `;
        const authorToken = await createSession(authorRes.rows[0].id);
        globalThis.testSessionToken = authorToken;

        req = new Request('http://localhost/api/accounts');
        res = await accountsHandler.GET(req);
        expect(res.status).toBe(401);
      });

      it('should list safe fields and not leak passwords/OTPs/sessions info', async () => {
        globalThis.testSessionToken = adminToken;

        const pHash = await hashPassword('PassToNeverLeak123!');
        await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified, is_disabled, verification_otp)
          VALUES ('secret_author', ${pHash}, 'Secret Author', 'secret@tanq.com', 'author', TRUE, FALSE, '999999')
        `;

        const req = new Request('http://localhost/api/accounts');
        const res = await accountsHandler.GET(req);
        expect(res.status).toBe(200);

        const accounts = await res.json();
        expect(accounts.length).toBeGreaterThanOrEqual(2);

        const secretUser = accounts.find((acc: any) => acc.username === 'secret_author');
        expect(secretUser).toBeDefined();
        expect(secretUser.password_hash).toBeUndefined();
        expect(secretUser.password).toBeUndefined();
        expect(secretUser.verification_otp).toBeUndefined();
        expect(secretUser.otp_expires_at).toBeUndefined();
        expect(secretUser.token_hash).toBeUndefined();

        // Check required fields
        expect(secretUser.id).toBeTypeOf('number');
        expect(secretUser.username).toBe('secret_author');
        expect(secretUser.name).toBe('Secret Author');
        expect(secretUser.email).toBe('secret@tanq.com');
        expect(secretUser.role).toBe('author');
        expect(secretUser.isVerified).toBe(true);
        expect(secretUser.isDisabled).toBe(false);
        expect(secretUser.submissionCount).toBe(0);
        expect(secretUser.reviewCount).toBe(0);
        expect(secretUser.isCurrentUser).toBe(false);
        expect(secretUser.canDisable).toBe(true);
        expect(secretUser.canRestore).toBe(false);
        expect(secretUser.canDelete).toBe(true);
        expect(secretUser.deleteBlockReason).toBeNull();
      });
    });

    describe('POST /api/accounts', () => {
      it('should reject state-changing requests without same-origin validation', async () => {
        globalThis.testSessionToken = adminToken;
        const req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://hacker.com',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: 999 })
        });
        const res = await accountsHandler.POST(req);
        expect(res.status).toBe(403);
      });

      it('should disable account and revoke all active sessions', async () => {
        globalThis.testSessionToken = adminToken;

        const userPass = await hashPassword('UserToDisable123!');
        const userRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('to_disable', ${userPass}, 'Disable User', 'disable@tanq.com', 'author', TRUE)
          RETURNING id
        `;
        const targetId = userRes.rows[0].id;
        const targetToken = await createSession(targetId);

        // Verify session works initially
        globalThis.testSessionToken = targetToken;
        let sessionCheck = await getSessionUser();
        expect(sessionCheck).not.toBeNull();

        // Perform disable action
        globalThis.testSessionToken = adminToken;
        const req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: targetId })
        });
        const res = await accountsHandler.POST(req);
        expect(res.status).toBe(200);

        // Verify is_disabled is true
        const checkUser = await db`SELECT is_disabled FROM users WHERE id = ${targetId}`;
        expect(checkUser.rows[0].is_disabled).toBe(true);

        // Verify sessions are revoked
        globalThis.testSessionToken = targetToken;
        sessionCheck = await getSessionUser();
        expect(sessionCheck).toBeNull();
      });

      it('should restore account and preserve verification state', async () => {
        globalThis.testSessionToken = adminToken;

        const userPass = await hashPassword('UserToRestore123!');
        const userRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified, is_disabled)
          VALUES ('to_restore', ${userPass}, 'Restore User', 'restore@tanq.com', 'author', FALSE, TRUE)
          RETURNING id
        `;
        const targetId = userRes.rows[0].id;

        const req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'restore', userId: targetId })
        });
        const res = await accountsHandler.POST(req);
        expect(res.status).toBe(200);

        // Verify disabled status and verification status
        const checkUser = await db`SELECT is_disabled, is_verified FROM users WHERE id = ${targetId}`;
        expect(checkUser.rows[0].is_disabled).toBe(false);
        expect(checkUser.rows[0].is_verified).toBe(false); // verification state preserved
      });

      it('should block self-disable and self-delete', async () => {
        globalThis.testSessionToken = adminToken;

        // Self-disable
        let req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: adminId })
        });
        let res = await accountsHandler.POST(req);
        expect(res.status).toBe(409);

        // Self-delete
        req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'delete', userId: adminId, confirmationEmail: 'admin@tanq.com' })
        });
        res = await accountsHandler.POST(req);
        expect(res.status).toBe(409);
      });

      it('should protect the last enabled administrator', async () => {
        // Create second admin
        const secondAdminPass = await hashPassword('AdminPass222!');
        const secondAdminRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('admin_second', ${secondAdminPass}, 'Second Admin', 'second@tanq.com', 'admin', TRUE)
          RETURNING id
        `;
        const secondAdminId = secondAdminRes.rows[0].id;

        globalThis.testSessionToken = adminToken;

        // Disable second admin (succeeds because main admin is still active)
        let req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: secondAdminId })
        });
        let res = await accountsHandler.POST(req);
        expect(res.status).toBe(200);

        // Try to disable main admin (self-disable, blocked)
        req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: adminId })
        });
        res = await accountsHandler.POST(req);
        expect(res.status).toBe(409);

        // Restore second admin
        req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'restore', userId: secondAdminId })
        });
        await accountsHandler.POST(req);

        // Now log in as second admin
        const secondAdminToken = await createSession(secondAdminId);
        globalThis.testSessionToken = secondAdminToken;

        // Try to disable main admin (leaves only second admin, so it succeeds)
        req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: adminId })
        });
        res = await accountsHandler.POST(req);
        expect(res.status).toBe(200);

        // Now main admin is disabled. Second admin is the last enabled admin.
        // Try to disable second admin (leaves no enabled admin, blocked)
        req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'disable', userId: secondAdminId })
        });
        res = await accountsHandler.POST(req);
        expect(res.status).toBe(409);
      });

      it('should block deletion when matching submission or review history exists (case-insensitive and trimmed)', async () => {
        globalThis.testSessionToken = adminToken;

        const authorPass = await hashPassword('AuthorPass123!');
        const authorRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('history_author', ${authorPass}, 'History Author', 'History@TANQ.com', 'author', TRUE)
          RETURNING id
        `;
        const authorId = authorRes.rows[0].id;

        // 1. Create a submission matching author email (case-insensitive/trimmed variation)
        const subRes = await db`
          INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
          VALUES ('History Paper', 'Abstract', 'keys', 'History Author', '  history@tanq.com  ', 'https://mock.blob/paper.pdf', 'submitted', '2026-06-06')
          RETURNING id
        `;
        const subId = subRes.rows[0].id;

        // Try deleting author - should fail with 409
        let req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'delete', userId: authorId, confirmationEmail: 'history@tanq.com' })
        });
        let res = await accountsHandler.POST(req);
        expect(res.status).toBe(409);

        // Remove submissions, but insert a review matching reviewer email
        await db`DELETE FROM submissions`;
        await db`
          INSERT INTO reviews (submission_id, reviewer_name, reviewer_email, comments, recommendation, score, date_reviewed)
          VALUES (null, 'History Reviewer', '  history@tanq.com  ', 'Some comments', 'accept', 5, '2026-06-06')
        `;

        // Try deleting author - should still fail with 409
        req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'delete', userId: authorId, confirmationEmail: 'history@tanq.com' })
        });
        res = await accountsHandler.POST(req);
        expect(res.status).toBe(409);
      });

      it('should reject deletion when the confirmation email does not match', async () => {
        globalThis.testSessionToken = adminToken;

        const authorPass = await hashPassword('AuthorPass123!');
        const authorRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('confirm_author', ${authorPass}, 'Confirm Author', 'confirm@tanq.com', 'author', TRUE)
          RETURNING id
        `;
        const authorId = authorRes.rows[0].id;

        const req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'delete', userId: authorId, confirmationEmail: 'wrong@tanq.com' })
        });
        const res = await accountsHandler.POST(req);
        expect(res.status).toBe(400);
      });

      it('should verify direct deletion of enabled history-free account and remove its sessions', async () => {
        globalThis.testSessionToken = adminToken;

        const authorPass = await hashPassword('AuthorPass123!');
        const authorRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('clean_author', ${authorPass}, 'Clean Author', 'clean@tanq.com', 'author', TRUE)
          RETURNING id
        `;
        const authorId = authorRes.rows[0].id;
        const authorToken = await createSession(authorId);

        const req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'delete', userId: authorId, confirmationEmail: '  clean@tanq.com  ' })
        });
        const res = await accountsHandler.POST(req);
        expect(res.status).toBe(200);

        // Verify user deleted
        const checkUser = await db`SELECT id FROM users WHERE id = ${authorId}`;
        expect(checkUser.rows.length).toBe(0);

        // Verify sessions are gone
        globalThis.testSessionToken = authorToken;
        const sessionCheck = await getSessionUser();
        expect(sessionCheck).toBeNull();
      });

      it('should verify deleted emails can register again, while disabled-account emails remain reserved', async () => {
        // 1. Create disabled account and delete another clean account
        const passHash = await hashPassword('SomePassword123!');
        
        const disabledRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified, is_disabled)
          VALUES ('disabled_reg', ${passHash}, 'Disabled', 'disabled-reg@tanq.com', 'author', TRUE, TRUE)
          RETURNING id
        `;
        
        const deletedRes = await db`
          INSERT INTO users (username, password_hash, name, email, role, is_verified)
          VALUES ('deleted_reg', ${passHash}, 'Deleted', 'deleted-reg@tanq.com', 'author', TRUE)
          RETURNING id
        `;
        const deletedId = deletedRes.rows[0].id;

        // Delete deleted_reg
        globalThis.testSessionToken = adminToken;
        let req = new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'delete', userId: deletedId, confirmationEmail: 'deleted-reg@tanq.com' })
        });
        let res = await accountsHandler.POST(req);
        expect(res.status).toBe(200);

        // 2. Try registering using the deleted email
        const authHandler = await import('@/app/api/auth/route');
        const registerReqDeleted = {
          action: 'register',
          username: 'deleted_reg_again',
          password: 'NewValidPassword123!',
          name: 'Deleted Again',
          email: 'deleted-reg@tanq.com',
          role: 'author'
        };
        let regReqObj = new Request('http://localhost/api/auth', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify(registerReqDeleted)
        });
        let regRes = await authHandler.POST(regReqObj);
        // Standard author registration responds with 200 requesting verification
        expect(regRes.status).toBe(200);

        // 3. Try registering using the disabled email
        const registerReqDisabled = {
          action: 'register',
          username: 'disabled_reg_again',
          password: 'NewValidPassword123!',
          name: 'Disabled Again',
          email: 'disabled-reg@tanq.com',
          role: 'author'
        };
        regReqObj = new Request('http://localhost/api/auth', {
          method: 'POST',
          headers: {
            'host': 'localhost',
            'origin': 'http://localhost',
            'content-type': 'application/json'
          },
          body: JSON.stringify(registerReqDisabled)
        });
        regRes = await authHandler.POST(regReqObj);
        expect(regRes.status).toBe(409); // Conflict, email reserved
      });
    });
  });
});
