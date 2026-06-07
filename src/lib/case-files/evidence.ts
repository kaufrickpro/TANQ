import 'server-only';
import crypto from 'crypto';
import { PassThrough, Readable } from 'stream';
import { createRequire } from 'module';
import PDFDocument from 'pdfkit';
import { get, put } from '@vercel/blob';
import db from '@/lib/db';
import { appendSubmissionEvent, verifySubmissionEventChain } from './audit';
import type { CaseFileActor } from './types';

const require = createRequire(import.meta.url);
const archiver = require('archiver') as any;

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildTimelinePdf(submission: any, events: any[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text('TANQ Manuscript Process Evidence', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Submission: ${submission.title}`);
    doc.text(`Public ID: ${submission.public_id}`);
    doc.text(`Current stage: ${submission.current_stage || submission.status}`);
    doc.moveDown();
    for (const event of events) {
      doc.fontSize(10).text(
        `${event.sequence_number}. ${new Date(event.created_at).toISOString()} | ${event.event_type}`,
        { continued: false },
      );
      doc.fontSize(9).text(`${event.summary}`);
      doc.text(`Actor role: ${event.actor_role}`);
      if (event.from_stage || event.to_stage) doc.text(`Stage: ${event.from_stage || '-'} -> ${event.to_stage || '-'}`);
      doc.moveDown(0.6);
    }
    doc.end();
  });
}

function signManifest(manifestBuffer: Buffer) {
  const privatePem = process.env.EVIDENCE_SIGNING_PRIVATE_KEY?.replaceAll('\\n', '\n');
  if (!privatePem) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EVIDENCE_SIGNING_PRIVATE_KEY is required in production');
    }
    const hmacKey = process.env.SESSION_SECRET || 'tanq-development-evidence-key';
    return {
      algorithm: 'HMAC-SHA256-DEVELOPMENT-ONLY',
      keyId: 'development',
      signature: crypto.createHmac('sha256', hmacKey).update(manifestBuffer).digest('base64'),
      publicKey: null,
    };
  }
  const privateKey = crypto.createPrivateKey(privatePem);
  const publicPem =
    process.env.EVIDENCE_SIGNING_PUBLIC_KEY?.replaceAll('\\n', '\n') ||
    crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  return {
    algorithm: 'Ed25519',
    keyId: process.env.EVIDENCE_SIGNING_KEY_ID || 'tanq-evidence-key-1',
    signature: crypto.sign(null, manifestBuffer, privateKey).toString('base64'),
    publicKey: publicPem,
  };
}

export async function createEvidenceExport(input: {
  submissionId: number;
  actor: CaseFileActor;
  includeIdentities: boolean;
}) {
  if (!['admin', 'editor'].includes(input.actor.role)) throw new Error('Editor role required');
  const exportResult = await db`
    INSERT INTO evidence_exports (
      submission_id, status, requested_by_user_id, requested_by_name, include_identities
    )
    VALUES (${input.submissionId}, 'processing', ${input.actor.id}, ${input.actor.name}, ${input.includeIdentities})
    RETURNING *
  `;
  const exportRow = exportResult.rows[0];

  try {
    const submissionResult = await db`SELECT * FROM submissions WHERE id = ${input.submissionId}`;
    if (submissionResult.rows.length === 0) throw new Error('Submission not found');
    const submission = submissionResult.rows[0];
    const eventsResult = await db`
      SELECT *
      FROM submission_events
      WHERE submission_id = ${input.submissionId}
      ORDER BY sequence_number ASC
    `;
    const documentsResult = await db`
      SELECT d.kind, d.label, d.visibility, v.*
      FROM submission_documents d
      JOIN document_versions v ON v.document_id = d.id
      WHERE d.submission_id = ${input.submissionId}
      ORDER BY d.kind ASC, v.version_number ASC
    `;
    const reportsResult = await db`
      SELECT rp.id, rp.review_round_id, rr.round_number, rp.recommendation, rp.score,
             rp.comments_to_author, rp.confidential_comments, rp.submitted_at,
             ra.reviewer_name, ra.reviewer_email, rel.released_at
      FROM review_reports rp
      JOIN review_rounds rr ON rr.id = rp.review_round_id
      JOIN review_assignments ra ON ra.id = rp.assignment_id
      LEFT JOIN review_report_releases rel ON rel.report_id = rp.id
      WHERE rp.submission_id = ${input.submissionId}
      ORDER BY rr.round_number ASC, rp.submitted_at ASC
    `;
    const decisionsResult = await db`
      SELECT *
      FROM editorial_decisions
      WHERE submission_id = ${input.submissionId}
      ORDER BY created_at ASC
    `;
    const chain = await verifySubmissionEventChain(db, input.submissionId);

    const safeDocuments = documentsResult.rows.filter((document: any) => {
      if (input.includeIdentities) return true;
      return !['title_page', 'copyright_form', 'reviewer_attachment'].includes(document.kind);
    });
    const reports = reportsResult.rows.map((report: any) => ({
      id: report.id,
      reviewRoundId: report.review_round_id,
      roundNumber: report.round_number,
      recommendation: report.recommendation,
      score: report.score,
      commentsToAuthor: report.comments_to_author,
      confidentialComments: input.includeIdentities ? report.confidential_comments : undefined,
      reviewerName: input.includeIdentities ? report.reviewer_name : undefined,
      reviewerEmail: input.includeIdentities ? report.reviewer_email : undefined,
      submittedAt: report.submitted_at,
      releasedAt: report.released_at,
    }));
    const manifest = {
      format: 'TANQ-EVIDENCE-1',
      generatedAt: new Date().toISOString(),
      includeIdentities: input.includeIdentities,
      submission: {
        id: submission.id,
        publicId: submission.public_id,
        title: submission.title,
        status: submission.status,
        currentStage: submission.current_stage,
        submittedAt: submission.submitted_at,
      },
      eventChain: chain,
      documents: safeDocuments.map((document: any) => ({
        versionId: document.id,
        kind: document.kind,
        label: document.label,
        versionNumber: document.version_number,
        filename: document.original_filename,
        contentType: document.content_type,
        sizeBytes: Number(document.size_bytes),
        sha256: document.sha256,
        etag: document.etag,
        createdAt: document.created_at,
      })),
      reports,
      decisions: decisionsResult.rows,
    };
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    const signature = signManifest(manifestBuffer);
    const manifestSha256 = crypto.createHash('sha256').update(manifestBuffer).digest('hex');
    const timelinePdf = await buildTimelinePdf(submission, eventsResult.rows);
    const timelineCsv = [
      ['sequence', 'created_at', 'event_type', 'actor_role', 'actor_name', 'from_stage', 'to_stage', 'summary', 'event_hash']
        .map(csvCell).join(','),
      ...eventsResult.rows.map((event: any) =>
        [
          event.sequence_number, event.created_at, event.event_type, event.actor_role,
          input.includeIdentities ? event.actor_name : event.actor_role,
          event.from_stage, event.to_stage, event.summary, event.event_hash,
        ].map(csvCell).join(','),
      ),
    ].join('\n');

    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = new PassThrough();
    archive.pipe(output);
    const pathname = `evidence/${submission.public_id}/${crypto.randomUUID()}.zip`;
    const uploadPromise = put(pathname, output, {
      access: 'private',
      allowOverwrite: false,
      contentType: 'application/zip',
      multipart: true,
    });
    archive.append(manifestBuffer, { name: 'manifest.json' });
    archive.append(Buffer.from(JSON.stringify(signature, null, 2)), { name: 'manifest-signature.json' });
    archive.append(timelinePdf, { name: 'timeline.pdf' });
    archive.append(Buffer.from(timelineCsv), { name: 'timeline.csv' });
    archive.append(Buffer.from(JSON.stringify(reports, null, 2)), { name: 'review-reports.json' });

    for (const document of safeDocuments as any[]) {
      const blob = await get(document.blob_url, { access: 'private', useCache: false });
      if (!blob || blob.statusCode !== 200) throw new Error(`Evidence source missing: version ${document.id}`);
      const filename = safeEvidenceFilename(document.original_filename);
      archive.append(Readable.fromWeb(blob.stream as any), {
        name: `documents/${document.kind}/v${document.version_number}-${filename}`,
      });
    }
    await archive.finalize();
    const blob = await uploadPromise;
    const client = await db.connect();
    try {
      await client.sql`BEGIN`;
      await client.sql`
        UPDATE evidence_exports
        SET status = 'ready', blob_url = ${blob.url}, blob_pathname = ${blob.pathname},
            manifest_sha256 = ${manifestSha256}, completed_at = NOW(),
            expires_at = NOW() + INTERVAL '30 days'
        WHERE id = ${exportRow.id}
      `;
      await appendSubmissionEvent(client, {
        submissionId: input.submissionId,
        eventType: 'evidence_export_generated',
        actor: input.actor,
        summary: 'A signed manuscript-process evidence export was generated.',
        payload: {
          evidenceExportId: exportRow.id,
          includeIdentities: input.includeIdentities,
          manifestSha256,
        },
      });
      await client.sql`COMMIT`;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    } finally {
      client.release();
    }
    return {
      ...exportRow,
      status: 'ready',
      blob_url: blob.url,
      manifest_sha256: manifestSha256,
      download_url: `/api/case-files/${input.submissionId}/evidence/${exportRow.id}/download`,
    };
  } catch (error: any) {
    await db`
      UPDATE evidence_exports
      SET status = 'failed', error_message = ${error.message || 'Evidence export failed'}, completed_at = NOW()
      WHERE id = ${exportRow.id}
    `;
    throw error;
  }
}

function safeEvidenceFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function evidenceAccessSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required');
  return secret;
}

export function createEvidenceAccessToken(shareId: number, expiresAt: Date) {
  const payload = `${shareId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  const signature = crypto.createHmac('sha256', evidenceAccessSecret()).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifyEvidenceAccessToken(token: string | undefined, shareId: number) {
  if (!token) return false;
  const [id, expiry, signature] = token.split('.');
  if (Number(id) !== shareId || !expiry || !signature || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  const payload = `${id}.${expiry}`;
  const expected = crypto.createHmac('sha256', evidenceAccessSecret()).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
