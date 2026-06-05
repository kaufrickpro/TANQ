import React from 'react';

interface NewIssueFormProps {
  vol: number;
  setVol: (val: number) => void;
  num: number;
  setNum: (val: number) => void;
  year: number;
  setYear: (val: number) => void;
  month: string;
  setMonth: (val: string) => void;
  issueTitle: string;
  setIssueTitle: (val: string) => void;
  issuePdfFile: File | null;
  setIssuePdfFile: (val: File | null) => void;
  creatingIssue: boolean;
  handleCreateIssue: (e: React.FormEvent) => void;
  setShowNewIssue: (val: boolean) => void;
}

export default function NewIssueForm({
  vol,
  setVol,
  num,
  setNum,
  year,
  setYear,
  month,
  setMonth,
  issueTitle,
  setIssueTitle,
  issuePdfFile,
  setIssuePdfFile,
  creatingIssue,
  handleCreateIssue,
  setShowNewIssue
}: NewIssueFormProps) {
  return (
    <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
      <h3 className="font-serif font-bold text-sm text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">New Issue Setup</h3>
      <form onSubmit={handleCreateIssue} className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume</label>
          <input type="number" value={vol} onChange={(e) => setVol(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Number</label>
          <input type="number" value={num} onChange={(e) => setNum(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Month</label>
          <input type="text" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-serif" />
        </div>
        <div className="col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Issue Title</label>
          <input type="text" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-serif" />
        </div>
        <div className="col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Full Issue PDF</label>
          <input
            id="new-issue-pdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setIssuePdfFile(e.target.files?.[0] || null)}
            className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-sans"
          />
          <p className="text-[10px] text-text-muted mt-1 font-serif leading-normal">Optional. You can also attach this later from the Volume PDF manager.</p>
        </div>
        <div className="col-span-2 flex gap-3 pt-2">
          <button type="submit" disabled={creatingIssue} className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-[10px]">
            {creatingIssue ? 'Creating...' : 'Create & Publish Issue'}
          </button>
          <button type="button" onClick={() => setShowNewIssue(false)} className="border border-border-custom px-4 py-2.5 rounded-sm text-text-primary hover:bg-sand/10 transition-colors cursor-pointer uppercase tracking-wider text-[10px]">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
