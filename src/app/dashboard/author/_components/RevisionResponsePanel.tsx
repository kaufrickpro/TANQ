'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, Save, Send } from 'lucide-react';
import { safeJson } from '@/lib/clientFetch';

type ResponseStatus = 'addressed' | 'partially_addressed' | 'disagreed';

interface ResponseItem {
  reviewer_id: string;
  comment: string;
  response: string;
  status: ResponseStatus;
}

interface RevisionResponsePanelProps {
  submissionId: number;
}

export default function RevisionResponsePanel({ submissionId }: RevisionResponsePanelProps) {
  const [roundId, setRoundId] = useState<number | null>(null);
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [responseStatus, setResponseStatus] = useState<'draft' | 'submitted' | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<'save_draft' | 'submit' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [caseResponse, reviewsResponse] = await Promise.all([
        fetch(`/api/case-files/${submissionId}`),
        fetch(`/api/case-files/${submissionId}/reviews`),
      ]);
      const caseData = await safeJson(caseResponse);
      const reviewsData = await safeJson(reviewsResponse);
      if (!caseResponse.ok) throw new Error(caseData.error || 'Unable to load review round');
      if (!reviewsResponse.ok) throw new Error(reviewsData.error || 'Unable to load released reviews');

      const latestRound = caseData.rounds?.[0];
      if (!latestRound?.id) {
        setItems([]);
        setRoundId(null);
        return;
      }

      const nextRoundId = Number(latestRound.id);
      setRoundId(nextRoundId);
      const responseRequest = await fetch(
        `/api/case-files/${submissionId}/revision-responses?review_round_id=${nextRoundId}`,
      );
      const responseData = await safeJson(responseRequest);
      if (!responseRequest.ok) throw new Error(responseData.error || 'Unable to load revision response');

      if (responseData.response?.response_items?.length) {
        setItems(responseData.response.response_items);
        setResponseStatus(responseData.response.status);
        return;
      }

      setResponseStatus(null);
      setItems(
        (reviewsData.reports || [])
          .filter((report: any) => Number(report.review_round_id) === nextRoundId)
          .map((report: any, index: number) => ({
          reviewer_id: `reviewer-${index + 1}`,
          comment: report.comments_to_author,
          response: '',
          status: 'addressed' as ResponseStatus,
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load revision response');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function persist(action: 'save_draft' | 'submit') {
    if (!roundId) return;
    setWorking(action);
    setError('');
    setMessage('');
    try {
      const request = await fetch(`/api/case-files/${submissionId}/revision-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          review_round_id: roundId,
          response_items: items,
        }),
      });
      const data = await safeJson(request);
      if (!request.ok) throw new Error(data.error || 'Unable to save revision response');
      setResponseStatus(data.status);
      setMessage(action === 'submit' ? 'Point-by-point response submitted.' : 'Revision response draft saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save revision response');
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border-custom bg-white p-4 font-sans text-[10px] font-bold uppercase tracking-wider text-text-muted">
        <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> Loading revision response
      </div>
    );
  }

  return (
    <section className="rounded-sm border border-border-custom bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-3">
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Revision workspace</p>
          <h3 className="mt-0.5 font-serif text-base font-bold text-text-heading">Point-by-point response</h3>
          <p className="mt-1 max-w-2xl font-serif text-xs leading-relaxed text-text-muted">
            Explain how each released reviewer comment was addressed. Upload response letters and manuscript versions in the case file below.
          </p>
        </div>
        {responseStatus && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-border-custom bg-sand/20 px-2 py-1 font-sans text-[8px] font-bold uppercase tracking-wider text-olive">
            <CheckCircle2 size={10} /> {responseStatus}
          </span>
        )}
      </div>

      {message && <p className="mt-3 border border-olive/25 bg-sand/20 p-3 font-serif text-xs text-olive">{message}</p>}
      {error && <p className="mt-3 border border-charcoal/20 bg-sand/20 p-3 font-serif text-xs text-charcoal">{error}</p>}

      {!roundId ? (
        <p className="mt-4 font-serif text-xs text-text-muted">No review round is available for a structured response.</p>
      ) : items.length === 0 ? (
        <p className="mt-4 font-serif text-xs text-text-muted">
          No released reviewer comments are available yet. You can still upload an author response letter in the case file.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {items.map((item, index) => (
              <article key={`${item.reviewer_id}-${index}`} className="rounded-sm border border-border-light bg-sand/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-wider text-olive">
                    {item.reviewer_id.replace('-', ' ')} · Comment {index + 1}
                  </p>
                  <label>
                    <span className="sr-only">Response status for comment {index + 1}</span>
                    <select
                      value={item.status}
                      disabled={responseStatus === 'submitted'}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry, itemIndex) =>
                            itemIndex === index
                              ? { ...entry, status: event.target.value as ResponseStatus }
                              : entry,
                          ),
                        )
                      }
                      className="min-h-9 rounded-sm border border-border-custom bg-white px-2 font-sans text-[8px] font-bold uppercase tracking-wide text-olive outline-none focus:border-olive disabled:opacity-60"
                    >
                      <option value="addressed">Addressed</option>
                      <option value="partially_addressed">Partially addressed</option>
                      <option value="disagreed">Respectfully disagree</option>
                    </select>
                  </label>
                </div>
                <blockquote className="mt-3 border-l-2 border-olive/35 pl-3 font-serif text-xs italic leading-relaxed text-text-muted">
                  {item.comment}
                </blockquote>
                <label className="mt-3 block">
                  <span className="mb-1.5 block font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">
                    Author response
                  </span>
                  <textarea
                    value={item.response}
                    disabled={responseStatus === 'submitted'}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index ? { ...entry, response: event.target.value } : entry,
                        ),
                      )
                    }
                    rows={4}
                    placeholder="Describe the revision and where it appears in the manuscript..."
                    className="w-full resize-y rounded-sm border border-border-custom bg-white px-3 py-2 font-serif text-xs leading-relaxed outline-none focus:border-olive disabled:bg-sand/10 disabled:text-text-muted"
                  />
                </label>
              </article>
            ))}
          </div>
          {responseStatus !== 'submitted' && (
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border-light pt-4">
              <button
                type="button"
                onClick={() => persist('save_draft')}
                disabled={working !== null}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-border-custom bg-white px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-olive transition-colors hover:bg-sand/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-olive"
              >
                <Save size={11} /> {working === 'save_draft' ? 'Saving...' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => persist('submit')}
                disabled={working !== null || items.some((item) => !item.response.trim())}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-olive px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-link-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
              >
                <Send size={11} /> {working === 'submit' ? 'Submitting...' : 'Submit response'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
