import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

/**
 * PATCH /api/submissions/[id]
 * Author-only: saves or updates a draft submission's metadata fields.
 * Does NOT handle file uploads — file upload is done via the main POST on final submit.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'author') {
      return NextResponse.json({ error: 'Forbidden: only authors can save drafts' }, { status: 403 });
    }

    const { id } = await params;
    const submissionId = Number(id);
    if (isNaN(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 });
    }

    // Verify ownership and that it is still a draft
    const subResult = await db`SELECT * FROM submissions WHERE id = ${submissionId}`;
    if (subResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const sub = subResult.rows[0];
    if (sub.author_email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: you do not own this submission' }, { status: 403 });
    }
    if (sub.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be updated this way' }, { status: 400 });
    }

    const body = await request.json();
    const {
      title,
      abstract,
      keywords,
      submission_type,
      topic,
      language,
      short_title,
      co_authors,
      project_number,
      ethics_statement,
      supporting_institution,
      acknowledgements,
      editor_note,
      checklist_confirmed,
      draft_step,
    } = body;

    // Build dynamic update — only update fields that were provided
    await db`
      UPDATE submissions SET
        title                  = COALESCE(${title ?? null}, title),
        abstract               = COALESCE(${abstract ?? null}, abstract),
        keywords               = COALESCE(${keywords ?? null}, keywords),
        submission_type        = COALESCE(${submission_type ?? null}, submission_type),
        topic                  = COALESCE(${topic ?? null}, topic),
        language               = COALESCE(${language ?? null}, language),
        short_title            = COALESCE(${short_title ?? null}, short_title),
        co_authors             = COALESCE(${co_authors !== undefined ? JSON.stringify(co_authors) : null}::jsonb, co_authors),
        project_number         = COALESCE(${project_number ?? null}, project_number),
        ethics_statement       = COALESCE(${ethics_statement ?? null}, ethics_statement),
        supporting_institution = COALESCE(${supporting_institution ?? null}, supporting_institution),
        acknowledgements       = COALESCE(${acknowledgements ?? null}, acknowledgements),
        editor_note            = COALESCE(${editor_note ?? null}, editor_note),
        checklist_confirmed    = COALESCE(${checklist_confirmed !== undefined ? checklist_confirmed : null}, checklist_confirmed),
        draft_step             = COALESCE(${draft_step !== undefined ? draft_step : null}, draft_step)
      WHERE id = ${submissionId}
    `;

    const updated = await db`SELECT * FROM submissions WHERE id = ${submissionId}`;
    const row = updated.rows[0];
    const { file_path, ...rest } = row;
    return NextResponse.json({
      ...rest,
      file_name: file_path ? file_path.split('/').pop() : '',
      download_url: file_path ? `/api/submissions/download?submission_id=${row.id}` : null,
    });
  } catch (error: any) {
    console.error('Error in submission PATCH:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/submissions/[id]
 * Author-only: "create draft" — inserts a new draft submission row with just step 1 metadata.
 * Returns the new draft row including its id.
 */
export async function POST(
  request: Request,
  { params: _ }: { params: Promise<{ id: string }> }
) {
  try {
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'author') {
      return NextResponse.json({ error: 'Forbidden: only authors can create drafts' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title = '',
      abstract = '',
      keywords = '',
      submission_type = 'Research Article',
      topic = null,
      language = 'English',
      short_title = null,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required to start a draft' }, { status: 400 });
    }

    const result = await db`
      INSERT INTO submissions (
        title, abstract, keywords, author_name, author_email,
        file_path, status, current_stage, date_submitted,
        submission_type, topic, language, short_title,
        co_authors, draft_step
      ) VALUES (
        ${title}, ${abstract}, ${keywords}, ${session.name}, ${session.email},
        '', 'draft', 'draft', '',
        ${submission_type}, ${topic}, ${language}, ${short_title},
        '[]', 1
      )
      RETURNING *
    `;

    const row = result.rows[0];
    const { file_path, ...rest } = row;
    return NextResponse.json({
      ...rest,
      file_name: '',
      download_url: null,
    });
  } catch (error: any) {
    console.error('Error in submission draft POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
