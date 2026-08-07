import 'server-only';

import { get, put } from '@/lib/blob';
import type { PublicationPdfKind } from '@/lib/publicationPdfPaths';

const PDF_FOLDERS: Record<PublicationPdfKind, string> = {
  article: 'articles',
  issue: 'issues',
  volume: 'volumes',
};

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') &&
    (!file.type || file.type === 'application/pdf');
}

export async function savePublicationPdf(file: File, kind: PublicationPdfKind): Promise<string> {
  if (!isPdf(file)) {
    throw new Error('Only PDF files are supported');
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

export async function publicationPdfResponse(
  request: Request,
  blobUrl: string,
  title: string,
): Promise<Response | null> {
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
