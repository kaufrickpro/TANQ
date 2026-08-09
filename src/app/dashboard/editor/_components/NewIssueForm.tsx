import React from 'react';

interface NewIssueFormProps {
  editingIssueId: number | null;
  existingPdfUrl?: string | null;
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
  issuePublished: boolean;
  setIssuePublished: (val: boolean) => void;
  removeIssuePdf: boolean;
  setRemoveIssuePdf: (val: boolean) => void;
  creatingIssue: boolean;
  handleSaveIssue: (e: React.FormEvent) => void;
  resetIssueForm: () => void;
  setShowNewIssue: (val: boolean) => void;
}

export default function NewIssueForm({
  editingIssueId,
  existingPdfUrl,
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
  issuePublished,
  setIssuePublished,
  removeIssuePdf,
  setRemoveIssuePdf,
  creatingIssue,
  handleSaveIssue,
  resetIssueForm,
  setShowNewIssue
}: NewIssueFormProps) {
  const closeForm = () => {
    resetIssueForm();
    setShowNewIssue(false);
  };

  return (
    <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
      <div className="border-b border-border-light pb-2">
        <h3 className="font-serif font-bold text-sm text-text-heading uppercase tracking-wide">
          {editingIssueId ? 'Edit Issue' : 'New Issue Setup'}
        </h3>
        <p className="mt-1 font-serif text-[10px] leading-normal text-text-muted">
          {editingIssueId ? 'Update issue metadata, publication status, or its full PDF.' : 'Create an issue and choose whether it is immediately visible to readers.'}
        </p>
      </div>
      <form onSubmit={handleSaveIssue} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume</label>
          <input type="number" min={1} required value={vol} onChange={(e) => setVol(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Number</label>
          <input type="number" min={1} required value={num} onChange={(e) => setNum(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Year</label>
          <input type="number" min={1000} max={9999} required value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Month</label>
          <input type="text" required maxLength={40} value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive font-serif" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Issue Title</label>
          <input type="text" required maxLength={300} value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive font-serif" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">
            {existingPdfUrl ? 'Replace Full Issue PDF' : 'Full Issue PDF'}
          </label>
          <input
            id="new-issue-pdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              setIssuePdfFile(e.target.files?.[0] || null);
              if (e.target.files?.[0]) setRemoveIssuePdf(false);
            }}
            className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive font-sans"
          />
          <p className="text-[10px] text-text-muted mt-1 font-serif leading-normal">Optional PDF, up to 100 MB.</p>
        </div>
        {editingIssueId && existingPdfUrl && (
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={removeIssuePdf}
              disabled={Boolean(issuePdfFile)}
              onChange={(e) => setRemoveIssuePdf(e.target.checked)}
              className="h-3.5 w-3.5 accent-olive"
            />
            Remove the current issue PDF
          </label>
        )}
        <label className="sm:col-span-2 inline-flex items-center gap-2 border border-border-light bg-sand/10 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={issuePublished}
            onChange={(e) => setIssuePublished(e.target.checked)}
            className="h-3.5 w-3.5 accent-olive"
          />
          <span>
            <span className="block font-bold uppercase tracking-wider text-text-heading text-[10px]">Published</span>
            <span className="block mt-0.5 font-serif font-normal normal-case tracking-normal text-text-muted text-[10px]">Visible on the current issue and archive pages.</span>
          </span>
        </label>
        <div className="sm:col-span-2 flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={creatingIssue} className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-[10px]">
            {creatingIssue ? 'Saving...' : editingIssueId ? 'Save Issue Changes' : 'Create Issue'}
          </button>
          <button type="button" onClick={closeForm} className="border border-border-custom px-4 py-2.5 rounded-sm text-text-primary hover:bg-sand/10 transition-colors cursor-pointer uppercase tracking-wider text-[10px]">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
