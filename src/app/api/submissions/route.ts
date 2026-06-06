import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { put } from '@vercel/blob';
import crypto from 'crypto';
import { getSessionUser } from '@/lib/session';
import { validateSameOrigin } from '@/lib/sameOrigin';

function mapSubmission(row: any) {
  if (!row) return null;
  const { file_path, ...rest } = row;
  const fileName = file_path.split('/').pop() || 'manuscript';
  return {
    ...rest,
    file_name: fileName,
    download_url: `/api/submissions/download?submission_id=${row.id}`
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

    // Admin / Editor checks
    if (role === 'admin' || role === 'editor') {
      if (session.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const result = await db`SELECT * FROM submissions ORDER BY id DESC`;
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
          s.id, s.title, s.abstract, s.keywords, s.author_name, s.author_email, s.file_path, s.status, s.date_submitted,
          r.id AS review_id, r.reviewer_name, r.reviewer_email, r.comments, r.recommendation, r.score, r.date_reviewed
        FROM submissions s
        JOIN reviews r ON s.id = r.submission_id
        WHERE TRIM(LOWER(r.reviewer_email)) = TRIM(LOWER(${email}))
        ORDER BY s.id DESC
      `;
      return NextResponse.json(result.rows.map(row => {
        const mapped = mapSubmission(row);
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
    let title = '';
    let abstract = '';
    let keywords = '';
    let filePath = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      title = (formData.get('title') as string) || '';
      abstract = (formData.get('abstract') as string) || '';
      keywords = (formData.get('keywords') as string) || '';

      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'File upload is required' }, { status: 400 });
      }

      // File type check
      const allowedExtensions = ['pdf', 'doc', 'docx'];
      const nameParts = file.name.split('.');
      const ext = nameParts.pop()?.toLowerCase();
      if (!ext || !allowedExtensions.includes(ext)) {
        return NextResponse.json({ error: 'Only PDF, DOC, and DOCX files are allowed.' }, { status: 400 });
      }

      // Size limit: 20MB
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size must be less than 20MB.' }, { status: 400 });
      }

      // Upload to Vercel Blob with randomized path and private access
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const randomPath = `manuscripts/${crypto.randomUUID()}/${safeName}`;
      const blob = await put(randomPath, file, { access: 'private' });
      filePath = blob.url;
    } else {
      // JSON fallback (unlikely, but handled)
      const body = await request.json();
      title = body.title;
      abstract = body.abstract;
      keywords = body.keywords;
      filePath = body.file_path;
    }

    if (!title || !abstract || !keywords || !filePath) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const authorName = session.name;
    const authorEmail = session.email;
    const currentDate = new Date().toISOString().split('T')[0];

    const result = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES (${title}, ${abstract}, ${keywords}, ${authorName}, ${authorEmail}, ${filePath}, 'submitted', ${currentDate})
      RETURNING *
    `;

    return NextResponse.json(mapSubmission(result.rows[0]));
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
    if (session.role !== 'admin') {
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

    // Size limit: 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 20MB.' }, { status: 400 });
    }

    // Upload revision to Vercel Blob with randomized path and private access
    const baseName = nameParts.join('.');
    const safeName = `${baseName}_editor_revision_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
    const randomPath = `manuscripts/${crypto.randomUUID()}/${safeName}`;
    const blob = await put(randomPath, file, { access: 'private' });
    const filePath = blob.url;

    const result = await db`
      UPDATE submissions 
      SET file_path = ${filePath} 
      WHERE id = ${Number(submissionId)}
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json(mapSubmission(result.rows[0]));
  } catch (error: any) {
    console.error('Error in submissions PUT:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
