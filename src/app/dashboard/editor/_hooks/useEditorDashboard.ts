import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Submission, Review, Issue, JournalVolume } from '../page';

interface UserSession {
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

  // View state for Editor Dashboard ('queue', 'invites', or 'issues')
  const [editorView, setEditorView] = useState<'queue' | 'invites' | 'issues'>('queue');
  
  // Invitation management state
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'reviewer' | 'admin'>('reviewer');
  const [invitingUser, setInvitingUser] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [newlyCreatedInviteUrl, setNewlyCreatedInviteUrl] = useState<string | null>(null);

  // New issue form state
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [vol, setVol] = useState(1);
  const [num, setNum] = useState(2);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState('June');
  const [issueTitle, setIssueTitle] = useState('Volume 1 Issue 2 – June 2026');
  const [issuePdfFile, setIssuePdfFile] = useState<File | null>(null);
  const [creatingIssue, setCreatingIssue] = useState(false);

  // Volume and issue PDF management state
  const [showVolumePdf, setShowVolumePdf] = useState(false);
  const [volumePdfNumber, setVolumePdfNumber] = useState(1);
  const [volumePdfYear, setVolumePdfYear] = useState(new Date().getFullYear());
  const [volumePdfTitle, setVolumePdfTitle] = useState('The African Nexus Quarterly, Volume 1');
  const [volumePdfSubtitle, setVolumePdfSubtitle] = useState('Complete journal volume');
  const [volumePdfFile, setVolumePdfFile] = useState<File | null>(null);
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
        const sessionUser = await res.json();
        if (sessionUser.role !== 'admin') {
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
        const subData = await subRes.json();
        setSubmissions(subData);
      }

      const issueRes = await fetch('/api/publish?include=volumes');
      if (issueRes.ok) {
        const issueData = await issueRes.json();
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
        const data = await res.json();
        setInvites(data);
      }
    } catch (e) {
      console.error('Error fetching invites:', e);
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
      fetchInvites();
    }
  }, [session, fetchData, fetchInvites]);

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

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to upload revised manuscript');
      }

      const updatedSub = await res.json();
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate invitation');
      }

      const data = await res.json();
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
      const res = await fetch(`/api/reviews?submission_id=${subId}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
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
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          submission_id: selectedSub.id,
          reviewer_name: revName,
          reviewer_email: revEmail
        })
      });

      if (!res.ok) {
        throw new Error('Failed to assign reviewer');
      }

      setSuccess(`Reviewer ${revName} assigned successfully! The manuscript status is updated to 'In Review'.`);
      setRevName('');
      setRevEmail('');
      
      fetchReviews(selectedSub.id);
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error assigning reviewer');
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
        const errData = await res.json();
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

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingIssue(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', 'create_issue');
      formData.append('volume', String(vol));
      formData.append('number', String(num));
      formData.append('year', String(year));
      formData.append('month', month);
      formData.append('title', issueTitle);
      if (issuePdfFile) {
        formData.append('issue_pdf', issuePdfFile);
      }

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create issue');
      }

      const issueData = await res.json();
      await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish_issue',
          issue_id: issueData.id
        })
      });

      setSuccess(`Issue "${issueTitle}" created and published successfully! You can now schedule articles to it.`);
      setShowNewIssue(false);
      setIssuePdfFile(null);
      const issueFileInput = document.getElementById('new-issue-pdf') as HTMLInputElement;
      if (issueFileInput) issueFileInput.value = '';
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error creating issue');
    } finally {
      setCreatingIssue(false);
    }
  };

  const handleUploadVolumePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volumePdfFile) return;
    setUploadingVolumePdf(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', 'upsert_volume_pdf');
      formData.append('volume', String(volumePdfNumber));
      formData.append('year', String(volumePdfYear));
      formData.append('title', volumePdfTitle);
      formData.append('subtitle', volumePdfSubtitle);
      formData.append('file', volumePdfFile);

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to upload volume PDF');
      }

      setSuccess(`Volume ${volumePdfNumber} PDF uploaded successfully.`);
      setVolumePdfFile(null);
      const volumeFileInput = document.getElementById('volume-pdf-file') as HTMLInputElement;
      if (volumeFileInput) volumeFileInput.value = '';
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Error uploading volume PDF');
    } finally {
      setUploadingVolumePdf(false);
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
        const errData = await res.json();
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
      case 'submitted': return 'bg-sand text-olive border-border-custom';
      case 'in_review': return 'bg-sand/60 text-olive border-border-light';
      case 'revision_requested': return 'bg-charcoal text-white border-charcoal';
      case 'accepted': return 'bg-olive text-white border-olive';
      case 'rejected': return 'bg-white text-text-muted border-border-light';
      case 'published': return 'bg-olive text-white border-olive';
      default: return 'bg-white text-text-muted border-border-light';
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
    handleUploadExistingIssuePdf,
    getStatusColor,
    newlyCreatedInviteUrl
  };
}
