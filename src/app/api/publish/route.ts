import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { put } from '@/lib/blob';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { uploadDocumentVersion } from '@/lib/case-files/documents';
import { transitionSubmission } from '@/lib/case-files/workflow';
import { queueNotification } from '@/lib/notifications';
import type { AuthUser } from '@/lib/session';

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

async function savePdfFile(file: File, folderName: 'issues' | 'volumes' | 'articles') {
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const blobName = `${folderName}/${Date.now()}_${safeName}`;
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

async function handleMultipartPost(request: Request, session: AuthUser) {
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

  if (action === 'publish_article') {
    const submissionId = getNumber(formData, 'submission_id');
    const issueId = getNumber(formData, 'issue_id');
    const doi = getString(formData, 'doi');
    const pages = getString(formData, 'pages');
    const type = getString(formData, 'type') || 'Research Article';
    const file = formData.get('file') as File | null;

    // Custom overrides
    const title = getString(formData, 'title');
    const authors = getString(formData, 'authors');
    const abstract = getString(formData, 'abstract');
    const keywords = getString(formData, 'keywords');

    if (!submissionId || !issueId) {
      return NextResponse.json({ error: 'Submission ID and Issue ID are required' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'A final article PDF file is required to publish.' }, { status: 400 });
    }

    const submissionResult = await db`SELECT * FROM submissions WHERE id = ${submissionId}`;
    const submission = submissionResult.rows[0];

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const stage = submission.current_stage || submission.status;
    if (!['accepted', 'production'].includes(stage)) {
      return NextResponse.json({ error: 'Only accepted or production-stage submissions can be published' }, { status: 409 });
    }

    // Validate and save only after workflow eligibility has been confirmed.
    let pdfUrl = '';
    try {
      pdfUrl = await savePdfFile(file, 'articles');
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'File upload failed. Make sure it is a PDF.' }, { status: 400 });
    }

    const evidenceVersion = await uploadDocumentVersion({
      submissionId,
      kind: 'published_pdf',
      file,
      actor: { id: session.id, name: session.name, role: session.role as any, email: session.email },
      note: 'Private evidence copy of the published article PDF',
    });

    const finalTitle = title || submission.title;
    const finalAuthors = authors || submission.author_name;
    const finalAbstract = abstract || submission.abstract;
    const finalKeywords = keywords || submission.keywords;
    const finalDoi = doi || '';
    const finalPages = pages || '';
    const currentDate = new Date().toISOString().split('T')[0];

    const insertArticleResult = await db`
      INSERT INTO articles (issue_id, title, authors, abstract, keywords, doi, pages, pdf_url, type, date_published, source_document_version_id)
      VALUES (${issueId}, ${finalTitle}, ${finalAuthors}, ${finalAbstract}, ${finalKeywords}, ${finalDoi}, ${finalPages}, ${pdfUrl}, ${type}, ${currentDate}, ${evidenceVersion.version.id})
      RETURNING *
    `;

    const actor = { id: session.id, name: session.name, role: session.role as any, email: session.email };
    if (stage === 'accepted') {
      await transitionSubmission({
        submissionId,
        toStage: 'production',
        actor,
        summary: 'Submission entered production before publication.',
      });
    }
    await transitionSubmission({
      submissionId,
      toStage: 'published',
      actor,
      summary: 'Final article PDF was published.',
      payload: { articleId: insertArticleResult.rows[0].id, sourceDocumentVersionId: evidenceVersion.version.id },
    });

    const newArticle = insertArticleResult.rows[0];
    try {
      let articleUrl = `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/article/${newArticle.id}`;
      const issueRecordResult = await db`SELECT volume, number FROM issues WHERE id = ${issueId}`;
      const issueRecord = issueRecordResult.rows[0];
      if (issueRecord) {
        articleUrl = `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/volume${issueRecord.volume}/issue${issueRecord.number}/article/${newArticle.id}`;
      }

      await queueNotification({
        templateKey: 'article_published',
        recipientEmail: submission.author_email,
        submissionId,
        dedupeKey: `article-published:${newArticle.id}:${submission.author_email.trim().toLowerCase()}`,
        variables: {
          author_name: submission.author_name,
          submission_title: finalTitle,
          article_url: articleUrl,
        },
      });
    } catch (error) {
      console.error('Failed to queue article publication notification:', error);
    }
    return NextResponse.json({ success: true, article: newArticle });
  }

  return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
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
    if (contentType.includes('multipart/form-data')) {
      return await handleMultipartPost(request, session);
    }

    const body = await request.json();
    const { action } = body;

    // JSON fallback actions
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
      return NextResponse.json({ 
        error: 'Article publishing has changed to multipart form data requiring a final PDF upload.' 
      }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in publish POST:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
