'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ClipboardCheck, RefreshCw, ChevronDown, ChevronUp, BookOpen, Users, FileText, Globe } from 'lucide-react';
import CaseFilePanel from '@/components/case-files/CaseFilePanel';
import DiscussionPanel from '@/components/DiscussionPanel';
import StatusProgressBar from '@/components/StatusProgressBar';
import SubmissionQueue, { type SubmissionQueueItem } from '@/components/SubmissionQueue';

interface SecretarySubmission {
  id: number;
  title: string;
  author_name: string;
  date_submitted: string;
  status: string;
  current_stage?: string | null;
  current_stage_deadline?: string | null;
  submission_type?: string | null;
  checklist_confirmed?: boolean;
  abstract?: string;
  keywords?: string;
  short_title?: string | null;
  language?: string | null;
  co_authors?: any;
  project_number?: string | null;
  ethics_statement?: string | null;
  supporting_institution?: string | null;
  acknowledgements?: string | null;
}

const CHECKLIST = [
  'Required manuscript files are present',
  'Author-identifying information is separated',
  'Abstract, keywords, and metadata are complete',
  'Formatting and scope meet intake requirements',
];

const stageOf = (submission: SecretarySubmission) => submission.current_stage || submission.status;

export default function SecretaryDashboard() {
  const [submissions, setSubmissions] = useState<SecretarySubmission[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checks, setChecks] = useState<Record<number, boolean[]>>({});
  const [loading, setLoading] = useState(true);
  const [metadataExpanded, setMetadataExpanded] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/submissions?role=secretary');
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
        setSelectedId((current) => current ?? data.find((submission: SecretarySubmission) =>
          ['submitted', 'secretary_check'].includes(stageOf(submission)),
        )?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const queueItems = useMemo<SubmissionQueueItem[]>(
    () =>
      submissions.map((submission) => {
        const stage = stageOf(submission);
        const archived = ['published', 'rejected', 'withdrawn'].includes(stage);
        return {
          id: submission.id,
          title: submission.title,
          author: submission.author_name,
          status: stage,
          submittedAt: submission.date_submitted,
          deadline: submission.current_stage_deadline,
          actionRequired: ['submitted', 'secretary_check'].includes(stage),
          assignedToMe: ['submitted', 'secretary_check'].includes(stage),
          archived,
          metadata: submission.submission_type || undefined,
        };
      }),
    [submissions],
  );
  const selected = submissions.find((submission) => submission.id === selectedId) ?? null;
  const selectedChecks = selected ? checks[selected.id] || CHECKLIST.map(() => false) : [];
  const completedChecks = selectedChecks.filter(Boolean).length;

  return (
    <main className="mx-auto w-full max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border-custom pb-4">
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-[0.2em] text-text-muted">Editorial intake</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-text-heading">Secretary technical queue</h1>
          <p className="mt-1 max-w-xl font-serif text-xs text-text-muted">
            Complete a consistent technical check before forwarding manuscripts to editorial screening.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-border-custom bg-white px-3 font-sans text-[9px] font-bold uppercase tracking-wider text-olive transition-colors hover:bg-sand/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-olive"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(520px,1.2fr)]">
        <SubmissionQueue
          items={queueItems}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyMessage="No manuscripts are waiting for technical control."
        />

        <section className="space-y-5">
          {selected ? (
            <>
              <div className="rounded-sm border border-border-custom bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-3">
                  <div>
                    <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Selected manuscript</p>
                    <h2 className="mt-1 font-serif text-lg font-bold text-text-heading">{selected.title}</h2>
                    <p className="mt-1 font-serif text-xs text-text-muted">{selected.author_name}</p>
                  </div>
                  <span className="rounded-sm border border-border-custom bg-sand/20 px-2 py-1 font-sans text-[8px] font-bold uppercase tracking-wider text-olive">
                    {stageOf(selected).replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="mt-4">
                  <StatusProgressBar currentStage={stageOf(selected)} audience="editorial" />
                </div>
              </div>

              {/* Manuscript Metadata */}
              <div className="rounded-sm border border-border-custom bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMetadataExpanded(!metadataExpanded)}
                  className="flex w-full items-center justify-between bg-sand/5 px-5 py-4 text-left transition-colors hover:bg-sand/10 border-b border-border-custom"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-olive" />
                    <div>
                      <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Technical Details</p>
                      <h3 className="font-serif text-sm font-bold text-text-heading">Manuscript Metadata</h3>
                    </div>
                  </div>
                  <div className="text-text-muted">
                    {metadataExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {metadataExpanded && (
                  <div className="p-5 space-y-4 font-sans text-xs">
                    {/* Abstract */}
                    {selected.abstract && (
                      <div className="space-y-1.5">
                        <h4 className="font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                          <FileText size={12} /> Abstract
                        </h4>
                        <p className="font-serif leading-relaxed text-text-primary bg-sand/10 border border-border-light rounded-sm p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {selected.abstract}
                        </p>
                      </div>
                    )}

                    {/* Keywords */}
                    {selected.keywords && (
                      <div className="space-y-1.5">
                        <h4 className="font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">Keywords</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.keywords.split(',').map((kw) => (
                            <span key={kw.trim()} className="rounded-sm bg-sand/35 border border-border-light px-2 py-0.5 text-[10px] font-medium text-text-primary">
                              {kw.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 border-t border-border-light pt-4">
                      {/* Left column details */}
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Submission Type</p>
                          <p className="font-serif text-xs font-semibold text-text-heading mt-0.5">{selected.submission_type || 'Research Article'}</p>
                        </div>
                        {selected.short_title && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Short Title</p>
                            <p className="font-serif text-xs font-semibold text-text-heading mt-0.5">{selected.short_title}</p>
                          </div>
                        )}
                        {selected.language && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1"><Globe size={11} /> Language</p>
                            <p className="font-serif text-xs font-semibold text-text-heading mt-0.5">{selected.language}</p>
                          </div>
                        )}
                      </div>

                      {/* Right column details */}
                      <div className="space-y-2.5">
                        {/* Co-Authors */}
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1"><Users size={11} /> Co-Authors</p>
                          <div className="mt-1 space-y-1">
                            {(() => {
                              try {
                                const authors = typeof selected.co_authors === 'string'
                                  ? JSON.parse(selected.co_authors)
                                  : selected.co_authors;
                                if (Array.isArray(authors) && authors.length > 0) {
                                  return authors.map((author: any, idx: number) => (
                                    <div key={idx} className="rounded-sm bg-sand/15 border border-border-light/60 p-1.5 text-[10px]">
                                      <p className="font-bold text-text-primary">{author.name} <span className="font-normal text-text-muted">({author.email})</span></p>
                                      {author.institution && <p className="text-text-muted text-[9px] mt-0.5">{author.institution}</p>}
                                    </div>
                                  ));
                                }
                              } catch {}
                              return <p className="text-text-muted italic text-[10px]">No co-authors registered.</p>;
                            })()}
                          </div>
                        </div>

                        {selected.supporting_institution && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Supporting Institution</p>
                            <p className="font-serif text-xs font-semibold text-text-heading mt-0.5">{selected.supporting_institution}</p>
                          </div>
                        )}
                        {selected.project_number && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Project/Grant Number</p>
                            <p className="font-mono text-xs font-semibold text-text-heading mt-0.5">{selected.project_number}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ethics Statement */}
                    {selected.ethics_statement && (
                      <div className="border-t border-border-light pt-3 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Ethics Statement</p>
                        <p className="font-serif text-xs text-text-primary leading-relaxed bg-sand/10 border border-border-light rounded-sm p-2.5 max-h-24 overflow-y-auto">{selected.ethics_statement}</p>
                      </div>
                    )}

                    {/* Acknowledgements */}
                    {selected.acknowledgements && (
                      <div className="border-t border-border-light pt-3 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Acknowledgements</p>
                        <p className="font-serif text-xs text-text-primary leading-relaxed bg-sand/10 border border-border-light rounded-sm p-2.5 max-h-24 overflow-y-auto">{selected.acknowledgements}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-sm border border-border-custom bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border-light pb-3">
                  <div>
                    <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Technical control</p>
                    <h3 className="mt-1 flex items-center gap-2 font-serif text-base font-bold text-text-heading">
                      <ClipboardCheck size={15} /> Intake checklist
                    </h3>
                  </div>
                  <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">
                    {completedChecks}/{CHECKLIST.length} complete
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {CHECKLIST.map((label, index) => (
                    <label
                      key={label}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border-light bg-sand/10 px-3 py-2 transition-colors hover:border-border-custom hover:bg-sand/20"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selectedChecks[index])}
                        onChange={(event) =>
                          setChecks((current) => {
                            const next = [...selectedChecks];
                            next[index] = event.target.checked;
                            return { ...current, [selected.id]: next };
                          })
                        }
                        className="size-4 accent-olive"
                      />
                      <span className="font-serif text-xs text-text-primary">{label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 border-t border-border-light pt-3 font-serif text-[10px] leading-relaxed text-text-muted">
                  <CheckSquare size={12} className="mt-0.5 shrink-0 text-olive" />
                  Use the case-file actions below to forward the manuscript or request technical corrections. Checklist progress is a local working aid.
                </p>
              </div>

              <DiscussionPanel submissionId={selected.id} role="secretary" />
              <CaseFilePanel submissionId={selected.id} role="secretary" />
            </>
          ) : (
            <div className="rounded-sm border border-border-custom bg-white px-6 py-16 text-center shadow-sm">
              <ClipboardCheck size={30} className="mx-auto text-text-muted" />
              <h2 className="mt-3 font-serif text-sm font-bold text-text-heading">Select a manuscript</h2>
              <p className="mt-1 font-serif text-xs text-text-muted">Choose an intake item to begin technical control.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
