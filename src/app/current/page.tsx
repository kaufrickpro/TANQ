import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import db from '@/lib/db';
import { Book } from 'lucide-react';
import JournalCover from '@/components/journal/JournalCover';

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

interface Article {
  id: number;
  issue_id: number;
  title: string;
  authors: string;
  abstract: string;
  doi: string;
  pages: string;
  pdf_url: string;
  type: string;
  date_published: string;
}

export const revalidate = 60; // Revalidate every minute for live publishing updates

export default async function CurrentIssuePage() {
  let issue: Issue | null = null;
  let articles: Article[] = [];

  try {
    // Fetch the latest published issue
    const issueResult = await db`
      SELECT * FROM issues 
      WHERE is_published = 1 
      ORDER BY year DESC, number DESC 
      LIMIT 1
    `;
    issue = (issueResult.rows[0] as Issue) || null;

    if (issue) {
      // Fetch articles for this issue
      const articlesResult = await db`
        SELECT * FROM articles 
        WHERE issue_id = ${issue.id} 
        ORDER BY id ASC
      `;
      articles = articlesResult.rows as Article[];
    }
  } catch (e) {
    console.error('Error fetching current issue:', e);
  }

  if (!issue) {
    return (
      <div className="max-w-[1120px] mx-auto px-6 sm:px-8 py-20 text-center font-serif space-y-4 bg-bg-page flex-1 flex flex-col justify-center items-center">
        <Book className="text-text-muted" size={48} />
        <h1 className="text-2xl font-bold text-text-heading">No Current Issue Available</h1>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          The journal has not published any issues yet. Please check back later or view our submissions page.
        </p>
      </div>
    );
  }

  const editorials = articles.filter(a => a.type === 'Editorial');
  const researchArticles = articles.filter(a => a.type === 'Research Article');

  return (
    <div className="flex-1 flex flex-col bg-bg-page font-serif">
      {/* Charcoal Header Band */}
      <div className="w-full bg-bg-band text-text-on-dark py-4 text-center border-b border-border-custom font-lato">
        <span className="font-lato font-black text-xs uppercase tracking-[0.18em]">
          Current Issue · Volume {issue.volume.toString().padStart(2, '0')} · Issue {issue.number.toString().padStart(2, '0')}
        </span>
      </div>

      {/* Main Layout Container */}
      <div className="py-12 max-w-[1000px] mx-auto w-full px-6 sm:px-8 flex-1 space-y-12">
        
        {/* Showcase Hero Section */}
        <section className="bg-bg-card border border-border-custom p-8 md:p-12 shadow-sm rounded-sm relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
            {/* Left: Interactive 3D Cover */}
            <div className="md:col-span-5 flex justify-center relative group">
              {/* Soft background glow matching the sand/olive aesthetic */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 bg-olive/15 rounded-full blur-[60px] opacity-75 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <JournalCover size="lg" priority />
            </div>

            {/* Right: Issue Information */}
            <div className="md:col-span-7 space-y-6 text-left">
              <div className="space-y-2">
                <span className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-text-muted block">
                  Latest Issue
                </span>
                <h1 className="text-3xl sm:text-4xl font-serif text-text-heading font-bold leading-tight">
                  {issue.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  <span className="font-sans font-bold text-[10px] uppercase tracking-wider bg-sand/35 text-olive px-3 py-1 rounded-sm border border-border-custom/50">
                    Volume {issue.volume}, No. {issue.number}
                  </span>
                  <span className="font-serif italic text-xs text-text-muted">
                    Published {issue.month} {issue.year}
                  </span>
                </div>
              </div>

              <p className="text-sm text-text-primary/80 leading-relaxed font-serif max-w-[55ch]">
                Explore the latest collection of interdisciplinary peer-reviewed articles focusing on developmental partnerships and structural transformations across the African continent.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                {issue.issue_pdf_url && (
                  <a
                    href={issue.issue_pdf_url}
                    download
                    className="flex items-center justify-center gap-2 bg-olive hover:bg-link-hover text-white px-6 py-3.5 rounded-sm font-sans font-bold text-xs uppercase tracking-[0.15em] transition-colors shadow-sm cursor-pointer animate-none"
                  >
                    <svg className="w-4 h-4 animate-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Full PDF
                  </a>
                )}
                <a 
                  href="#table-of-contents"
                  className="flex items-center justify-center border border-olive text-olive hover:bg-olive/5 px-6 py-3.5 rounded-sm font-sans font-bold text-xs uppercase tracking-[0.15em] transition-colors cursor-pointer text-center"
                >
                  Browse Articles &darr;
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Table of Contents Section */}
        <main id="table-of-contents" className="space-y-8 scroll-mt-6">
          <div className="border-b border-border-light pb-3 flex justify-between items-baseline">
            <h2 className="text-xl font-serif font-bold text-text-heading uppercase tracking-wider">
              Table of Contents
            </h2>
            <span className="font-sans font-bold text-[10px] uppercase tracking-wider text-text-muted">
              {articles.length} article{articles.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Editorials */}
          {editorials.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-muted">
                Editorial
              </h3>
              <div className="space-y-6">
                {editorials.map(article => (
                  <div 
                    key={article.id} 
                    className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-r-sm"
                  >
                    <h4 className="font-serif font-bold text-base text-text-primary hover:text-link transition-colors mb-2">
                      <Link href={`/article/${article.id}`}>{article.title}</Link>
                    </h4>
                    <p className="text-xs text-text-heading italic mb-3 font-serif">{article.authors}</p>
                    
                    <p className="text-sm text-text-primary/80 line-clamp-3 mb-4 leading-relaxed font-serif">
                      {article.abstract}
                    </p>

                    <div className="border-t border-border-light pt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0 flex-1">
                        <span className="min-w-0">DOI: <span className="normal-case font-normal text-text-primary break-all">{article.doi}</span></span>
                        <span className="shrink-0">Pages: <span className="normal-case font-normal text-text-primary">{article.pages}</span></span>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <Link href={`/article/${article.id}`} className="text-link hover:text-link-hover">Abstract</Link>
                        <a href={article.pdf_url} download className="text-link hover:text-link-hover whitespace-nowrap">PDF ↓</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Research Articles */}
          {researchArticles.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-muted">
                Research Articles
              </h3>
              <div className="space-y-6">
                {researchArticles.map(article => (
                  <div 
                    key={article.id} 
                    className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-r-sm"
                  >
                    <h4 className="font-serif font-bold text-base text-text-primary hover:text-link transition-colors mb-2">
                      <Link href={`/article/${article.id}`}>{article.title}</Link>
                    </h4>
                    <p className="text-xs text-text-heading italic mb-3 font-serif">{article.authors}</p>
                    
                    <p className="text-sm text-text-primary/80 line-clamp-3 mb-4 leading-relaxed font-serif">
                      {article.abstract}
                    </p>

                    <div className="border-t border-border-light pt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0 flex-1">
                        <span className="min-w-0">DOI: <span className="normal-case font-normal text-text-primary break-all">{article.doi}</span></span>
                        <span className="shrink-0">Pages: <span className="normal-case font-normal text-text-primary">{article.pages}</span></span>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <Link href={`/article/${article.id}`} className="text-link hover:text-link-hover">Abstract</Link>
                        <a href={article.pdf_url} download className="text-link hover:text-link-hover whitespace-nowrap">PDF ↓</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
