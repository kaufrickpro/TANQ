'use client';

import React, { useState } from 'react';
import { Copy, Check, Quote } from 'lucide-react';

interface CitationBlockProps {
  title: string;
  authors: string;
  year: number;
  volume: number;
  number: number;
  pages: string;
  doi: string;
}

export default function CitationBlock({
  title,
  authors,
  year,
  volume,
  number,
  pages,
  doi
}: CitationBlockProps) {
  const [format, setFormat] = useState<'APA' | 'MLA' | 'Chicago'>('APA');
  const [copied, setCopied] = useState(false);

  // Helper to format authors list for academic styles
  const formatAuthors = (style: 'APA' | 'MLA' | 'Chicago') => {
    const authorList = authors.split(/, | and /).map(a => a.trim());
    
    if (style === 'APA') {
      const formatted = authorList.map(a => {
        const parts = a.split(' ');
        const surname = parts[parts.length - 1];
        const initials = parts.slice(0, parts.length - 1).map(p => p[0] + '.').join(' ');
        return `${surname}, ${initials}`;
      });
      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
      return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
    }
    
    if (style === 'MLA') {
      if (authorList.length === 1) {
        const parts = authorList[0].split(' ');
        return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
      }
      if (authorList.length === 2) {
        const parts1 = authorList[0].split(' ');
        const name1 = `${parts1[parts1.length - 1]}, ${parts1.slice(0, -1).join(' ')}`;
        return `${name1}, and ${authorList[1]}`;
      }
      const parts1 = authorList[0].split(' ');
      const name1 = `${parts1[parts1.length - 1]}, ${parts1.slice(0, -1).join(' ')}`;
      return `${name1}, et al`;
    }

    if (authorList.length === 1) {
      const parts = authorList[0].split(' ');
      return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
    }
    if (authorList.length === 2) {
      const parts1 = authorList[0].split(' ');
      const name1 = `${parts1[parts1.length - 1]}, ${parts1.slice(0, -1).join(' ')}`;
      return `${name1} and ${authorList[1]}`;
    }
    return `${authorList[0]} et al.`;
  };

  const getCitationText = () => {
    const formattedAuthors = formatAuthors(format);
    const cleanTitle = title.endsWith('.') ? title.slice(0, -1) : title;

    switch (format) {
      case 'APA':
        return `${formattedAuthors} (${year}). ${cleanTitle}. The African Nexus Quarterly, ${volume}(${number}), ${pages}. https://doi.org/${doi}`;
      case 'MLA':
        return `${formattedAuthors}. "${cleanTitle}." The African Nexus Quarterly, vol. ${volume}, no. ${number}, ${year}, pp. ${pages}. https://doi.org/${doi}`;
      case 'Chicago':
        return `${formattedAuthors}. "${cleanTitle}." The African Nexus Quarterly ${volume}, no. ${number} (${year}): ${pages}. https://doi.org/${doi}`;
      default:
        return '';
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getCitationText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const citation = getCitationText();

  return (
    <div className="bg-bg-card border border-border-custom p-6 space-y-4 shadow-sm font-sans text-xs">
      <div className="flex flex-col border-b border-border-light pb-3 gap-3">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-[0.12em] text-text-heading">
          <Quote size={15} className="text-olive shrink-0" />
          <span>How to Cite</span>
        </div>
        <div className="grid grid-cols-3 bg-sand/30 border border-border-light rounded-sm p-0.5 w-full">
          {(['APA', 'MLA', 'Chicago'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setFormat(fmt)}
              className={`px-2 py-1.5 text-[10px] font-bold rounded-sm transition-colors cursor-pointer uppercase tracking-wider ${
                format === fmt ? 'bg-olive text-white shadow-sm' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-sand/10 border border-border-light p-4 rounded-sm text-text-primary leading-relaxed font-serif break-words">
        <p className="not-italic">
          {citation}
        </p>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={copyToClipboard}
          className="inline-flex items-center gap-2 bg-olive hover:bg-link-hover text-white font-sans font-bold text-[10px] uppercase tracking-[0.12em] px-4 py-2 rounded-sm transition-colors shadow-sm cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" /> Copied!
            </>
          ) : (
            <>
              <Copy size={12} /> Copy Citation
            </>
          )}
        </button>
      </div>
    </div>
  );
}
