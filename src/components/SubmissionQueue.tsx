'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ArrowUpDown, CalendarClock, Search } from 'lucide-react';
import { getMilestoneLabel } from './StatusProgressBar';

export interface SubmissionQueueItem {
  id: number;
  title: string;
  status: string;
  author?: string;
  submittedAt?: string | null;
  deadline?: string | null;
  actionRequired?: boolean;
  assignedToMe?: boolean;
  archived?: boolean;
  metadata?: string;
}

interface SubmissionQueueProps {
  items: SubmissionQueueItem[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  emptyMessage?: string;
  showAuthor?: boolean;
}

type QueueFilter = 'action' | 'assigned' | 'active' | 'archived';
type QueueSort = 'urgency' | 'newest' | 'title';

function safeTime(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function urgency(deadline?: string | null) {
  const time = safeTime(deadline);
  if (!time) return { label: 'No deadline', className: 'text-text-muted bg-sand/15 border-border-light', rank: 3 };
  const days = Math.ceil((time - Date.now()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, className: 'text-white bg-charcoal border-charcoal', rank: 0 };
  if (days <= 3) return { label: `${days}d left`, className: 'text-charcoal bg-sand border-border-custom', rank: 1 };
  return { label: `${days}d left`, className: 'text-olive bg-white border-border-custom', rank: 2 };
}

export default function SubmissionQueue({
  items,
  selectedId,
  onSelect,
  emptyMessage = 'No submissions match this view.',
  showAuthor = true,
}: SubmissionQueueProps) {
  const [filter, setFilter] = useState<QueueFilter>('action');
  const [sort, setSort] = useState<QueueSort>('urgency');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      action: items.filter((item) => item.actionRequired && !item.archived).length,
      assigned: items.filter((item) => item.assignedToMe && !item.archived).length,
      active: items.filter((item) => !item.archived).length,
      archived: items.filter((item) => item.archived).length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (filter === 'action') return item.actionRequired && !item.archived;
        if (filter === 'assigned') return item.assignedToMe && !item.archived;
        if (filter === 'active') return !item.archived;
        return item.archived;
      })
      .filter((item) => {
        if (!cleanQuery) return true;
        return [item.title, item.author, item.status, item.metadata].some((value) =>
          value?.toLowerCase().includes(cleanQuery),
        );
      })
      .sort((left, right) => {
        if (sort === 'title') return left.title.localeCompare(right.title);
        if (sort === 'newest') return (safeTime(right.submittedAt) ?? 0) - (safeTime(left.submittedAt) ?? 0);
        return urgency(left.deadline).rank - urgency(right.deadline).rank;
      });
  }, [filter, items, query, sort]);

  const filters: Array<{ key: QueueFilter; label: string }> = [
    { key: 'action', label: 'Action required' },
    { key: 'assigned', label: 'My assigned' },
    { key: 'active', label: 'All active' },
    { key: 'archived', label: 'Archived' },
  ];

  return (
    <section className="overflow-hidden rounded-sm border border-border-custom bg-bg-card shadow-sm">
      <div className="border-b border-border-custom bg-sand/20 px-4 pt-4">
        <div className="flex gap-1 overflow-x-auto pb-0" role="tablist" aria-label="Submission queue views">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`min-h-10 shrink-0 border-b-2 px-3 font-sans text-[9px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-olive ${
                filter === key
                  ? 'border-olive text-olive'
                  : 'border-transparent text-text-muted hover:text-olive'
              }`}
            >
              {label} <span className="ml-1 text-[8px]">({counts[key]})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 border-b border-border-light p-3 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search submissions</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, author, stage..."
            className="min-h-10 w-full rounded-sm border border-border-custom bg-white pl-9 pr-3 font-serif text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-olive focus-visible:ring-2 focus-visible:ring-olive/15"
          />
        </label>
        <label className="relative">
          <span className="sr-only">Sort submissions</span>
          <ArrowUpDown size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as QueueSort)}
            className="min-h-10 rounded-sm border border-border-custom bg-white pl-8 pr-8 font-sans text-[9px] font-bold uppercase tracking-wider text-olive outline-none focus:border-olive"
          >
            <option value="urgency">Deadline urgency</option>
            <option value="newest">Newest first</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      <div className="max-h-[660px] divide-y divide-border-light overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <AlertCircle size={24} className="mx-auto text-text-muted" />
            <p className="mt-2 font-serif text-xs text-text-muted">{emptyMessage}</p>
          </div>
        ) : (
          visible.map((item) => {
            const due = urgency(item.deadline);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`block w-full px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-olive ${
                  selectedId === item.id ? 'bg-sand/25' : 'bg-white hover:bg-sand/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-sm font-bold leading-snug text-text-primary">{item.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[9px] font-bold uppercase tracking-wide text-text-muted">
                      {showAuthor && item.author && <span>{item.author}</span>}
                      <span className="text-olive">{getMilestoneLabel(item.status, 'editorial')}</span>
                      {item.metadata && <span>{item.metadata}</span>}
                    </div>
                  </div>
                  {item.actionRequired && (
                    <span className="shrink-0 rounded-full bg-olive px-2 py-1 font-sans text-[8px] font-bold uppercase tracking-wider text-white">
                      Action
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-2 font-sans text-[9px] text-text-muted">
                  <span>{item.submittedAt || 'Submission date unavailable'}</span>
                  <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-bold uppercase tracking-wide ${due.className}`}>
                    <CalendarClock size={10} /> {due.label}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
