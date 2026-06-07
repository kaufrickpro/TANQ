'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, FileText, RefreshCw, CheckCircle, AlertCircle, X as CloseIcon, Edit3, X } from 'lucide-react';
import SubmissionWizard from './_components/SubmissionWizard';
import WithdrawalModal from './_components/WithdrawalModal';
import CaseFilePanel from '@/components/case-files/CaseFilePanel';

interface Submission {
  id: number;
  title: string;
  abstract: string;
  keywords: string;
  author_name: string;
  author_email: string;
  download_url: string | null;
  file_name: string;
  status: string;
  date_submitted: string;
  withdrawal_status?: string | null;
  submission_type?: string;
  topic?: string | null;
  language?: string;
  short_title?: string | null;
  co_authors?: string | any[];
  project_number?: string | null;
  ethics_statement?: string | null;
  supporting_institution?: string | null;
  acknowledgements?: string | null;
  editor_note?: string | null;
  checklist_confirmed?: boolean;
  draft_step?: number;
}

interface UserSession {
  username: string;
  name: string;
  email: string;
  role: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft:               'bg-border-light text-text-muted border-border-light',
  submitted:           'bg-sand text-olive border-border-custom',
  in_review:           'bg-sand/60 text-olive border-border-light',
  revision_requested:  'bg-charcoal text-white border-charcoal',
  accepted:            'bg-olive text-white border-olive',
  rejected:            'bg-white text-text-muted border-border-light',
  published:           'bg-olive text-white border-olive',
  withdrawn:           'bg-white text-text-muted border-border-light line-through',
};

// Statuses that allow withdrawal
const WITHDRAWABLE_STATUSES = [
  'submitted', 'secretary_check', 'editor_screening', 'in_review', 'under_review',
  'editor_decision', 'revision_requested', 'author_revision',
];

export default function AuthorDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [activeDraft, setActiveDraft] = useState<Submission | null>(null);

  // Withdrawal state
  const [withdrawSub, setWithdrawSub] = useState<Submission | null>(null);

  // Case-file detail and compatibility revision upload state
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<number | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Validate session
  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) { router.push('/dashboard/login'); return; }
        const sessionUser = await res.json();
        if (sessionUser.role !== 'author') { router.push('/dashboard/login'); return; }
        setSession(sessionUser);
      })
      .catch(() => router.push('/dashboard/login'));
  }, [router]);

  const fetchSubmissions = useCallback(async (email: string) => {
    try {
      const res = await fetch(`/api/submissions?role=author&email=${encodeURIComponent(email)}`);
      if (res.ok) setSubmissions(await res.json());
    } catch (e) {
      console.error('Error fetching submissions:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.email) fetchSubmissions(session.email);
  }, [session, fetchSubmissions]);

  const handleWizardSuccess = () => {
    setShowWizard(false);
    setActiveDraft(null);
    setSuccess('Manuscript submitted successfully! The Editorial Office will conduct a desk review shortly.');
    if (session?.email) fetchSubmissions(session.email);
    setTimeout(() => setSuccess(''), 6000);
  };

  const handleDeleteDraft = async (id: number) => {
    if (!confirm('Are you sure you want to permanently delete this draft?')) return;
    try {
      const res = await fetch(`/api/submissions?submission_id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSuccess('Draft deleted successfully.');
        if (session?.email) fetchSubmissions(session.email);
        setTimeout(() => setSuccess(''), 5000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete draft.');
        setTimeout(() => setError(''), 5000);
      }
    } catch {
      setError('Error deleting draft.');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleWithdrawalSuccess = (result: { type: string; message: string }) => {
    setWithdrawSub(null);
    setSuccess(result.message);
    if (session?.email) fetchSubmissions(session.email);
    setTimeout(() => setSuccess(''), 7000);
  };

  const handleReplaceFile = async (e: React.FormEvent, submissionId: number) => {
    e.preventDefault();
    if (!replaceFile) {
      setActionError('Please select a replacement file.');
      return;
    }
    setReplacingId(submissionId);
    setActionError('');
    setActionSuccess('');

    try {
      const formData = new FormData();
      formData.append('submission_id', submissionId.toString());
      formData.append('file', replaceFile);

      const res = await fetch('/api/submissions', {
        method: 'PATCH',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to replace manuscript');
      }

      setActionSuccess('Manuscript file replaced successfully!');
      setReplaceFile(null);
      
      const fileInput = document.getElementById(`replace-file-${submissionId}`) as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      setExpandedSubmissionId(null);
      if (session?.email) {
        fetchSubmissions(session.email);
      }
    } catch (e: any) {
      setActionError(e.message || 'Error replacing paper file');
    } finally {
      setReplacingId(null);
    }
  };

  if (!session) return null;

  // Separate drafts from active submissions
  const drafts = submissions.filter(s => s.status === 'draft');
  const active = submissions.filter(s => s.status !== 'draft');

  return (
    <>
      {/* Wizard overlay */}
      {showWizard && (
        <SubmissionWizard
          session={session}
          initialDraft={activeDraft || undefined}
          onSuccess={handleWizardSuccess}
          onClose={() => { setShowWizard(false); setActiveDraft(null); }}
        />
      )}

      {/* Withdrawal modal */}
      {withdrawSub && (
        <WithdrawalModal
          submissionId={withdrawSub.id}
          submissionTitle={withdrawSub.title}
          submissionStatus={withdrawSub.status}
          onClose={() => setWithdrawSub(null)}
          onSuccess={handleWithdrawalSuccess}
        />
      )}

      <div className="flex-1 max-w-[1120px] mx-auto w-full px-6 sm:px-8 py-12 font-serif bg-bg-page space-y-8">
        
        {/* Page header */}
        <div className="flex items-end justify-between border-b border-border-custom pb-4">
          <div>
            <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-text-muted">Portal</p>
            <h1 className="text-2xl font-serif font-bold text-text-heading uppercase tracking-wide mt-0.5">Author Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchSubmissions(session.email)}
              className="p-1.5 text-text-muted hover:text-olive border border-border-custom bg-bg-card hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-olive hover:bg-link-hover text-white font-sans font-bold text-xs uppercase tracking-[0.1em] rounded-sm cursor-pointer transition-colors shadow-sm"
            >
              <FilePlus size={14} />
              New Submission
            </button>
          </div>
        </div>

        {/* Alerts */}
        {success && (
          <div className="bg-bg-card border border-border-custom p-3.5 rounded-sm flex items-start gap-2 text-xs font-sans">
            <CheckCircle size={16} className="shrink-0 mt-0.5 text-olive" />
            <span className="font-serif leading-relaxed font-bold uppercase tracking-wider text-text-heading">{success}</span>
            <button onClick={() => setSuccess('')} className="ml-auto text-text-muted hover:text-olive cursor-pointer">
              <CloseIcon size={14} />
            </button>
          </div>
        )}
        {error && (
          <div className="bg-bg-card border border-border-custom p-3.5 rounded-sm flex items-start gap-2 text-xs font-sans">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-olive" />
            <span className="font-bold uppercase tracking-wider text-text-heading">{error}</span>
          </div>
        )}

        {/* Drafts section */}
        {drafts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-sans font-bold uppercase tracking-widest text-text-muted border-b border-border-light pb-2">
              Drafts in Progress ({drafts.length})
            </h2>
            {drafts.map(sub => (
              <div key={sub.id} className="bg-bg-card border border-dashed border-border-custom p-5 rounded-sm flex items-center justify-between gap-4 hover:border-olive/50 transition-colors">
                <div className="min-w-0">
                  <p className="font-serif font-bold text-sm text-text-primary truncate">{sub.title || '(Untitled draft)'}</p>
                  <p className="text-[10px] text-text-muted font-sans mt-0.5">Step {sub.draft_step || 1} · Draft</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setActiveDraft(sub);
                      setShowWizard(true);
                    }}
                    className="text-[10px] font-sans font-bold uppercase tracking-wider text-olive border border-border-custom px-3 py-1.5 rounded-sm hover:bg-sand/20 cursor-pointer transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => handleDeleteDraft(sub.id)}
                    className="text-[10px] font-sans font-bold uppercase tracking-wider text-rose-600 border border-border-custom hover:border-rose-200 px-3 py-1.5 rounded-sm hover:bg-rose-50 cursor-pointer transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active submissions */}
        <div className="space-y-3">
          <h2 className="text-xs font-sans font-bold uppercase tracking-widest text-text-muted border-b border-border-light pb-2">
            Submissions ({active.length})
          </h2>

          {loading ? (
            <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">Loading submissions...</p>
          ) : active.length === 0 ? (
            <div className="bg-bg-card border border-border-custom p-10 rounded-sm text-center space-y-3 text-text-muted font-sans">
              <FileText className="mx-auto text-text-muted" size={36} />
              <h3 className="font-serif font-bold text-sm text-text-heading uppercase">No active submissions</h3>
              <p className="text-xs font-serif leading-relaxed max-w-xs mx-auto">
                Click <strong>"New Submission"</strong> above to begin your first manuscript submission. You will be able to track peer review status here.
              </p>
            </div>
          ) : (
            active.map(sub => (
              <div
                key={sub.id}
                className="bg-bg-card border border-border-custom border-l-4 border-l-olive p-6 rounded-sm hover:shadow-sm transition-shadow duration-200 space-y-3 relative overflow-hidden"
              >
                {/* Withdrawal-requested banner */}
                {sub.withdrawal_status === 'requested' && (
                  <div className="absolute top-0 left-0 right-0 bg-charcoal/90 text-white text-[9px] font-sans font-bold uppercase tracking-widest px-4 py-1.5 flex items-center gap-1.5">
                    <AlertCircle size={10} /> Withdrawal Pending · Awaiting editor decision
                  </div>
                )}

                <div className={`flex justify-between items-start gap-4 ${sub.withdrawal_status === 'requested' ? 'mt-6' : ''}`}>
                  <h3 className="font-serif font-bold text-base text-text-primary leading-tight">{sub.title}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {sub.withdrawal_status === 'requested' && (
                      <span className="text-[9px] uppercase font-sans font-bold tracking-widest px-2.5 py-0.5 rounded-sm border bg-charcoal text-white border-charcoal">
                        Withdrawal Pending
                      </span>
                    )}
                    <span className={`text-[9px] uppercase font-sans font-bold tracking-widest px-2.5 py-0.5 rounded-sm border ${STATUS_COLORS[sub.status] || STATUS_COLORS.submitted}`}>
                      {sub.status.replace(/_/g, ' ')}
                    </span>
                    {sub.withdrawal_status !== 'requested' && (
                      <button
                        onClick={() => {
                          setActionError('');
                          setActionSuccess('');
                          setReplaceFile(null);
                          setExpandedSubmissionId(expandedSubmissionId === sub.id ? null : sub.id);
                        }}
                        className="p-1 text-text-muted hover:text-olive border border-border-custom bg-white hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
                        title="Edit Submission"
                      >
                        {expandedSubmissionId === sub.id ? <X size={12} /> : <Edit3 size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted border-t border-border-light pt-2">
                  {sub.submission_type && <span>{sub.submission_type}</span>}
                  {sub.submission_type && <span>·</span>}
                  <span>Submitted: <span className="normal-case font-normal text-text-primary">{sub.date_submitted || '—'}</span></span>
                  {sub.download_url && (
                    <>
                      <span>·</span>
                      <span>
                        File: <a href={sub.download_url} download className="text-link hover:text-link-hover hover:underline normal-case font-normal font-mono">{sub.file_name}</a>
                      </span>
                    </>
                  )}
                </div>

                <p className="text-sm text-text-primary/80 line-clamp-2 leading-relaxed font-serif pt-1">{sub.abstract}</p>

                {expandedSubmissionId === sub.id && (
                  <div className="mt-4 pt-4 border-t border-border-light space-y-4 bg-sand/5 p-4 rounded-sm">
                    <div className="flex items-center justify-between border-b border-border-light pb-2">
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-text-heading">Manage Submission</h4>
                      <button 
                        onClick={() => setExpandedSubmissionId(null)}
                        className="text-text-muted hover:text-olive transition-colors cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    
                    {actionSuccess && (
                      <div className="bg-white border border-border-custom text-text-heading p-2.5 rounded-sm text-[10px] flex items-start gap-2">
                        <CheckCircle size={14} className="shrink-0 mt-0.5 text-olive" />
                        <span className="font-serif leading-relaxed font-bold uppercase tracking-wider">{actionSuccess}</span>
                      </div>
                    )}
                    {actionError && (
                      <div className="bg-white border border-border-custom text-text-heading p-2 rounded-sm text-[10px] flex items-center gap-2">
                        <AlertCircle size={14} className="shrink-0 text-olive" />
                        <span className="font-bold uppercase tracking-wider">{actionError}</span>
                      </div>
                    )}

                    <CaseFilePanel submissionId={sub.id} role="author" />

                    {/* Compatibility upload form */}
                    {(sub.status === 'submitted' || sub.status === 'revision_requested' || sub.status === 'author_revision') && <form onSubmit={(e) => handleReplaceFile(e, sub.id)} className="space-y-3">
                      <div>
                        <label className="block text-[10px] block font-bold uppercase tracking-wider text-text-muted mb-1.5">Upload New Blinded Manuscript Version (Word / PDF)</label>
                        <div className="flex gap-2">
                          <input
                            id={`replace-file-${sub.id}`}
                            type="file"
                            required
                            onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                            className="bg-white border border-border-custom rounded-sm flex-1 px-3 py-2 text-xs text-black focus:outline-none focus:border-olive shadow-sm font-sans"
                            accept=".docx,.doc,.pdf"
                          />
                          <button
                            type="submit"
                            disabled={replacingId === sub.id}
                            className="bg-olive hover:bg-link-hover text-white font-sans font-bold px-4 py-2 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 text-[10px] uppercase tracking-wider shrink-0"
                          >
                            {replacingId === sub.id ? 'Uploading...' : 'Upload Version'}
                          </button>
                        </div>
                      </div>
                    </form>}

                    {/* Submitted case files cannot be deleted. */}
                    <div className="pt-2 border-t border-border-light flex justify-between items-center">
                      <span className="text-[10px] text-text-muted leading-relaxed font-serif">Submitted case files are retained permanently. Use the withdrawal workflow to close this submission.</span>
                    </div>
                  </div>
                )}

                {/* Withdraw button — only if status allows and not already requested */}
                {WITHDRAWABLE_STATUSES.includes(sub.status) && sub.withdrawal_status !== 'requested' && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => setWithdrawSub(sub)}
                      className="text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted border border-border-light px-3 py-1.5 rounded-sm cursor-pointer hover:text-olive hover:border-border-custom transition-colors"
                    >
                      Withdraw
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
