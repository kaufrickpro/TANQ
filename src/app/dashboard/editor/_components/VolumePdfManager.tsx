import React from 'react';
import { BookOpen, Edit, FileText, Loader2, Trash2 } from 'lucide-react';
import type { JournalVolume, Issue } from '../page';
import { publicationPdfHref } from '@/lib/publicationPdfPaths';

interface VolumePdfManagerProps {
  canDelete: boolean;
  volumes: JournalVolume[];
  issues: Issue[];
  editingVolumeId: number | null;
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
  removeVolumePdf: boolean;
  setRemoveVolumePdf: (val: boolean) => void;
  uploadingVolumePdf: boolean;
  handleSaveVolume: (e: React.FormEvent) => void;
  startEditingVolume: (volume: JournalVolume) => void;
  resetVolumeForm: () => void;
  handleDeleteVolume: (volume: JournalVolume) => Promise<void>;
  issuePdfIssueId: number;
  setIssuePdfIssueId: (val: number) => void;
  existingIssuePdfFile: File | null;
  setExistingIssuePdfFile: (val: File | null) => void;
  uploadingIssuePdf: boolean;
  handleUploadExistingIssuePdf: (e: React.FormEvent) => void;
  setShowVolumePdf: (val: boolean) => void;
}

export default function VolumePdfManager({
  canDelete,
  volumes,
  issues,
  editingVolumeId,
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
  removeVolumePdf,
  setRemoveVolumePdf,
  uploadingVolumePdf,
  handleSaveVolume,
  startEditingVolume,
  resetVolumeForm,
  handleDeleteVolume,
  issuePdfIssueId,
  setIssuePdfIssueId,
  existingIssuePdfFile,
  setExistingIssuePdfFile,
  uploadingIssuePdf,
  handleUploadExistingIssuePdf,
  setShowVolumePdf
}: VolumePdfManagerProps) {
  const editingVolume = volumes.find((volume) => volume.id === editingVolumeId);
  const closeManager = () => {
    resetVolumeForm();
    setShowVolumePdf(false);
  };

  return (
    <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-5 text-xs text-text-primary font-sans">
      <div className="flex items-start justify-between gap-3 border-b border-border-light pb-3">
        <div>
          <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 uppercase tracking-wide">
            <BookOpen size={15} /> Volume PDF Manager
          </h3>
          <p className="text-[10px] text-text-muted mt-1 font-serif leading-normal">
            Create volumes, revise their metadata and complete PDF, or remove obsolete volume records.
          </p>
        </div>
        <button type="button" onClick={closeManager} className="text-text-muted hover:text-olive font-bold cursor-pointer uppercase tracking-wider text-[10px]">
          Close
        </button>
      </div>

      {volumes.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold text-[9px] uppercase tracking-wider text-text-muted">Current Volumes</h4>
          <div className="space-y-2">
            {volumes.map((volumeItem) => (
              <div key={volumeItem.id} className={`flex items-center justify-between gap-3 border px-3 py-2 text-xs ${editingVolumeId === volumeItem.id ? 'border-olive bg-sand/25' : 'border-border-custom bg-sand/15'}`}>
                <div className="min-w-0">
                  <p className="font-bold text-text-heading font-serif truncate">{volumeItem.title}</p>
                  <p className="text-[10px] text-text-muted mt-0.5 font-serif">
                    Vol. {volumeItem.volume}, {volumeItem.year}{volumeItem.subtitle ? ` · ${volumeItem.subtitle}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {volumeItem.pdf_url ? (
                    <a href={publicationPdfHref('volume', volumeItem.id)} download className="mr-1 text-[9px] text-olive font-bold hover:underline uppercase tracking-wider">
                      PDF
                    </a>
                  ) : (
                    <span className="mr-1 text-[9px] uppercase tracking-wider text-text-muted/60">No PDF</span>
                  )}
                  <button
                    type="button"
                    onClick={() => startEditingVolume(volumeItem)}
                    className="inline-flex items-center justify-center p-1.5 text-olive border border-border-custom hover:bg-white rounded-sm cursor-pointer transition-colors"
                    aria-label={`Edit ${volumeItem.title}`}
                    title="Edit volume"
                  >
                    <Edit size={11} />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteVolume(volumeItem)}
                      className="inline-flex items-center justify-center p-1.5 text-text-muted hover:text-red-600 border border-border-custom hover:bg-red-50 rounded-sm cursor-pointer transition-colors"
                      aria-label={`Delete ${volumeItem.title}`}
                      title="Delete volume"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSaveVolume} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border border-border-light p-4 bg-white">
        <div className="sm:col-span-2 flex items-center justify-between gap-3 border-b border-border-light pb-2">
          <div>
            <h4 className="font-serif font-bold text-xs uppercase tracking-wide text-text-heading">
              {editingVolumeId ? 'Edit Volume' : 'Create Volume'}
            </h4>
            {editingVolumeId && (
              <p className="mt-1 font-serif text-[10px] normal-case text-text-muted">Changing the volume number or year also updates its matching issues.</p>
            )}
          </div>
          {editingVolumeId && (
            <button type="button" onClick={resetVolumeForm} className="text-[9px] font-bold uppercase tracking-wider text-text-muted hover:text-olive cursor-pointer">
              New volume
            </button>
          )}
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume</label>
          <input type="number" min={1} required value={volumePdfNumber} onChange={(e) => setVolumePdfNumber(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive" />
        </div>
        <div>
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Year</label>
          <input type="number" min={1000} max={9999} required value={volumePdfYear} onChange={(e) => setVolumePdfYear(Number(e.target.value))} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Volume Title</label>
          <input type="text" required maxLength={300} value={volumePdfTitle} onChange={(e) => setVolumePdfTitle(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive font-serif" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Subtitle</label>
          <input type="text" maxLength={500} value={volumePdfSubtitle} onChange={(e) => setVolumePdfSubtitle(e.target.value)} className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive font-serif" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">
            {editingVolume?.pdf_url ? 'Replace Volume PDF' : 'Volume PDF'}
          </label>
          <input
            id="volume-pdf-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              setVolumePdfFile(e.target.files?.[0] || null);
              if (e.target.files?.[0]) setRemoveVolumePdf(false);
            }}
            className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none focus:border-olive font-sans"
          />
          <p className="mt-1 font-serif text-[10px] text-text-muted">Optional PDF, up to 100 MB.</p>
        </div>
        {editingVolume?.pdf_url && (
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={removeVolumePdf}
              disabled={Boolean(volumePdfFile)}
              onChange={(e) => setRemoveVolumePdf(e.target.checked)}
              className="h-3.5 w-3.5 accent-olive"
            />
            Remove the current volume PDF
          </label>
        )}
        <div className="sm:col-span-2 flex gap-3 pt-1">
          <button type="submit" disabled={uploadingVolumePdf} className="inline-flex items-center gap-1.5 bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-[10px]">
            {uploadingVolumePdf ? <><Loader2 size={11} className="animate-spin" /> Saving...</> : editingVolumeId ? 'Save Volume Changes' : 'Create Volume'}
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
