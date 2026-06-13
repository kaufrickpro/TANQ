import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Calendar, 
  User, 
  Tag, 
  FileUp,
  BookOpen
} from 'lucide-react';
import type { Issue } from '../page';
import { safeJson } from '@/lib/clientFetch';

interface Article {
  id: number;
  issue_id: number;
  title: string;
  authors: string;
  abstract: string;
  keywords: string;
  doi: string;
  pages: string;
  pdf_url: string;
  type: string;
  date_published: string;
}

interface ArticleManagerProps {
  issues: Issue[];
  selectedIssueId: number;
  onClose: () => void;
  onRefreshIssues: () => Promise<void>;
}

export default function ArticleManager({
  issues,
  selectedIssueId,
  onClose,
  onRefreshIssues
}: ArticleManagerProps) {
  const [activeIssueId, setActiveIssueId] = useState<number>(selectedIssueId);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [success, setSuccess] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Expandable abstracts state
  const [expandedArticles, setExpandedArticles] = useState<Record<number, boolean>>({});

  // Issue PDF upload state
  const [issuePdfFile, setIssuePdfFile] = useState<File | null>(null);
  const [uploadingIssuePdf, setUploadingIssuePdf] = useState<boolean>(false);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);
  
  const [formTitle, setFormTitle] = useState<string>('');
  const [formAuthors, setFormAuthors] = useState<string>('');
  const [formAbstract, setFormAbstract] = useState<string>('');
  const [formKeywords, setFormKeywords] = useState<string>('');
  const [formDoi, setFormDoi] = useState<string>('');
  const [formPages, setFormPages] = useState<string>('');
  const [formType, setFormType] = useState<string>('Research Article');
  const [formDatePublished, setFormDatePublished] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [formPdfFile, setFormPdfFile] = useState<File | null>(null);
  const [submittingForm, setSubmittingForm] = useState<boolean>(false);

  // Find active issue object
  const activeIssue = issues.find(i => i.id === activeIssueId);

  const fetchArticles = useCallback(async (issueId: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/articles?issue_id=${issueId}`);
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data.error || 'Failed to fetch articles');
      }
      const data = await safeJson(res);
      setArticles(data);
    } catch (err: any) {
      setError(err.message || 'Error loading articles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeIssueId) {
      fetchArticles(activeIssueId);
      // Generate default DOI based on issue
      if (activeIssue) {
        const year = activeIssue.year;
        const vol = activeIssue.volume;
        const num = activeIssue.number;
        setFormDoi(`10.58737/saj.${year}.${vol.toString().padStart(2, '0')}.${num.toString().padStart(2, '0')}.`);
      }
    }
  }, [activeIssueId, fetchArticles, activeIssue]);

  const toggleExpand = (articleId: number) => {
    setExpandedArticles(prev => ({ ...prev, [articleId]: !prev[articleId] }));
  };

  const handleIssuePdfUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuePdfFile || !activeIssueId) return;
    setUploadingIssuePdf(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('action', 'update_issue_pdf');
      formData.append('issue_id', String(activeIssueId));
      formData.append('issue_pdf', issuePdfFile);

      const res = await fetch('/api/publish', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData.error || 'Failed to upload issue PDF');
      }

      setSuccess('Issue PDF updated successfully!');
      setIssuePdfFile(null);
      const fileInput = document.getElementById('issue-pdf-change') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      await onRefreshIssues();
    } catch (err: any) {
      setError(err.message || 'Error uploading issue PDF');
    } finally {
      setUploadingIssuePdf(false);
    }
  };

  const openCreateForm = () => {
    setFormMode('create');
    setEditingArticleId(null);
    setFormTitle('');
    setFormAuthors('');
    setFormAbstract('');
    setFormKeywords('');
    
    // Default sensible DOI suffix
    if (activeIssue) {
      const year = activeIssue.year;
      const vol = activeIssue.volume;
      const num = activeIssue.number;
      setFormDoi(`10.58737/saj.${year}.${vol.toString().padStart(2, '0')}.${num.toString().padStart(2, '0')}.00${articles.length + 1}`);
    } else {
      setFormDoi('');
    }
    
    setFormPages('');
    setFormType('Research Article');
    setFormDatePublished(new Date().toISOString().split('T')[0]);
    setFormPdfFile(null);
    setIsFormOpen(true);
  };

  const openEditForm = (article: Article) => {
    setFormMode('edit');
    setEditingArticleId(article.id);
    setFormTitle(article.title);
    setFormAuthors(article.authors);
    setFormAbstract(article.abstract);
    setFormKeywords(article.keywords);
    setFormDoi(article.doi);
    setFormPages(article.pages);
    setFormType(article.type);
    setFormDatePublished(article.date_published);
    setFormPdfFile(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingForm(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('issue_id', String(activeIssueId));
      formData.append('title', formTitle);
      formData.append('authors', formAuthors);
      formData.append('abstract', formAbstract);
      formData.append('keywords', formKeywords);
      formData.append('doi', formDoi);
      formData.append('pages', formPages);
      formData.append('type', formType);
      formData.append('date_published', formDatePublished);

      if (formMode === 'create') {
        if (!formPdfFile) {
          throw new Error('PDF file is required for new articles');
        }
        formData.append('action', 'create');
        formData.append('file', formPdfFile);
      } else {
        formData.append('action', 'update');
        formData.append('id', String(editingArticleId));
        if (formPdfFile) {
          formData.append('file', formPdfFile);
        }
      }

      const res = await fetch('/api/articles', {
        method: 'POST',
        body: formData
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save article');
      }

      setSuccess(formMode === 'create' ? 'Article added successfully!' : 'Article updated successfully!');
      setIsFormOpen(false);
      setFormPdfFile(null);
      fetchArticles(activeIssueId);
    } catch (err: any) {
      setError(err.message || 'Error saving article');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleDeleteArticle = async (articleId: number, title: string) => {
    if (!confirm(`Are you sure you want to delete the article: "${title}"? This cannot be undone.`)) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('action', 'delete');
      formData.append('id', String(articleId));

      const res = await fetch('/api/articles', {
        method: 'POST',
        body: formData
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete article');
      }

      setSuccess('Article deleted successfully.');
      fetchArticles(activeIssueId);
    } catch (err: any) {
      setError(err.message || 'Error deleting article');
    }
  };

  return (
    <div className="bg-bg-card border border-border-custom p-6 rounded-sm shadow-sm space-y-6 text-xs text-text-primary font-sans">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-4 gap-4">
        <div>
          <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-1.5 uppercase tracking-wide">
            <BookOpen size={16} /> Article & Issue Manager
          </h3>
          <p className="text-[10px] text-text-muted mt-1 font-serif">
            Select an issue to manage its articles or change issue details.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={activeIssueId}
            onChange={(e) => {
              setActiveIssueId(Number(e.target.value));
              setIsFormOpen(false);
              setSuccess('');
              setError('');
            }}
            className="bg-white border border-border-custom rounded-sm px-3 py-1.5 text-xs text-black focus:outline-none font-serif"
          >
            {issues.map(iss => (
              <option key={iss.id} value={iss.id}>
                {iss.title} (Vol. {iss.volume}, No. {iss.number})
              </option>
            ))}
          </select>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-text-muted hover:text-olive font-bold cursor-pointer uppercase tracking-wider text-[10px] border border-border-custom bg-white px-2.5 py-1.5 rounded-sm hover:bg-sand/10 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Success/Error Alerts */}
      {success && (
        <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm flex items-start gap-2 text-xs">
          <CheckCircle size={16} className="shrink-0 mt-0.5 text-olive" />
          <span className="font-serif leading-relaxed font-bold uppercase tracking-wider">{success}</span>
        </div>
      )}
      {error && (
        <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm flex items-start gap-2 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-olive" />
          <span className="font-bold uppercase tracking-wider">{error}</span>
        </div>
      )}

      {activeIssue && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* Left / Top Side: Issue PDF Details (md:col-span-4) */}
          <div className="md:col-span-4 bg-sand/10 border border-border-light p-4 rounded-sm space-y-4">
            <h4 className="font-serif font-bold text-xs text-text-heading uppercase tracking-wide border-b border-border-light pb-2">
              Issue PDF Settings
            </h4>
            <div className="space-y-2 font-serif text-[11px]">
              <div>
                <span className="font-sans font-bold text-[8px] uppercase tracking-wider text-text-muted block">Issue Title</span>
                <span className="font-bold text-text-heading">{activeIssue.title}</span>
              </div>
              <div>
                <span className="font-sans font-bold text-[8px] uppercase tracking-wider text-text-muted block">Metadata</span>
                <span>Volume {activeIssue.volume}, Number {activeIssue.number} ({activeIssue.month} {activeIssue.year})</span>
              </div>
              <div>
                <span className="font-sans font-bold text-[8px] uppercase tracking-wider text-text-muted block">Current PDF Status</span>
                {activeIssue.issue_pdf_url ? (
                  <div className="flex items-center gap-2 mt-1 font-sans">
                    <a 
                      href={activeIssue.issue_pdf_url} 
                      download 
                      className="inline-flex items-center gap-1 text-[10px] text-olive font-bold hover:underline"
                    >
                      <Download size={11} /> Download PDF
                    </a>
                  </div>
                ) : (
                  <span className="text-text-muted italic">No PDF attached to this issue.</span>
                )}
              </div>
            </div>

            {/* Change Issue PDF Form */}
            <form onSubmit={handleIssuePdfUpload} className="border-t border-border-light pt-3 space-y-3 font-sans">
              <label className="block">
                <span className="block font-bold uppercase tracking-wider text-text-muted text-[8px] mb-1">
                  Change / Upload Issue PDF
                </span>
                <input 
                  id="issue-pdf-change"
                  type="file" 
                  required
                  accept="application/pdf,.pdf" 
                  onChange={(e) => setIssuePdfFile(e.target.files?.[0] || null)}
                  className="bg-white border border-border-custom rounded-sm px-2 py-1 w-full text-[10px] focus:outline-none"
                />
              </label>
              <button 
                type="submit" 
                disabled={uploadingIssuePdf || !issuePdfFile}
                className="w-full bg-olive hover:bg-link-hover text-white font-bold py-2 rounded-sm text-[9px] uppercase tracking-wider disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                {uploadingIssuePdf ? (
                  <>
                    <Loader2 size={10} className="animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <FileUp size={11} /> Update Issue PDF
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right / Main Side: Articles Management (md:col-span-8) */}
          <div className="md:col-span-8 space-y-4">
            
            {/* List Header and Add Button */}
            <div className="flex justify-between items-center bg-bg-card border border-border-custom p-3.5 rounded-sm">
              <div>
                <h4 className="font-serif font-bold text-xs text-text-heading uppercase tracking-wide">
                  Articles in this Issue ({articles.length})
                </h4>
              </div>
              {!isFormOpen && (
                <button
                  onClick={openCreateForm}
                  className="bg-olive hover:bg-link-hover text-white font-sans font-bold text-[9px] px-3 py-1.5 rounded-sm uppercase tracking-wider inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus size={10} /> Add Article
                </button>
              )}
            </div>

            {/* Add/Edit Form Overlay/Inline */}
            {isFormOpen && (
              <form onSubmit={handleFormSubmit} className="bg-bg-card border border-border-custom p-5 rounded-sm space-y-4 shadow-sm">
                <div className="flex justify-between items-center border-b border-border-light pb-2">
                  <h5 className="font-serif font-bold text-xs text-text-heading uppercase tracking-wider">
                    {formMode === 'create' ? 'Add New Article' : 'Edit Article Details'}
                  </h5>
                  <button 
                    type="button" 
                    onClick={() => setIsFormOpen(false)}
                    className="text-text-muted hover:text-olive font-bold text-[9px] uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Article Title</label>
                    <input 
                      type="text" 
                      required 
                      value={formTitle} 
                      onChange={(e) => setFormTitle(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-serif focus:outline-none"
                    />
                  </div>
                  
                  <div className="sm:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Authors</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. John Doe, Jane Smith"
                      value={formAuthors} 
                      onChange={(e) => setFormAuthors(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-serif focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Abstract</label>
                    <textarea 
                      required 
                      rows={5}
                      value={formAbstract} 
                      onChange={(e) => setFormAbstract(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-2 w-full text-black font-serif focus:outline-none leading-relaxed"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Keywords</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Development, Partnership, Economics (comma separated)"
                      value={formKeywords} 
                      onChange={(e) => setFormKeywords(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-sans focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">DOI Reference</label>
                    <input 
                      type="text" 
                      required 
                      value={formDoi} 
                      onChange={(e) => setFormDoi(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Page Range</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. 10-25"
                      value={formPages} 
                      onChange={(e) => setFormPages(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-serif focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Article Type</label>
                    <select 
                      value={formType} 
                      onChange={(e) => setFormType(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black focus:outline-none font-serif"
                    >
                      <option value="Research Article">Research Article</option>
                      <option value="Editorial">Editorial</option>
                      <option value="Review Article">Review Article</option>
                      <option value="Book Review">Book Review</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">Date Published</label>
                    <input 
                      type="date" 
                      required
                      value={formDatePublished} 
                      onChange={(e) => setFormDatePublished(e.target.value)} 
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-sans focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1">
                      Article PDF File {formMode === 'create' ? '(Required)' : '(Optional, leave empty to keep current)'}
                    </label>
                    <input 
                      type="file" 
                      required={formMode === 'create'}
                      accept="application/pdf,.pdf"
                      onChange={(e) => setFormPdfFile(e.target.files?.[0] || null)}
                      className="bg-white border border-border-custom rounded-sm px-3 py-1.5 w-full text-black font-sans focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    disabled={submittingForm}
                    className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider text-[10px] inline-flex items-center gap-1.5"
                  >
                    {submittingForm ? (
                      <>
                        <Loader2 size={11} className="animate-spin" /> Saving...
                      </>
                    ) : (
                      'Save Article'
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsFormOpen(false)}
                    className="bg-white border border-border-custom hover:bg-sand/10 text-olive font-bold px-4 py-2.5 rounded-sm transition-colors cursor-pointer uppercase tracking-wider text-[10px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Articles List */}
            {loading ? (
              <div className="bg-white border border-border-custom p-8 rounded-sm text-center text-text-muted flex justify-center items-center gap-2 font-serif">
                <Loader2 size={14} className="animate-spin" /> Loading articles...
              </div>
            ) : articles.length === 0 ? (
              <div className="bg-white border border-border-custom p-8 rounded-sm text-center text-text-muted font-serif">
                No articles are published in this issue yet. Use the "Add Article" button above to publish one directly.
              </div>
            ) : (
              <div className="space-y-3">
                {articles.map((article) => {
                  const isExpanded = !!expandedArticles[article.id];
                  return (
                    <div key={article.id} className="bg-white border border-border-custom rounded-sm p-4 hover:shadow-md transition-shadow duration-200">
                      
                      {/* Top Info Bar */}
                      <div className="flex items-start justify-between gap-4 font-serif">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-sans font-bold text-[8px] uppercase tracking-wider bg-sand/35 text-olive px-1.5 py-0.5 rounded-sm">
                              {article.type}
                            </span>
                            <span className="font-sans font-bold text-[8px] uppercase tracking-wider text-text-muted">
                              pp. {article.pages}
                            </span>
                          </div>
                          <h5 className="font-bold text-sm text-text-heading leading-snug">
                            {article.title}
                          </h5>
                          <p className="text-[10px] text-text-primary italic">
                            {article.authors}
                          </p>
                        </div>
                        
                        {/* Edit & Delete Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0 font-sans">
                          <button
                            onClick={() => openEditForm(article)}
                            className="p-1.5 rounded-sm border border-border-custom hover:bg-sand/15 text-olive transition-colors cursor-pointer"
                            title="Edit metadata / PDF"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteArticle(article.id, article.title)}
                            className="p-1.5 rounded-sm border border-border-custom hover:bg-sand/15 text-olive transition-colors cursor-pointer"
                            title="Delete article"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Expandable abstract and metadata */}
                      <div className="border-t border-border-light mt-3 pt-2">
                        <button
                          onClick={() => toggleExpand(article.id)}
                          className="flex items-center gap-1 text-[9px] font-sans font-bold uppercase tracking-wider text-text-muted hover:text-olive cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp size={11} /> Hide Abstract & Info
                            </>
                          ) : (
                            <>
                              <ChevronDown size={11} /> Show Abstract & Info
                            </>
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2.5 space-y-3 font-serif text-[11px] leading-relaxed text-text-primary">
                            <div>
                              <span className="font-sans font-bold text-[8px] uppercase tracking-wider text-text-muted block mb-0.5">Abstract</span>
                              <p className="whitespace-pre-line text-justify">{article.abstract}</p>
                            </div>
                            
                            {article.keywords && (
                              <div>
                                <span className="font-sans font-bold text-[8px] uppercase tracking-wider text-text-muted block mb-0.5">Keywords</span>
                                <div className="flex flex-wrap gap-1 mt-1 font-sans">
                                  {article.keywords.split(',').map(kw => (
                                    <span key={kw} className="bg-sand/30 text-olive border border-border-custom px-1.5 py-0.5 text-[8px] font-bold uppercase rounded-sm">
                                      {kw.trim()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 font-sans text-[9px] border-t border-border-light pt-2 text-text-muted">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={11} className="shrink-0" />
                                <span>Published: <span className="text-text-primary font-bold">{article.date_published}</span></span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Tag size={11} className="shrink-0" />
                                <span className="truncate">DOI: <span className="text-text-primary font-bold font-mono">{article.doi || 'N/A'}</span></span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* PDF download footer bar */}
                      <div className="flex items-center justify-between border-t border-border-light mt-3 pt-2 font-sans text-[9px] text-text-muted">
                        <span>Article live in directory</span>
                        <a 
                          href={article.pdf_url} 
                          download 
                          className="inline-flex items-center gap-0.5 text-[9px] font-bold text-olive hover:underline"
                        >
                          <Download size={10} /> Download PDF ↓
                        </a>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}
