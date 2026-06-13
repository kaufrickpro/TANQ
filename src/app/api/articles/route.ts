import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { put } from '@/lib/blob';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function getNumber(formData: FormData, key: string): number | undefined {
  const str = getString(formData, key);
  if (!str) return undefined;
  const value = Number(str);
  return Number.isFinite(value) ? value : undefined;
}

async function savePdfFile(file: File) {
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const blobName = `articles/${Date.now()}_${safeName}`;
  const blob = await put(blobName, file, { access: 'public' });

  return blob.url;
}

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['admin', 'editor'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get('issue_id');

    let result;
    if (issueId) {
      result = await db`
        SELECT * FROM articles 
        WHERE issue_id = ${Number(issueId)} 
        ORDER BY id ASC
      `;
    } else {
      result = await db`
        SELECT * FROM articles 
        ORDER BY id DESC
      `;
    }

    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // CSRF Check
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['admin', 'editor'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Multipart form data is required' }, { status: 400 });
    }

    const formData = await request.formData();
    const action = getString(formData, 'action');

    if (action === 'create') {
      const issueId = getNumber(formData, 'issue_id');
      const title = getString(formData, 'title');
      const authors = getString(formData, 'authors');
      const abstract = getString(formData, 'abstract');
      const keywords = getString(formData, 'keywords');
      const doi = getString(formData, 'doi');
      const pages = getString(formData, 'pages');
      const type = getString(formData, 'type') || 'Research Article';
      const datePublished = getString(formData, 'date_published');
      const file = formData.get('file') as File | null;

      if (!issueId || !title || !authors || !abstract || !keywords || !pages || !datePublished || !file) {
        return NextResponse.json({ error: 'Missing required fields for creating an article' }, { status: 400 });
      }

      let pdfUrl = '';
      try {
        pdfUrl = await savePdfFile(file);
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'File upload failed' }, { status: 400 });
      }

      const result = await db`
        INSERT INTO articles (issue_id, title, authors, abstract, keywords, doi, pages, pdf_url, type, date_published)
        VALUES (${issueId}, ${title}, ${authors}, ${abstract}, ${keywords}, ${doi}, ${pages}, ${pdfUrl}, ${type}, ${datePublished})
        RETURNING *
      `;

      return NextResponse.json({ success: true, article: result.rows[0] });
    }

    if (action === 'update') {
      const id = getNumber(formData, 'id');
      const issueId = getNumber(formData, 'issue_id');
      const title = getString(formData, 'title');
      const authors = getString(formData, 'authors');
      const abstract = getString(formData, 'abstract');
      const keywords = getString(formData, 'keywords');
      const doi = getString(formData, 'doi');
      const pages = getString(formData, 'pages');
      const type = getString(formData, 'type') || 'Research Article';
      const datePublished = getString(formData, 'date_published');
      const file = formData.get('file') as File | null;

      if (!id || !issueId || !title || !authors || !abstract || !keywords || !pages || !datePublished) {
        return NextResponse.json({ error: 'Missing required fields for updating the article' }, { status: 400 });
      }

      let pdfUrl: string | null = null;
      if (file) {
        try {
          pdfUrl = await savePdfFile(file);
        } catch (err: any) {
          return NextResponse.json({ error: err.message || 'File upload failed' }, { status: 400 });
        }
      }

      let result;
      if (pdfUrl) {
        result = await db`
          UPDATE articles 
          SET issue_id = ${issueId},
              title = ${title},
              authors = ${authors},
              abstract = ${abstract},
              keywords = ${keywords},
              doi = ${doi},
              pages = ${pages},
              pdf_url = ${pdfUrl},
              type = ${type},
              date_published = ${datePublished}
          WHERE id = ${id}
          RETURNING *
        `;
      } else {
        result = await db`
          UPDATE articles 
          SET issue_id = ${issueId},
              title = ${title},
              authors = ${authors},
              abstract = ${abstract},
              keywords = ${keywords},
              doi = ${doi},
              pages = ${pages},
              type = ${type},
              date_published = ${datePublished}
          WHERE id = ${id}
          RETURNING *
        `;
      }

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, article: result.rows[0] });
    }

    if (action === 'delete') {
      const id = getNumber(formData, 'id');
      if (!id) {
        return NextResponse.json({ error: 'Article ID is required' }, { status: 400 });
      }

      const result = await db`
        DELETE FROM articles 
        WHERE id = ${id}
        RETURNING *
      `;

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in articles POST:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
