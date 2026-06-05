import React from 'react';
import { BookOpen, FileText } from 'lucide-react';
import type { JournalVolume, Issue } from '../page';

interface VolumePdfManagerProps {
  volumes: JournalVolume[];
  issues: Issue[];
  volumePdfNumber: number;
  setVolumePdfNumber: (val: number) => void;
  volumePdfYear: number;
  setVolumePdfYear: (val: number) => void;
  volumePdfTitle: string;
  setVolumePdfTitle: (val: string) => void;
  volumePdfSubtitle: string;
  setVolumePdfSubtitle: (val: string) => void;
  volumePdfFile: File | null;
  setVolumePdfFile: (val: File | null) => void;
  uploadingVolumePdf: boolean;
  handleUploadVolumePdf: (e: React.FormEvent) => void;
  issuePdfIssueId: number;
  setIssuePdfIssueId: (val: number) => void;
  existingIssuePdfFile: File | null;
  setExistingIssuePdfFile: (val: File | null) => void;
  uploadingIssuePdf: boolean;
  handleUploadExistingIssuePdf: (e: React.FormEvent) => void;
  setShowVolumePdf: (val: boolean) => void;
}

export default function VolumePdfManager({
  volumes,
  issues,
  volumePdfNumber,
  setVolumePdfNumber,
  volumePdfYear,
  setVolumePdfYear,
  volumePdfTitle,
  setVolumePdfTitle,
  volumePdfSubtitle,
  setVolumePdfSubtitle,
  volumePdfFile,
  setVolumePdfFile,
  uploadingVolumePdf,
  handleUploadVolumePdf,
  issuePdfIssueId,
  setIssuePdfIssueId,
  existingIssuePdfFile,
  setExistingIssuePdfFile,
  uploadingIssuePdf,
  handleUploadExistingIssuePdf,
  setShowVolumePdf
}: VolumePdfManagerProps) {
  return (
    <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-5 text-xs text-text-primary font-sans">
      <div className="flex items-start justify-between gap-3 border-b border-border-light pb-3">
        <div>
          <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 uppercase tracking-wide">
            <BookOpen size={15} /> Volume PDF Manager
          </h3>
          <p className="text-[10px] text-text-muted mt-1 font-serif leading-normal">
            Upload the complete journal volume PDF shown above its issues in the public archive.
          </p>
        </div>
        <button type="button" onClick={() => setShowVolumePdf(false)} className="text-text-muted hover:text-olive font-bold cursor-pointer uppercase tracking-wider text-[10px]">
          Close
        </button>
      </div>

      {volumes.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold text-[9px] uppercase tracking-wider text-text-muted">Current Volumes</h4>
          <div className="space-y-2">
            {volumes.map((volumeItem) => (
              <div key={volumeItem.id} className="flex items-center justify-between gap-3 border border-border-custom bg-sand/15 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-text-heading font-serif truncate">{volumeItem.title}</p>
                  <p className="text-[10px] text-text-muted mt-0.5 font-serif">
                    Vol. {volumeItem.volume}, {volumeItem.year}{volumeItem.subtitle ? ` · ${volumeItem.subtitle}` : ''}
                  </p>
                </div>
                {volumeItem.pdf_url ? (
                  <a href={volumeItem.pdf_url} download className="text-[10px] text-olive font-bold hover:underline shrink-0 uppercase tracking-wider">
                    Download
                  </a>
                ) : (
                  <span className="text-[10px] text-text-muted/60 shrink-0">No PDF</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleUploadVolumePdf} className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume</label>
          <input type="number" min={1} value={volumePdfNumber} onChange={(e) => setVolumePdfNumber(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Year</label>
          <input type="number" value={volumePdfYear} onChange={(e) => setVolumePdfYear(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none" />
        </div>
        <div className="col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume Title</label>
          <input type="text" required value={volumePdfTitle} onChange={(e) => setVolumePdfTitle(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-serif" />
        </div>
        <div className="col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Subtitle</label>
          <input type="text" value={volumePdfSubtitle} onChange={(e) => setVolumePdfSubtitle(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-serif" />
        </div>
        <div className="col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume PDF</label>
          <input
            id="volume-pdf-file"
            type="file"
            required
            accept="application/pdf,.pdf"
            onChange={(e) => setVolumePdfFile(e.target.files?.[0] || null)}
            className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-sans"
          />
        </div>
        <div className="col-span-2 flex gap-3 pt-1">
          <button type="submit" disabled={uploadingVolumePdf || !volumePdfFile} className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-[10px]">
            {uploadingVolumePdf ? 'Uploading...' : 'Save Volume PDF'}
          </button>
        </div>
      </form>

      {issues.length > 0 && (
        <form onSubmit={handleUploadExistingIssuePdf} className="border-t border-border-light pt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="col-span-2">
            <h4 className="font-serif font-bold text-xs text-text-heading flex items-center gap-1.5 uppercase tracking-wide">
              <FileText size={14} /> Attach Full Issue PDF
            </h4>
          </div>
          <div className="col-span-2">
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Existing Issue</label>
            <select
              value={issuePdfIssueId}
              onChange={(e) => setIssuePdfIssueId(Number(e.target.value))}
              className="bg-white border border-border-custom rounded-sm px-3 py-2 w-full text-black focus:outline-none font-serif"
            >
              {issues.map((iss) => (
                <option key={iss.id} value={iss.id}>
                  {iss.title}{iss.issue_pdf_url ? ' (PDF attached)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Issue PDF</label>
            <input
              id="existing-issue-pdf"
              type="file"
              required
              accept="application/pdf,.pdf"
              onChange={(e) => setExistingIssuePdfFile(e.target.files?.[0] || null)}
              className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-sans"
            />
          </div>
          <div className="col-span-2 flex gap-3 pt-1">
            <button type="submit" disabled={uploadingIssuePdf || !existingIssuePdfFile} className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-[10px]">
              {uploadingIssuePdf ? 'Uploading...' : 'Attach Issue PDF'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
