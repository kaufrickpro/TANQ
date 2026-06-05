'use client';

import React from 'react';
import { CheckCircle, RefreshCw, AlertCircle, PlusCircle, BookOpen } from 'lucide-react';

// Import subcomponents & custom hook
import VolumePdfManager from './_components/VolumePdfManager';
import NewIssueForm from './_components/NewIssueForm';
import InviteTeamSection from './_components/InviteTeamSection';
import SubmissionDetail from './_components/SubmissionDetail';
import { useEditorDashboard } from './_hooks/useEditorDashboard';

export interface Submission {
  id: number;
  title: string;
  abstract: string;
  keywords: string;
  author_name: string;
  author_email: string;
  file_path: string;
  status: string;
  date_submitted: string;
}

export interface Review {
  id: number;
  submission_id: number;
  reviewer_name: string;
  reviewer_email: string;
  comments: string;
  recommendation: string;
  score: number;
  date_reviewed: string;
}

export interface Issue {
  id: number;
  volume: number;
  number: number;
  year: number;
  month: string;
  title: string;
  issue_pdf_url: string | null;
  is_published: number;
}

export interface JournalVolume {
  id: number;
  volume: number;
  year: number;
  title: string;
  subtitle: string | null;
  pdf_url: string | null;
}

export default function EditorDashboard() {
  const {
    session,
    submissions,
    issues,
    volumes,
    loading,
    selectedSub,
    setSelectedSub,
    reviews,
    revName,
    setRevName,
    revEmail,
    setRevEmail,
    assigning,
    pubIssueId,
    setPubIssueId,
    pubDoi,
    setPubDoi,
    pubPages,
    setPubPages,
    pubType,
    setPubType,
    publishing,
    editorView,
    setEditorView,
    invites,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    invitingUser,
    loadingInvites,
    showNewIssue,
    setShowNewIssue,
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
    showVolumePdf,
    setShowVolumePdf,
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
    issuePdfIssueId,
    setIssuePdfIssueId,
    existingIssuePdfFile,
    setExistingIssuePdfFile,
    uploadingIssuePdf,
    success,
    setSuccess,
    error,
    setError,
    showDemo,
    revisionFile,
    setRevisionFile,
    uploadingRevision,
    fetchData,
    fetchInvites,
    handleUploadRevision,
    handleCreateInvite,
    handleRevokeInvite,
    handleCopyLink,
    handleAssignReviewer,
    handlePublishArticle,
    handleCreateIssue,
    handleUploadVolumePdf,
    handleUploadExistingIssuePdf,
    getStatusColor
  } = useEditorDashboard();

  if (!session) return null;

  return (
    <div className="flex-1 max-w-[1120px] mx-auto w-full px-6 sm:px-8 py-12 font-serif grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-bg-page">
      {/* Left Panel: Submissions queue or Invitation manager */}
      <div className="lg:col-span-6 space-y-6">
        <div className="flex justify-between items-center border-b border-border-custom pb-3">
          <div className="flex gap-4">
            <button
              onClick={() => setEditorView('queue')}
              className={`text-lg font-serif font-bold uppercase tracking-wide cursor-pointer transition-colors pb-1 border-b-2 ${
                editorView === 'queue' ? 'text-olive border-olive' : 'text-text-muted border-transparent hover:text-text-heading'
              }`}
            >
              Editor Queue
            </button>
            <button
              onClick={() => {
                setEditorView('invites');
                fetchInvites();
              }}
              className={`text-lg font-serif font-bold uppercase tracking-wide cursor-pointer transition-colors pb-1 border-b-2 ${
                editorView === 'invites' ? 'text-olive border-olive' : 'text-text-muted border-transparent hover:text-text-heading'
              }`}
            >
              Invite Team
            </button>
          </div>
          
          <div className="flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-wider">
            {editorView === 'queue' ? (
              <>
                <button
                  onClick={() => setShowVolumePdf(!showVolumePdf)}
                  className="inline-flex items-center gap-1.5 bg-bg-card text-olive border border-border-custom hover:bg-sand/10 px-3 py-1.5 rounded-sm transition-colors cursor-pointer"
                >
                  <BookOpen size={12} /> Volume PDF
                </button>
                <button
                  onClick={() => setShowNewIssue(!showNewIssue)}
                  className="inline-flex items-center gap-1.5 bg-olive text-white hover:bg-link-hover px-3 py-1.5 rounded-sm transition-colors cursor-pointer"
                >
                  <PlusCircle size={12} /> Create Issue
                </button>
                <button 
                  onClick={fetchData}
                  className="p-1.5 text-text-muted hover:text-olive border border-border-custom bg-bg-card hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
                >
                  <RefreshCw size={14} />
                </button>
              </>
            ) : (
              <button 
                onClick={fetchInvites}
                className="p-1.5 text-text-muted hover:text-olive border border-border-custom bg-bg-card hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>

        {success && (
          <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm flex items-start gap-2 text-xs font-sans">
            <CheckCircle size={16} className="shrink-0 mt-0.5 text-olive" />
            <span className="font-serif leading-relaxed font-bold uppercase tracking-wider">{success}</span>
          </div>
        )}
        {error && (
          <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm flex items-start gap-2 text-xs font-sans">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-olive" />
            <span className="font-bold uppercase tracking-wider">{error}</span>
          </div>
        )}

        {editorView === 'queue' && (
          <>
            {/* Volume PDF manager component */}
            {showVolumePdf && (
              <VolumePdfManager
                volumes={volumes}
                issues={issues}
                volumePdfNumber={volumePdfNumber}
                setVolumePdfNumber={setVolumePdfNumber}
                volumePdfYear={volumePdfYear}
                setVolumePdfYear={setVolumePdfYear}
                volumePdfTitle={volumePdfTitle}
                setVolumePdfTitle={setVolumePdfTitle}
                volumePdfSubtitle={volumePdfSubtitle}
                setVolumePdfSubtitle={setVolumePdfSubtitle}
                volumePdfFile={volumePdfFile}
                setVolumePdfFile={setVolumePdfFile}
                uploadingVolumePdf={uploadingVolumePdf}
                handleUploadVolumePdf={handleUploadVolumePdf}
                issuePdfIssueId={issuePdfIssueId}
                setIssuePdfIssueId={setIssuePdfIssueId}
                existingIssuePdfFile={existingIssuePdfFile}
                setExistingIssuePdfFile={setExistingIssuePdfFile}
                uploadingIssuePdf={uploadingIssuePdf}
                handleUploadExistingIssuePdf={handleUploadExistingIssuePdf}
                setShowVolumePdf={setShowVolumePdf}
              />
            )}

            {/* Issue creation form block component */}
            {showNewIssue && (
              <NewIssueForm
                vol={vol}
                setVol={setVol}
                num={num}
                setNum={setNum}
                year={year}
                setYear={setYear}
                month={month}
                setMonth={setMonth}
                issueTitle={issueTitle}
                setIssueTitle={setIssueTitle}
                issuePdfFile={issuePdfFile}
                setIssuePdfFile={setIssuePdfFile}
                creatingIssue={creatingIssue}
                handleCreateIssue={handleCreateIssue}
                setShowNewIssue={setShowNewIssue}
              />
            )}

            {loading ? (
              <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">Loading editor queue...</p>
            ) : submissions.length === 0 ? (
              <p className="text-xs text-text-muted font-serif">No submissions in queue.</p>
            ) : (
              <div className="space-y-4">
                {submissions.map((sub) => (
                  <div 
                    key={sub.id} 
                    onClick={() => {
                      setSelectedSub(sub);
                      setSuccess('');
                      setError('');
                    }}
                    className={`bg-bg-card border p-5 border-l-4 border-l-olive hover:shadow-sm transition-all relative overflow-hidden cursor-pointer ${
                      selectedSub?.id === sub.id ? 'border-olive ring-1 ring-olive' : 'border-border-custom'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="font-serif font-bold text-sm text-text-primary leading-tight">{sub.title}</h3>
                      <span className={`text-[9px] uppercase font-sans font-bold tracking-widest px-2.5 py-0.5 rounded-sm border shrink-0 ${getStatusColor(sub.status)}`}>
                        {sub.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-text-muted pt-2.5 font-sans font-bold uppercase tracking-wider border-t border-border-light mt-2">
                      <span>Author: <span className="normal-case font-normal text-text-primary">{sub.author_name}</span></span>
                      <span>Date: <span className="normal-case font-normal text-text-primary">{sub.date_submitted}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {editorView === 'invites' && (
          <InviteTeamSection
            invites={invites}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteRole={inviteRole}
            setInviteRole={setInviteRole}
            invitingUser={invitingUser}
            loadingInvites={loadingInvites}
            handleCreateInvite={handleCreateInvite}
            handleRevokeInvite={handleRevokeInvite}
            handleCopyLink={handleCopyLink}
          />
        )}
      </div>

      {/* Right Panel: Selected Submission actions & reviews */}
      <div className="lg:col-span-6 space-y-6">
        {selectedSub ? (
          <SubmissionDetail
            selectedSub={selectedSub}
            setSelectedSub={setSelectedSub}
            reviews={reviews}
            revName={revName}
            setRevName={setRevName}
            revEmail={revEmail}
            setRevEmail={setRevEmail}
            assigning={assigning}
            handleAssignReviewer={handleAssignReviewer}
            pubIssueId={pubIssueId}
            setPubIssueId={setPubIssueId}
            issues={issues}
            pubType={pubType}
            setPubType={setPubType}
            pubDoi={pubDoi}
            setPubDoi={setPubDoi}
            pubPages={pubPages}
            setPubPages={setPubPages}
            publishing={publishing}
            handlePublishArticle={handlePublishArticle}
            showDemo={showDemo}
            revisionFile={revisionFile}
            setRevisionFile={setRevisionFile}
            uploadingRevision={uploadingRevision}
            handleUploadRevision={handleUploadRevision}
          />
        ) : (
          <div className="bg-bg-card border border-border-custom rounded-sm p-6 text-center space-y-3 text-text-muted py-16">
            <BookOpen className="mx-auto text-text-muted" size={32} />
            <h3 className="font-serif font-bold text-sm text-text-heading uppercase">Select a paper</h3>
            <p className="text-xs leading-relaxed max-w-xs mx-auto font-serif">
              Click on any submission in the queue on the left to assign peer reviewers, check reviewer comments, and publish manuscripts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
