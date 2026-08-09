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

const { putMock, delMock } = vi.hoisted(() => ({
  putMock: vi.fn(async (pathname: string) => ({
    url: `https://store.private.blob.vercel-storage.com/${pathname}`,
  })),
  delMock: vi.fn(async () => undefined),
}));

vi.mock('@vercel/blob', () => ({
  put: putMock,
  del: delMock,
  get: vi.fn(),
  head: vi.fn(),
}));

describe('publication catalog management', () => {
  let route: typeof import('@/app/api/publish/route');
  let adminToken: string;
  let editorToken: string;

  beforeAll(async () => {
    execSync('npx tsx scripts/migrate.ts', {
      env: { ...process.env, POSTGRES_URL: process.env.TEST_DATABASE_URL || process.env.POSTGRES_URL },
    });
    route = await import('@/app/api/publish/route');
  });

  beforeEach(async () => {
    await resetTestDatabase();
    const users = await db`
      INSERT INTO users (username, password_hash, name, email, role, is_verified)
      VALUES
        ('publication_admin', 'hash', 'Publication Admin', 'pub-admin@tanq.test', 'admin', TRUE),
        ('publication_editor', 'hash', 'Publication Editor', 'pub-editor@tanq.test', 'editor', TRUE)
      RETURNING id, role
    `;
    adminToken = await createSession(Number(users.rows.find((row) => row.role === 'admin')?.id));
    editorToken = await createSession(Number(users.rows.find((row) => row.role === 'editor')?.id));
    globalThis.testSessionToken = adminToken;
    putMock.mockClear();
    delMock.mockClear();
  });

  function mutation(fields: Record<string, string>, file?: File) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.append(key, value);
    if (file) formData.append('file', file);
    return new Request('http://localhost/api/publish', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost' },
      body: formData,
    });
  }

  it('updates a volume by id and keeps matching issue metadata attached', async () => {
    const volume = await db`
      INSERT INTO journal_volumes (volume, year, title, subtitle, pdf_url)
      VALUES (1, 2026, 'Volume One', 'Original', 'https://store.private.blob.vercel-storage.com/volumes/old.pdf')
      RETURNING id
    `;
    await db`
      INSERT INTO issues (volume, number, year, month, title, is_published)
      VALUES (1, 1, 2026, 'June', 'Issue One', 1)
    `;

    const response = await route.POST(mutation({
      action: 'update_volume',
      id: String(volume.rows[0].id),
      volume: '2',
      year: '2027',
      title: 'Volume Two',
      subtitle: 'Revised',
    }, new File(['pdf'], 'volume.pdf', { type: 'application/pdf' })));

    expect(response.status).toBe(200);
    const issue = await db`SELECT volume, year FROM issues LIMIT 1`;
    expect(issue.rows[0]).toMatchObject({ volume: 2, year: 2027 });
    expect(delMock).toHaveBeenCalledWith(
      'https://store.private.blob.vercel-storage.com/volumes/old.pdf',
      undefined,
    );
  });

  it('allows editors to revise but not delete volume records', async () => {
    const volume = await db`
      INSERT INTO journal_volumes (volume, year, title)
      VALUES (1, 2026, 'Volume One')
      RETURNING id
    `;
    globalThis.testSessionToken = editorToken;

    const response = await route.POST(mutation({
      action: 'delete_volume',
      id: String(volume.rows[0].id),
    }));

    expect(response.status).toBe(403);
    const remaining = await db`SELECT COUNT(*)::integer AS count FROM journal_volumes`;
    expect(remaining.rows[0].count).toBe(1);
  });

  it('blocks issue deletion while articles still reference it', async () => {
    const issue = await db`
      INSERT INTO issues (volume, number, year, month, title, is_published)
      VALUES (1, 1, 2026, 'June', 'Issue One', 1)
      RETURNING id
    `;
    await db`
      INSERT INTO articles (issue_id, title, authors, abstract, keywords, doi, pages, pdf_url, type, date_published)
      VALUES (${issue.rows[0].id}, 'Article', 'Author', 'Abstract', 'Keyword', '', '1-2', '/articles/a.pdf', 'Editorial', '2026-06-01')
    `;

    const response = await route.POST(mutation({
      action: 'delete_issue',
      id: String(issue.rows[0].id),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('article') });
  });

  it('revises issue metadata, publication status, and PDF by id', async () => {
    const pdfUrl = 'https://store.private.blob.vercel-storage.com/issues/old.pdf';
    const issue = await db`
      INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
      VALUES (1, 1, 2026, 'June', 'Issue One', ${pdfUrl}, 1)
      RETURNING id
    `;

    const formData = new FormData();
    for (const [key, value] of Object.entries({
      action: 'update_issue',
      id: String(issue.rows[0].id),
      volume: '1',
      number: '2',
      year: '2026',
      month: 'December',
      title: 'Issue Two',
      is_published: 'false',
      remove_pdf: 'true',
    })) formData.append(key, value);

    const response = await route.POST(new Request('http://localhost/api/publish', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost' },
      body: formData,
    }));

    expect(response.status).toBe(200);
    const updated = await db`SELECT number, month, title, issue_pdf_url, is_published FROM issues LIMIT 1`;
    expect(updated.rows[0]).toMatchObject({
      number: 2,
      month: 'December',
      title: 'Issue Two',
      issue_pdf_url: null,
      is_published: 0,
    });
    expect(delMock).toHaveBeenCalledWith(pdfUrl, undefined);
  });

  it('deletes an empty issue and cleans up its private PDF', async () => {
    const pdfUrl = 'https://store.private.blob.vercel-storage.com/issues/old.pdf';
    const issue = await db`
      INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
      VALUES (1, 1, 2026, 'June', 'Issue One', ${pdfUrl}, 1)
      RETURNING id
    `;

    const response = await route.POST(mutation({
      action: 'delete_issue',
      id: String(issue.rows[0].id),
    }));

    expect(response.status).toBe(200);
    expect(delMock).toHaveBeenCalledWith(pdfUrl, undefined);
    const remaining = await db`SELECT COUNT(*)::integer AS count FROM issues`;
    expect(remaining.rows[0].count).toBe(0);
  });

  it('rejects duplicate issue identities with a conflict response', async () => {
    await db`
      INSERT INTO issues (volume, number, year, month, title, is_published)
      VALUES (1, 1, 2026, 'June', 'Issue One', 1)
    `;
    const formData = new FormData();
    formData.append('action', 'create_issue');
    formData.append('volume', '1');
    formData.append('number', '1');
    formData.append('year', '2026');
    formData.append('month', 'December');
    formData.append('title', 'Duplicate Issue');

    const response = await route.POST(new Request('http://localhost/api/publish', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost' },
      body: formData,
    }));

    expect(response.status).toBe(409);
  });
});
