import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle,
  FileArchive,
  FileText,
  MessageSquare,
  Send,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import type { Issue, Review, Submission } from '../page';
import CaseFilePanel from '@/components/case-files/CaseFilePanel';
import DiscussionPanel from '@/components/DiscussionPanel';
import StatusProgressBar from '@/components/StatusProgressBar';
import { safeJson } from '@/lib/clientFetch';

interface SubmissionDetailProps {
  selectedSub: Submission;
  setSelectedSub: (value: Submission | null) => void;
  reviews: Review[];
  revName: string;
  setRevName: (value: string) => void;
  revEmail: string;
  setRevEmail: (value: string) => void;
  assigning: boolean;
  handleAssignReviewer: (event: React.FormEvent) => void;
  pubIssueId: number;
  setPubIssueId: (value: number) => void;
  issues: Issue[];
  pubType: string;
  setPubType: (value: string) => void;
  pubDoi: string;
  setPubDoi: (value: string) => void;
  pubPages: string;
  setPubPages: (value: string) => void;
  publishing: boolean;
  handlePublishArticle: (event: React.FormEvent) => void;
  showDemo: boolean;
  revisionFile: File | null;
  setRevisionFile: (value: File | null) => void;
  uploadingRevision: boolean;
  handleUploadRevision: (event: React.FormEvent) => void;
  pubPdfFile: File | null;
  setPubPdfFile: (value: File | null) => void;
  handleApproveWithdrawal: (submissionId: number, editorNote?: string) => Promise<void>;
  handleRejectWithdrawal: (submissionId: number, editorNote?: string) => Promise<void>;
  handleDeleteSubmission: (submissionId: number) => Promise<void>;
}

type DetailTab = 'overview' | 'reviews' | 'case-file' | 'discussion' | 'publishing';

interface ReviewerAssignmentSummary {
  id: number;
  reviewer_name: string;
  reviewer_email: string;
  status: string;
  review_deadline?: string | null;
  invitation_expires_at?: string | null;
  is_alternate?: boolean;
}

export default function SubmissionDetail({
  selectedSub,
  setSelectedSub,
  reviews,
  revName,
  setRevName,
  revEmail,
  setRevEmail,
  assigning,
  handleAssignReviewer,
  pubIssueId,
  setPubIssueId,
  issues,
  pubType,
  setPubType,
  pubDoi,
  setPubDoi,
  pubPages,
  setPubPages,
  publishing,
  handlePublishArticle,
  showDemo,
  revisionFile,
  setRevisionFile,
  uploadingRevision,
  handleUploadRevision,
  pubPdfFile,
  setPubPdfFile,
  handleApproveWithdrawal,
  handleRejectWithdrawal,
}: SubmissionDetailProps) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false);
  const [assignments, setAssignments] = useState<ReviewerAssignmentSummary[]>([]);
  const stage = selectedSub.current_stage || selectedSub.status;

  useEffect(() => {
    fetch(`/api/case-files/${selectedSub.id}/reviews`)
      .then(async (response) => {
        const data = await safeJson(response);
        if (response.ok) setAssignments(data.assignments || []);
      })
      .catch(() => setAssignments([]));
  }, [selectedSub.id]);

  async function decideWithdrawal(decision: 'approve' | 'reject') {
    setProcessingWithdrawal(true);
    try {
      if (decision === 'approve') {
        await handleApproveWithdrawal(selectedSub.id, withdrawalNote || undefined);
      } else {
        await handleRejectWithdrawal(selectedSub.id, withdrawalNote || undefined);
      }
      setWithdrawalNote('');
    } finally {
      setProcessingWithdrawal(false);
    }
  }

  const tabs: Array<{ id: DetailTab; label: string; icon: typeof FileText }> = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'reviews', label: 'Reviews', icon: Users },
    { id: 'case-file', label: 'Case file', icon: FileArchive },
    { id: 'discussion', label: 'Discussion', icon: MessageSquare },
    { id: 'publishing', label: 'Publishing', icon: Award },
  ];

  return (
    <section className="overflow-hidden rounded-sm border border-border-custom bg-white shadow-sm">
      <div className="border-b border-border-custom bg-sand/15 px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Selected manuscript</p>
            <h2 className="mt-1 font-serif text-lg font-bold leading-snug text-text-heading">{selectedSub.title}</h2>
            <p className="mt-1 font-serif text-xs text-text-muted">{selectedSub.author_name}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedSub(null)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-sm border border-border-custom bg-white text-text-muted transition-colors hover:text-olive focus-visible:outline-2 focus-visible:outline-olive"
            aria-label="Close selected manuscript"
          >
            <X size={14} />
          </button>
        </div>
        <div className="mt-4">
          <StatusProgressBar currentStage={stage} audience="editorial" compact />
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Submission detail sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 font-sans text-[8px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-olive ${
                tab === id ? 'border-olive text-olive' : 'border-transparent text-text-muted hover:text-olive'
              }`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {tab === 'overview' && (
          <div className="space-y-5">
            {selectedSub.withdrawal_status === 'requested' && (
              <div className="overflow-hidden rounded-sm border border-border-custom">
                <div className="flex items-center gap-2 bg-charcoal px-4 py-3 text-white">
                  <AlertTriangle size={14} />
                  <p className="font-sans text-[9px] font-bold uppercase tracking-wider">Withdrawal requested by author</p>
                </div>
                <div className="space-y-3 p-4">
                  <label className="block">
                    <span className="mb-1.5 block font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">
                      Editor note (optional)
                    </span>
                    <textarea
                      rows={3}
                      value={withdrawalNote}
                      onChange={(event) => setWithdrawalNote(event.target.value)}
                      className="w-full resize-y rounded-sm border border-border-custom px-3 py-2 font-serif text-xs outline-none focus:border-olive"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => decideWithdrawal('approve')}
                      disabled={processingWithdrawal}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-olive px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-white hover:bg-link-hover disabled:opacity-50"
                    >
                      <CheckCircle size={11} /> Approve withdrawal
                    </button>
                    <button
                      type="button"
                      onClick={() => decideWithdrawal('reject')}
                      disabled={processingWithdrawal}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-border-custom px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-olive hover:bg-sand/20 disabled:opacity-50"
                    >
                      <X size={11} /> Reject request
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-sm border border-border-light bg-sand/10 p-4">
              <dl className="grid gap-4 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Stage</dt>
                  <dd className="mt-1 font-serif font-bold text-text-heading">{stage.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt className="font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Submitted</dt>
                  <dd className="mt-1 font-serif text-text-primary">{selectedSub.date_submitted || 'Unavailable'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Abstract</dt>
                  <dd className="mt-1 font-serif leading-relaxed text-text-primary">{selectedSub.abstract}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Keywords</dt>
                  <dd className="mt-1 font-serif text-text-primary">{selectedSub.keywords}</dd>
                </div>
              </dl>
            </div>

            <form onSubmit={handleUploadRevision} className="space-y-3 rounded-sm border border-border-custom p-4">
              <div>
                <p className="font-serif text-sm font-bold text-text-heading">Upload editorial manuscript version</p>
                <p className="mt-1 font-serif text-xs text-text-muted">Retains the current editing workflow while adding a version to the manuscript record.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="editor-revision-file"
                  type="file"
                  required
                  onChange={(event) => setRevisionFile(event.target.files?.[0] || null)}
                  accept=".docx,.doc,.pdf"
                  className="min-h-10 flex-1 rounded-sm border border-border-custom bg-white px-2 py-1.5 font-sans text-[10px]"
                />
                <button
                  type="submit"
                  disabled={uploadingRevision || !revisionFile}
                  className="min-h-10 rounded-sm bg-olive px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-white hover:bg-link-hover disabled:opacity-50"
                >
                  {uploadingRevision ? 'Uploading...' : 'Upload version'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'reviews' && (
          <div className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-serif text-base font-bold text-text-heading">Reviewer invitations</h3>
                <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">{assignments.length} assignments</span>
              </div>
              {assignments.length === 0 ? (
                <p className="rounded-sm border border-border-light bg-sand/10 p-4 font-serif text-xs text-text-muted">No reviewers assigned to this manuscript yet.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {assignments.map((assignment) => (
                    <article key={assignment.id} className="rounded-sm border border-border-light bg-sand/10 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-serif text-xs font-bold text-text-primary">{assignment.reviewer_name}</p>
                          <p className="mt-0.5 truncate font-sans text-[8px] text-text-muted">{assignment.reviewer_email}</p>
                        </div>
                        <span className="shrink-0 rounded-sm border border-border-custom bg-white px-2 py-1 font-sans text-[7px] font-bold uppercase tracking-wider text-olive">
                          {assignment.status}
                        </span>
                      </div>
                      <p className="mt-2 font-sans text-[8px] font-bold uppercase tracking-wide text-text-muted">
                        {assignment.is_alternate
                          ? 'Alternate reviewer'
                          : assignment.review_deadline
                            ? `Review due ${new Date(assignment.review_deadline).toLocaleDateString()}`
                            : assignment.invitation_expires_at
                              ? `Invite expires ${new Date(assignment.invitation_expires_at).toLocaleDateString()}`
                              : 'No deadline set'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-serif text-base font-bold text-text-heading">Review summary</h3>
                <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">{reviews.length} reports</span>
              </div>
              {reviews.length === 0 ? (
                <p className="rounded-sm border border-border-light bg-sand/10 p-4 font-serif text-xs text-text-muted">No submitted review reports yet.</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <article key={review.id} className="rounded-sm border border-border-light bg-sand/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">
                        <span>{review.reviewer_name}</span>
                        <span>{review.recommendation?.replaceAll('_', ' ')} · {review.score}/5</span>
                      </div>
                      <p className="mt-2 font-serif text-xs italic leading-relaxed text-text-primary">&ldquo;{review.comments}&rdquo;</p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {['submitted', 'in_review', 'under_review', 'editor_screening'].includes(stage) && (
              <form onSubmit={handleAssignReviewer} className="space-y-3 rounded-sm border border-border-custom p-4">
                <div>
                  <h3 className="flex items-center gap-2 font-serif text-sm font-bold text-text-heading"><Send size={13} /> Invite reviewer</h3>
                  <p className="mt-1 font-serif text-xs text-text-muted">An open review round is required before sending an invitation.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Reviewer name</span>
                    <input
                      value={revName}
                      onChange={(event) => setRevName(event.target.value)}
                      required
                      className="min-h-10 w-full rounded-sm border border-border-custom px-3 font-serif text-xs outline-none focus:border-olive"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Reviewer email</span>
                    <input
                      type="email"
                      value={revEmail}
                      onChange={(event) => setRevEmail(event.target.value)}
                      required
                      className="min-h-10 w-full rounded-sm border border-border-custom px-3 font-serif text-xs outline-none focus:border-olive"
                    />
                  </label>
                </div>
                {showDemo && <p className="font-serif text-[10px] text-text-muted">Demo reviewer: reviewer@makerere.ac.ug</p>}
                <button
                  type="submit"
                  disabled={assigning}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-olive px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-white hover:bg-link-hover disabled:opacity-50"
                >
                  <Send size={11} /> {assigning ? 'Inviting...' : 'Invite reviewer'}
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'case-file' && <CaseFilePanel submissionId={selectedSub.id} role="editor" />}
        {tab === 'discussion' && <DiscussionPanel submissionId={selectedSub.id} role="editor" />}

        {tab === 'publishing' && (
          stage === 'accepted' ? (
            <form onSubmit={handlePublishArticle} className="space-y-4">
              <div>
                <h3 className="flex items-center gap-2 font-serif text-base font-bold text-text-heading"><Award size={15} /> Publishing workspace</h3>
                <p className="mt-1 font-serif text-xs text-text-muted">Schedule the accepted manuscript and upload the final public PDF.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Issue</span>
                  <select value={pubIssueId} onChange={(event) => setPubIssueId(Number(event.target.value))} className="min-h-10 w-full rounded-sm border border-border-custom bg-white px-3 font-serif text-xs">
                    {issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Article type</span>
                  <select value={pubType} onChange={(event) => setPubType(event.target.value)} className="min-h-10 w-full rounded-sm border border-border-custom bg-white px-3 font-serif text-xs">
                    <option value="Research Article">Research Article</option>
                    <option value="Editorial">Editorial</option>
                    <option value="Review Article">Review Article</option>
                    <option value="Book Review">Book Review</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">DOI suffix</span>
                  <input value={pubDoi} onChange={(event) => setPubDoi(event.target.value)} required className="min-h-10 w-full rounded-sm border border-border-custom px-3 font-mono text-xs" />
                </label>
                <label>
                  <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Page range</span>
                  <input value={pubPages} onChange={(event) => setPubPages(event.target.value)} required className="min-h-10 w-full rounded-sm border border-border-custom px-3 font-serif text-xs" />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1 block font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">Final article PDF</span>
                  <input type="file" required accept="application/pdf" onChange={(event) => setPubPdfFile(event.target.files?.[0] || null)} className="min-h-10 w-full rounded-sm border border-border-custom px-3 py-2 font-sans text-[10px]" />
                </label>
              </div>
              <p className="flex items-start gap-2 rounded-sm border border-border-light bg-sand/10 p-3 font-serif text-[10px] text-text-muted">
                <ShieldAlert size={12} className="mt-0.5 shrink-0 text-olive" /> The final PDF becomes public after publishing.
              </p>
              <button type="submit" disabled={publishing || !pubPdfFile} className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-olive px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-white hover:bg-link-hover disabled:opacity-50">
                <Award size={11} /> {publishing ? 'Publishing...' : 'Publish article'}
              </button>
            </form>
          ) : (
            <div className="rounded-sm border border-border-light bg-sand/10 p-6 text-center">
              <Award size={25} className="mx-auto text-text-muted" />
              <p className="mt-2 font-serif text-sm font-bold text-text-heading">Publishing opens after acceptance</p>
              <p className="mt-1 font-serif text-xs text-text-muted">Use the case-file tab to record editorial decisions and advance the workflow.</p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
