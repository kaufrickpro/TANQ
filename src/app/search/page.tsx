import React from 'react';
import Link from 'next/link';
import db from '@/lib/db';
import { Search, FileText } from 'lucide-react';

interface Article {
  id: number;
  title: string;
  authors: string;
  abstract: string;
  doi: string;
  pages: string;
  pdf_url: string;
  type: string;
  date_published: string;
  volume: number;
  number: number;
}

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = '' } = await searchParams;
  let results: Article[] = [];
  const query = q.trim();

  if (query) {
    try {
      const pattern = `%${query}%`;
      const searchResult = await db`
        SELECT a.id, a.title, a.authors, a.abstract, a.doi, a.pages, a.pdf_url, a.type, a.date_published, i.volume, i.number
        FROM articles a
        JOIN issues i ON a.issue_id = i.id
        WHERE a.title ILIKE ${pattern} 
           OR a.authors ILIKE ${pattern} 
           OR a.abstract ILIKE ${pattern} 
           OR a.keywords ILIKE ${pattern}
        ORDER BY a.id ASC
      `;
      results = searchResult.rows as Article[];
    } catch (e) {
      console.error('Error executing search query:', e);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-page font-serif">
      {/* Charcoal Header Band */}
      <div className="w-full bg-bg-band text-text-on-dark py-4 text-center border-b border-border-custom font-lato">
        <span className="font-lato font-black text-xs uppercase tracking-[0.18em]">
          Search Articles
        </span>
      </div>

      {/* Main Content (Full Width) */}
      <div className="py-12 max-w-[1120px] mx-auto w-full px-6 sm:px-8 flex-1 space-y-8">
        
        {/* Search Input and Form */}
        <div className="bg-bg-card border border-border-custom p-8 shadow-sm">
          <form method="GET" action="/search" className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search by title, author, keyword, or abstract..."
              className="flex-1 bg-white border border-border-custom rounded-sm px-4 py-3 text-sm text-black placeholder-text-muted focus:outline-none focus:border-olive shadow-sm font-sans"
            />
            <button
              type="submit"
              className="bg-olive hover:bg-link-hover text-white font-sans font-bold text-xs uppercase tracking-[0.15em] px-8 py-3 rounded-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Search size={16} /> Search
            </button>
          </form>

          {/* Results Summary */}
          <div className="mt-4 font-sans text-xs uppercase tracking-wider text-text-muted">
            {query ? (
              <p>
                Found {results.length} result(s) for &ldquo;<span className="text-text-heading font-black">{query}</span>&rdquo;
              </p>
            ) : (
              <p>Enter search terms to search the journal index.</p>
            )}
          </div>
        </div>

        {/* Results List */}
        {results.length > 0 ? (
          <div className="space-y-6">
            {results.map((article) => (
              <div 
                key={article.id} 
                className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <span className="font-sans font-bold text-[9px] uppercase tracking-[0.15em] text-text-muted mb-2 block">
                  {article.type}
                </span>
                <h3 className="font-serif font-bold text-lg text-text-primary hover:text-link transition-colors mb-2">
                  <Link href={`/volume${article.volume}/issue${article.number}/article/${article.id}`}>{article.title}</Link>
                </h3>
                <p className="text-xs text-text-heading italic mb-4 font-serif">{article.authors}</p>
                <p className="text-sm text-text-primary/80 line-clamp-3 mb-4 leading-relaxed font-serif">
                  {article.abstract}
                </p>
                <div className="border-t border-border-light pt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                  <span className="min-w-0">Published: <span className="normal-case font-normal text-text-primary break-all">{article.date_published}</span></span>
                  <div className="flex gap-4 shrink-0">
                    <Link href={`/volume${article.volume}/issue${article.number}/article/${article.id}`} className="text-link hover:text-link-hover">Read</Link>
                    <a href={article.pdf_url} download className="text-link hover:text-link-hover whitespace-nowrap">PDF ↓</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : query ? (
          <div className="bg-bg-card border border-border-custom p-12 text-center space-y-4">
            <FileText className="mx-auto text-text-muted" size={40} />
            <h3 className="font-serif font-bold text-base text-text-heading">No matching articles found</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              Check spelling, try broader keywords, or search for different terms (e.g. &quot;Uganda&quot;, &quot;curriculum&quot;, &quot;internationalisation&quot;).
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
