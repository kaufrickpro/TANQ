'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, FileText, CheckCircle, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';

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

interface UserSession {
  username: string;
  name: string;
  email: string;
  role: string;
}

export default function AuthorDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Submit form state
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

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
      if (sessionUser.role !== 'author') {
        router.push('/dashboard/login');
        return;
      }
      setSession(sessionUser);
    } catch {
      router.push('/dashboard/login');
    }
  }, [router]);

  const fetchSubmissions = useCallback(async (email: string) => {
    try {
      const res = await fetch(`/api/submissions?role=author&email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch (e) {
      console.error('Error fetching submissions:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch submissions once session is loaded
  useEffect(() => {
    if (session?.email) {
      fetchSubmissions(session.email);
    }
  }, [session, fetchSubmissions]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !file) {
      setError('Please select a blinded manuscript file.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('abstract', abstract);
      formData.append('keywords', keywords);
      formData.append('author_name', session.name);
      formData.append('author_email', session.email);
      formData.append('file', file);

      const res = await fetch('/api/submissions', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to submit manuscript');
      }

      setSuccess('Manuscript submitted successfully! The Editorial Office will conduct a desk review shortly.');
      setTitle('');
      setAbstract('');
      setKeywords('');
      setFile(null);
      
      const fileInput = document.getElementById('manuscript-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      fetchSubmissions(session.email);
    } catch (e: any) {
      setError(e.message || 'Error submitting paper');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeStyles = (status: string) => {
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
      {/* Left panel: Submissions list */}
      <div className="lg:col-span-7 space-y-6">
        <div className="flex justify-between items-center border-b border-border-custom pb-3">
          <h1 className="text-2xl font-serif font-bold text-text-heading uppercase tracking-wide">Author Dashboard</h1>
          <button 
            onClick={() => fetchSubmissions(session.email)}
            className="p-1.5 text-text-muted hover:text-olive border border-border-custom bg-bg-card hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <div className="bg-bg-card border border-border-custom p-10 rounded-sm text-center space-y-3 text-text-muted font-sans">
            <FileText className="mx-auto text-text-muted" size={36} />
            <h3 className="font-serif font-bold text-sm text-text-heading uppercase">No active submissions</h3>
            <p className="text-xs font-serif leading-relaxed max-w-xs mx-auto">
              Submit your first manuscript using the panel on the right. You will be able to track peer review status here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div key={sub.id} className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-sm transition-shadow duration-200 space-y-3 relative overflow-hidden">
                <div className="flex justify-between items-start gap-4">
                  <h3 className="font-serif font-bold text-base text-text-primary leading-tight">{sub.title}</h3>
                  <span className={`text-[9px] uppercase font-sans font-bold tracking-widest px-2.5 py-0.5 rounded-sm border shrink-0 ${getStatusBadgeStyles(sub.status)}`}>
                    {sub.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted border-t border-border-light pt-2">
                  <span>Submitted: <span className="normal-case font-normal text-text-primary">{sub.date_submitted}</span></span>
                  <span>|</span>
                  <span>
                    File: <a href={sub.file_path} download className="text-link hover:text-link-hover hover:underline normal-case font-normal font-mono">{sub.file_path.split('/').pop()}</a>
                  </span>
                </div>
                <p className="text-sm text-text-primary/80 line-clamp-2 leading-relaxed font-serif pt-1">{sub.abstract}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel: Submit manuscript form */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-border-light pb-3">
            <FilePlus className="text-olive" size={18} />
            <h2 className="font-serif font-bold text-base text-text-heading uppercase tracking-wide">Submit Manuscript</h2>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4 text-xs text-text-primary font-sans">
            {success && (
              <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm flex items-start gap-2">
                <CheckCircle size={16} className="shrink-0 mt-0.5 text-olive" />
                <span className="font-serif leading-relaxed font-bold uppercase tracking-wider">{success}</span>
              </div>
            )}
            {error && (
              <div className="bg-white border border-border-custom text-text-heading p-3 rounded-sm flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-olive" />
                <span className="font-bold uppercase tracking-wider">{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Manuscript Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                  placeholder="Full title of the manuscript"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Abstract</label>
                <textarea
                  required
                  rows={5}
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm leading-relaxed font-serif"
                  placeholder="150 - 250 words abstract"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Keywords</label>
                <input
                  type="text"
                  required
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                  placeholder="e.g. curriculum, education (comma separated)"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Blinded Manuscript (Word / PDF)</label>
                <input
                  id="manuscript-file"
                  type="file"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-sans"
                  accept=".docx,.doc,.pdf"
                />
                <div className="bg-sand/10 border border-border-light rounded-sm p-3 mt-2 flex gap-2 items-start text-[10px] text-text-muted font-serif leading-normal">
                  <ShieldAlert className="text-olive shrink-0 mt-0.5" size={14} />
                  <span>Ensure files are completely blinded (no author names in text, metadata, or headers). Upload the separate Title Page via the checklist.</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-olive hover:bg-link-hover text-white font-sans font-bold py-3 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 text-xs uppercase tracking-[0.12em]"
            >
              {submitting ? 'Submitting...' : 'Submit Manuscript'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
