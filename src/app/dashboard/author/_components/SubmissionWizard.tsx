'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { safeJson } from '@/lib/clientFetch';
import {
  ChevronRight, ChevronLeft, Check, X, Plus, Trash2,
  FileText, Users, Paperclip, Info, Eye, Upload,
  AlertCircle, CheckCircle, Loader2, ChevronDown
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CoAuthor {
  name: string;
  email: string;
}

interface FileMeta {
  file: File;
  name: string;
}

interface FilesState {
  fullText: FileMeta | null;
  supplementary: FileMeta | null;
  titlePage: FileMeta | null;
  copyrightForm: FileMeta | null;
  similarityReport: FileMeta | null;
  ethicsApproval: FileMeta | null;
  extras: FileMeta[];
}

interface Step1Data {
  submissionType: string;
  topic: string;
  language: string;
  title: string;
  shortTitle: string;
  keywords: string[];
  abstract: string;
  declared: boolean;
}

interface Step4Data {
  projectNumber: string;
  ethicsStatement: string;
  supportingInstitution: string;
  acknowledgements: string;
}

interface WizardProps {
  session: { name: string; email: string };
  initialDraft?: any;
  onSuccess: () => void;
  onClose: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Metadata', icon: FileText },
  { label: 'Authors', icon: Users },
  { label: 'Files', icon: Paperclip },
  { label: 'Details', icon: Info },
  { label: 'Preview', icon: Eye },
];

const SUBMISSION_TYPES = ['Research Article', 'Review Article', 'Editorial', 'Book Review', 'Case Study', 'Short Communication'];
const LANGUAGES = ['English', 'French', 'Swahili', 'Arabic', 'Portuguese'];
const TOPICS = ['African Studies', 'Political Science', 'Economics', 'History', 'Anthropology', 'Sociology', 'International Relations', 'Environmental Studies', 'Gender Studies', 'Public Health'];

const CHECKLIST_ITEMS = [
  'The manuscript has not been submitted elsewhere and is not under consideration by another journal.',
  'All author information has been removed from the blinded manuscript (no names in text, metadata, or headers).',
  'The manuscript conforms to TANQ submission guidelines and formatting requirements.',
];

const FILE_SLOTS = [
  { key: 'fullText' as const, label: 'Full Text (Blinded Manuscript)', required: true, accept: '.pdf,.doc,.docx' },
  { key: 'supplementary' as const, label: 'Supplementary Files', required: true, accept: '.pdf,.doc,.docx,.zip' },
  { key: 'titlePage' as const, label: 'Title Page (with author info)', required: true, accept: '.pdf,.doc,.docx' },
  { key: 'copyrightForm' as const, label: 'Copyright Transfer Form', required: true, accept: '.pdf,.doc,.docx' },
  { key: 'similarityReport' as const, label: 'Similarity / Plagiarism Report', required: true, accept: '.pdf' },
  { key: 'ethicsApproval' as const, label: 'Ethics Committee Approval', required: true, accept: '.pdf,.doc,.docx' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const Icon = step.icon;
        return (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center gap-1.5 relative">
              <div className={`
                w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300
                ${done ? 'bg-olive border-olive text-white' : active ? 'bg-white border-olive text-olive shadow-sm' : 'bg-white border-border-custom text-text-muted'}
              `}>
                {done ? <Check size={15} strokeWidth={2.5} /> : <Icon size={15} />}
              </div>
              <span className={`text-[9px] font-sans font-bold uppercase tracking-widest whitespace-nowrap transition-colors duration-200 ${active ? 'text-olive' : done ? 'text-text-muted' : 'text-text-muted/50'}`}>
                {step.label}
              </span>
            </div>
            {idx < total - 1 && (
              <div className={`flex-1 h-[2px] mb-5 mx-1 transition-colors duration-300 ${done ? 'bg-olive' : 'bg-border-custom'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function KeywordInput({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
  const [input, setInput] = useState('');
  const addKeyword = () => {
    const kw = input.trim();
    if (kw && !keywords.includes(kw) && keywords.length < 8) {
      onChange([...keywords, kw]);
      setInput('');
    }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px]">
        {keywords.map((kw) => (
          <span key={kw} className="inline-flex items-center gap-1 bg-olive text-white text-[10px] font-sans font-bold px-2.5 py-1 rounded-sm">
            {kw}
            <button type="button" onClick={() => onChange(keywords.filter(k => k !== kw))} className="ml-0.5 hover:opacity-70 cursor-pointer">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
          placeholder="Type a keyword and press Enter"
          className="flex-1 bg-white border border-border-custom rounded-sm px-3 py-2 text-sm text-black focus:outline-none focus:border-olive font-serif"
        />
        <button type="button" onClick={addKeyword} className="px-3 py-2 bg-olive text-white text-[10px] font-sans font-bold rounded-sm cursor-pointer hover:bg-link-hover transition-colors">
          <Plus size={14} />
        </button>
      </div>
      <p className="text-[10px] text-text-muted font-serif mt-1">Add up to 8 keywords. Press Enter or click + to add.</p>
    </div>
  );
}

function FileSlotRow({ slotLabel, slotKey, required, accept, value, onChange }: {
  slotLabel: string; slotKey: string; required: boolean; accept: string;
  value: FileMeta | null; onChange: (file: FileMeta | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 border border-border-custom bg-white rounded-sm px-4 py-3 hover:border-olive/50 transition-colors">
      <div className="w-2 h-2 rounded-full shrink-0 bg-olive/30 border border-olive/60" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-serif font-bold text-text-primary">
          {slotLabel}
          {required && <span className="text-olive ml-1">*</span>}
        </p>
        {value ? (
          <p className="text-[10px] text-olive font-mono mt-0.5 truncate">{value.name}</p>
        ) : (
          <p className="text-[10px] text-text-muted font-serif mt-0.5">No file selected</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-text-muted hover:text-olive cursor-pointer transition-colors">
            <Trash2 size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sand/30 border border-border-custom text-olive font-sans font-bold text-[10px] uppercase tracking-wider rounded-sm cursor-pointer hover:bg-sand/60 transition-colors"
        >
          <Upload size={12} />
          {value ? 'Replace' : 'Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onChange({ file: f, name: f.name });
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function AccordionSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-border-custom rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-sand/20 hover:bg-sand/40 transition-colors cursor-pointer"
      >
        <span className="text-xs font-sans font-bold uppercase tracking-wider text-text-heading">{title}</span>
        <ChevronDown size={14} className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 py-4 bg-white space-y-2 text-sm font-serif text-text-primary">{children}</div>}
    </div>
  );
}

// ─── Main Wizard Component ────────────────────────────────────────────────────

export default function SubmissionWizard({ session, initialDraft, onSuccess, onClose }: WizardProps) {
  const [draftId, setDraftId] = useState<number | null>(initialDraft?.id || null);
  const [step, setStep] = useState(() => {
    if (initialDraft?.draft_step) {
      return Math.max(0, Math.min(STEPS.length - 1, initialDraft.draft_step - 1));
    }
    return 0;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [s1, setS1] = useState<Step1Data>(() => ({
    submissionType: initialDraft?.submission_type || 'Research Article',
    topic: initialDraft?.topic || '',
    language: initialDraft?.language || 'English',
    title: initialDraft?.title || '',
    shortTitle: initialDraft?.short_title || '',
    keywords: initialDraft?.keywords
      ? (typeof initialDraft.keywords === 'string'
          ? initialDraft.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
          : initialDraft.keywords)
      : [],
    abstract: initialDraft?.abstract || '',
    declared: !!initialDraft,
  }));

  // Step 2
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>(() => {
    if (initialDraft?.co_authors) {
      return typeof initialDraft.co_authors === 'string'
        ? JSON.parse(initialDraft.co_authors)
        : initialDraft.co_authors;
    }
    return [];
  });
  const [newCoName, setNewCoName] = useState('');
  const [newCoEmail, setNewCoEmail] = useState('');

  // Step 3
  const [files, setFiles] = useState<FilesState>({
    fullText: null,
    supplementary: null,
    titlePage: null,
    copyrightForm: null,
    similarityReport: null,
    ethicsApproval: null,
    extras: [],
  });

  // Step 4
  const [s4, setS4] = useState<Step4Data>(() => ({
    projectNumber: initialDraft?.project_number || '',
    ethicsStatement: initialDraft?.ethics_statement || '',
    supportingInstitution: initialDraft?.supporting_institution || '',
    acknowledgements: initialDraft?.acknowledgements || '',
  }));

  // Step 5
  const [noteToEditor, setNoteToEditor] = useState(initialDraft?.editor_note || '');
  const [checklist, setChecklist] = useState(() => {
    if (initialDraft?.checklist_confirmed) {
      return [true, true, true];
    }
    return [false, false, false];
  });

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep = useCallback((s: number): string => {
    if (s === 0) {
      if (!s1.title.trim()) return 'Manuscript title is required.';
      if (!s1.abstract.trim()) return 'Abstract is required.';
      if (s1.keywords.length < 3) return 'Please add at least 3 keywords.';
      if (!s1.declared) return 'You must declare that the manuscript has not been submitted elsewhere.';
    }
    if (s === 2) {
      const required = ['fullText', 'supplementary', 'titlePage', 'copyrightForm', 'similarityReport', 'ethicsApproval'] as const;
      for (const key of required) {
        if (!files[key]) return `"${FILE_SLOTS.find(sl => sl.key === key)?.label}" is required.`;
      }
    }
    if (s === 4) {
      if (!checklist.every(Boolean)) return 'Please confirm all checklist items before submitting.';
    }
    return '';
  }, [s1, files, checklist]);

  // ── Draft Save ────────────────────────────────────────────────────────────

  const saveDraft = useCallback(async (currentStep: number) => {
    setSaving(true);
    setError('');
    try {
      if (!draftId) {
        // Create a new draft row
        const res = await fetch('/api/submissions/0', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
          body: JSON.stringify({
            title: s1.title,
            abstract: s1.abstract,
            keywords: s1.keywords.join(', '),
            submission_type: s1.submissionType,
            topic: s1.topic,
            language: s1.language,
            short_title: s1.shortTitle,
          }),
        });
        if (!res.ok) throw new Error('Could not save draft');
        const data = await safeJson(res);
        setDraftId(data.id);
      } else {
        // Patch existing draft
        const payload: Record<string, any> = {
          draft_step: currentStep + 1,
          title: s1.title,
          abstract: s1.abstract,
          keywords: s1.keywords.join(', '),
          submission_type: s1.submissionType,
          topic: s1.topic,
          language: s1.language,
          short_title: s1.shortTitle,
          co_authors: coAuthors,
          project_number: s4.projectNumber,
          ethics_statement: s4.ethicsStatement,
          supporting_institution: s4.supportingInstitution,
          acknowledgements: s4.acknowledgements,
          editor_note: noteToEditor,
        };
        const res = await fetch(`/api/submissions/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Could not save draft');
      }
    } catch (e: any) {
      setError(e.message || 'Error saving draft');
    } finally {
      setSaving(false);
    }
  }, [draftId, s1, coAuthors, s4, noteToEditor]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleNext = async () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    await saveDraft(step);
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(s => s - 1);
  };

  // ── Final Submit ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const err = validateStep(4);
    if (err) { setError(err); return; }
    if (!files.fullText) { setError('Full text file is required.'); return; }
    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('title', s1.title);
      formData.append('abstract', s1.abstract);
      formData.append('keywords', s1.keywords.join(', '));
      formData.append('submission_type', s1.submissionType);
      formData.append('topic', s1.topic);
      formData.append('language', s1.language);
      formData.append('short_title', s1.shortTitle);
      formData.append('co_authors', JSON.stringify(coAuthors));
      formData.append('project_number', s4.projectNumber);
      formData.append('ethics_statement', s4.ethicsStatement);
      formData.append('supporting_institution', s4.supportingInstitution);
      formData.append('acknowledgements', s4.acknowledgements);
      formData.append('editor_note', noteToEditor);
      formData.append('checklist_confirmed', 'true');
      formData.append('file', files.fullText.file, files.fullText.name);
      // Append other files as additional named fields (stored as files_meta if needed)
      if (files.titlePage) formData.append('file_title_page', files.titlePage.file, files.titlePage.name);
      if (files.supplementary) formData.append('file_supplementary', files.supplementary.file, files.supplementary.name);

      const res = await fetch('/api/submissions', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const d = await safeJson(res);
        throw new Error(d.error || 'Failed to submit');
      }

      if (draftId) {
        try {
          await fetch(`/api/submissions?submission_id=${draftId}`, {
            method: 'DELETE',
          });
        } catch (delErr) {
          console.error('Failed to delete draft after submit:', delErr);
        }
      }

      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Submission failed');
      setSubmitting(false);
    }
  };

  // ── Render Helpers ────────────────────────────────────────────────────────

  const inputCls = 'bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive font-serif transition-colors';
  const labelCls = 'block text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted mb-1.5';
  const sectionTitle = (t: string) => (
    <h3 className="font-serif font-bold text-base text-text-heading border-b border-border-light pb-2 mb-4">{t}</h3>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-charcoal/40 backdrop-blur-sm p-4">
      <div className="bg-bg-page border border-border-custom shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col rounded-sm overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-bg-card border-b border-border-custom shrink-0">
          <div>
            <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-text-muted">New Submission</p>
            <h2 className="font-serif font-bold text-lg text-text-heading mt-0.5">{STEPS[step].label}</h2>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-olive cursor-pointer transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <StepIndicator current={step} total={STEPS.length} />

          {/* ── Step 1: Metadata ── */}
          {step === 0 && (
            <div className="space-y-5">
              {sectionTitle('Article Metadata')}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Submission Type</label>
                  <select value={s1.submissionType} onChange={e => setS1(p => ({ ...p, submissionType: e.target.value }))} className={inputCls}>
                    {SUBMISSION_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Primary Language</label>
                  <select value={s1.language} onChange={e => setS1(p => ({ ...p, language: e.target.value }))} className={inputCls}>
                    {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Topic / Subject Area</label>
                <select value={s1.topic} onChange={e => setS1(p => ({ ...p, topic: e.target.value }))} className={inputCls}>
                  <option value="">Select a topic...</option>
                  {TOPICS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Manuscript Title <span className="text-olive">*</span></label>
                <input type="text" value={s1.title} onChange={e => setS1(p => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Full title of the manuscript" />
              </div>
              <div>
                <label className={labelCls}>Short / Running Title</label>
                <input type="text" value={s1.shortTitle} onChange={e => setS1(p => ({ ...p, shortTitle: e.target.value }))} className={inputCls} placeholder="Abbreviated title (max 60 characters)" maxLength={60} />
              </div>
              <div>
                <label className={labelCls}>Keywords <span className="text-olive">*</span></label>
                <KeywordInput keywords={s1.keywords} onChange={kw => setS1(p => ({ ...p, keywords: kw }))} />
              </div>
              <div>
                <label className={labelCls}>
                  Abstract <span className="text-olive">*</span>
                  <span className="ml-2 normal-case font-normal text-text-muted/70">
                    ({s1.abstract.trim().split(/\s+/).filter(Boolean).length} words)
                  </span>
                </label>
                <textarea rows={6} value={s1.abstract} onChange={e => setS1(p => ({ ...p, abstract: e.target.value }))} className={`${inputCls} leading-relaxed resize-y`} placeholder="150 – 250 word structured abstract" />
              </div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" checked={s1.declared} onChange={e => setS1(p => ({ ...p, declared: e.target.checked }))} className="mt-0.5 accent-olive shrink-0" />
                <span className="text-xs font-serif text-text-primary leading-relaxed group-hover:text-text-heading transition-colors">
                  I confirm that this manuscript has not been submitted to, or is not under consideration by, any other journal. All authors have read and approved the submission.
                </span>
              </label>
            </div>
          )}

          {/* ── Step 2: Authors ── */}
          {step === 1 && (
            <div className="space-y-5">
              {sectionTitle('Authors')}

              {/* Corresponding author (auto-populated) */}
              <div className="bg-sand/20 border border-border-custom rounded-sm px-4 py-3">
                <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-olive mb-1">Corresponding Author (You)</p>
                <p className="text-sm font-serif font-bold text-text-primary">{session.name}</p>
                <p className="text-xs text-text-muted font-mono">{session.email}</p>
              </div>

              {/* Co-author table */}
              {coAuthors.length > 0 && (
                <div className="border border-border-custom rounded-sm overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_auto] bg-sand/30 px-4 py-2 text-[9px] font-sans font-bold uppercase tracking-wider text-text-muted border-b border-border-custom">
                    <span>Name</span><span>Email</span><span>Action</span>
                  </div>
                  {coAuthors.map((ca, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] px-4 py-2.5 items-center text-sm font-serif border-b border-border-light last:border-0 hover:bg-sand/10 transition-colors">
                      <span className="font-bold text-text-primary">{ca.name}</span>
                      <span className="text-text-muted font-mono text-xs">{ca.email}</span>
                      <button type="button" onClick={() => setCoAuthors(prev => prev.filter((_, i) => i !== idx))} className="text-text-muted hover:text-olive cursor-pointer transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add co-author form */}
              <div className="border border-border-custom rounded-sm p-4 space-y-3 bg-bg-card">
                <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-text-muted">Add Co-Author</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Full Name</label>
                    <input type="text" value={newCoName} onChange={e => setNewCoName(e.target.value)} className={inputCls} placeholder="Dr. Ada Okafor" />
                  </div>
                  <div>
                    <label className={labelCls}>Email Address</label>
                    <input type="email" value={newCoEmail} onChange={e => setNewCoEmail(e.target.value)} className={inputCls} placeholder="ada@university.edu" />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!newCoName.trim() || !newCoEmail.trim()}
                  onClick={() => {
                    if (newCoName.trim() && newCoEmail.trim()) {
                      setCoAuthors(prev => [...prev, { name: newCoName.trim(), email: newCoEmail.trim() }]);
                      setNewCoName(''); setNewCoEmail('');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-olive text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer hover:bg-link-hover transition-colors disabled:opacity-40"
                >
                  <Plus size={14} /> Add Co-Author
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Files ── */}
          {step === 2 && (
            <div className="space-y-3">
              {sectionTitle('File Uploads')}
              <p className="text-xs font-serif text-text-muted leading-relaxed -mt-3 mb-2">
                All required files must be uploaded before proceeding. Ensure all blinded files contain no author information.
              </p>
              {FILE_SLOTS.map(slot => (
                <FileSlotRow
                  key={slot.key}
                  slotLabel={slot.label}
                  slotKey={slot.key}
                  required={slot.required}
                  accept={slot.accept}
                  value={files[slot.key]}
                  onChange={val => setFiles(prev => ({ ...prev, [slot.key]: val }))}
                />
              ))}
              {/* Extra files */}
              {files.extras.map((extra, idx) => (
                <div key={idx} className="flex items-center gap-3 border border-border-custom bg-white rounded-sm px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-serif text-text-muted">Extra File {idx + 1}</p>
                    <p className="text-[10px] text-olive font-mono truncate">{extra.name}</p>
                  </div>
                  <button type="button" onClick={() => setFiles(prev => ({ ...prev, extras: prev.extras.filter((_, i) => i !== idx) }))} className="text-text-muted hover:text-olive cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <label className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-border-custom rounded-sm text-text-muted text-xs font-sans font-bold uppercase tracking-wider cursor-pointer hover:border-olive hover:text-olive transition-colors">
                <Plus size={14} /> Add Extra File
                <input type="file" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setFiles(prev => ({ ...prev, extras: [...prev.extras, { file: f, name: f.name }] }));
                  e.target.value = '';
                }} />
              </label>
            </div>
          )}

          {/* ── Step 4: Additional Info ── */}
          {step === 3 && (
            <div className="space-y-5">
              {sectionTitle('Additional Information')}
              <div>
                <label className={labelCls}>Project / Grant Number</label>
                <input type="text" value={s4.projectNumber} onChange={e => setS4(p => ({ ...p, projectNumber: e.target.value }))} className={inputCls} placeholder="e.g. NRF-2024-045 (optional)" />
              </div>
              <div>
                <label className={labelCls}>Ethics Statement</label>
                <textarea rows={3} value={s4.ethicsStatement} onChange={e => setS4(p => ({ ...p, ethicsStatement: e.target.value }))} className={`${inputCls} leading-relaxed resize-y`} placeholder="Describe any ethical considerations or approvals relevant to this manuscript..." />
              </div>
              <div>
                <label className={labelCls}>Supporting Institution / Funding Body</label>
                <textarea rows={2} value={s4.supportingInstitution} onChange={e => setS4(p => ({ ...p, supportingInstitution: e.target.value }))} className={`${inputCls} leading-relaxed resize-y`} placeholder="List institutions or funders that supported this research..." />
              </div>
              <div>
                <label className={labelCls}>Acknowledgements</label>
                <textarea rows={3} value={s4.acknowledgements} onChange={e => setS4(p => ({ ...p, acknowledgements: e.target.value }))} className={`${inputCls} leading-relaxed resize-y`} placeholder="Acknowledge individuals, colleagues, or organizations who contributed..." />
              </div>
            </div>
          )}

          {/* ── Step 5: Preview & Submit ── */}
          {step === 4 && (
            <div className="space-y-4">
              {sectionTitle('Preview & Submit')}

              <AccordionSection title="1 · Article Metadata" defaultOpen>
                <div className="space-y-1.5 text-sm">
                  <p><strong>Type:</strong> {s1.submissionType}</p>
                  <p><strong>Language:</strong> {s1.language}</p>
                  {s1.topic && <p><strong>Topic:</strong> {s1.topic}</p>}
                  <p><strong>Title:</strong> {s1.title}</p>
                  {s1.shortTitle && <p><strong>Short Title:</strong> {s1.shortTitle}</p>}
                  <p><strong>Keywords:</strong> {s1.keywords.join(', ') || '—'}</p>
                  <p className="leading-relaxed"><strong>Abstract:</strong> {s1.abstract}</p>
                </div>
              </AccordionSection>

              <AccordionSection title="2 · Authors">
                <p><strong>Corresponding:</strong> {session.name} ({session.email})</p>
                {coAuthors.length > 0 && (
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {coAuthors.map((ca, i) => <li key={i}>{ca.name} – {ca.email}</li>)}
                  </ul>
                )}
              </AccordionSection>

              <AccordionSection title="3 · Files">
                <ul className="space-y-1">
                  {FILE_SLOTS.map(slot => (
                    <li key={slot.key} className={`flex items-center gap-2 ${files[slot.key] ? 'text-olive' : 'text-text-muted'}`}>
                      {files[slot.key] ? <Check size={12} /> : <X size={12} />}
                      <span>{slot.label}:</span>
                      <span className="font-mono text-xs">{files[slot.key]?.name || 'Not uploaded'}</span>
                    </li>
                  ))}
                </ul>
              </AccordionSection>

              {(s4.projectNumber || s4.ethicsStatement || s4.supportingInstitution || s4.acknowledgements) && (
                <AccordionSection title="4 · Additional Info">
                  {s4.projectNumber && <p><strong>Project No:</strong> {s4.projectNumber}</p>}
                  {s4.ethicsStatement && <p><strong>Ethics:</strong> {s4.ethicsStatement}</p>}
                  {s4.supportingInstitution && <p><strong>Support:</strong> {s4.supportingInstitution}</p>}
                  {s4.acknowledgements && <p><strong>Acknowledgements:</strong> {s4.acknowledgements}</p>}
                </AccordionSection>
              )}

              {/* Article Checklist */}
              <div className="border border-border-custom rounded-sm overflow-hidden">
                <div className="bg-sand/20 px-4 py-3 border-b border-border-custom">
                  <p className="text-xs font-sans font-bold uppercase tracking-wider text-text-heading">Article Checklist</p>
                </div>
                <div className="px-4 py-4 space-y-3 bg-white">
                  {CHECKLIST_ITEMS.map((item, idx) => (
                    <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={checklist[idx]}
                        onChange={e => setChecklist(prev => prev.map((v, i) => i === idx ? e.target.checked : v))}
                        className="mt-0.5 accent-olive shrink-0"
                      />
                      <span className="text-xs font-serif text-text-primary leading-relaxed group-hover:text-text-heading transition-colors">
                        {item}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Note to Editor */}
              <div>
                <label className={labelCls}>Note to Editor (Optional)</label>
                <textarea
                  rows={3}
                  value={noteToEditor}
                  onChange={e => setNoteToEditor(e.target.value)}
                  className={`${inputCls} leading-relaxed resize-y`}
                  placeholder="Any confidential comments or special requests for the editorial team..."
                />
              </div>
            </div>
          )}

        </div>

        {/* Error display - placed outside scrollable body to be pinned above the footer */}
        {error && (
          <div className="shrink-0 mx-6 mb-4 bg-rose-50 border border-rose-200 rounded-sm p-3.5 flex items-start gap-2.5 text-xs font-sans">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
            <span className="font-bold uppercase tracking-wider text-rose-800">{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 bg-bg-card border-t border-border-custom flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-[10px] text-text-muted font-sans flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Saving draft...
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-border-custom bg-white text-text-heading font-sans font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer hover:bg-sand/20 transition-colors"
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-olive text-white font-sans font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer hover:bg-link-hover transition-colors disabled:opacity-50"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-olive text-white font-sans font-bold text-xs uppercase tracking-[0.12em] rounded-sm cursor-pointer hover:bg-link-hover transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Submitting...' : 'Submit Manuscript'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
