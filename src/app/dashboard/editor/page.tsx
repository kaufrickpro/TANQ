'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Users, CheckCircle, RefreshCw, AlertCircle, Award, Send, PlusCircle, BookOpen, FileText } from 'lucide-react';

interface Submission {
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

interface Review {
  id: number;
  submission_id: number;
  reviewer_name: string;
  reviewer_email: string;
  comments: string;
  recommendation: string;
  score: number;
  date_reviewed: string;
}

interface Issue {
  id: number;
  volume: number;
  number: number;
  year: number;
  month: string;
  title: string;
  issue_pdf_url: string | null;
  is_published: number;
}

interface JournalVolume {
  id: number;
  volume: number;
  year: number;
  title: string;
  subtitle: string | null;
  pdf_url: string | null;
}

interface UserSession {
  username: string;
  name: string;
  email: string;
  role: string;
}

export default function EditorDashboard() {
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
    const hasDemoParam = new URLSearchParams(window.location.search).get('demo') === 'true' || window.location.hash === '#demo';
    if (isDev || hasDemoParam) {
      setShowDemo(true);
    }
  }, []);

  // Editor revision upload state
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [uploadingRevision, setUploadingRevision] = useState(false);

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

  // Validate session
  useEffect(() => {
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('session_user='));
    if (!sessionCookie) {
      router.push('/dashboard/login');
      return;
    }

    try {
      const decoded = decodeURIComponent(sessionCookie.split('=')[1]);
      const sessionUser = JSON.parse(decoded);
      if (sessionUser.role !== 'admin') {
        router.push('/dashboard/login');
        return;
      }
      setSession(sessionUser);
    } catch {
      router.push('/dashboard/login');
    }
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

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, fetchData]);

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
    if (!selectedSub || !pubIssueId) return;
    setPublishing(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish_article',
          submission_id: selectedSub.id,
          issue_id: Number(pubIssueId),
          doi: pubDoi,
          pages: pubPages,
          type: pubType
        })
      });

      if (!res.ok) {
        throw new Error('Failed to publish article');
      }

      setSuccess(`Article scheduled and published successfully under selected issue! It is now live in the journal directory.`);
      setSelectedSub(null);
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

  if (!session) return null;

  return (
    <div className="flex-1 max-w-[1120px] mx-auto w-full px-6 sm:px-8 py-12 font-serif grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-bg-page">
      {/* Left Panel: Submissions queue */}
      <div className="lg:col-span-6 space-y-6">
        <div className="flex justify-between items-center border-b border-border-custom pb-3">
          <h1 className="text-2xl font-serif font-bold text-text-heading uppercase tracking-wide flex items-center gap-2">
            Editor Queue
          </h1>
          <div className="flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-wider">
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

        {/* Volume PDF manager */}
        {showVolumePdf && (
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
        )}

        {/* Issue creation form block */}
        {showNewIssue && (
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
      </div>

      {/* Right Panel: Selected Submission actions & reviews */}
      <div className="lg:col-span-6 space-y-6">
        {selectedSub ? (
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
                  <a href={selectedSub.file_path} download className="text-link hover:text-link-hover hover:underline font-bold font-mono text-xs">
                    {selectedSub.file_path.split('/').pop()}
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
                    className="bg-white border border-border-custom rounded-sm px-2.5 py-1.5 w-full text-[10px] text-text-primary focus:outline-none"
                    accept=".docx,.doc,.pdf"
                  />
                  <button 
                    type="submit" 
                    disabled={uploadingRevision || !revisionFile}
                    className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2 rounded-sm text-[10px] cursor-pointer disabled:opacity-50 whitespace-nowrap uppercase tracking-wider"
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
            {selectedSub.status === 'submitted' || selectedSub.status === 'in_review' ? (
              <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
                <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 border-b border-border-light pb-2.5 uppercase tracking-wide">
                  <Send size={16} /> Assign Peer Reviewer
                </h3>
                <form onSubmit={handleAssignReviewer} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Reviewer Name</label>
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
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Reviewer Email</label>
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
            ) : null}

            {/* Scheduling & Publishing Workspace */}
            {selectedSub.status === 'accepted' ? (
              <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
                <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 border-b border-border-light pb-2.5 uppercase tracking-wide">
                  <Award size={16} /> Publishing Wizard
                </h3>
                <form onSubmit={handlePublishArticle} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Schedule to Issue</label>
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
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Article Type</label>
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
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">DOI Suffix</label>
                      <input
                        type="text"
                        required
                        value={pubDoi}
                        onChange={(e) => setPubDoi(e.target.value)}
                        className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none shadow-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Page Range</label>
                      <input
                        type="text"
                        required
                        value={pubPages}
                        onChange={(e) => setPubPages(e.target.value)}
                        className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none shadow-sm"
                        placeholder="e.g. 19-32"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={publishing}
                    className="bg-olive hover:bg-link-hover text-white font-bold px-5 py-2.5 rounded-sm shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-xs"
                  >
                    Schedule & Publish Live
                  </button>
                </form>
              </div>
            ) : null}

          </div>
        ) : (
          <div className="bg-bg-card border border-border-custom rounded-sm p-6 text-center space-y-3 text-text-muted py-24">
            <Settings className="mx-auto text-text-muted" size={32} />
            <h3 className="font-serif font-bold text-sm text-text-heading uppercase">Select submission</h3>
            <p className="text-xs leading-relaxed max-w-xs mx-auto font-serif">
              Click on any submission in the queue on the left to assign peer reviewers, check reviewer comments, and publish manuscripts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
