import React from 'react';
import { Edit, AlertCircle, Star } from 'lucide-react';
import type { ReviewAssignment } from '../page';

interface ReviewEvaluationFormProps {
  activeReview: ReviewAssignment;
  setActiveReview: (val: ReviewAssignment | null) => void;
  score: number;
  setScore: (val: number) => void;
  recommendation: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
  setRecommendation: (val: 'accept' | 'minor_revision' | 'major_revision' | 'reject') => void;
  comments: string;
  setComments: (val: string) => void;
  submitting: boolean;
  error: string;
  handleReviewSubmit: (e: React.FormEvent) => void;
}

export default function ReviewEvaluationForm({
  activeReview,
  setActiveReview,
  score,
  setScore,
  recommendation,
  setRecommendation,
  comments,
  setComments,
  submitting,
  error,
  handleReviewSubmit
}: ReviewEvaluationFormProps) {
  return (
    <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-6 font-sans">
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
            className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif font-sans"
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
  );
}
