import React from 'react';
import { Users, Send, Award, ShieldAlert } from 'lucide-react';
import type { Submission, Review, Issue } from '../page';

interface SubmissionDetailProps {
  selectedSub: Submission;
  setSelectedSub: (val: Submission | null) => void;
  reviews: Review[];
  revName: string;
  setRevName: (val: string) => void;
  revEmail: string;
  setRevEmail: (val: string) => void;
  assigning: boolean;
  handleAssignReviewer: (e: React.FormEvent) => void;
  pubIssueId: number;
  setPubIssueId: (val: number) => void;
  issues: Issue[];
  pubType: string;
  setPubType: (val: string) => void;
  pubDoi: string;
  setPubDoi: (val: string) => void;
  pubPages: string;
  setPubPages: (val: string) => void;
  publishing: boolean;
  handlePublishArticle: (e: React.FormEvent) => void;
  showDemo: boolean;
  revisionFile: File | null;
  setRevisionFile: (val: File | null) => void;
  uploadingRevision: boolean;
  handleUploadRevision: (e: React.FormEvent) => void;
  pubPdfFile: File | null;
  setPubPdfFile: (val: File | null) => void;
}

export default function SubmissionDetail({
  selectedSub,
  setSelectedSub,
  reviews,
  revName,
  setRevName,
  revEmail,
  setRevEmail,
  assigning,
  handleAssignReviewer,
  pubIssueId,
  setPubIssueId,
  issues,
  pubType,
  setPubType,
  pubDoi,
  setPubDoi,
  pubPages,
  setPubPages,
  publishing,
  handlePublishArticle,
  showDemo,
  revisionFile,
  setRevisionFile,
  uploadingRevision,
  handleUploadRevision,
  pubPdfFile,
  setPubPdfFile
}: SubmissionDetailProps) {
  return (
    <div className="space-y-6">
      
      {/* Submission Detail Summary */}
      <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-serif">
        <div className="border-b border-border-light pb-3 flex justify-between items-start gap-4">
          <div>
            <span className="text-[9px] font-bold text-text-muted uppercase font-sans tracking-wide">Selected manuscript</span>
            <h2 className="font-serif font-bold text-base text-text-heading pt-1 leading-tight">{selectedSub.title}</h2>
          </div>
          <button onClick={() => setSelectedSub(null)} className="text-text-muted hover:text-olive font-bold font-sans cursor-pointer text-xs uppercase tracking-wider text-[10px]">Close</button>
        </div>

        <div className="space-y-3 leading-relaxed">
          <p><strong>Abstract:</strong> {selectedSub.abstract}</p>
          <p><strong>Keywords:</strong> {selectedSub.keywords}</p>
          <p><strong>Current Status:</strong> <span className="uppercase font-sans text-[10px] tracking-wider text-olive font-bold bg-sand/30 px-2.5 py-0.5 rounded-sm border border-border-custom">{selectedSub.status.replace('_', ' ')}</span></p>
          <p className="pt-2.5 border-t border-border-light mt-2">
            <strong>Blinded Draft File: </strong> 
            <a href={selectedSub.download_url} download className="text-link hover:text-link-hover hover:underline font-bold font-mono text-xs">
              {selectedSub.file_name}
            </a>
          </p>
        </div>

        {/* Revision Upload Form */}
        <div className="border-t border-border-light pt-4 mt-3 space-y-3 bg-sand/15 p-4 rounded-sm border border-border-custom font-sans">
          <h4 className="font-serif font-bold text-text-heading text-xs uppercase tracking-wide">Revise & Upload Manuscript File</h4>
          <p className="text-[10px] text-text-muted leading-normal font-serif">
            Upload an edited, blinded, or formatted version of this manuscript to replace the current draft for review and publishing.
          </p>
          <form onSubmit={handleUploadRevision} className="flex flex-col sm:flex-row gap-2 items-center">
            <input 
              id="editor-revision-file"
              type="file" 
              required 
              onChange={(e) => setRevisionFile(e.target.files?.[0] || null)}
              className="bg-white border border-border-custom rounded-sm px-2.5 py-1.5 w-full text-[10px] text-text-primary focus:outline-none font-sans"
              accept=".docx,.doc,.pdf"
            />
            <button 
              type="submit" 
              disabled={uploadingRevision || !revisionFile}
              className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2 rounded-sm text-[10px] cursor-pointer disabled:opacity-50 whitespace-nowrap uppercase tracking-wider font-sans"
            >
              {uploadingRevision ? 'Uploading...' : 'Upload Revision'}
            </button>
          </form>
        </div>
      </div>

      {/* Peer Reviews List */}
      <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
        <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 border-b border-border-light pb-2.5 uppercase tracking-wide">
          <Users size={16} /> Peer Reviews
        </h3>

        {reviews.length === 0 ? (
          <p className="text-xs text-text-muted font-serif">No reviewers assigned yet.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((rev) => {
              const isCompleted = !!rev.date_reviewed;
              return (
                <div key={rev.id} className="bg-sand/15 border border-border-custom rounded-sm p-4 space-y-2.5 relative">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    <span>{rev.reviewer_name} ({rev.reviewer_email})</span>
                    <span className={`px-2 py-0.5 rounded-sm border ${
                      isCompleted 
                        ? 'bg-olive text-white border-olive' 
                        : 'bg-white text-text-muted border-border-light'
                    }`}>
                      {isCompleted ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  {isCompleted ? (
                    <div className="space-y-2 text-xs font-serif leading-relaxed">
                      <p><strong>Score:</strong> {rev.score} / 5</p>
                      <p><strong>Recommendation:</strong> <span className="uppercase font-sans font-bold text-[10px] text-olive">{rev.recommendation.replace('_', ' ')}</span></p>
                      <p className="font-serif italic bg-white p-3 border border-border-light rounded-sm">&ldquo;{rev.comments}&rdquo;</p>
                    </div>
                  ) : (
                    <p className="text-text-muted/65 italic font-serif text-[10px]">Waiting for evaluation report...</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Reviewer Workspace */}
      {(selectedSub.status === 'submitted' || selectedSub.status === 'in_review') && (
        <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
          <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 border-b border-border-light pb-2.5 uppercase tracking-wide">
            <Send size={16} /> Assign Peer Reviewer
          </h3>
          <form onSubmit={handleAssignReviewer} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Reviewer Name</label>
                <input
                  type="text"
                  required
                  value={revName}
                  onChange={(e) => setRevName(e.target.value)}
                  placeholder="e.g. Dr. Alfred Buluma"
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                />
              </div>
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Reviewer Email</label>
                <input
                  type="email"
                  required
                  value={revEmail}
                  onChange={(e) => setRevEmail(e.target.value)}
                  placeholder="reviewer@makerere.ac.ug"
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                />
              </div>
            </div>
            {showDemo && (
              <div className="bg-sand/15 border border-border-light rounded-sm p-3 flex gap-2 items-start text-[10px] text-text-muted font-serif leading-normal">
                <Users className="text-olive shrink-0 mt-0.5" size={14} />
                <span>To test dashboard review flows: assign reviews to the registered account <strong>reviewer@makerere.ac.ug</strong>.</span>
              </div>
            )}
            <button
              type="submit"
              disabled={assigning}
              className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm text-xs shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
            >
              Assign Reviewer
            </button>
          </form>
        </div>
      )}

      {/* Scheduling & Publishing Workspace */}
      {selectedSub.status === 'accepted' && (
        <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
          <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 border-b border-border-light pb-2.5 uppercase tracking-wide">
            <Award size={16} /> Publishing Wizard
          </h3>
          <form onSubmit={handlePublishArticle} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Schedule to Issue</label>
                <select
                  value={pubIssueId}
                  onChange={(e) => setPubIssueId(Number(e.target.value))}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none shadow-sm font-serif"
                >
                  {issues.map(iss => (
                    <option key={iss.id} value={iss.id}>{iss.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Article Type</label>
                <select
                  value={pubType}
                  onChange={(e) => setPubType(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none shadow-sm font-serif"
                >
                  <option value="Research Article">Research Article</option>
                  <option value="Editorial">Editorial</option>
                  <option value="Review Article">Review Article</option>
                  <option value="Book Review">Book Review</option>
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">DOI Suffix</label>
                <input
                  type="text"
                  required
                  value={pubDoi}
                  onChange={(e) => setPubDoi(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none shadow-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Page Range</label>
                <input
                  type="text"
                  required
                  value={pubPages}
                  onChange={(e) => setPubPages(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none shadow-sm font-serif"
                />
              </div>
              
              {/* Final Article PDF Upload Field */}
              <div className="col-span-2">
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Final Article PDF (Required)</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setPubPdfFile(e.target.files?.[0] || null)}
                  className="bg-white border border-border-custom rounded-sm px-3 py-2 w-full text-xs text-text-primary focus:outline-none font-sans"
                  accept="application/pdf"
                />
                <div className="bg-sand/10 border border-border-light rounded-sm p-3 mt-2 flex gap-2 items-start text-[10px] text-text-muted font-serif leading-normal">
                  <ShieldAlert className="text-olive shrink-0 mt-0.5" size={14} />
                  <span>The final PDF will be uploaded to public storage. Verify that the file layout conforms to standard TANQ template formatting.</span>
                </div>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={publishing || !pubPdfFile}
              className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm text-xs shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
            >
              Publish Article
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
