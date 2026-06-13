import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { del } from '@/lib/blob';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';
import { createSubmittedCaseFile, uploadDocumentVersion } from '@/lib/case-files/documents';
import type { DocumentKind } from '@/lib/case-files/types';

function mapSubmission(row: any) {
  if (!row) return null;
  const { file_path, ...rest } = row;
  const storedName = file_path ? (file_path.split('/').pop() || 'manuscript') : '';
  const fileName = storedName.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  );
  return {
    ...rest,
    file_name: fileName,
    download_url: file_path ? `/api/submissions/download?submission_id=${row.id}` : null,
    case_file_url: `/api/case-files/${row.id}`,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const email = searchParams.get('email');

    if (!role) {
      return NextResponse.json({ error: 'Role query parameter is required' }, { status: 400 });
    }

    // Admin / Editor checks — exclude drafts from the queue
    if (role === 'admin' || role === 'editor' || role === 'secretary') {
      if (!['admin', 'editor', 'secretary'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const result = await db`SELECT * FROM submissions WHERE status != 'draft' ORDER BY id DESC`;
      return NextResponse.json(result.rows.map(mapSubmission));
    }

    // Author checks
    if (role === 'author') {
      if (!email) {
        return NextResponse.json({ error: 'Email query parameter is required for author' }, { status: 400 });
      }
      if (session.role !== 'author' || session.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const result = await db`SELECT * FROM submissions WHERE author_email = ${email} ORDER BY id DESC`;
      return NextResponse.json(result.rows.map(mapSubmission));
    }

    // Reviewer checks
    if (role === 'reviewer') {
      if (!email) {
        return NextResponse.json({ error: 'Email query parameter is required for reviewer' }, { status: 400 });
      }
      if (session.role !== 'reviewer' || session.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const result = await db`
        SELECT
          s.id, s.title, s.abstract, s.keywords, s.author_name, s.author_email, s.file_path, s.status,
          s.current_stage, s.date_submitted,
          ra.id AS review_id, ra.reviewer_name, ra.reviewer_email,
          ra.status AS assignment_status,
          ra.review_deadline, ra.invitation_sent_at, ra.invitation_expires_at, ra.is_alternate,
          rp.comments_to_author AS comments, rp.recommendation, rp.score, rp.submitted_at AS date_reviewed,
          dv.id AS assigned_version_id, dv.original_filename AS assigned_file_name
        FROM submissions s
        JOIN review_assignments ra ON s.id = ra.submission_id
        JOIN review_rounds rr ON rr.id = ra.review_round_id
        JOIN document_versions dv ON dv.id = rr.manuscript_version_id
        LEFT JOIN review_reports rp ON rp.assignment_id = ra.id
        WHERE TRIM(LOWER(ra.reviewer_email)) = TRIM(LOWER(${email}))
          AND ra.status IN ('invited', 'alternate', 'assigned', 'accepted', 'submitted')
        ORDER BY s.id DESC
      `;
      if (result.rows.length === 0) {
        const legacy = await db`
          SELECT s.*, r.id AS review_id, r.reviewer_name, r.reviewer_email,
                 r.comments, r.recommendation, r.score, r.date_reviewed
          FROM submissions s
          JOIN reviews r ON r.submission_id = s.id
          WHERE TRIM(LOWER(r.reviewer_email)) = TRIM(LOWER(${email}))
          ORDER BY s.id DESC
        `;
        return NextResponse.json(legacy.rows.map(row => {
          const mapped = mapSubmission(row);
          if (mapped) {
            delete (mapped as any).author_name;
            delete (mapped as any).author_email;
          }
          return mapped;
        }));
      }
      return NextResponse.json(result.rows.map(row => {
        const mapped = mapSubmission(row);
        if (mapped) {
          // Single-blind: reviewer sees title/abstract but not author identity
          delete (mapped as any).author_name;
          delete (mapped as any).author_email;
          // Overlay manuscript version fields for active/completed assignments
          if (row.assigned_version_id) {
            mapped.file_name = row.assigned_file_name;
            mapped.download_url = `/api/case-files/${row.id}/documents/${row.assigned_version_id}/download`;
          }
          // Surface invitation & deadline fields for folder grouping
          mapped.review_deadline = row.review_deadline ?? null;
          mapped.invitation_sent_at = row.invitation_sent_at ?? null;
          mapped.invitation_expires_at = row.invitation_expires_at ?? null;
          mapped.is_alternate = row.is_alternate ?? false;
        }
        return mapped;
      }));
    }

    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in submissions GET:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

    // Only authors can create/submit manuscripts
    if (session.role !== 'author') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const coAuthorsRaw = formData.get('co_authors');
      const fileFields: Array<[string, DocumentKind]> = [
        ['file', 'manuscript'],
        ['file_title_page', 'title_page'],
        ['file_supplementary', 'supplementary'],
        ['file_copyright_form', 'copyright_form'],
        ['file_similarity_report', 'similarity_report'],
        ['file_ethics_approval', 'ethics_approval'],
      ];
      const files = fileFields.flatMap(([field, kind]) => {
        const value = formData.get(field);
        return value instanceof File && value.size > 0 ? [{ kind, file: value }] : [];
      });
      const submissionId = await createSubmittedCaseFile({
        draftId: formData.get('draft_id') ? Number(formData.get('draft_id')) : null,
        metadata: {
          title: String(formData.get('title') || ''),
          abstract: String(formData.get('abstract') || ''),
          keywords: String(formData.get('keywords') || ''),
          authorName: session.name,
          authorEmail: session.email,
          submissionType: String(formData.get('submission_type') || 'Research Article'),
          topic: String(formData.get('topic') || '') || null,
          language: String(formData.get('language') || 'English'),
          shortTitle: String(formData.get('short_title') || '') || null,
          coAuthors: typeof coAuthorsRaw === 'string' && coAuthorsRaw ? JSON.parse(coAuthorsRaw) : [],
          editorNote: String(formData.get('editor_note') || '') || null,
          projectNumber: String(formData.get('project_number') || '') || null,
          ethicsStatement: String(formData.get('ethics_statement') || '') || null,
          supportingInstitution: String(formData.get('supporting_institution') || '') || null,
          acknowledgements: String(formData.get('acknowledgements') || '') || null,
          checklistConfirmed: formData.get('checklist_confirmed') === 'true',
        },
        files,
        actor: { id: session.id, name: session.name, role: 'author', email: session.email },
      });
      const result = await db`SELECT * FROM submissions WHERE id = ${submissionId}`;
      return NextResponse.json(mapSubmission(result.rows[0]), { status: 201 });
    }

    return NextResponse.json({
      error: 'Submitted manuscripts must use multipart/form-data so every file can be archived and checksummed.',
    }, { status: 415 });
  } catch (error: any) {
    console.error('Error in submissions POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    // CSRF Check
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only editors (admin) can update submissions/upload revisions
    if (!['admin', 'editor'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Content-Type must be multipart/form-data' }, { status: 400 });
    }

    const formData = await request.formData();
    const submissionId = formData.get('submission_id') as string;
    const file = formData.get('file') as File | null;

    if (!submissionId || !file) {
      return NextResponse.json({ error: 'submission_id and file are required' }, { status: 400 });
    }

    // File type check
    const allowedExtensions = ['pdf', 'doc', 'docx'];
    const nameParts = file.name.split('.');
    const ext = nameParts.pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are allowed.' }, { status: 400 });
    }

    // MIME-type check
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (file.type && !allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are allowed (MIME-type check failed).' }, { status: 400 });
    }

    // Size limit: 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 20MB.' }, { status: 400 });
    }

    await uploadDocumentVersion({
      submissionId: Number(submissionId),
      kind: 'manuscript',
      file,
      actor: { id: session.id, name: session.name, role: session.role as any, email: session.email },
      note: 'Editorial manuscript revision',
    });
    const result = await db`SELECT * FROM submissions WHERE id = ${Number(submissionId)}`;
    if (result.rows.length === 0) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    return NextResponse.json(mapSubmission(result.rows[0]));
  } catch (error: any) {
    console.error('Error in submissions PUT:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    // CSRF Check
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only authors can replace their own manuscripts
    if (session.role !== 'author') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Content-Type must be multipart/form-data' }, { status: 400 });
    }

    const formData = await request.formData();
    const submissionId = formData.get('submission_id') as string;
    const file = formData.get('file') as File | null;

    if (!submissionId || !file) {
      return NextResponse.json({ error: 'submission_id and file are required' }, { status: 400 });
    }

    // Check submission existence, ownership and status
    const submissionResult = await db`SELECT * FROM submissions WHERE id = ${Number(submissionId)}`;
    if (submissionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const submission = submissionResult.rows[0];

    // Ownership check: must match session email
    if (submission.author_email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Status guard: only 'submitted' or 'revision_requested' allowed
    const allowedStatuses = ['submitted', 'revision_requested', 'author_revision'];
    if (!allowedStatuses.includes(submission.status)) {
      return NextResponse.json({ error: 'Cannot replace file for submission in current status' }, { status: 400 });
    }

    // File type check
    const allowedExtensions = ['pdf', 'doc', 'docx'];
    const nameParts = file.name.split('.');
    const ext = nameParts.pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are allowed.' }, { status: 400 });
    }

    // MIME-type check
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (file.type && !allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are allowed (MIME-type check failed).' }, { status: 400 });
    }

    // Size limit: 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 20MB.' }, { status: 400 });
    }

    await uploadDocumentVersion({
      submissionId: Number(submissionId),
      kind: 'manuscript',
      file,
      actor: { id: session.id, name: session.name, role: 'author', email: session.email },
      note: submission.status === 'revision_requested' || submission.current_stage === 'author_revision'
        ? 'Author revision'
        : 'Author pre-review update',
    });
    const result = await db`SELECT * FROM submissions WHERE id = ${Number(submissionId)}`;
    return NextResponse.json(mapSubmission(result.rows[0]));
  } catch (error: any) {
    console.error('Error in submissions PATCH:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    // CSRF Check
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
    }

    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only authors and admins can delete unsubmitted drafts.
    if (session.role !== 'author' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('submission_id');

    if (!submissionId) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
    }

    // Check submission existence, ownership and status
    const submissionResult = await db`SELECT * FROM submissions WHERE id = ${Number(submissionId)}`;
    if (submissionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const submission = submissionResult.rows[0];

    // Ownership guard check
    if (session.role === 'author') {
      if (submission.author_email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

    }

    // Submitted case files are permanent. Withdrawal is the only supported closure.
    if (submission.status !== 'draft') {
      return NextResponse.json({
        error: 'Submitted manuscript case files cannot be deleted. Use the withdrawal workflow instead.',
      }, { status: 409 });
    }

    // Delete old blob file if it exists
    if (submission.file_path) {
      try {
        await del(submission.file_path);
      } catch (delError) {
        console.error('Failed to delete blob file during submission deletion:', submission.file_path, delError);
      }
    }

    // Delete from DB
    await db`DELETE FROM submissions WHERE id = ${Number(submissionId)}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in submissions DELETE:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
