import 'server-only';

import { del, get, put } from '@/lib/blob';
import type { PublicationPdfKind } from '@/lib/publicationPdfPaths';

const PDF_FOLDERS: Record<PublicationPdfKind, string> = {
  article: 'articles',
  issue: 'issues',
  volume: 'volumes',
};

// Published private PDFs from the first two issues had plain-text DOI references.
// Keep their original records intact while serving corrected, checked-in copies.
const DOI_LINKED_PDFS: Record<string, string> = {
  '/articles/1786432265675_3_ANQ-Bridging_the_Gaps.pdf': '/articles/ANQ-Article-2-DOI-Links.pdf',
  '/articles/1786179867676_ANQ-Transformative_Learning.pdf': '/articles/ANQ-Article-7-DOI-Links.pdf',
  '/articles/1788463905639_ANQ_Cultural_Convergence.pdf': '/articles/ANQ-Article-8-DOI-Links.pdf',
};

export const MAX_PUBLICATION_PDF_BYTES = 100 * 1024 * 1024;

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') &&
    (!file.type || file.type === 'application/pdf');
}

export async function savePublicationPdf(file: File, kind: PublicationPdfKind): Promise<string> {
  if (!isPdf(file)) {
    throw new Error('Only PDF files are supported');
  }
  if (file.size <= 0) {
    throw new Error('The PDF file is empty');
  }
  if (file.size > MAX_PUBLICATION_PDF_BYTES) {
    throw new Error('Publication PDFs must be 100 MB or smaller');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const pathname = `${PDF_FOLDERS[kind]}/${Date.now()}_${safeName}`;
  const blob = await put(pathname, file, {
    access: 'private',
    contentType: 'application/pdf',
  });

  return blob.url;
}

function downloadDisposition(title: string): string {
  const filename = `${title.trim() || 'publication'}.pdf`;
  return `attachment; filename="publication.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function legacyPublicUrl(value: string, requestUrl: string): URL | null {
  if (value.startsWith('/') && !value.startsWith('//')) {
    return new URL(value, requestUrl);
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com')
      ? url
      : null;
  } catch {
    return null;
  }
}

function isPrivateBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.private.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function doiLinkedPublicationPdf(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname.endsWith('.private.blob.vercel-storage.com')) {
      return DOI_LINKED_PDFS[url.pathname] ?? value;
    }
  } catch {
    // Relative legacy paths are handled by publicationPdfResponse.
  }
  return value;
}

/**
 * Removes publication files only when they belong to the private Blob store.
 * Legacy public paths and unknown URLs are deliberately left untouched.
 */
export async function removePublicationPdf(value: string | null | undefined): Promise<boolean> {
  if (!value || !isPrivateBlobUrl(value)) return false;
  await del(value);
  return true;
}

export async function publicationPdfResponse(
  request: Request,
  blobUrl: string,
  title: string,
): Promise<Response | null> {
  blobUrl = doiLinkedPublicationPdf(blobUrl);
  // The first published issue used static, same-origin files. Keep those links
  // valid while all new private Blob files are streamed by this application.
  const publicUrl = legacyPublicUrl(blobUrl, request.url);
  if (publicUrl) {
    return Response.redirect(publicUrl, 307);
  }

  if (!isPrivateBlobUrl(blobUrl)) return null;

  const result = await get(blobUrl, { access: 'private' });
  if (!result || result.statusCode !== 200) return null;

  return new Response(result.stream, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'Content-Disposition': downloadDisposition(title),
      'Content-Length': String(result.blob.size),
      'Content-Type': result.blob.contentType || 'application/pdf',
      ETag: result.blob.etag,
      'Last-Modified': result.blob.uploadedAt.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
