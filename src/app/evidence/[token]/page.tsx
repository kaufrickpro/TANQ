'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { safeJson } from '@/lib/clientFetch';

export default function EvidenceSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [otp, setOtp] = useState('');
  const [caseFile, setCaseFile] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const loadCaseFile = useCallback(async () => {
    const response = await fetch(`/api/evidence/share/${token}`);
    const data = await safeJson(response);
    if (response.ok) {
      setCaseFile(data);
      setError('');
      return true;
    }
    return false;
  }, [token]);

  useEffect(() => {
    loadCaseFile();
  }, [loadCaseFile]);

  async function otpAction(action: 'request' | 'verify') {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/evidence/share/${token}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, otp }),
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Evidence access failed');
      if (action === 'request') {
        setMessage(`A verification code was sent to ${data.auditor_email_hint}.`);
      } else {
        setMessage('Access verified.');
        await loadCaseFile();
      }
    } catch (err: any) {
      setError(err.message || 'Evidence access failed');
    } finally {
      setWorking(false);
    }
  }

  if (!caseFile) {
    return (
      <main className="max-w-lg mx-auto w-full px-6 py-16">
        <section className="bg-bg-card border border-border-custom p-7 space-y-5">
          <div className="text-center space-y-2">
            <LockKeyhole className="mx-auto text-olive" size={32} />
            <h1 className="font-serif text-xl font-bold text-text-heading uppercase">Protected Evidence Access</h1>
            <p className="text-xs text-text-muted font-serif">This time-limited manuscript process record requires an email verification code.</p>
          </div>
          {message && <p className="text-xs bg-sand/20 border border-border-custom p-3">{message}</p>}
          {error && <p className="text-xs bg-red-50 border border-red-200 text-red-700 p-3">{error}</p>}
          <button disabled={working} onClick={() => otpAction('request')} className="w-full bg-olive text-white py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50">Send Verification Code</button>
          <div className="flex gap-2">
            <input value={otp} onChange={event => setOtp(event.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" className="border border-border-custom px-3 py-2 flex-1 text-sm font-mono" />
            <button disabled={working || otp.length !== 6} onClick={() => otpAction('verify')} className="border border-border-custom px-4 py-2 text-xs font-bold uppercase disabled:opacity-50">Verify</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-[960px] mx-auto w-full px-6 py-12 space-y-6">
      <header className="border-b border-border-custom pb-4">
        <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold flex items-center gap-1"><ShieldCheck size={12} /> Verified read-only evidence</p>
        <h1 className="font-serif text-2xl font-bold text-text-heading mt-1">{caseFile.submission.title}</h1>
        <p className="text-xs text-text-muted mt-2">Public ID: <span className="font-mono">{caseFile.submission.public_id}</span> · Stage: {caseFile.submission.current_stage}</p>
        <p className="text-[10px] text-text-muted mt-1">Access expires: {new Date(caseFile.expires_at).toLocaleString()}</p>
      </header>

      <section className="bg-bg-card border border-border-custom p-5 space-y-3">
        <h2 className="font-serif font-bold text-base flex items-center gap-2"><Archive size={15} /> Archived Documents</h2>
        {caseFile.documents.map((document: any) => (
          <div key={document.version_id} className="border-t border-border-light pt-3 flex justify-between gap-3 text-xs">
            <div>
              <p className="font-bold">{document.label} · v{document.version_number}</p>
              <p className="text-text-muted">{document.original_filename}</p>
              <p className="font-mono text-[9px] text-text-muted">SHA-256: {document.sha256 || 'legacy checksum unavailable'}</p>
            </div>
            <a href={document.download_url} className="text-olive flex items-center gap-1 shrink-0"><Download size={12} /> Download</a>
          </div>
        ))}
      </section>

      <section className="bg-bg-card border border-border-custom p-5 space-y-3">
        <h2 className="font-serif font-bold text-base">Process Timeline</h2>
        {caseFile.events.map((event: any) => (
          <div key={event.sequence_number} className="border-l-2 border-olive/30 pl-3 text-xs">
            <p className="font-bold">{event.sequence_number}. {event.summary}</p>
            <p className="text-text-muted">{event.actor_role} · {new Date(event.created_at).toLocaleString()}</p>
            <p className="font-mono text-[9px] text-text-muted truncate">{event.event_hash}</p>
          </div>
        ))}
      </section>

      {caseFile.reports.length > 0 && (
        <section className="bg-bg-card border border-border-custom p-5 space-y-3">
          <h2 className="font-serif font-bold text-base">Peer Review Records</h2>
          {caseFile.reports.map((report: any) => (
            <div key={report.id} className="border-t border-border-light pt-3 text-xs font-serif">
              <p className="font-bold">Round {report.round_number} · {report.recommendation}</p>
              <p className="mt-1">{report.comments_to_author}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
