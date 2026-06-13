'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CircleX, LoaderCircle, LockKeyhole, MessageSquare, Plus, Send } from 'lucide-react';
import { safeJson } from '@/lib/clientFetch';

interface DiscussionMessage {
  id: number;
  sender_name: string;
  body: string;
  created_at: string;
}

interface Discussion {
  id: number;
  subject: string;
  visibility: 'editorial' | 'author_editor' | 'all_parties';
  stage?: string;
  is_closed?: boolean;
  messages?: DiscussionMessage[];
}

interface DiscussionPanelProps {
  submissionId: number;
  role: 'admin' | 'editor' | 'secretary' | 'reviewer' | 'author';
}

export default function DiscussionPanel({ submissionId, role }: DiscussionPanelProps) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Discussion['visibility']>(
    role === 'author' ? 'author_editor' : 'editorial',
  );
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/case-files/${submissionId}/discussions`);
      if (response.status === 404) {
        setMessage('Discussion service is not available for this manuscript yet.');
        setDiscussions([]);
        return;
      }
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Unable to load discussions');
      const next = Array.isArray(data) ? data : data.discussions || [];
      setDiscussions(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load discussions');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = discussions.find((discussion) => discussion.id === selectedId) ?? null;
  const isStaff = role === 'admin' || role === 'editor' || role === 'secretary';
  const canReply = Boolean(
    selected &&
    !selected.is_closed &&
    (role !== 'reviewer' || selected.visibility === 'all_parties'),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || (creating && !subject.trim())) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/case-files/${submissionId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          creating
            ? { action: 'create', subject: subject.trim(), body: body.trim(), visibility }
            : { action: 'message', discussion_id: selectedId, body: body.trim() },
        ),
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Unable to send message');
      setBody('');
      setSubject('');
      setCreating(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send message');
    } finally {
      setWorking(false);
    }
  }

  async function closeSelected() {
    if (!selected || !isStaff || selected.is_closed) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/case-files/${submissionId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', discussion_id: selected.id }),
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Unable to close discussion');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to close discussion');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-sm border border-border-custom bg-bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border-custom px-4 py-3">
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Case communication</p>
          <h3 className="mt-0.5 flex items-center gap-2 font-serif text-base font-bold text-text-heading">
            <MessageSquare size={15} /> Discussions
          </h3>
        </div>
        {role !== 'reviewer' && (
          <button
            type="button"
            onClick={() => setCreating((current) => !current)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-border-custom bg-white px-3 font-sans text-[9px] font-bold uppercase tracking-wider text-olive transition-colors hover:bg-sand/20 focus-visible:outline-2 focus-visible:outline-olive"
          >
            <Plus size={12} /> New thread
          </button>
        )}
      </div>

      {message && <p className="border-b border-border-light bg-sand/20 px-4 py-2 font-serif text-xs text-text-muted">{message}</p>}

      {loading ? (
        <p className="flex items-center gap-2 p-5 font-sans text-[10px] font-bold uppercase tracking-wider text-text-muted">
          <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> Loading discussions
        </p>
      ) : (
        <div className="grid min-h-72 md:grid-cols-[190px_1fr]">
          <div className="border-b border-border-light p-2 md:border-b-0 md:border-r">
            {discussions.length === 0 ? (
              <p className="p-3 font-serif text-xs text-text-muted">No discussion threads yet.</p>
            ) : (
              discussions.map((discussion) => (
                <button
                  key={discussion.id}
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(discussion.id);
                  }}
                  className={`mb-1 block w-full rounded-sm border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-olive ${
                    selectedId === discussion.id
                      ? 'border-olive bg-sand/25'
                      : 'border-transparent hover:border-border-light hover:bg-sand/10'
                  }`}
                >
                  <span className="block font-serif text-xs font-bold text-text-primary">{discussion.subject}</span>
                  <span className="mt-1 flex items-center gap-1 font-sans text-[8px] font-bold uppercase tracking-wide text-text-muted">
                    {discussion.visibility === 'editorial' && <LockKeyhole size={9} />}
                    {discussion.visibility.replace('_', ' ')}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex min-h-72 flex-col">
            <div className="flex-1 space-y-3 p-4">
              {creating ? (
                <div className="rounded-sm border border-border-light bg-sand/10 p-4">
                  <p className="font-serif text-sm font-bold text-text-heading">Start a discussion</p>
                  <p className="mt-1 font-serif text-xs text-text-muted">Choose visibility deliberately; editorial threads are internal.</p>
                </div>
              ) : selected ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border-light pb-3">
                    <div>
                      <p className="font-serif text-sm font-bold text-text-heading">{selected.subject}</p>
                      <p className="mt-0.5 font-sans text-[8px] font-bold uppercase tracking-wide text-text-muted">
                        {selected.is_closed ? 'Closed thread' : selected.visibility.replace('_', ' ')}
                      </p>
                    </div>
                    {isStaff && !selected.is_closed && (
                      <button
                        type="button"
                        onClick={closeSelected}
                        disabled={working}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-border-custom bg-white px-3 font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted transition-colors hover:border-olive hover:text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-olive"
                      >
                        <CircleX size={11} /> Close thread
                      </button>
                    )}
                  </div>
                  {selected.messages?.length ? (
                    selected.messages.map((entry) => (
                      <article key={entry.id} className="rounded-sm border border-border-light bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-sans text-[8px] font-bold uppercase tracking-wide text-text-muted">
                          <span>{entry.sender_name}</span>
                          <time>{new Date(entry.created_at).toLocaleString()}</time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap font-serif text-xs leading-relaxed text-text-primary">{entry.body}</p>
                      </article>
                    ))
                  ) : (
                    <p className="font-serif text-xs text-text-muted">This thread has no messages yet.</p>
                  )}
                </>
              ) : (
                <p className="font-serif text-xs text-text-muted">Select a discussion or start a new thread.</p>
              )}
            </div>

            {(creating || canReply) && (
              <form onSubmit={submit} className="space-y-2 border-t border-border-light bg-sand/10 p-3">
                {creating && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label>
                      <span className="sr-only">Discussion subject</span>
                      <input
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        required
                        placeholder="Discussion subject"
                        className="min-h-10 w-full rounded-sm border border-border-custom bg-white px-3 font-serif text-xs outline-none focus:border-olive"
                      />
                    </label>
                    <label>
                      <span className="sr-only">Discussion visibility</span>
                      <select
                        value={visibility}
                        onChange={(event) => setVisibility(event.target.value as Discussion['visibility'])}
                        className="min-h-10 rounded-sm border border-border-custom bg-white px-3 font-sans text-[9px] font-bold uppercase tracking-wide text-olive outline-none focus:border-olive"
                      >
                        {role !== 'author' && <option value="editorial">Editorial only</option>}
                        <option value="author_editor">Author and editors</option>
                        {role !== 'author' && <option value="all_parties">All parties</option>}
                      </select>
                    </label>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Message</span>
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      required
                      rows={3}
                      placeholder="Write a clear case-file message..."
                      className="w-full resize-y rounded-sm border border-border-custom bg-white px-3 py-2 font-serif text-xs outline-none focus:border-olive"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={working}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-olive px-4 font-sans text-[9px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-link-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
                  >
                    <Send size={11} /> Send
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
