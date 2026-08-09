import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Submission, Review, Issue, JournalVolume } from '../page';
import type { ManagedAccount } from '@/app/api/accounts/route';
import { safeJson } from '@/lib/clientFetch';

interface UserSession {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
}

export function useEditorDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [volumes, setVolumes] = useState<JournalVolume[]>([]);
  const [loading, setLoading] = useState(true);

  // Active submission actions workspace
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  
  // Reviewer assignment state
  const [revName, setRevName] = useState('');
  const [revEmail, setRevEmail] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Publishing form state
  const [pubIssueId, setPubIssueId] = useState<number>(0);
  const [pubDoi, setPubDoi] = useState('');
  const [pubPages, setPubPages] = useState('');
  const [pubType, setPubType] = useState('Research Article');
  const [publishing, setPublishing] = useState(false);
  const [pubPdfFile, setPubPdfFile] = useState<File | null>(null);

  // View state for Editor Dashboard ('queue', 'invites', 'issues', or 'accounts')
  const [editorView, setEditorView] = useState<'queue' | 'invites' | 'issues' | 'accounts'>('queue');
  
  // Account management state
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsSearch, setAccountsSearch] = useState('');
  const [accountsRoleFilter, setAccountsRoleFilter] = useState('all');
  const [accountsStatusFilter, setAccountsStatusFilter] = useState('all');
  
  // Invitation management state
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'reviewer' | 'secretary' | 'editor' | 'admin'>('reviewer');
  const [invitingUser, setInvitingUser] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [newlyCreatedInviteUrl, setNewlyCreatedInviteUrl] = useState<string | null>(null);

  // New issue form state
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [editingIssueId, setEditingIssueId] = useState<number | null>(null);
  const [vol, setVol] = useState(1);
  const [num, setNum] = useState(2);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('June');
  const [issueTitle, setIssueTitle] = useState('Volume 1 Issue 2 – June 2026');
  const [issuePdfFile, setIssuePdfFile] = useState<File | null>(null);
  const [issuePublished, setIssuePublished] = useState(true);
  const [removeIssuePdf, setRemoveIssuePdf] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);

  // Volume and issue PDF management state
  const [showVolumePdf, setShowVolumePdf] = useState(false);
  const [editingVolumeId, setEditingVolumeId] = useState<number | null>(null);
  const [volumePdfNumber, setVolumePdfNumber] = useState(1);
  const [volumePdfYear, setVolumePdfYear] = useState(new Date().getFullYear());
  const [volumePdfTitle, setVolumePdfTitle] = useState('African Nexus Quarterly, Volume 1');
  const [volumePdfSubtitle, setVolumePdfSubtitle] = useState('Complete journal volume');
  const [volumePdfFile, setVolumePdfFile] = useState<File | null>(null);
  const [removeVolumePdf, setRemoveVolumePdf] = useState(false);
  const [uploadingVolumePdf, setUploadingVolumePdf] = useState(false);
  const [issuePdfIssueId, setIssuePdfIssueId] = useState<number>(0);
  const [existingIssuePdfFile, setExistingIssuePdfFile] = useState<File | null>(null);
  const [uploadingIssuePdf, setUploadingIssuePdf] = useState(false);

  // Status logs
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      const hasDemoParam = new URLSearchParams(window.location.search).get('demo') === 'true' || window.location.hash === '#demo';
      if (hasDemoParam) {
        setShowDemo(true);
      }
    }
  }, []);

  // Editor revision upload state
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [uploadingRevision, setUploadingRevision] = useState(false);

  // Validate session and load user info
  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          router.push('/dashboard/login');
          return;
        }
        const sessionUser = await safeJson(res);
        if (!['admin', 'editor'].includes(sessionUser.role)) {
          router.push('/dashboard/login');
          return;
        }
        setSession(sessionUser);
      })
      .catch(() => {
        router.push('/dashboard/login');
      });
  }, [router]);

  const fetchData = useCallback(async () => {
    try {
      const subRes = await fetch('/api/submissions?role=editor');
      if (subRes.ok) {
        const subData = await safeJson(subRes);
        setSubmissions(subData);
      }

      const issueRes = await fetch('/api/publish?include=volumes');
      if (issueRes.ok) {
        const issueData = await safeJson(issueRes);
        const nextIssues = Array.isArray(issueData) ? issueData : issueData.issues;
        setIssues(nextIssues);
        setVolumes(Array.isArray(issueData) ? [] : issueData.volumes);
        if (nextIssues.length > 0) {
          setPubIssueId(nextIssues[0].id);
          setIssuePdfIssueId(nextIssues[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const res = await fetch('/api/invitations');
      if (res.ok) {
        const data = await safeJson(res);
        setInvites(data);
      }
    } catch (e) {
      console.error('Error fetching invites:', e);
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await safeJson(res);
        setAccounts(data);
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const handleDisableAccount = async (userId: number) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', userId }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to disable account');
      }
      setSuccess('Account disabled successfully.');
      fetchAccounts();
    } catch (err: any) {
      setError(err.message || 'Error disabling account');
    }
  };

  const handleRestoreAccount = async (userId: number) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', userId }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore account');
      }
      setSuccess('Account restored successfully.');
      fetchAccounts();
    } catch (err: any) {
      setError(err.message || 'Error restoring account');
    }
  };

  const handleDeleteAccount = async (userId: number, confirmationEmail: string) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', userId, confirmationEmail }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }
      setSuccess('Account permanently deleted.');
      fetchAccounts();
    } catch (err: any) {
      setError(err.message || 'Error deleting account');
    }
  };

  useEffect(() => {
    if (session) {
      fetchData();
      if (session.role === 'admin') {
        fetchInvites();
        fetchAccounts();
      }
    }
  }, [session, fetchData, fetchInvites, fetchAccounts]);

  const handleUploadRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !revisionFile) return;
    setUploadingRevision(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('submission_id', String(selectedSub.id));
      formData.append('file', revisionFile);

      const res = await fetch('/api/submissions', {
        method: 'PUT',
        body: formData
      });

      const responseData = await safeJson(res);
      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to upload revised manuscript');
      }

      const updatedSub = responseData;
      setSuccess('Manuscript file revised and uploaded successfully!');
      setSelectedSub(updatedSub);
      setRevisionFile(null);

      const fileInput = document.getElementById('editor-revision-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error uploading revision');
    } finally {
      setUploadingRevision(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInvitingUser(true);
    setError('');
    setSuccess('');
    setNewlyCreatedInviteUrl(null);

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email: inviteEmail,
          role: inviteRole
        })
      });

      const responseData = await safeJson(res);
      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to generate invitation');
      }

      const data = responseData;
      const rawToken = data.invitation.token;
      const url = `${window.location.origin}/dashboard/login#register?invite=${rawToken}`;
      setNewlyCreatedInviteUrl(url);

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setSuccess(`Invitation link generated and copied to clipboard for ${inviteEmail}!`);
      } else {
        setSuccess(`Invitation link generated for ${inviteEmail}!`);
      }

      setInviteEmail('');
      fetchInvites();
    } catch (err: any) {
      setError(err.message || 'Error generating invitation');
    } finally {
      setInvitingUser(false);
    }
  };

  const handleRevokeInvite = async (id: number, email: string) => {
    if (!confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke',
          id
        })
      });

      if (!res.ok) {
        throw new Error('Failed to revoke invitation');
      }

      setSuccess(`Invitation for ${email} has been revoked.`);
      fetchInvites();
    } catch (err: any) {
      setError(err.message || 'Error revoking invitation');
    }
  };

  const handleCopyLink = (token: string) => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/dashboard/login#register?invite=${token}`;
    navigator.clipboard.writeText(url);
    setSuccess('Invitation link copied to clipboard!');
  };

  const fetchReviews = useCallback(async (subId: number) => {
    try {
      const res = await fetch(`/api/case-files/${subId}/reviews`);
      if (res.ok) {
        const data = await safeJson(res);
        setReviews((data.reports || []).map((report: any) => ({
          ...report,
          reviewer_name: report.reviewer_name,
          reviewer_email: report.reviewer_email,
          comments: report.comments_to_author,
          date_reviewed: report.submitted_at,
        })));
      }
    } catch (e) {
      console.error('Error fetching reviews:', e);
    }
  }, []);

  useEffect(() => {
    if (selectedSub) {
      fetchReviews(selectedSub.id);
      setPubDoi(`10.58737/saj.2026.01.00${45 + selectedSub.id}`);
      setPubPages('19-30');
    }
  }, [selectedSub, fetchReviews]);

  const handleAssignReviewer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;
    setAssigning(true);
    setError('');
    setSuccess('');

    try {
      const caseRes = await fetch(`/api/case-files/${selectedSub.id}`);
      const caseData = await safeJson(caseRes);
      const activeRound = caseData.rounds?.find((round: any) => round.status === 'open');
      if (!activeRound) {
        throw new Error('Open a review round for a specific manuscript version before assigning reviewers.');
      }
      const res = await fetch(`/api/case-files/${selectedSub.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite',
          review_round_id: activeRound.id,
          reviewer_name: revName,
          reviewer_email: revEmail
        })
      });

      if (!res.ok) {
        throw new Error('Failed to invite reviewer');
      }

      setSuccess(`Reviewer ${revName} invited to review round ${activeRound.round_number}.`);
      setRevName('');
      setRevEmail('');
      
      fetchReviews(selectedSub.id);
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error inviting reviewer');
    } finally {
      setAssigning(false);
    }
  };

  const handlePublishArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !pubIssueId || !pubPdfFile) {
      setError('Please select the final PDF file to publish this article.');
      return;
    }
    setPublishing(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', 'publish_article');
      formData.append('submission_id', String(selectedSub.id));
      formData.append('issue_id', String(pubIssueId));
      formData.append('doi', pubDoi);
      formData.append('pages', pubPages);
      formData.append('type', pubType);
      formData.append('file', pubPdfFile);

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData.error || 'Failed to publish article');
      }

      setSuccess(`Article scheduled and published successfully under selected issue! It is now live in the journal directory.`);
      setSelectedSub(null);
      setPubPdfFile(null);
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error publishing article');
    } finally {
      setPublishing(false);
    }
  };

  const resetIssueForm = () => {
    const latestIssue = issues[0];
    setEditingIssueId(null);
    setVol(latestIssue?.volume || 1);
    setNum(latestIssue ? latestIssue.number + 1 : 1);
    setYear(new Date().getFullYear());
    setMonth('');
    setIssueTitle('');
    setIssuePdfFile(null);
    setRemoveIssuePdf(false);
    setIssuePublished(true);
    const issueFileInput = document.getElementById('new-issue-pdf') as HTMLInputElement | null;
    if (issueFileInput) issueFileInput.value = '';
  };

  const startEditingIssue = (issue: Issue) => {
    setEditingIssueId(issue.id);
    setVol(issue.volume);
    setNum(issue.number);
    setYear(issue.year);
    setMonth(issue.month);
    setIssueTitle(issue.title);
    setIssuePublished(Boolean(issue.is_published));
    setIssuePdfFile(null);
    setRemoveIssuePdf(false);
    setShowVolumePdf(false);
    setShowNewIssue(true);
    setSuccess('');
    setError('');
  };

  const handleSaveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingIssue(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', editingIssueId ? 'update_issue' : 'create_issue');
      if (editingIssueId) formData.append('id', String(editingIssueId));
      formData.append('volume', String(vol));
      formData.append('number', String(num));
      formData.append('year', String(year));
      formData.append('month', month);
      formData.append('title', issueTitle);
      formData.append('is_published', String(issuePublished));
      formData.append('remove_pdf', String(removeIssuePdf));
      if (issuePdfFile) {
        formData.append('issue_pdf', issuePdfFile);
      }

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      const responseData = await safeJson(res);
      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to create issue');
      }

      setSuccess(editingIssueId
        ? `Issue "${issueTitle}" updated successfully.`
        : `Issue "${issueTitle}" created successfully.`);
      setShowNewIssue(false);
      resetIssueForm();
      await fetchData();
    } catch (e: any) {
      setError(e.message || 'Error saving issue');
    } finally {
      setCreatingIssue(false);
    }
  };

  const handleDeleteIssue = async (issue: Issue) => {
    if (!confirm(`Delete issue "${issue.title}"? This is permanent. Issues containing articles cannot be deleted.`)) return false;
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('action', 'delete_issue');
      formData.append('id', String(issue.id));
      const res = await fetch('/api/publish', { method: 'POST', body: formData });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to delete issue');
      setSuccess(`Issue "${issue.title}" deleted.`);
      if (editingIssueId === issue.id) {
        setShowNewIssue(false);
        resetIssueForm();
      }
      await fetchData();
      return true;
    } catch (e: any) {
      setError(e.message || 'Error deleting issue');
      return false;
    }
  };

  const resetVolumeForm = () => {
    setEditingVolumeId(null);
    setVolumePdfNumber(1);
    setVolumePdfYear(new Date().getFullYear());
    setVolumePdfTitle('');
    setVolumePdfSubtitle('');
    setVolumePdfFile(null);
    setRemoveVolumePdf(false);
    const volumeFileInput = document.getElementById('volume-pdf-file') as HTMLInputElement | null;
    if (volumeFileInput) volumeFileInput.value = '';
  };

  const startEditingVolume = (volume: JournalVolume) => {
    setEditingVolumeId(volume.id);
    setVolumePdfNumber(volume.volume);
    setVolumePdfYear(volume.year);
    setVolumePdfTitle(volume.title);
    setVolumePdfSubtitle(volume.subtitle || '');
    setVolumePdfFile(null);
    setRemoveVolumePdf(false);
    setShowVolumePdf(true);
    setShowNewIssue(false);
    setSuccess('');
    setError('');
  };

  const handleSaveVolume = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadingVolumePdf(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', editingVolumeId ? 'update_volume' : 'create_volume');
      if (editingVolumeId) formData.append('id', String(editingVolumeId));
      formData.append('volume', String(volumePdfNumber));
      formData.append('year', String(volumePdfYear));
      formData.append('title', volumePdfTitle);
      formData.append('subtitle', volumePdfSubtitle);
      formData.append('remove_pdf', String(removeVolumePdf));
      if (volumePdfFile) formData.append('file', volumePdfFile);

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData.error || 'Failed to upload volume PDF');
      }

      setSuccess(editingVolumeId
        ? `Volume ${volumePdfNumber} updated successfully.`
        : `Volume ${volumePdfNumber} created successfully.`);
      resetVolumeForm();
      await fetchData();
    } catch (e: any) {
      setError(e.message || 'Error saving volume');
    } finally {
      setUploadingVolumePdf(false);
    }
  };

  const handleDeleteVolume = async (volume: JournalVolume) => {
    if (!confirm(`Delete "${volume.title}"? Its volume PDF will be removed, but its issues and articles will remain available.`)) return;
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('action', 'delete_volume');
      formData.append('id', String(volume.id));
      const res = await fetch('/api/publish', { method: 'POST', body: formData });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to delete volume');
      const retained = Number(data.retainedIssueCount || 0);
      setSuccess(`Volume "${volume.title}" deleted.${retained > 0 ? ` ${retained} issue${retained === 1 ? '' : 's'} retained.` : ''}`);
      if (editingVolumeId === volume.id) resetVolumeForm();
      await fetchData();
    } catch (e: any) {
      setError(e.message || 'Error deleting volume');
    }
  };

  const handleUploadExistingIssuePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuePdfIssueId || !existingIssuePdfFile) return;
    setUploadingIssuePdf(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', 'update_issue_pdf');
      formData.append('issue_id', String(issuePdfIssueId));
      formData.append('issue_pdf', existingIssuePdfFile);

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData.error || 'Failed to upload issue PDF');
      }

      const issue = issues.find((item) => item.id === issuePdfIssueId);
      setSuccess(`Full issue PDF uploaded${issue ? ` for "${issue.title}"` : ''}.`);
      setExistingIssuePdfFile(null);
      const issueFileInput = document.getElementById('existing-issue-pdf') as HTMLInputElement;
      if (issueFileInput) issueFileInput.value = '';
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error uploading issue PDF');
    } finally {
      setUploadingIssuePdf(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':              return 'bg-border-light text-text-muted border-border-light';
      case 'submitted':          return 'bg-sand text-olive border-border-custom';
      case 'in_review':          return 'bg-sand/60 text-olive border-border-light';
      case 'revision_requested': return 'bg-charcoal text-white border-charcoal';
      case 'accepted':           return 'bg-olive text-white border-olive';
      case 'rejected':           return 'bg-white text-text-muted border-border-light';
      case 'published':          return 'bg-olive text-white border-olive';
      case 'withdrawn':          return 'bg-white text-text-muted border-border-light';
      default:                   return 'bg-white text-text-muted border-border-light';
    }
  };

  const handleApproveWithdrawal = async (submissionId: number, editorNote?: string) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/withdrawal-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ decision: 'approved', editor_note: editorNote }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to approve withdrawal');
      setSuccess('Withdrawal approved. Submission is now withdrawn and author has been notified.');
      setSelectedSub(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error approving withdrawal');
    }
  };

  const handleRejectWithdrawal = async (submissionId: number, editorNote?: string) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/withdrawal-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ decision: 'rejected', editor_note: editorNote }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to reject withdrawal');
      setSuccess('Withdrawal request rejected. Submission continues in review. Author has been notified.');
      fetchData();
      if (selectedSub?.id === submissionId) {
        // refresh the selected sub
        const updated = await fetch('/api/submissions?role=editor');
        if (updated.ok) {
          const subs = await safeJson(updated);
          const refreshed = subs.find((s: any) => s.id === submissionId);
          if (refreshed) setSelectedSub(refreshed);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error rejecting withdrawal');
    }
  };

  const handleDeleteSubmission = async (submissionId: number) => {
    if (!confirm('Are you sure you want to permanently delete this submission? This action cannot be undone.')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/submissions?submission_id=${submissionId}`, {
        method: 'DELETE',
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete submission');
      }
      setSuccess('Submission permanently deleted.');
      setSelectedSub(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error deleting submission');
    }
  };

  return {
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
    editingIssueId,
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
    showVolumePdf,
    setShowVolumePdf,
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
    handleSaveIssue,
    startEditingIssue,
    resetIssueForm,
    handleDeleteIssue,
    handleSaveVolume,
    startEditingVolume,
    resetVolumeForm,
    handleDeleteVolume,
    handleUploadExistingIssuePdf,
    getStatusColor,
    newlyCreatedInviteUrl,
    accounts,
    setAccounts,
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
    handleDeleteSubmission,
  };
}
