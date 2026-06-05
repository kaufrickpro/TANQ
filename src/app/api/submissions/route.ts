import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { put } from '@vercel/blob';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const email = searchParams.get('email');

    if (!role) {
      return NextResponse.json({ error: 'Role query parameter is required' }, { status: 400 });
    }

    if (role === 'admin' || role === 'editor') {
      const result = await db`SELECT * FROM submissions ORDER BY id DESC`;
      return NextResponse.json(result.rows);
    }

    if (role === 'author') {
      if (!email) {
        return NextResponse.json({ error: 'Email query parameter is required for author' }, { status: 400 });
      }
      const result = await db`SELECT * FROM submissions WHERE author_email = ${email} ORDER BY id DESC`;
      return NextResponse.json(result.rows);
    }

    if (role === 'reviewer') {
      if (!email) {
        return NextResponse.json({ error: 'Email query parameter is required for reviewer' }, { status: 400 });
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
      return NextResponse.json(result.rows);
    }

    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let abstract = '';
    let keywords = '';
    let authorName = '';
    let authorEmail = '';
    let filePath = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      title = formData.get('title') as string;
      abstract = formData.get('abstract') as string;
      keywords = formData.get('keywords') as string;
      authorName = formData.get('author_name') as string;
      authorEmail = formData.get('author_email') as string;

      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'File upload is required' }, { status: 400 });
      }

      // Sanitise file name to prevent path issues
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      // Upload to Vercel Blob
      const blob = await put(safeName, file, { access: 'public' });
      filePath = blob.url;
    } else {
      const body = await request.json();
      title = body.title;
      abstract = body.abstract;
      keywords = body.keywords;
      authorName = body.author_name;
      authorEmail = body.author_email;
      filePath = body.file_path;
    }

    if (!title || !abstract || !keywords || !authorName || !authorEmail || !filePath) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const result = await db`
      INSERT INTO submissions (title, abstract, keywords, author_name, author_email, file_path, status, date_submitted)
      VALUES (${title}, ${abstract}, ${keywords}, ${authorName}, ${authorEmail}, ${filePath}, 'submitted', ${currentDate})
      RETURNING *
    `;

    const newSubmission = result.rows[0];
    return NextResponse.json(newSubmission);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
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

    const nameParts = file.name.split('.');
    const ext = nameParts.pop();
    const baseName = nameParts.join('.');
    const safeName = `${baseName}_editor_revision_${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Upload the revision to Vercel Blob
    const blob = await put(safeName, file, { access: 'public' });
    const filePath = blob.url;

    const result = await db`
      UPDATE submissions 
      SET file_path = ${filePath} 
      WHERE id = ${Number(submissionId)}
      RETURNING *
    `;

    const updatedSubmission = result.rows[0];
    return NextResponse.json(updatedSubmission);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
