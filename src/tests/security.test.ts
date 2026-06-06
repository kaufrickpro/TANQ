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
    return { url: `https://mock.blob.vercel.storage/manuscripts/${path}` };
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
    // Clear dynamic tables before each test
    await db`DELETE FROM auth_sessions`;
    await db`DELETE FROM auth_rate_limits`;
    await db`DELETE FROM reviews`;
    await db`DELETE FROM invitations`;
    await db`DELETE FROM users WHERE username != 'admin'`; // Keep potential seed admin if needed, or clear all
    await db`DELETE FROM users`;
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
});
