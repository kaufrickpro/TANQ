import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import db from '@/lib/db';
import { Book } from 'lucide-react';

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

      {/* Main Grid Layout */}
      <div className="py-12 max-w-[1120px] mx-auto w-full px-6 sm:px-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start">
          
          {/* Left Column: Cover and Articles (8 cols) */}
          <main className="lg:col-span-8 space-y-10">
            {/* Cover Image Container */}
            <div className="flex justify-center bg-bg-card border border-border-custom p-8 shadow-sm">
              <div className="relative w-56 sm:w-64 aspect-[3/4] shadow-md border border-border-custom overflow-hidden">
                <Image 
                  src="/images/TANQ.png" 
                  alt="Current Issue Cover" 
                  fill 
                  className="object-cover" 
                  priority
                />
              </div>
            </div>

            {/* Table of contents */}
            <div className="space-y-8">
              <h2 className="text-xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wider">
                Table of Contents
              </h2>

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
                        className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md transition-all duration-200 cursor-pointer"
                      >
                        <h4 className="font-serif font-bold text-base text-text-primary hover:text-link transition-colors mb-2">
                          <Link href={`/article/${article.id}`}>{article.title}</Link>
                        </h4>
                        <p className="text-xs text-text-heading italic mb-4 font-serif">{article.authors}</p>
                        <div className="border-t border-border-light pt-3 flex items-center justify-between text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                          <div className="flex gap-4">
                            <span>DOI: <span className="normal-case font-normal text-text-primary">{article.doi}</span></span>
                            <span>Pages: <span className="normal-case font-normal text-text-primary">{article.pages}</span></span>
                          </div>
                          <div className="flex gap-4">
                            <Link href={`/article/${article.id}`} className="text-link hover:text-link-hover">Abstract</Link>
                            <a href={article.pdf_url} download className="text-link hover:text-link-hover">PDF ↓</a>
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
                        className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md transition-all duration-200 cursor-pointer"
                      >
                        <h4 className="font-serif font-bold text-base text-text-primary hover:text-link transition-colors mb-2">
                          <Link href={`/article/${article.id}`}>{article.title}</Link>
                        </h4>
                        <p className="text-xs text-text-heading italic mb-4 font-serif">{article.authors}</p>
                        <div className="border-t border-border-light pt-3 flex items-center justify-between text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                          <div className="flex gap-4">
                            <span>DOI: <span className="normal-case font-normal text-text-primary">{article.doi}</span></span>
                            <span>Pages: <span className="normal-case font-normal text-text-primary">{article.pages}</span></span>
                          </div>
                          <div className="flex gap-4">
                            <Link href={`/article/${article.id}`} className="text-link hover:text-link-hover">Abstract</Link>
                            <a href={article.pdf_url} download className="text-link hover:text-link-hover">PDF ↓</a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Right Column: Details & Sidebar (4 cols) */}
          <aside className="lg:col-span-4 space-y-8">
            
            {/* Issue Details Card */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Issue Details
              </h3>
              <div className="space-y-3 font-serif text-sm text-text-primary">
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Title</span>
                  <span>{issue.title}</span>
                </div>
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Published</span>
                  <span>{issue.month} {issue.year}</span>
                </div>
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Volume / Issue</span>
                  <span>Volume {issue.volume}, No. {issue.number}</span>
                </div>
                <div>
                  <span className="font-bold text-xs font-sans uppercase tracking-wider block text-text-muted">Total Articles</span>
                  <span>{articles.length} article{articles.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            </div>

            {/* Download Issue PDF */}
            {issue.issue_pdf_url && (
              <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
                <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                  Full Issue Download
                </h3>
                <p className="text-xs text-text-muted leading-relaxed font-serif mb-4">
                  Download the complete collection of articles from this issue compiled into a single publication volume.
                </p>
                <a
                  href={issue.issue_pdf_url}
                  download
                  className="block text-center bg-olive hover:bg-link-hover text-white py-3 rounded-sm font-sans font-bold text-xs uppercase tracking-[0.12em] transition-colors shadow-sm cursor-pointer"
                >
                  Download Full PDF
                </a>
              </div>
            )}
            
          </aside>

        </div>
      </div>
    </div>
  );
}
