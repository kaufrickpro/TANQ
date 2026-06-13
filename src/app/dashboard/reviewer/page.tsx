'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CheckCircle,
  Clock3,
  Edit,
  Inbox,
  MailOpen,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import ReviewEvaluationForm from './_components/ReviewEvaluationForm';
import CaseFilePanel from '@/components/case-files/CaseFilePanel';
import DiscussionPanel from '@/components/DiscussionPanel';
import StatusProgressBar from '@/components/StatusProgressBar';

export interface ReviewAssignment {
  id: number;
  title: string;
  abstract: string;
  keywords: string;
  download_url: string;
  file_name: string;
  status: string;
  current_stage?: string;
  date_submitted: string;
  review_id: number;
  reviewer_name: string;
  reviewer_email: string;
  comments: string;
  recommendation: string;
  score: number;
  date_reviewed: string;
  assignment_status?: string;
  invitation_sent_at?: string | null;
  invitation_expires_at?: string | null;
  review_deadline?: string | null;
  is_alternate?: boolean;
}

interface UserSession {
  username: string;
  name: string;
  email: string;
  role: string;
}

type Folder = 'invitations' | 'active' | 'completed';

const INVITATION_STATES = new Set(['invited', 'alternate']);
const ACTIVE_STATES = new Set(['assigned', 'accepted']);

function deadlineLabel(value?: string | null) {
  if (!value) return 'No deadline set';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'No deadline set';
  const days = Math.ceil((time - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  return `${days} days remaining`;
}

function assignmentState(assignment: ReviewAssignment) {
  return assignment.assignment_status || (assignment.date_reviewed ? 'submitted' : 'assigned');
}

export default function ReviewerDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [assignments, setAssignments] = useState<ReviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<Folder>('active');
  const [activeReview, setActiveReview] = useState<ReviewAssignment | null>(null);
  const [score, setScore] = useState<number>(3);
  const [recommendation, setRecommendation] = useState<'accept' | 'minor_revision' | 'major_revision' | 'reject'>('minor_revision');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (response) => {
        if (!response.ok) {
          router.push('/dashboard/login');
          return;
        }
        const user = await response.json();
        if (user.role !== 'reviewer') {
          router.push('/dashboard/login');
          return;
        }
        setSession(user);
      })
      .catch(() => router.push('/dashboard/login'));
  }, [router]);

  const fetchAssignments = useCallback(async (email: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/submissions?role=reviewer&email=${encodeURIComponent(email)}`);
      if (response.ok) setAssignments(await response.json());
    } catch (fetchError) {
      console.error('Error fetching reviewer assignments:', fetchError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.email) fetchAssignments(session.email);
  }, [fetchAssignments, session]);

  const grouped = useMemo(
    () => ({
      invitations: assignments.filter((assignment) => INVITATION_STATES.has(assignmentState(assignment))),
      active: assignments.filter((assignment) => ACTIVE_STATES.has(assignmentState(assignment)) && !assignment.date_reviewed),
      completed: assignments.filter((assignment) => assignmentState(assignment) === 'submitted' || Boolean(assignment.date_reviewed)),
    }),
    [assignments],
  );

  const handleReviewSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeReview || !session) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/case-files/${activeReview.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_report',
          assignment_id: activeReview.review_id,
          comments_to_author: comments,
          recommendation,
          score,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit peer review');
      setSuccess('Peer review submitted successfully.');
      setComments('');
      setScore(3);
      setRecommendation('minor_revision');
      setActiveReview(null);
      setFolder('completed');
      fetchAssignments(session.email);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error submitting review');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;

  const folders: Array<{ id: Folder; label: string; icon: typeof Inbox }> = [
    { id: 'invitations', label: 'New invitations', icon: MailOpen },
    { id: 'active', label: 'Active reviews', icon: Inbox },
    { id: 'completed', label: 'Completed', icon: CheckCircle },
  ];
  const visibleAssignments = grouped[folder];

  return (
    <main className="mx-auto w-full max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border-custom pb-4">
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-[0.2em] text-text-muted">Reviewer workspace</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-text-heading">Review assignments</h1>
          <p className="mt-1 max-w-xl font-serif text-xs text-text-muted">
            Respond to invitations, track deadlines, and submit clear, blinded evaluations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchAssignments(session.email)}
          className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-border-custom bg-white px-3 font-sans text-[9px] font-bold uppercase tracking-wider text-olive transition-colors hover:bg-sand/20 focus-visible:outline-2 focus-visible:outline-olive"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </header>

      {success && (
        <div className="mb-5 flex items-start gap-2 rounded-sm border border-olive/25 bg-white p-3 font-serif text-xs text-olive">
          <CheckCircle size={15} className="mt-0.5 shrink-0" /> {success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Review assignment folders">
            {folders.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={folder === id}
                onClick={() => setFolder(id)}
                className={`min-h-20 rounded-sm border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-olive ${
                  folder === id
                    ? 'border-olive bg-olive text-white'
                    : 'border-border-custom bg-white text-text-heading hover:bg-sand/20'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <Icon size={15} />
                  <span className="font-sans text-sm font-bold">{grouped[id].length}</span>
                </span>
                <span className="mt-2 block font-sans text-[8px] font-bold uppercase tracking-wider">{label}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <p className="rounded-sm border border-border-custom bg-white p-5 font-sans text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Loading review assignments...
            </p>
          ) : visibleAssignments.length === 0 ? (
            <div className="rounded-sm border border-border-custom bg-white p-10 text-center">
              <ShieldCheck size={30} className="mx-auto text-text-muted" />
              <h2 className="mt-3 font-serif text-sm font-bold text-text-heading">This folder is clear</h2>
              <p className="mt-1 font-serif text-xs text-text-muted">Assignments will appear here as their state changes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAssignments.map((assignment) => {
                const state = assignmentState(assignment);
                const canEvaluate = ACTIVE_STATES.has(state) && !assignment.date_reviewed;
                return (
                  <article
                    key={assignment.review_id || assignment.id}
                    className={`rounded-sm border border-l-4 bg-white p-5 shadow-sm transition-colors ${
                      activeReview?.review_id === assignment.review_id
                        ? 'border-olive border-l-olive'
                        : 'border-border-custom border-l-olive/55'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-serif text-sm font-bold leading-snug text-text-primary">{assignment.title}</h2>
                      <span className="shrink-0 rounded-sm border border-border-custom bg-sand/20 px-2 py-1 font-sans text-[8px] font-bold uppercase tracking-wider text-olive">
                        {state.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 font-serif text-xs leading-relaxed text-text-muted">{assignment.abstract}</p>
                    <div className="mt-3 border-t border-border-light pt-3">
                      <StatusProgressBar currentStage={assignment.current_stage || assignment.status} audience="editorial" compact />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-sans text-[9px] font-bold uppercase tracking-wide text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={11} /> {deadlineLabel(assignment.review_deadline || assignment.invitation_expires_at)}
                      </span>
                      {assignment.is_alternate && <span>Alternate reviewer</span>}
                    </div>
                    {canEvaluate && (
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <a
                          href={assignment.download_url}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-border-custom px-3 font-sans text-[9px] font-bold uppercase tracking-wider text-olive transition-colors hover:bg-sand/20 focus-visible:outline-2 focus-visible:outline-olive"
                        >
                          <BookOpen size={11} /> Manuscript
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReview(assignment);
                            setComments(assignment.comments || '');
                            setRecommendation((assignment.recommendation as typeof recommendation) || 'minor_revision');
                            setScore(assignment.score || 3);
                            setSuccess('');
                            setError('');
                          }}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-olive px-3 font-sans text-[9px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
                        >
                          <Edit size={11} /> Open evaluation
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          {activeReview ? (
            <>
              <ReviewEvaluationForm
                activeReview={activeReview}
                setActiveReview={setActiveReview}
                score={score}
                setScore={setScore}
                recommendation={recommendation}
                setRecommendation={setRecommendation}
                comments={comments}
                setComments={setComments}
                submitting={submitting}
                error={error}
                handleReviewSubmit={handleReviewSubmit}
              />
              <DiscussionPanel submissionId={activeReview.id} role="reviewer" />
              <CaseFilePanel submissionId={activeReview.id} role="reviewer" />
            </>
          ) : (
            <div className="rounded-sm border border-border-custom bg-white px-6 py-16 text-center shadow-sm">
              <BookOpen size={30} className="mx-auto text-text-muted" />
              <h2 className="mt-3 font-serif text-sm font-bold text-text-heading">Select an active review</h2>
              <p className="mx-auto mt-1 max-w-xs font-serif text-xs leading-relaxed text-text-muted">
                Open an accepted assignment to view the manuscript, case file, discussions, and evaluation form.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
