'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { safeJson } from '@/lib/clientFetch';

export default function ReviewerInvitePage() {
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState<any>(null);
  const [action, setAction] = useState<'accept' | 'decline'>('accept');
  const [coi, setCoi] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
      ?? new URLSearchParams(window.location.search).get('token')
      ?? '';
    window.history.replaceState(null, '', window.location.pathname);
    setToken(rawToken);
    if (!rawToken) {
      setError('Invitation token is missing.');
      return;
    }
    fetch(`/api/reviewer-invite?token=${encodeURIComponent(rawToken)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await safeJson(response);
        if (!response.ok) throw new Error(data.error || 'Invitation is unavailable');
        setInvitation(data.invitation);
      })
      .catch(err => setError(err.message || 'Invitation is unavailable'));
  }, []);

  async function respond(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/reviewer-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action,
          coi_declaration: coi,
          decline_reason: declineReason,
        }),
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Invitation response failed');
      setInvitation(null);
      setRegistrationUrl(data.registrationUrl || null);
      setMessage(data.action === 'expired'
        ? 'This invitation expired before the response could be recorded.'
        : action === 'accept'
          ? 'Thank you. The review invitation has been accepted.'
          : 'Thank you. The invitation has been declined and the editorial team has been notified.');
    } catch (err: any) {
      setError(err.message || 'Invitation response failed');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto w-full px-6 py-14">
      <section className="bg-bg-card border border-border-custom p-7 space-y-6">
        <header className="space-y-2 border-b border-border-light pb-4">
          <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Peer Review Invitation</p>
          <h1 className="font-serif text-2xl font-bold text-text-heading">African Nexus Quarterly</h1>
          <p className="text-xs text-text-muted font-serif">
            This journal uses double-blind review. The invitation link can be answered only once.
          </p>
        </header>

        {error && <p className="text-xs bg-red-50 border border-red-200 text-red-700 p-3">{error}</p>}
        {message && <p className="text-xs bg-sand/20 border border-border-custom p-3">{message}</p>}

        {registrationUrl && (
          <Link href={registrationUrl} className="block bg-olive text-white text-center py-3 text-xs font-bold uppercase tracking-wider">
            Create Reviewer Account
          </Link>
        )}

        {invitation && (
          <>
            <div className="space-y-3 font-serif text-sm">
              <h2 className="text-xl font-bold text-text-heading">{invitation.title}</h2>
              <p>{invitation.abstract}</p>
              {invitation.keywords && <p className="text-xs text-text-muted"><strong>Keywords:</strong> {invitation.keywords}</p>}
              <p className="text-xs text-text-muted">
                Review deadline: {invitation.review_deadline
                  ? new Date(invitation.review_deadline).toLocaleDateString()
                  : 'To be confirmed'}
              </p>
            </div>

            <form onSubmit={respond} className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setAction('accept')} className={`flex-1 border px-3 py-2 text-xs font-bold uppercase ${action === 'accept' ? 'bg-olive text-white' : 'border-border-custom'}`}>Accept</button>
                <button type="button" onClick={() => setAction('decline')} className={`flex-1 border px-3 py-2 text-xs font-bold uppercase ${action === 'decline' ? 'bg-text-heading text-white' : 'border-border-custom'}`}>Decline</button>
              </div>
              {action === 'accept' ? (
                <label className="block space-y-1 text-xs font-bold">
                  Conflict-of-interest declaration
                  <textarea required value={coi} onChange={event => setCoi(event.target.value)} rows={5} className="w-full border border-border-custom p-3 font-normal" placeholder="Declare any conflicts, or state that you have none." />
                </label>
              ) : (
                <label className="block space-y-1 text-xs font-bold">
                  Reason for declining
                  <textarea required value={declineReason} onChange={event => setDeclineReason(event.target.value)} rows={5} className="w-full border border-border-custom p-3 font-normal" />
                </label>
              )}
              <button disabled={working} className="w-full bg-olive text-white py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50">
                {working ? 'Submitting...' : `Submit ${action}`}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
