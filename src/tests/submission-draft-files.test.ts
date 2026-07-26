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

const storedBlobs = vi.hoisted(() => new Map<string, {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  etag: string;
}>());
const deleteBlobMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/blob', () => ({
  head: vi.fn(async (url: string) => {
    const blob = storedBlobs.get(url);
    if (!blob) throw new Error('Blob not found');
    return blob;
  }),
  del: deleteBlobMock,
}));

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

describe('Persisted submission draft files', () => {
  let route: typeof import('@/app/api/submissions/[id]/files/route');
  let draftId: number;
  let publicId: string;
  let authorToken: string;
  let otherAuthorToken: string;

  beforeAll(async () => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });
    route = await import('@/app/api/submissions/[id]/files/route');
  });

  beforeEach(async () => {
    await resetTestDatabase();
    storedBlobs.clear();
    deleteBlobMock.mockClear();

    const users = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES
        ('draft_file_author', 'hash', 'Draft File Author', 'draft-file-author@tanq.test', 'author', TRUE),
        ('draft_file_other', 'hash', 'Other Author', 'other-draft-author@tanq.test', 'author', TRUE)
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
        'Persistent Draft', 'Draft abstract', 'draft, files',
        'Draft File Author', ${users.rows[0].email}, '', 'draft', 'draft', ''
      )
      RETURNING id, public_id
    `;
    draftId = Number(draft.rows[0].id);
    publicId = String(draft.rows[0].public_id);
    globalThis.testSessionToken = authorToken;
  });

  function addBlob(originalFilename: string, uploadId: string) {
    const pathname = `manuscripts/${publicId}/manuscript/${uploadId}-${originalFilename}`;
    const url = `https://mock.blob.vercel.storage/${pathname}`;
    storedBlobs.set(url, {
      url,
      pathname,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 2048,
      etag: `etag-${uploadId}`,
    });
    return { url, pathname, originalFilename };
  }

  function request(method: 'POST' | 'DELETE', body: object) {
    return new Request(`http://localhost/api/submissions/${draftId}/files`, {
      method,
      headers: {
        host: 'localhost',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  it('registers an uploaded file in the draft manifest so it survives reopening', async () => {
    const uploaded = addBlob('anonymous.docx', '00000000-0000-4000-8000-000000000001');
    const response = await route.POST(request('POST', { kind: 'manuscript', ...uploaded }), {
      params: Promise.resolve({ id: String(draftId) }),
    });

    expect(response.status).toBe(200);
    const saved = await db`SELECT files_meta FROM submissions WHERE id = ${draftId}`;
    expect(saved.rows[0].files_meta.manuscript).toMatchObject({
      kind: 'manuscript',
      originalFilename: 'anonymous.docx',
      pathname: uploaded.pathname,
      url: uploaded.url,
      size: 2048,
    });
  });

  it('atomically replaces a manifest entry and removes the superseded blob afterward', async () => {
    const first = addBlob('anonymous-v1.docx', '00000000-0000-4000-8000-000000000001');
    const second = addBlob('anonymous-v2.docx', '00000000-0000-4000-8000-000000000002');

    await route.POST(request('POST', { kind: 'manuscript', ...first }), {
      params: Promise.resolve({ id: String(draftId) }),
    });
    const response = await route.POST(request('POST', { kind: 'manuscript', ...second }), {
      params: Promise.resolve({ id: String(draftId) }),
    });

    expect(response.status).toBe(200);
    const saved = await db`SELECT files_meta FROM submissions WHERE id = ${draftId}`;
    expect(saved.rows[0].files_meta.manuscript.url).toBe(second.url);
    expect(deleteBlobMock).toHaveBeenCalledWith(first.url);
  });

  it('removes a saved slot from both the draft manifest and Blob storage', async () => {
    const uploaded = addBlob('anonymous.docx', '00000000-0000-4000-8000-000000000001');
    await route.POST(request('POST', { kind: 'manuscript', ...uploaded }), {
      params: Promise.resolve({ id: String(draftId) }),
    });

    const response = await route.DELETE(request('DELETE', { kind: 'manuscript' }), {
      params: Promise.resolve({ id: String(draftId) }),
    });

    expect(response.status).toBe(200);
    const saved = await db`SELECT files_meta FROM submissions WHERE id = ${draftId}`;
    expect(saved.rows[0].files_meta).toEqual({});
    expect(deleteBlobMock).toHaveBeenCalledWith(uploaded.url);
  });

  it('does not allow another author to register a file against the draft', async () => {
    globalThis.testSessionToken = otherAuthorToken;
    const uploaded = addBlob('anonymous.docx', '00000000-0000-4000-8000-000000000001');
    const response = await route.POST(request('POST', { kind: 'manuscript', ...uploaded }), {
      params: Promise.resolve({ id: String(draftId) }),
    });

    expect(response.status).toBe(404);
    const saved = await db`SELECT files_meta FROM submissions WHERE id = ${draftId}`;
    expect(saved.rows[0].files_meta).toEqual({});
  });
});
