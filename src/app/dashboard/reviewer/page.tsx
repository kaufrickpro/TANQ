'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, BookOpen, CheckCircle, RefreshCw, AlertCircle, Edit, Star } from 'lucide-react';

interface ReviewAssignment {
  id: number;
  title: string;
  abstract: string;
  keywords: string;
  file_path: string;
  status: string;
  date_submitted: string;
  review_id: number;
  reviewer_name: string;
  reviewer_email: string;
  comments: string;
  recommendation: string;
  score: number;
  date_reviewed: string;
}

interface UserSession {
  username: string;
  name: string;
  email: string;
  role: string;
}

export default function ReviewerDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [assignments, setAssignments] = useState<ReviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Active review form state
  const [activeReview, setActiveReview] = useState<ReviewAssignment | null>(null);
  const [score, setScore] = useState<number>(3);
  const [recommendation, setRecommendation] = useState<'accept' | 'minor_revision' | 'major_revision' | 'reject'>('minor_revision');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Validate session
  useEffect(() => {
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('session_user='));
    if (!sessionCookie) {
      router.push('/dashboard/login');
      return;
    }

    try {
      const decoded = decodeURIComponent(sessionCookie.split('=')[1]);
      const sessionUser = JSON.parse(decoded);
      if (sessionUser.role !== 'reviewer') {
        router.push('/dashboard/login');
        return;
      }
      setSession(sessionUser);
    } catch {
      router.push('/dashboard/login');
    }
  }, [router]);

  const fetchAssignments = useCallback(async (email: string) => {
    try {
      const res = await fetch(`/api/submissions?role=reviewer&email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(data);
      }
    } catch (e) {
      console.error('Error fetching reviewer assignments:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch once session is loaded
  useEffect(() => {
    if (session?.email) {
      fetchAssignments(session.email);
    }
  }, [session, fetchAssignments]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReview || !session) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          review_id: activeReview.review_id,
          comments,
          recommendation,
          score
        })
      });

      if (!res.ok) {
        throw new Error('Failed to submit peer review');
      }

      setSuccess('Peer review submitted successfully! Thank you for your contribution to academic standards.');
      setComments('');
      setScore(3);
      setRecommendation('minor_revision');
      setActiveReview(null);

      fetchAssignments(session.email);
    } catch (e: any) {
      setError(e.message || 'Error submitting review');
    } finally {
      setSubmitting(false);
    }
  };

  const getRecommendationStyle = (rec: string) => {
    switch (rec) {
      case 'accept': return 'text-olive font-black';
      case 'minor_revision': return 'text-olive';
      case 'major_revision': return 'text-charcoal font-black';
      case 'reject': return 'text-text-muted';
      default: return 'text-text-primary';
    }
  };

  if (!session) return null;

  return (
    <div className="flex-1 max-w-[1120px] mx-auto w-full px-6 sm:px-8 py-12 font-serif grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-bg-page">
      {/* Left Column: Assigned Reviews */}
      <div className="lg:col-span-7 space-y-6">
        <div className="flex justify-between items-center border-b border-border-custom pb-3">
          <h1 className="text-2xl font-serif font-bold text-text-heading uppercase tracking-wide">Reviewer Portal</h1>
          <button 
            onClick={() => fetchAssignments(session.email)}
            className="p-1.5 text-text-muted hover:text-olive border border-border-custom bg-bg-card hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">Loading assignments...</p>
        ) : assignments.length === 0 ? (
          <div className="bg-bg-card border border-border-custom p-10 rounded-sm text-center space-y-3 text-text-muted font-sans">
            <ShieldCheck className="mx-auto text-text-muted" size={36} />
            <h3 className="font-serif font-bold text-sm text-text-heading uppercase">No reviews assigned</h3>
            <p className="text-xs font-serif leading-relaxed max-w-xs mx-auto">
              You currently do not have any pending review invitations or assignments. When the editors assign papers to you, they will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.map((asg) => {
              const isReviewed = !!asg.date_reviewed;
              return (
                <div key={asg.id} className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive shadow-sm hover:shadow-md transition-all duration-200 space-y-3 relative overflow-hidden">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-serif font-bold text-base text-text-primary leading-tight">{asg.title}</h3>
                    <span className={`text-[9px] uppercase font-sans font-bold tracking-widest px-2.5 py-0.5 rounded-sm border shrink-0 ${
                      isReviewed 
                        ? 'bg-olive text-white border-olive' 
                        : 'bg-sand text-olive border-border-custom'
                    }`}>
                      {isReviewed ? 'Submitted' : 'Pending Review'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted border-t border-border-light pt-2">
                    <span>Assigned: <span className="normal-case font-normal text-text-primary">{asg.date_submitted}</span></span>
                    <span>|</span>
                    <span>Blinded Draft: <span className="normal-case font-normal font-mono">{asg.file_path.split('/').pop()}</span></span>
                  </div>
                  <p className="text-sm text-text-primary/85 leading-relaxed font-serif pt-1">{asg.abstract}</p>
                  
                  {!isReviewed && (
                    <div className="pt-2 flex justify-end font-sans">
                      <button
                        onClick={() => {
                          setActiveReview(asg);
                          setComments(asg.comments || '');
                          setRecommendation((asg.recommendation as any) || 'minor_revision');
                          setScore(asg.score || 3);
                          setSuccess('');
                          setError('');
                        }}
                        className="inline-flex items-center gap-1.5 bg-olive hover:bg-link-hover text-white font-bold text-[10px] uppercase tracking-[0.12em] px-4 py-2 rounded-sm transition-colors shadow-sm cursor-pointer"
                      >
                        <Edit size={12} /> Evaluate Manuscript
                      </button>
                    </div>
                  )}
                  {isReviewed && (
                    <div className="pt-3 border-t border-border-light text-xs text-text-primary space-y-2 bg-sand/15 p-4 rounded-sm">
                      <p className="font-sans uppercase text-[10px] font-bold tracking-wider text-text-muted">Your Evaluation Record</p>
                      <p><strong>Recommendation:</strong> <span className={`uppercase font-sans font-bold text-[10px] tracking-wider ${getRecommendationStyle(asg.recommendation)}`}>{asg.recommendation.replace('_', ' ')}</span></p>
                      <p><strong>Score:</strong> {asg.score} / 5</p>
                      <p className="font-serif italic bg-white p-3 border border-border-light rounded-sm">&ldquo;{asg.comments}&rdquo;</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: Review Submission Form */}
      <div className="lg:col-span-5 space-y-6">
        {activeReview ? (
          <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-border-light pb-3">
              <Edit className="text-olive" size={18} />
              <h2 className="font-serif font-bold text-base text-text-heading uppercase tracking-wide">Submit Peer Evaluation</h2>
            </div>
            
            <div className="bg-sand/15 p-4 rounded-sm border border-border-light text-xs">
              <p className="font-bold text-text-heading font-serif">Manuscript: &ldquo;{activeReview.title}&rdquo;</p>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs text-text-primary font-sans">
              {error && (
                <div className="bg-white border border-border-custom text-text-heading p-3 rounded-sm flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-olive" />
                  <span className="font-bold uppercase tracking-wider">{error}</span>
                </div>
              )}

              {/* Score rating */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Evaluation Score (1 - 5)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScore(s)}
                      className={`w-10 h-10 rounded-sm border flex items-center justify-center transition-colors cursor-pointer ${
                        score === s 
                          ? 'bg-olive border-olive text-white shadow-sm' 
                          : 'bg-white border-border-custom text-text-muted hover:border-olive hover:text-olive'
                      }`}
                    >
                      <Star size={16} fill={score >= s ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Recommendation select */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Recommendation</label>
                <select
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value as any)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                >
                  <option value="accept">Accept Submission</option>
                  <option value="minor_revision">Minor Revision</option>
                  <option value="major_revision">Major Revision</option>
                  <option value="reject">Reject Submission</option>
                </select>
              </div>

              {/* Comments */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Comments & Feedback</label>
                <textarea
                  required
                  rows={6}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm leading-relaxed font-serif"
                  placeholder="Provide detailed scientific feedback. Point out specific strengths, weaknesses, and revision requirements."
                />
              </div>

              <div className="flex gap-3 pt-2 font-sans">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-olive hover:bg-link-hover text-white font-bold py-3 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 text-xs uppercase tracking-[0.12em]"
                >
                  {submitting ? 'Submitting...' : 'Submit Evaluation'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReview(null)}
                  className="px-4 py-3 border border-border-custom hover:bg-sand/10 text-text-primary font-bold rounded-sm transition-colors cursor-pointer text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-bg-card border border-border-custom rounded-sm p-6 text-center space-y-3 text-text-muted py-16">
            <BookOpen className="mx-auto text-text-muted" size={32} />
            <h3 className="font-serif font-bold text-sm text-text-heading uppercase">Select a paper</h3>
            <p className="text-xs leading-relaxed max-w-xs mx-auto font-serif">
              Click the &quot;Evaluate Manuscript&quot; button on an assigned paper in the list to open the evaluation workspace.
            </p>
          </div>
        )}

        {success && (
          <div className="bg-white border border-border-custom text-text-heading p-4 rounded-sm flex items-start gap-2">
            <CheckCircle size={16} className="shrink-0 mt-0.5 text-olive" />
            <span className="font-serif leading-relaxed text-xs font-bold uppercase tracking-wider">{success}</span>
          </div>
        )}
      </div>
    </div>
  );
}
