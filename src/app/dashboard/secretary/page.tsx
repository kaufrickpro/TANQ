'use client';

import React, { useEffect, useState } from 'react';
import CaseFilePanel from '@/components/case-files/CaseFilePanel';

export default function SecretaryDashboard() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    fetch('/api/submissions?role=secretary').then(async response => {
      if (response.ok) setSubmissions(await response.json());
    });
  }, []);

  return (
    <main className="max-w-[1120px] mx-auto w-full px-6 py-12 grid lg:grid-cols-12 gap-8">
      <section className="lg:col-span-5 space-y-3">
        <h1 className="text-2xl font-serif font-bold text-text-heading uppercase border-b border-border-custom pb-3">Secretary Queue</h1>
        {submissions.map(submission => (
          <button key={submission.id} onClick={() => setSelected(submission)} className="block text-left w-full bg-bg-card border border-border-custom p-4 cursor-pointer hover:border-olive">
            <p className="font-serif font-bold text-sm">{submission.title}</p>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mt-1">{submission.current_stage || submission.status}</p>
          </button>
        ))}
      </section>
      <section className="lg:col-span-7">
        {selected ? <CaseFilePanel submissionId={selected.id} role="secretary" /> : <p className="text-xs text-text-muted">Select a manuscript for technical control.</p>}
      </section>
    </main>
  );
}

