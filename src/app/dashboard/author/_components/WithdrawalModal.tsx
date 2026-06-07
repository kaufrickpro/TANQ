'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, AlertCircle } from 'lucide-react';

interface WithdrawalModalProps {
  submissionId: number;
  submissionTitle: string;
  submissionStatus: string;
  onClose: () => void;
  onSuccess: (result: { type: 'instant' | 'requested'; message: string }) => void;
}

// Statuses where the withdrawal is instant (no editor needed)
const INSTANT_STATUSES = ['submitted', 'draft'];
// Statuses where the withdrawal is a request
const REQUEST_STATUSES = ['in_review', 'revision_requested'];

export default function WithdrawalModal({
  submissionId,
  submissionTitle,
  submissionStatus,
  onClose,
  onSuccess,
}: WithdrawalModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isInstant = INSTANT_STATUSES.includes(submissionStatus);
  const isRequest = REQUEST_STATUSES.includes(submissionStatus);

  const handleWithdraw = async () => {
    if (!reason.trim() || reason.trim().length < 10) {
      setError('Please provide a reason of at least 10 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal failed');
      onSuccess({ type: data.type, message: data.message });
    } catch (e: any) {
      setError(e.message || 'Error processing withdrawal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 backdrop-blur-sm p-4">
      <div className="bg-bg-page border border-border-custom shadow-2xl w-full max-w-lg rounded-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border-custom bg-bg-card">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-olive shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-text-muted">Withdrawal</p>
              <h2 className="font-serif font-bold text-base text-text-heading mt-0.5">
                {isInstant ? 'Withdraw Submission' : 'Request Withdrawal'}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-olive cursor-pointer transition-colors p-1 -mt-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Submission title */}
          <div className="bg-sand/20 border border-border-custom rounded-sm px-4 py-3">
            <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-text-muted mb-1">Submission</p>
            <p className="text-sm font-serif font-bold text-text-primary leading-snug">{submissionTitle}</p>
            <span className="inline-block mt-1 text-[9px] font-sans font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-sand text-olive border border-border-custom">
              {submissionStatus.replace('_', ' ')}
            </span>
          </div>

          {/* Outcome explanation */}
          {isInstant && (
            <div className="flex gap-3 items-start text-xs font-serif text-text-muted bg-white border border-border-custom rounded-sm p-3.5 leading-relaxed">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-olive" />
              <span>
                Your submission is in <strong className="text-text-primary">early stage</strong> and has not yet been sent for peer review.
                It will be <strong className="text-text-primary">withdrawn immediately</strong> upon confirmation — no editor approval is required.
              </span>
            </div>
          )}
          {isRequest && (
            <div className="flex gap-3 items-start text-xs font-serif text-text-muted bg-white border border-border-custom rounded-sm p-3.5 leading-relaxed">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-olive" />
              <span>
                Your submission is currently <strong className="text-text-primary">under review</strong>.
                A withdrawal <strong className="text-text-primary">request will be sent to the editorial team</strong>, who must approve it within 15 days.
                The manuscript remains in the review queue until a decision is made.
              </span>
            </div>
          )}

          {/* Reason textarea */}
          <div>
            <label className="block text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Reason for Withdrawal <span className="text-olive">*</span>
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Please explain why you are withdrawing this submission (minimum 10 characters)..."
              className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive font-serif leading-relaxed resize-none transition-colors"
            />
            <p className="text-[10px] text-text-muted font-serif mt-1">{reason.length} characters (min. 10)</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-white border border-border-custom rounded-sm p-3 text-xs font-sans">
              <AlertCircle size={14} className="shrink-0 text-olive" />
              <span className="font-bold uppercase tracking-wider text-text-heading">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-bg-card border-t border-border-custom flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-border-custom bg-white text-text-heading font-sans font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer hover:bg-sand/20 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={loading || !reason.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-charcoal text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer hover:bg-olive transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {isInstant ? 'Withdraw Submission' : 'Send Withdrawal Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
