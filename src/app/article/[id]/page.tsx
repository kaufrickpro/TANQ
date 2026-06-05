import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import db from '@/lib/db';
import CitationBlock from '@/components/journal/CitationBlock';

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

interface Issue {
  id: number;
  volume: number;
  number: number;
  year: number;
  month: string;
  title: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 60; // Revalidate every minute

export default async function ArticlePage({ params }: PageProps) {
  const { id } = await params;
  let article: Article | null = null;
  let issue: Issue | null = null;

  try {
    // Fetch article details
    const articleResult = await db`SELECT * FROM articles WHERE id = ${id}`;
    article = (articleResult.rows[0] as Article) || null;

    if (article) {
      // Fetch corresponding issue details
      const issueResult = await db`SELECT * FROM issues WHERE id = ${article.issue_id}`;
      issue = (issueResult.rows[0] as Issue) || null;
    }
  } catch (e) {
    console.error('Error fetching article or issue:', e);
  }

  if (!article || !issue) {
    notFound();
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-page font-serif">
      {/* Charcoal Header Band representing article type */}
      <div className="w-full bg-bg-band text-text-on-dark py-4 text-center border-b border-border-custom font-lato">
        <span className="font-lato font-black text-xs uppercase tracking-[0.18em]">
          {article.type}
        </span>
      </div>

      {/* Main Container */}
      <div className="py-10 max-w-[1120px] mx-auto w-full px-6 sm:px-8 flex-1 space-y-6">
        
        {/* Back Link */}
        <div>
          <Link 
            href="/current" 
            className="font-lato font-bold text-xs uppercase tracking-[0.15em] text-text-muted hover:text-link flex items-center gap-1 transition-colors"
          >
            &larr; Back to Current Issue
          </Link>
        </div>

        {/* 8/4 Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start pt-2">
          
          {/* Left Column (8 cols) - Core content */}
          <main className="lg:col-span-8 space-y-8 max-w-[62ch]">
            {/* Title & Authors */}
            <div className="space-y-4">
              <h1 className="text-3xl font-serif font-bold text-text-heading leading-tight">
                {article.title}
              </h1>
              <p className="text-sm font-serif font-semibold text-olive italic">
                {article.authors}
              </p>
            </div>

            {/* Abstract */}
            <div className="space-y-3 pt-4 border-t border-border-light">
              <h2 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-muted">
                Abstract
              </h2>
              <p className="text-sm text-text-primary leading-relaxed font-serif text-justify whitespace-pre-line">
                {article.abstract}
              </p>
            </div>

            {/* Keywords */}
            {article.keywords && (
              <div className="space-y-3 pt-4 border-t border-border-light">
                <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-muted">
                  Keywords
                </h3>
                <div className="flex flex-wrap gap-2 pt-1 font-sans">
                  {article.keywords.split(',').map((kw) => (
                    <span 
                      key={kw.trim()}
                      className="bg-sand text-olive border border-border-custom px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm"
                    >
                      {kw.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </main>

          {/* Right Column (4 cols) - Panels & Citation */}
          <aside className="lg:col-span-4 space-y-8">
            
            {/* Download Manuscript Galley */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Manuscript Galley
              </h3>
              <p className="text-xs text-text-muted leading-relaxed font-serif mb-4">
                Download the complete published article document in portable document format.
              </p>
              <a
                href={article.pdf_url}
                download
                className="block text-center bg-olive hover:bg-link-hover text-white py-3 rounded-sm font-sans font-bold text-xs uppercase tracking-[0.12em] transition-colors shadow-sm cursor-pointer"
              >
                Download PDF Full Text
              </a>
            </div>

            {/* Article Details Panel */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Article Info
              </h3>
              <div className="space-y-3 font-serif text-sm text-text-primary">
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Type</span>
                  <span>{article.type}</span>
                </div>
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">DOI Reference</span>
                  <span className="font-mono text-xs text-text-primary/90">{article.doi}</span>
                </div>
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Page Range</span>
                  <span>pp. {article.pages}</span>
                </div>
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Published Date</span>
                  <span>{article.date_published}</span>
                </div>
              </div>
            </div>

            {/* Citation block */}
            <CitationBlock
              title={article.title}
              authors={article.authors}
              year={issue.year}
              volume={issue.volume}
              number={issue.number}
              pages={article.pages}
              doi={article.doi}
            />

          </aside>

        </div>
      </div>
    </div>
  );
}
