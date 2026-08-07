import React from 'react';
import Link from 'next/link';
import { FileDown, CheckCircle, ShieldAlert } from 'lucide-react';

const downloadableDocuments = [
  {
    href: '/templates/T-ANQ Title Page Template.docx',
    title: 'Title Page Template',
    description: 'Separate file for author details',
  },
  {
    href: '/templates/T-ANQ Manuscript Preparation Guidelines for Authors.docx',
    title: 'Manuscript Preparation Guidelines',
    description: 'Formatting and preparation requirements for authors',
  },
  {
    href: '/templates/T-ANQ Cover Letter Template.docx',
    title: 'Cover Letter Template',
    description: 'Cover letter format for new submissions',
  },
  {
    href: '/templates/T-ANQ Responses to the Reviewers.docx',
    title: 'Responses to the Reviewers',
    description: 'Structured response for revised submissions',
  },
  {
    href: '/templates/T-ANQ Copyright Transfer & Declaration.docx',
    title: 'Copyright Transfer & Declaration',
    description: 'Copyright transfer and author declaration form',
  },
  {
    href: '/templates/T-ANQ Copyright Transfer Agreement.docx',
    title: 'Copyright Transfer Agreement',
    description: 'Copyright agreement for accepted manuscripts',
  },
];

export default function Submissions() {
  const checklistItems = [
    'The manuscript is written in clear, concise English.',
    'The main manuscript file has been completely blinded (all author names, affiliations, and acknowledgments removed).',
    'The separate Title Page is prepared containing all author details, ORCID IDs, and corresponding contact info.',
    'The abstract is between 100 and 150 words and contains no citations.',
    '4 to 6 keywords are provided.',
    'Formatting complies with the APA 7th edition style guidelines.',
    'Word count is under 8,000 words (including tables, figures, and references).',
    'References contain active DOIs where available.',
    'The use of artificial intelligence in draft preparation is fully disclosed.'
  ];

  return (
    <div className="space-y-10">
      {/* Scope Header */}
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Submissions Guidelines
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          Manuscripts must be submitted through our online portal. We do not accept submissions via email. Authors must register for an account before submitting.
        </p>
      </div>

      {/* Templates section */}
      <div className="space-y-4 font-sans">
        <h3 className="font-serif font-bold text-base text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
          Download Templates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {downloadableDocuments.map((document) => (
            <a
              key={document.href}
              href={document.href}
              download
              className="flex items-center gap-4 bg-bg-card p-4 border border-border-custom rounded-sm hover:border-olive hover:shadow-sm transition-all"
            >
              <div className="bg-sand/30 p-3 rounded-sm border border-border-light text-olive shrink-0">
                <FileDown size={20} />
              </div>
              <div>
                <h3 className="font-serif font-bold text-sm text-text-primary">{document.title}</h3>
                <p className="text-[10px] text-text-muted mt-0.5 font-serif">{document.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-bg-card border border-border-custom p-6 space-y-4 shadow-sm font-sans">
        <h3 className="font-serif font-bold text-sm text-text-heading flex items-center gap-2 border-b border-border-light pb-2 mb-1 uppercase tracking-wide">
          <ShieldAlert className="text-olive" size={18} /> Pre-Submission Checklist
        </h3>
        <p className="text-xs text-text-muted font-serif">
          Before initiating your submission, please ensure your draft complies with all items on this checklist. Submissions failing to meet basic requirements will be desk-rejected.
        </p>
        <ul className="space-y-3 pt-2 font-serif text-xs">
          {checklistItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3 text-text-primary/90">
              <CheckCircle className="text-olive mt-0.5 shrink-0" size={16} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Submission CTA */}
      <div className="bg-bg-band text-white p-8 border border-border-custom text-center space-y-4">
        <h3 className="font-serif font-normal text-xl text-white">Ready to Submit?</h3>
        <p className="text-xs text-white/70 max-w-xl mx-auto leading-relaxed font-serif">
          Click below to log into the Author Portal, where you can complete the submission form, upload your blinded manuscript and cover letter, and track the progress of your peer review.
        </p>
        <div className="pt-2 font-sans">
          <Link
            href="/dashboard/login"
            className="inline-flex items-center gap-2 bg-olive hover:bg-link-hover text-white px-6 py-3 rounded-sm font-bold text-xs uppercase tracking-[0.12em] transition-colors shadow-sm cursor-pointer"
          >
            Go to Submissions Portal &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
