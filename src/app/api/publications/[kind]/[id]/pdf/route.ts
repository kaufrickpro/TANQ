import db from '@/lib/db';
import { publicationPdfResponse } from '@/lib/publicationPdfs';
import type { PublicationPdfKind } from '@/lib/publicationPdfPaths';

interface PublicationPdfRecord {
  title: string;
  pdf_url: string | null;
}

function isPublicationKind(value: string): value is PublicationPdfKind {
  return value === 'article' || value === 'issue' || value === 'volume';
}

async function findPublicationPdf(
  kind: PublicationPdfKind,
  id: number,
): Promise<PublicationPdfRecord | null> {
  if (kind === 'article') {
    const result = await db`SELECT title, pdf_url FROM articles WHERE id = ${id}`;
    return (result.rows[0] as PublicationPdfRecord | undefined) ?? null;
  }

  if (kind === 'issue') {
    const result = await db`SELECT title, issue_pdf_url AS pdf_url FROM issues WHERE id = ${id}`;
    return (result.rows[0] as PublicationPdfRecord | undefined) ?? null;
  }

  const result = await db`SELECT title, pdf_url FROM journal_volumes WHERE id = ${id}`;
  return (result.rows[0] as PublicationPdfRecord | undefined) ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id: rawId } = await params;
    if (!isPublicationKind(kind) || !/^\d+$/.test(rawId)) {
      return Response.json({ error: 'Publication PDF not found' }, { status: 404 });
    }

    const record = await findPublicationPdf(kind, Number(rawId));
    if (!record?.pdf_url) {
      return Response.json({ error: 'Publication PDF not found' }, { status: 404 });
    }

    const response = await publicationPdfResponse(request, record.pdf_url, record.title);
    return response ?? Response.json({ error: 'Publication PDF not found' }, { status: 404 });
  } catch (error) {
    console.error('Failed to download publication PDF:', error);
    return Response.json({ error: 'Unable to download publication PDF' }, { status: 500 });
  }
}
