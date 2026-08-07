import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('@/lib/blob', () => ({
  get: getMock,
  put: putMock,
}));

import { publicationPdfHref } from '@/lib/publicationPdfPaths';
import { publicationPdfResponse, savePublicationPdf } from '@/lib/publicationPdfs';

describe('publication PDFs', () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
  });

  it('uploads publication PDFs with private store access', async () => {
    putMock.mockResolvedValue({
      url: 'https://store.private.blob.vercel-storage.com/articles/example.pdf',
    });
    const file = new File(['pdf'], 'article.pdf', { type: 'application/pdf' });

    const url = await savePublicationPdf(file, 'article');

    expect(url).toContain('.private.blob.vercel-storage.com');
    expect(putMock).toHaveBeenCalledWith(
      expect.stringMatching(/^articles\/\d+_article\.pdf$/),
      file,
      { access: 'private', contentType: 'application/pdf' },
    );
  });

  it('streams private Blob content through a same-origin response', async () => {
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new Blob(['pdf']).stream(),
      headers: new Headers(),
      blob: {
        contentType: 'application/pdf',
        size: 3,
        etag: 'etag-1',
        uploadedAt: new Date('2026-08-07T00:00:00.000Z'),
      },
    });

    const response = await publicationPdfResponse(
      new Request('https://anq.aftap.org/api/publications/article/4/pdf'),
      'https://store.private.blob.vercel-storage.com/articles/example.pdf',
      'Research Article',
    );

    expect(getMock).toHaveBeenCalledWith(
      'https://store.private.blob.vercel-storage.com/articles/example.pdf',
      { access: 'private' },
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('content-type')).toBe('application/pdf');
    expect(response?.headers.get('content-disposition')).toContain("Research%20Article.pdf");
  });

  it('preserves legacy same-origin publication files', async () => {
    const response = await publicationPdfResponse(
      new Request('https://anq.aftap.org/api/publications/issue/1/pdf'),
      '/volumes/ANQ-Volume-1-2026.pdf',
      'Volume 1',
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe(
      'https://anq.aftap.org/volumes/ANQ-Volume-1-2026.pdf',
    );
    expect(getMock).not.toHaveBeenCalled();
  });

  it('rejects untrusted publication URLs instead of becoming an open redirect', async () => {
    const response = await publicationPdfResponse(
      new Request('https://anq.aftap.org/api/publications/issue/1/pdf'),
      '//example.com/untrusted.pdf',
      'Volume 1',
    );

    expect(response).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('builds stable same-origin download paths', () => {
    expect(publicationPdfHref('issue', 12)).toBe('/api/publications/issue/12/pdf');
  });
});
