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

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import db from '@/lib/db';
import { createSession } from '@/lib/session';
import { resetTestDatabase } from './helpers/db';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (
      name === 'session_token' && globalThis.testSessionToken
        ? { value: globalThis.testSessionToken }
        : undefined
    ),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const handleUploadMock = vi.hoisted(() => vi.fn(async (options: any) => {
  const generated = await options.onBeforeGenerateToken(
    options.body.payload.pathname,
    options.body.payload.clientPayload,
    options.body.payload.multipart,
  );
  return {
    type: 'blob.generate-client-token',
    clientToken: JSON.stringify(generated),
  };
}));

vi.mock('@vercel/blob/client', () => ({
  handleUpload: handleUploadMock,
}));

describe('Direct submission upload authorization', () => {
  let route: typeof import('@/app/api/submissions/upload/route');
  let authorToken: string;
  let otherAuthorToken: string;
  let draftId: number;
  let publicId: string;

  beforeAll(async () => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });
    route = await import('@/app/api/submissions/upload/route');
  });

  beforeEach(async () => {
    await resetTestDatabase();
    const users = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES
        ('upload_author', 'hash', 'Upload Author', 'upload-author@tanq.test', 'author', TRUE),
        ('upload_other', 'hash', 'Other Author', 'upload-other@tanq.test', 'author', TRUE)
      RETURNING id, email
    `;
    authorToken = await createSession(Number(users.rows[0].id));
    otherAuthorToken = await createSession(Number(users.rows[1].id));
    const draft = await db`
      INSERT INTO submissions (
        title, abstract, keywords, author_name, author_email,
        file_path, status, current_stage, date_submitted
      )
      VALUES (
        'Upload Draft', 'Draft abstract', 'upload',
        'Upload Author', ${users.rows[0].email}, '', 'draft', 'draft', ''
      )
      RETURNING id, public_id
    `;
    draftId = Number(draft.rows[0].id);
    publicId = String(draft.rows[0].public_id);
    globalThis.testSessionToken = authorToken;
    handleUploadMock.mockClear();
  });

  function tokenRequest(pathname: string, options?: { origin?: boolean; draftId?: number }) {
    const uploadId = '00000000-0000-4000-8000-000000000001';
    return new Request('http://localhost/api/submissions/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost',
        ...(options?.origin === false ? {} : { origin: 'http://localhost' }),
      },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname,
          multipart: true,
          clientPayload: JSON.stringify({
            draftId: options?.draftId ?? draftId,
            kind: 'manuscript',
            originalFilename: 'anonymous.docx',
            uploadId,
          }),
        },
      }),
    });
  }

  it('issues a tightly constrained private upload token for an author-owned draft', async () => {
    const pathname =
      `manuscripts/${publicId}/manuscript/00000000-0000-4000-8000-000000000001-anonymous.docx`;
    const response = await route.POST(tokenRequest(pathname));
    expect(response.status).toBe(200);
    const body = await response.json();
    const tokenOptions = JSON.parse(body.clientToken);
    expect(tokenOptions.maximumSizeInBytes).toBe(20 * 1024 * 1024);
    expect(tokenOptions.allowedContentTypes).toEqual([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    expect(tokenOptions.addRandomSuffix).toBe(false);
    expect(tokenOptions.allowOverwrite).toBe(false);
  });

  it('rejects a pathname that is not canonically bound to the draft', async () => {
    const response = await route.POST(tokenRequest(
      'manuscripts/another-draft/manuscript/00000000-0000-4000-8000-000000000001-anonymous.docx',
    ));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Upload path does not belong to this draft.',
    });
  });

  it('does not issue a token for another author’s draft', async () => {
    globalThis.testSessionToken = otherAuthorToken;
    const pathname =
      `manuscripts/${publicId}/manuscript/00000000-0000-4000-8000-000000000001-anonymous.docx`;
    const response = await route.POST(tokenRequest(pathname));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Draft not found or no longer editable',
    });
  });

  it('requires same-origin token-generation requests', async () => {
    const pathname =
      `manuscripts/${publicId}/manuscript/00000000-0000-4000-8000-000000000001-anonymous.docx`;
    const response = await route.POST(tokenRequest(pathname, { origin: false }));
    expect(response.status).toBe(403);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON values before calling the Blob SDK', async () => {
    const response = await route.POST(new Request('http://localhost/api/submissions/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost',
        origin: 'http://localhost',
      },
      body: 'null',
    }));
    expect(response.status).toBe(400);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });
});
