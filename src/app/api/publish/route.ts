import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { uploadDocumentVersion } from '@/lib/case-files/documents';
import { transitionSubmission } from '@/lib/case-files/workflow';
import { queueNotification } from '@/lib/notifications';
import { removePublicationPdf, savePublicationPdf } from '@/lib/publicationPdfs';
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

function getBoolean(formData: FormData, key: string, fallback = false): boolean {
  const value = getString(formData, key).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function validPositiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

function validYear(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 1000 && value <= 9999;
}

function publicationFieldsAreValid(input: {
  volume?: number;
  year?: number;
  number?: number;
  title: string;
  month?: string;
}) {
  return validPositiveInteger(input.volume)
    && validYear(input.year)
    && (input.number === undefined || validPositiveInteger(input.number))
    && input.title.length > 0
    && input.title.length <= 300
    && (input.month === undefined || (input.month.length > 0 && input.month.length <= 40));
}

async function removePublicationPdfQuietly(url: string | null | undefined) {
  try {
    await removePublicationPdf(url);
  } catch (error) {
    console.error('Failed to remove superseded publication PDF:', error);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
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

  if (action === 'create_volume' || action === 'upsert_volume_pdf') {
    const volume = getNumber(formData, 'volume');
    const year = getNumber(formData, 'year');
    const title = getString(formData, 'title');
    const subtitle = getString(formData, 'subtitle');
    const file = formData.get('file') as File | null;

    if (!publicationFieldsAreValid({ volume, year, title }) || subtitle.length > 500) {
      return NextResponse.json({ error: 'Enter a valid volume, four-digit year, and title' }, { status: 400 });
    }
    if (action === 'upsert_volume_pdf' && !file) {
      return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
    }

    const previousVolume = action === 'upsert_volume_pdf'
      ? (await db`
          SELECT pdf_url FROM journal_volumes WHERE volume = ${volume} AND year = ${year}
        `).rows[0]
      : null;
    const pdfUrl = file ? await savePublicationPdf(file, 'volume') : null;
    try {
      const result = action === 'upsert_volume_pdf'
        ? await db`
            INSERT INTO journal_volumes (volume, year, title, subtitle, pdf_url)
            VALUES (${volume}, ${year}, ${title}, ${subtitle || null}, ${pdfUrl})
            ON CONFLICT(volume, year) DO UPDATE SET
              title = EXCLUDED.title,
              subtitle = EXCLUDED.subtitle,
              pdf_url = EXCLUDED.pdf_url
            RETURNING *
          `
        : await db`
            INSERT INTO journal_volumes (volume, year, title, subtitle, pdf_url)
            VALUES (${volume}, ${year}, ${title}, ${subtitle || null}, ${pdfUrl})
            RETURNING *
          `;

      if (previousVolume?.pdf_url && previousVolume.pdf_url !== pdfUrl) {
        await removePublicationPdfQuietly(previousVolume.pdf_url);
      }
      return NextResponse.json({ success: true, volume: result.rows[0] });
    } catch (error) {
      await removePublicationPdfQuietly(pdfUrl);
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: 'A volume with this number and year already exists' }, { status: 409 });
      }
      throw error;
    }
  }

  if (action === 'update_volume') {
    const id = getNumber(formData, 'id');
    const volume = getNumber(formData, 'volume');
    const year = getNumber(formData, 'year');
    const title = getString(formData, 'title');
    const subtitle = getString(formData, 'subtitle');
    const file = formData.get('file') as File | null;
    const removePdf = getBoolean(formData, 'remove_pdf');

    if (!validPositiveInteger(id) || !publicationFieldsAreValid({ volume, year, title }) || subtitle.length > 500) {
      return NextResponse.json({ error: 'Enter a valid volume, four-digit year, and title' }, { status: 400 });
    }
    if (file && removePdf) {
      return NextResponse.json({ error: 'Choose either a replacement PDF or remove the current PDF' }, { status: 400 });
    }

    const uploadedPdfUrl = file ? await savePublicationPdf(file, 'volume') : null;
    const client = await db.connect();
    let previousPdfUrl: string | null = null;
    try {
      await client.sql`BEGIN`;
      const currentResult = await client.sql`
        SELECT id, volume, year, pdf_url FROM journal_volumes WHERE id = ${id} FOR UPDATE
      `;
      if (currentResult.rows.length === 0) {
        await client.sql`ROLLBACK`;
        await removePublicationPdfQuietly(uploadedPdfUrl);
        return NextResponse.json({ error: 'Volume not found' }, { status: 404 });
      }

      const current = currentResult.rows[0];
      previousPdfUrl = current.pdf_url;
      const nextPdfUrl = uploadedPdfUrl || (removePdf ? null : previousPdfUrl);
      const result = await client.sql`
        UPDATE journal_volumes
        SET volume = ${volume}, year = ${year}, title = ${title}, subtitle = ${subtitle || null}, pdf_url = ${nextPdfUrl}
        WHERE id = ${id}
        RETURNING *
      `;

      if (Number(current.volume) !== volume || Number(current.year) !== year) {
        await client.sql`
          UPDATE issues
          SET volume = ${volume}, year = ${year}
          WHERE volume = ${Number(current.volume)} AND year = ${Number(current.year)}
        `;
      }
      await client.sql`COMMIT`;

      if ((uploadedPdfUrl || removePdf) && previousPdfUrl !== nextPdfUrl) {
        await removePublicationPdfQuietly(previousPdfUrl);
      }
      return NextResponse.json({ success: true, volume: result.rows[0] });
    } catch (error) {
      await client.sql`ROLLBACK`;
      await removePublicationPdfQuietly(uploadedPdfUrl);
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: 'A volume with this number and year already exists' }, { status: 409 });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === 'delete_volume') {
    const id = getNumber(formData, 'id');
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can delete volumes' }, { status: 403 });
    }
    if (!validPositiveInteger(id)) {
      return NextResponse.json({ error: 'Volume ID is required' }, { status: 400 });
    }

    const client = await db.connect();
    try {
      await client.sql`BEGIN`;
      const currentResult = await client.sql`
        SELECT id, volume, year, pdf_url FROM journal_volumes WHERE id = ${id} FOR UPDATE
      `;
      if (currentResult.rows.length === 0) {
        await client.sql`ROLLBACK`;
        return NextResponse.json({ error: 'Volume not found' }, { status: 404 });
      }
      const current = currentResult.rows[0];
      const issueCountResult = await client.sql`
        SELECT COUNT(*)::integer AS count FROM issues
        WHERE volume = ${Number(current.volume)} AND year = ${Number(current.year)}
      `;
      await client.sql`DELETE FROM journal_volumes WHERE id = ${id}`;
      await client.sql`COMMIT`;
      await removePublicationPdfQuietly(current.pdf_url);
      return NextResponse.json({ success: true, retainedIssueCount: Number(issueCountResult.rows[0].count) });
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === 'create_issue') {
    const volume = getNumber(formData, 'volume');
    const number = getNumber(formData, 'number');
    const year = getNumber(formData, 'year');
    const month = getString(formData, 'month');
    const title = getString(formData, 'title');
    const file = formData.get('issue_pdf') as File | null;
    const isPublished = getBoolean(formData, 'is_published', true);

    if (!publicationFieldsAreValid({ volume, number, year, month, title })) {
      return NextResponse.json({ error: 'Enter valid volume, issue, year, month, and title values' }, { status: 400 });
    }

    const issuePdfUrl = file ? await savePublicationPdf(file, 'issue') : null;
    try {
      const result = await db`
        INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
        VALUES (${volume}, ${number}, ${year}, ${month}, ${title}, ${issuePdfUrl}, ${isPublished ? 1 : 0})
        RETURNING *
      `;
      return NextResponse.json(result.rows[0]);
    } catch (error) {
      await removePublicationPdfQuietly(issuePdfUrl);
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: 'This issue number already exists in the selected volume and year' }, { status: 409 });
      }
      throw error;
    }
  }

  if (action === 'update_issue') {
    const id = getNumber(formData, 'id');
    const volume = getNumber(formData, 'volume');
    const number = getNumber(formData, 'number');
    const year = getNumber(formData, 'year');
    const month = getString(formData, 'month');
    const title = getString(formData, 'title');
    const file = formData.get('issue_pdf') as File | null;
    const isPublished = getBoolean(formData, 'is_published');
    const removePdf = getBoolean(formData, 'remove_pdf');

    if (!validPositiveInteger(id) || !publicationFieldsAreValid({ volume, number, year, month, title })) {
      return NextResponse.json({ error: 'Enter valid volume, issue, year, month, and title values' }, { status: 400 });
    }
    if (file && removePdf) {
      return NextResponse.json({ error: 'Choose either a replacement PDF or remove the current PDF' }, { status: 400 });
    }

    const uploadedPdfUrl = file ? await savePublicationPdf(file, 'issue') : null;
    const client = await db.connect();
    try {
      await client.sql`BEGIN`;
      const currentResult = await client.sql`
        SELECT id, issue_pdf_url FROM issues WHERE id = ${id} FOR UPDATE
      `;
      if (currentResult.rows.length === 0) {
        await client.sql`ROLLBACK`;
        await removePublicationPdfQuietly(uploadedPdfUrl);
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }
      const current = currentResult.rows[0];
      const nextPdfUrl = uploadedPdfUrl || (removePdf ? null : current.issue_pdf_url);
      const result = await client.sql`
        UPDATE issues
        SET volume = ${volume}, number = ${number}, year = ${year}, month = ${month}, title = ${title},
            issue_pdf_url = ${nextPdfUrl}, is_published = ${isPublished ? 1 : 0}
        WHERE id = ${id}
        RETURNING *
      `;
      await client.sql`COMMIT`;
      if ((uploadedPdfUrl || removePdf) && current.issue_pdf_url !== nextPdfUrl) {
        await removePublicationPdfQuietly(current.issue_pdf_url);
      }
      return NextResponse.json({ success: true, issue: result.rows[0] });
    } catch (error) {
      await client.sql`ROLLBACK`;
      await removePublicationPdfQuietly(uploadedPdfUrl);
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: 'This issue number already exists in the selected volume and year' }, { status: 409 });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === 'delete_issue') {
    const id = getNumber(formData, 'id');
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can delete issues' }, { status: 403 });
    }
    if (!validPositiveInteger(id)) {
      return NextResponse.json({ error: 'Issue ID is required' }, { status: 400 });
    }

    const client = await db.connect();
    try {
      await client.sql`BEGIN`;
      const currentResult = await client.sql`
        SELECT id, issue_pdf_url FROM issues WHERE id = ${id} FOR UPDATE
      `;
      if (currentResult.rows.length === 0) {
        await client.sql`ROLLBACK`;
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }
      const articleCountResult = await client.sql`
        SELECT COUNT(*)::integer AS count FROM articles WHERE issue_id = ${id}
      `;
      const articleCount = Number(articleCountResult.rows[0].count);
      if (articleCount > 0) {
        await client.sql`ROLLBACK`;
        return NextResponse.json({
          error: `Move or delete the ${articleCount} article${articleCount === 1 ? '' : 's'} in this issue first`,
        }, { status: 409 });
      }

      const current = currentResult.rows[0];
      await client.sql`DELETE FROM issues WHERE id = ${id}`;
      await client.sql`COMMIT`;
      await removePublicationPdfQuietly(current.issue_pdf_url);
      return NextResponse.json({ success: true });
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === 'update_issue_pdf') {
    const issueId = getNumber(formData, 'issue_id');
    const file = formData.get('issue_pdf') as File | null;

    if (issueId === undefined || !file) {
      return NextResponse.json({ error: 'Issue and PDF file are required' }, { status: 400 });
    }

    const issuePdfUrl = await savePublicationPdf(file, 'issue');
    const currentResult = await db`SELECT issue_pdf_url FROM issues WHERE id = ${issueId}`;

    if (currentResult.rows.length === 0) {
      await removePublicationPdfQuietly(issuePdfUrl);
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const result = await db`
      UPDATE issues SET issue_pdf_url = ${issuePdfUrl} WHERE id = ${issueId} RETURNING *
    `;
    await removePublicationPdfQuietly(currentResult.rows[0].issue_pdf_url);

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
      pdfUrl = await savePublicationPdf(file, 'article');
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
