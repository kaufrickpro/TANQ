'use client';

import React from 'react';
import { CheckCircle, RefreshCw, AlertCircle, PlusCircle, BookOpen, FileText } from 'lucide-react';

// Import subcomponents & custom hook
import VolumePdfManager from './_components/VolumePdfManager';
import NewIssueForm from './_components/NewIssueForm';
import InviteTeamSection from './_components/InviteTeamSection';
import SubmissionDetail from './_components/SubmissionDetail';
import AccountManagementSection from './_components/AccountManagementSection';
import { useEditorDashboard } from './_hooks/useEditorDashboard';

export interface Submission {
  id: number;
  title: string;
  abstract: string;
  keywords: string;
  author_name: string;
  author_email: string;
  download_url: string | null;
  file_name: string;
  status: string;
  date_submitted: string;
  withdrawal_status?: string | null;
  submission_type?: string;
  topic?: string;
  language?: string;
  short_title?: string;
  co_authors?: any[];
  project_number?: string;
  ethics_statement?: string;
  supporting_institution?: string;
  acknowledgements?: string;
  editor_note?: string;
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
    handleUploadExistingIssuePdf,
    success,
    setSuccess,
    error,
    setError,
    showDemo,
    revisionFile,
    setRevisionFile,
    uploadingRevision,
    pubPdfFile,
    setPubPdfFile,
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
    getStatusColor,
    newlyCreatedInviteUrl,
    accounts,
    loadingAccounts,
    accountsSearch,
    setAccountsSearch,
    accountsRoleFilter,
    setAccountsRoleFilter,
    accountsStatusFilter,
    setAccountsStatusFilter,
    fetchAccounts,
    handleDisableAccount,
    handleRestoreAccount,
    handleDeleteAccount,
    handleApproveWithdrawal,
    handleRejectWithdrawal,
  } = useEditorDashboard();

  if (!session) return null;

  const isAccountsView = editorView === 'accounts';

  return (
    <div className="flex-1 max-w-[1120px] mx-auto w-full px-6 sm:px-8 py-12 font-serif grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-bg-page">
      {/* Left Panel: Submissions queue, Issues/Volumes manager, Invitation manager, or Accounts manager */}
      <div className={`${isAccountsView ? 'lg:col-span-12' : 'lg:col-span-6'} space-y-6`}>
        <div className="flex justify-between items-end border-b border-border-custom">
          <div className="flex gap-4 -mb-[1px]">
            <button
              onClick={() => setEditorView('queue')}
              className={`text-lg font-serif font-bold uppercase tracking-wide cursor-pointer transition-colors pb-3 border-b-2 ${
                editorView === 'queue' ? 'text-olive border-olive' : 'text-text-muted border-transparent hover:text-text-heading'
              }`}
            >
              Editor Queue
            </button>
            <button
              onClick={() => {
                setEditorView('issues');
              }}
              className={`text-lg font-serif font-bold uppercase tracking-wide cursor-pointer transition-colors pb-3 border-b-2 ${
                editorView === 'issues' ? 'text-olive border-olive' : 'text-text-muted border-transparent hover:text-text-heading'
              }`}
            >
              Issues & Volumes
            </button>
            <button
              onClick={() => {
                setEditorView('invites');
                fetchInvites();
              }}
              className={`text-lg font-serif font-bold uppercase tracking-wide cursor-pointer transition-colors pb-3 border-b-2 ${
                editorView === 'invites' ? 'text-olive border-olive' : 'text-text-muted border-transparent hover:text-text-heading'
              }`}
            >
              Invite Team
            </button>
            <button
              onClick={() => {
                setEditorView('accounts');
                fetchAccounts();
              }}
              className={`text-lg font-serif font-bold uppercase tracking-wide cursor-pointer transition-colors pb-3 border-b-2 ${
                editorView === 'accounts' ? 'text-olive border-olive' : 'text-text-muted border-transparent hover:text-text-heading'
              }`}
            >
              Accounts
            </button>
          </div>
          
          <div className="flex items-center gap-2 pb-3 font-sans text-[11px] font-bold uppercase tracking-wider">
            <button 
              onClick={
                editorView === 'invites' 
                  ? fetchInvites 
                  : editorView === 'accounts' 
                  ? fetchAccounts 
                  : fetchData
              }
              className="inline-flex items-center justify-center w-[29px] h-[29px] text-text-muted hover:text-olive border border-border-custom bg-bg-card hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
            >
              <RefreshCw size={12} />
            </button>
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

        {editorView === 'issues' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-bg-card border border-border-custom p-4 rounded-sm">
              <div className="min-w-0">
                <h3 className="font-serif font-bold text-sm text-text-heading uppercase tracking-wide">Issues & Volumes</h3>
                <p className="text-[10px] text-text-muted mt-0.5 font-serif truncate">Configure journal issues, publish new volumes, and attach full PDFs.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    setShowNewIssue(true);
                    setShowVolumePdf(false);
                  }}
                  className={`px-3 py-1.5 rounded-sm font-sans text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                    showNewIssue 
                      ? 'bg-olive text-white border-olive' 
                      : 'bg-bg-card text-olive border-border-custom hover:bg-sand/10'
                  }`}
                >
                  Create Issue
                </button>
                <button
                  onClick={() => {
                    setShowVolumePdf(true);
                    setShowNewIssue(false);
                  }}
                  className={`px-3 py-1.5 rounded-sm font-sans text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                    showVolumePdf 
                      ? 'bg-olive text-white border-olive' 
                      : 'bg-bg-card text-olive border-border-custom hover:bg-sand/10'
                  }`}
                >
                  Volume Manager
                </button>
              </div>
            </div>

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

            {!showNewIssue && !showVolumePdf && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Volumes Card */}
                <div className="bg-bg-card border border-border-custom p-5 rounded-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <h4 className="font-serif font-bold text-xs text-text-heading uppercase tracking-wide border-b border-border-light pb-2 flex items-center gap-1.5">
                      <BookOpen size={13} /> Volumes ({volumes.length})
                    </h4>
                    {volumes.length === 0 ? (
                      <p className="text-xs text-text-muted font-serif">No volumes configured yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {volumes.map((v) => (
                          <div key={v.id} className="border border-border-light p-2 bg-sand/5 rounded-sm flex items-center justify-between text-xs font-serif">
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-text-heading truncate">Volume {v.volume} ({v.year})</p>
                              <p className="text-[10px] text-text-muted truncate mt-0.5">{v.title}</p>
                            </div>
                            {v.pdf_url ? (
                              <a href={v.pdf_url} download className="font-sans font-bold text-[9px] uppercase tracking-wider text-olive hover:underline shrink-0">PDF</a>
                            ) : (
                              <span className="font-sans font-bold text-[9px] uppercase tracking-wider text-text-muted/50 shrink-0">No PDF</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowVolumePdf(true)}
                    className="w-full bg-sand/10 hover:bg-sand/30 text-olive border border-border-custom font-sans font-bold text-[10px] py-2 rounded-sm uppercase tracking-wider transition-colors cursor-pointer mt-4"
                  >
                    Open Volume Manager
                  </button>
                </div>

                {/* Issues Card */}
                <div className="bg-bg-card border border-border-custom p-5 rounded-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <h4 className="font-serif font-bold text-xs text-text-heading uppercase tracking-wide border-b border-border-light pb-2 flex items-center gap-1.5">
                      <FileText size={13} /> Issues ({issues.length})
                    </h4>
                    {issues.length === 0 ? (
                      <p className="text-xs text-text-muted font-serif">No issues created yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {issues.map((iss) => (
                          <div key={iss.id} className="border border-border-light p-2 bg-sand/5 rounded-sm flex items-center justify-between text-xs font-serif">
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-text-heading truncate">{iss.title}</p>
                              <p className="text-[10px] text-text-muted mt-0.5">Vol. {iss.volume}, No. {iss.number}</p>
                            </div>
                            {iss.issue_pdf_url ? (
                              <a href={iss.issue_pdf_url} download className="font-sans font-bold text-[9px] uppercase tracking-wider text-olive hover:underline shrink-0">PDF</a>
                            ) : (
                              <span className="font-sans font-bold text-[9px] uppercase tracking-wider text-text-muted/50 shrink-0">No PDF</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowNewIssue(true)}
                    className="w-full bg-olive text-white hover:bg-link-hover font-sans font-bold text-[10px] py-2 rounded-sm uppercase tracking-wider transition-colors cursor-pointer mt-4"
                  >
                    Create New Issue
                  </button>
                </div>
              </div>
            )}
          </div>
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
            newlyCreatedInviteUrl={newlyCreatedInviteUrl}
          />
        )}

        {editorView === 'accounts' && (
          <AccountManagementSection
            accounts={accounts}
            loadingAccounts={loadingAccounts}
            accountsSearch={accountsSearch}
            setAccountsSearch={setAccountsSearch}
            accountsRoleFilter={accountsRoleFilter}
            setAccountsRoleFilter={setAccountsRoleFilter}
            accountsStatusFilter={accountsStatusFilter}
            setAccountsStatusFilter={setAccountsStatusFilter}
            handleDisableAccount={handleDisableAccount}
            handleRestoreAccount={handleRestoreAccount}
            handleDeleteAccount={handleDeleteAccount}
          />
        )}
      </div>

      {/* Right Panel: Selected Submission actions & reviews */}
      {!isAccountsView && (
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
              pubPdfFile={pubPdfFile}
              setPubPdfFile={setPubPdfFile}
              handleApproveWithdrawal={handleApproveWithdrawal}
              handleRejectWithdrawal={handleRejectWithdrawal}
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
      )}
    </div>
  );
}
