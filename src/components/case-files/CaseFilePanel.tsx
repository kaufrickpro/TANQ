'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Download, FilePlus2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { safeJson } from '@/lib/clientFetch';

type Props = {
  submissionId: number;
  role: string;
};

const STAFF_UPLOAD_KINDS = [
  ['manuscript', 'Blinded Manuscript'],
  ['editor_revision', 'Editorial Revision'],
  ['production_file', 'Production File'],
  ['final_proof', 'Final Proof'],
  ['other', 'Other File'],
];

export default function CaseFilePanel({ submissionId, role }: Props) {
  const [caseFile, setCaseFile] = useState<any>(null);
  const [reviews, setReviews] = useState<any>({ reports: [], assignments: [] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadKind, setUploadKind] = useState(role === 'reviewer' ? 'reviewer_attachment' : 'manuscript');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [decision, setDecision] = useState('minor_revision');
  const [decisionLetter, setDecisionLetter] = useState('');
  const [auditorEmail, setAuditorEmail] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [exportUrl, setExportUrl] = useState('');
  const [includeIdentities, setIncludeIdentities] = useState(false);
  const [reportComments, setReportComments] = useState('');
  const [reportConfidential, setReportConfidential] = useState('');
  const [recommendation, setRecommendation] = useState('minor_revision');
  const [score, setScore] = useState(3);

  const isEditor = role === 'admin' || role === 'editor';
  const isSecretary = role === 'secretary';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [caseRes, reviewRes] = await Promise.all([
        fetch(`/api/case-files/${submissionId}`),
        fetch(`/api/case-files/${submissionId}/reviews`),
      ]);
      const caseData = await safeJson(caseRes);
      const reviewData = await safeJson(reviewRes);
      if (!caseRes.ok) throw new Error(caseData.error || 'Could not load manuscript case file');
      setCaseFile(caseData);
      if (reviewRes.ok) setReviews(reviewData);
      const latestManuscript = caseData.documents.find((document: any) => document.kind === 'manuscript');
      if (latestManuscript) setSelectedVersion(String(latestManuscript.version_id));
    } catch (err: any) {
      setError(err.message || 'Could not load manuscript case file');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  const latestRound = useMemo(() => caseFile?.rounds?.[0] ?? null, [caseFile]);
  const activeAssignment = useMemo(
    () => reviews.assignments?.find((assignment: any) => assignment.status === 'assigned'),
    [reviews],
  );

  async function jsonAction(path: string, body: Record<string, unknown>, success: string) {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setMessage(success);
      await load();
      return data;
    } catch (err: any) {
      setError(err.message || 'Action failed');
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadFile) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('kind', uploadKind);
      const uploadRoundId = role === 'reviewer' ? activeAssignment?.review_round_id : latestRound?.id;
      if (uploadRoundId) formData.append('review_round_id', String(uploadRoundId));
      const res = await fetch(`/api/case-files/${submissionId}/documents`, { method: 'POST', body: formData });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMessage('New immutable document version uploaded.');
      setUploadFile(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <p className="text-xs text-text-muted">Loading manuscript case file...</p>;

  return (
    <section className="space-y-5 bg-bg-card border border-border-custom p-5 rounded-sm font-sans">
      <div className="flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold">Immutable archive</p>
          <h3 className="font-serif text-base font-bold text-text-heading flex items-center gap-2"><Archive size={16} /> Manuscript Case File</h3>
        </div>
        <button onClick={load} className="p-2 border border-border-custom rounded-sm cursor-pointer text-text-muted hover:text-olive"><RefreshCw size={13} /></button>
      </div>

      {message && <p className="text-xs border border-olive/30 bg-sand/20 p-3 font-bold text-olive">{message}</p>}
      {error && <p className="text-xs border border-red-200 bg-red-50 p-3 font-bold text-red-700">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="border border-border-light p-2"><strong>Stage</strong><br />{caseFile.submission.current_stage || caseFile.submission.status}</div>
        <div className="border border-border-light p-2"><strong>Files</strong><br />{caseFile.documents.length} versions</div>
        <div className="border border-border-light p-2"><strong>Events</strong><br />{caseFile.events.length} records</div>
        <div className="border border-border-light p-2"><strong>Rounds</strong><br />{caseFile.rounds.length}</div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Document Archive</h4>
        <div className="max-h-64 overflow-auto border border-border-light divide-y divide-border-light">
          {caseFile.documents.map((document: any) => (
            <div key={document.version_id} className="p-2.5 flex items-center justify-between gap-3 text-[10px]">
              <div className="min-w-0">
                <p className="font-bold text-text-primary truncate">{document.label} · v{document.version_number}</p>
                <p className="text-text-muted truncate">{document.original_filename} · {document.uploaded_by_role} · {new Date(document.version_created_at).toLocaleString()}</p>
                <p className="font-mono text-[8px] text-text-muted truncate">SHA-256: {document.sha256 || 'legacy checksum pending'}</p>
              </div>
              <a href={document.download_url} className="shrink-0 text-olive hover:underline flex items-center gap-1"><Download size={11} /> Download</a>
            </div>
          ))}
        </div>
      </div>

      {(role !== 'reviewer' || activeAssignment) && (
        <form onSubmit={handleUpload} className="border border-border-light bg-sand/10 p-3 space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1"><FilePlus2 size={12} /> Upload New Version</h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={uploadKind} onChange={event => setUploadKind(event.target.value)} className="border border-border-custom bg-white px-2 py-2 text-xs">
              {role === 'reviewer' ? (
                <option value="reviewer_attachment">Reviewer Attachment</option>
              ) : role === 'author' ? (
                <>
                  <option value="manuscript">Blinded Manuscript</option>
                  <option value="author_response">Author Response Letter</option>
                  <option value="supplementary">Supplementary File</option>
                  <option value="final_proof">Final Proof Response</option>
                </>
              ) : STAFF_UPLOAD_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="file" accept=".pdf,.doc,.docx,.zip" onChange={event => setUploadFile(event.target.files?.[0] || null)} className="border border-border-custom bg-white px-2 py-1.5 text-xs flex-1" />
            <button disabled={working || !uploadFile} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold disabled:opacity-50">Upload Version</button>
          </div>
        </form>
      )}

      {role === 'author' && ['revision_requested', 'author_revision'].includes(caseFile.submission.current_stage || caseFile.submission.status) && (
        <button
          disabled={working}
          onClick={() => jsonAction(`/api/case-files/${submissionId}/transition`, { to_stage: 'editor_screening', summary: 'Author submitted revised files for editorial review.' }, 'Revision submitted to the editor.')}
          className="bg-olive text-white px-4 py-2 text-[10px] uppercase font-bold"
        >
          Submit Revision To Editor
        </button>
      )}

      {isSecretary && (
        <div className="flex gap-2">
          <button disabled={working} onClick={() => jsonAction(`/api/case-files/${submissionId}/transition`, { to_stage: 'editor_screening', summary: 'Secretary completed technical check.' }, 'Sent to editor.')} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold">Send To Editor</button>
          <button disabled={working} onClick={() => jsonAction(`/api/case-files/${submissionId}/transition`, { to_stage: 'author_revision', summary: 'Secretary requested technical corrections.' }, 'Technical revision requested.')} className="border border-border-custom px-3 py-2 text-[10px] uppercase font-bold">Request Technical Revision</button>
        </div>
      )}

      {isEditor && (
        <div className="space-y-4 border-t border-border-light pt-4">
          {caseFile.submission.current_stage === 'submitted' && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Route New Submission</h4>
              <div className="flex flex-wrap gap-2">
                <button disabled={working} onClick={() => jsonAction(`/api/case-files/${submissionId}/transition`, { to_stage: 'editor_screening', summary: 'Submission entered editorial screening.' }, 'Editorial screening started.')} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold">Start Editorial Screening</button>
                <button disabled={working} onClick={() => jsonAction(`/api/case-files/${submissionId}/transition`, { to_stage: 'secretary_check', summary: 'Submission was routed for secretary technical control.' }, 'Sent to secretary technical control.')} className="border border-border-custom px-3 py-2 text-[10px] uppercase font-bold">Send To Secretary</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Open Review Round</h4>
            <div className="flex gap-2">
              <select value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)} className="border border-border-custom bg-white px-2 py-2 text-xs flex-1">
                {caseFile.documents.filter((document: any) => document.kind === 'manuscript').map((document: any) => (
                  <option key={document.version_id} value={document.version_id}>Manuscript v{document.version_number} · {document.original_filename}</option>
                ))}
              </select>
              <button disabled={working || !selectedVersion} onClick={() => jsonAction(`/api/case-files/${submissionId}/reviews`, { action: 'open_round', manuscript_version_id: Number(selectedVersion) }, 'Review round opened.')} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold">Open Round</button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Invite Reviewer To Latest Open Round</h4>
            <div className="grid sm:grid-cols-3 gap-2">
              <input value={reviewerName} onChange={event => setReviewerName(event.target.value)} placeholder="Reviewer name" className="border border-border-custom px-2 py-2 text-xs" />
              <input value={reviewerEmail} onChange={event => setReviewerEmail(event.target.value)} placeholder="Reviewer email" className="border border-border-custom px-2 py-2 text-xs" />
              <button disabled={working || !latestRound || latestRound.status !== 'open'} onClick={() => jsonAction(`/api/case-files/${submissionId}/reviews`, { action: 'invite', review_round_id: latestRound?.id, reviewer_name: reviewerName, reviewer_email: reviewerEmail }, 'Reviewer invitation queued.')} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold disabled:opacity-50">Invite</button>
            </div>
          </div>

          {reviews.reports?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Submitted Review Reports</h4>
              {reviews.reports.map((report: any) => (
                <div key={report.id} className="border border-border-light p-3 text-xs">
                  <p><strong>Round {report.round_number} · {report.recommendation}</strong> · {report.reviewer_name}</p>
                  <p className="font-serif mt-1">{report.comments_to_author}</p>
                  {!report.released_at && <button disabled={working} onClick={() => jsonAction(`/api/case-files/${submissionId}/reviews`, { action: 'release_report', report_id: report.id }, 'Review report released to author.')} className="mt-2 border border-border-custom px-2 py-1 text-[9px] uppercase font-bold">Release To Author</button>}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Editorial Decision</h4>
            <div className="flex flex-col gap-2">
              <select value={decision} onChange={event => setDecision(event.target.value)} className="border border-border-custom bg-white px-2 py-2 text-xs">
                <option value="technical_revision">Technical Revision</option>
                <option value="minor_revision">Minor Revision</option>
                <option value="major_revision">Major Revision</option>
                <option value="accept">Accept</option>
                <option value="reject">Reject</option>
              </select>
              <textarea value={decisionLetter} onChange={event => setDecisionLetter(event.target.value)} placeholder="Decision letter" className="border border-border-custom px-2 py-2 text-xs" rows={3} />
              <button disabled={working || !decisionLetter.trim()} onClick={() => jsonAction(`/api/case-files/${submissionId}/reviews`, { action: 'decision', decision, letter: decisionLetter, review_round_id: latestRound?.id }, 'Editorial decision recorded.')} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold disabled:opacity-50">Record Decision</button>
            </div>
          </div>

          <div className="space-y-2 border-t border-border-light pt-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1"><ShieldCheck size={12} /> Evidence</h4>
            <label className="flex items-center gap-2 text-[10px] text-text-muted">
              <input type="checkbox" checked={includeIdentities} onChange={event => setIncludeIdentities(event.target.checked)} />
              Include protected identities and confidential records
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button disabled={working} onClick={async () => {
                const data = await jsonAction(`/api/case-files/${submissionId}/evidence`, { action: 'export', include_identities: includeIdentities }, 'Evidence ZIP generated.');
                if (data?.download_url) setExportUrl(data.download_url);
              }} className="border border-border-custom px-3 py-2 text-[10px] uppercase font-bold">Generate Evidence ZIP</button>
              <input value={auditorEmail} onChange={event => setAuditorEmail(event.target.value)} placeholder="Auditor email" className="border border-border-custom px-2 py-2 text-xs flex-1" />
              <button disabled={working || !auditorEmail} onClick={async () => {
                const data = await jsonAction(`/api/case-files/${submissionId}/evidence`, { action: 'create_share', auditor_email: auditorEmail, expires_in_days: 7, include_identities: includeIdentities }, 'OTP-protected auditor link created.');
                if (data?.url) setShareUrl(data.url);
              }} className="border border-border-custom px-3 py-2 text-[10px] uppercase font-bold">Create Auditor Link</button>
            </div>
            {exportUrl && <a href={exportUrl} className="inline-flex text-[10px] text-olive font-bold uppercase hover:underline">Download Generated Evidence ZIP</a>}
            {shareUrl && <p className="text-[10px] break-all font-mono bg-sand/20 p-2">{shareUrl}</p>}
          </div>
        </div>
      )}

      {role === 'reviewer' && activeAssignment && (
        <div className="space-y-2 border-t border-border-light pt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Submit Immutable Review Report</h4>
          <select value={recommendation} onChange={event => setRecommendation(event.target.value)} className="border border-border-custom bg-white px-2 py-2 text-xs w-full">
            <option value="accept">Accept</option>
            <option value="minor_revision">Minor Revision</option>
            <option value="major_revision">Major Revision</option>
            <option value="reject">Reject</option>
          </select>
          <input type="number" min={1} max={5} value={score} onChange={event => setScore(Number(event.target.value))} className="border border-border-custom px-2 py-2 text-xs w-full" />
          <textarea value={reportComments} onChange={event => setReportComments(event.target.value)} placeholder="Comments to author" className="border border-border-custom px-2 py-2 text-xs w-full" rows={5} />
          <textarea value={reportConfidential} onChange={event => setReportConfidential(event.target.value)} placeholder="Confidential comments to editor (optional)" className="border border-border-custom px-2 py-2 text-xs w-full" rows={3} />
          <button disabled={working || !reportComments.trim()} onClick={() => jsonAction(`/api/case-files/${submissionId}/reviews`, { action: 'submit_report', assignment_id: activeAssignment.id, recommendation, score, comments_to_author: reportComments, confidential_comments: reportConfidential }, 'Immutable review report submitted.')} className="bg-olive text-white px-3 py-2 text-[10px] uppercase font-bold disabled:opacity-50 flex items-center gap-1"><Send size={11} /> Submit Report</button>
        </div>
      )}

      {role === 'author' && reviews.reports?.length > 0 && (
        <div className="space-y-2 border-t border-border-light pt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Released Review Reports</h4>
          {reviews.reports.map((report: any) => <div key={report.id} className="border border-border-light p-3 text-xs font-serif">{report.comments_to_author}</div>)}
        </div>
      )}

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Audit Timeline</h4>
        <div className="max-h-72 overflow-auto border-l-2 border-olive/30 pl-3 space-y-3">
          {caseFile.events.map((event: any) => (
            <div key={event.id} className="text-[10px]">
              <p className="font-bold text-text-primary">{event.sequence_number}. {event.summary}</p>
              <p className="text-text-muted">{event.actor_role} · {new Date(event.created_at).toLocaleString()}</p>
              <p className="font-mono text-[8px] text-text-muted truncate">{event.event_hash}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
