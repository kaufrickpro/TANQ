import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { put } from '@vercel/blob';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function getNumber(formData: FormData, key: string) {
  const value = Number(getString(formData, key));
  return Number.isFinite(value) ? value : undefined;
}

async function savePdfFile(file: File, folderName: 'issues' | 'volumes') {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Only PDF files are supported');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const blobName = `${Date.now()}_${safeName}`;
  const blob = await put(blobName, file, { access: 'public' });

  return blob.url;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const issuesResult = await db`SELECT * FROM issues ORDER BY year DESC, volume DESC, number DESC`;
    const issues = issuesResult.rows;

    if (searchParams.get('include') === 'volumes') {
      const volumesResult = await db`SELECT * FROM journal_volumes ORDER BY year DESC, volume DESC`;
      const volumes = volumesResult.rows;
      return NextResponse.json({ issues, volumes });
    }

    return NextResponse.json(issues);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function handleMultipartPost(request: Request) {
  const formData = await request.formData();
  const action = getString(formData, 'action');

  if (action === 'upsert_volume_pdf') {
    const volume = getNumber(formData, 'volume');
    const year = getNumber(formData, 'year');
    const title = getString(formData, 'title');
    const subtitle = getString(formData, 'subtitle');
    const file = formData.get('file') as File | null;

    if (volume === undefined || year === undefined || !title || !file) {
      return NextResponse.json({ error: 'Volume, year, title, and PDF file are required' }, { status: 400 });
    }

    const pdfUrl = await savePdfFile(file, 'volumes');
    await db`
      INSERT INTO journal_volumes (volume, year, title, subtitle, pdf_url)
      VALUES (${volume}, ${year}, ${title}, ${subtitle || null}, ${pdfUrl})
      ON CONFLICT(volume, year) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        pdf_url = EXCLUDED.pdf_url
    `;

    const volumeRecordResult = await db`SELECT * FROM journal_volumes WHERE volume = ${volume} AND year = ${year}`;
    const volumeRecord = volumeRecordResult.rows[0];
    return NextResponse.json({ success: true, volume: volumeRecord });
  }

  if (action === 'create_issue') {
    const volume = getNumber(formData, 'volume');
    const number = getNumber(formData, 'number');
    const year = getNumber(formData, 'year');
    const month = getString(formData, 'month');
    const title = getString(formData, 'title');
    const file = formData.get('issue_pdf') as File | null;

    if (volume === undefined || number === undefined || year === undefined || !month || !title) {
      return NextResponse.json({ error: 'Missing required fields for creating an issue' }, { status: 400 });
    }

    const issuePdfUrl = file ? await savePdfFile(file, 'issues') : null;
    
    const result = await db`
      INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
      VALUES (${volume}, ${number}, ${year}, ${month}, ${title}, ${issuePdfUrl}, 0)
      RETURNING *
    `;
    const newIssue = result.rows[0];

    return NextResponse.json(newIssue);
  }

  if (action === 'update_issue_pdf') {
    const issueId = getNumber(formData, 'issue_id');
    const file = formData.get('issue_pdf') as File | null;

    if (issueId === undefined || !file) {
      return NextResponse.json({ error: 'Issue and PDF file are required' }, { status: 400 });
    }

    const issuePdfUrl = await savePdfFile(file, 'issues');
    
    const result = await db`
      UPDATE issues 
      SET issue_pdf_url = ${issuePdfUrl} 
      WHERE id = ${issueId}
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const updatedIssue = result.rows[0];
    return NextResponse.json({ success: true, issue: updatedIssue });
  }

  return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return await handleMultipartPost(request);
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'create_issue') {
      const { volume, number, year, month, title, issue_pdf_url } = body;

      if (volume === undefined || number === undefined || year === undefined || !month || !title) {
        return NextResponse.json({ error: 'Missing required fields for creating an issue' }, { status: 400 });
      }

      const result = await db`
        INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
        VALUES (${volume}, ${number}, ${year}, ${month}, ${title}, ${issue_pdf_url || null}, 0)
        RETURNING *
      `;
      const newIssue = result.rows[0];

      return NextResponse.json(newIssue);
    }

    if (action === 'publish_issue') {
      const { issue_id } = body;

      if (!issue_id) {
        return NextResponse.json({ error: 'Issue ID is required' }, { status: 400 });
      }

      const result = await db`
        UPDATE issues 
        SET is_published = 1 
        WHERE id = ${issue_id}
        RETURNING *
      `;

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }

      const updatedIssue = result.rows[0];
      return NextResponse.json({ success: true, issue: updatedIssue });
    }

    if (action === 'publish_article') {
      const { submission_id, issue_id, doi, pages, pdf_url, type, title, authors, abstract, keywords } = body;

      if (!submission_id || !issue_id) {
        return NextResponse.json({ error: 'Submission ID and Issue ID are required' }, { status: 400 });
      }

      const submissionResult = await db`SELECT * FROM submissions WHERE id = ${submission_id}`;
      const submission = submissionResult.rows[0] as {
        id: number;
        title: string;
        abstract: string;
        keywords: string;
        author_name: string;
        author_email: string;
        file_path: string;
        status: string;
        date_submitted: string;
      } | undefined;

      if (!submission) {
        return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
      }

      const finalTitle = title || submission.title;
      const finalAuthors = authors || submission.author_name;
      const finalAbstract = abstract || submission.abstract;
      const finalKeywords = keywords || submission.keywords;
      const finalPdfUrl = pdf_url || submission.file_path;
      const finalDoi = doi || '';
      const finalPages = pages || '';
      const finalType = type || 'Research Article';
      const currentDate = new Date().toISOString().split('T')[0];

      const insertArticleResult = await db`
        INSERT INTO articles (issue_id, title, authors, abstract, keywords, doi, pages, pdf_url, type, date_published)
        VALUES (${issue_id}, ${finalTitle}, ${finalAuthors}, ${finalAbstract}, ${finalKeywords}, ${finalDoi}, ${finalPages}, ${finalPdfUrl}, ${finalType}, ${currentDate})
        RETURNING *
      `;

      await db`UPDATE submissions SET status = 'published' WHERE id = ${submission_id}`;

      const newArticle = insertArticleResult.rows[0];

      return NextResponse.json({ success: true, article: newArticle });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
