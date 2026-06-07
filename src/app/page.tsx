import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import db from '@/lib/db';
import JournalCover from '@/components/journal/JournalCover';

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
}

export const revalidate = 60; // Revalidate every minute

export default async function Home() {
  // Query articles from seeded database
  let articles: Article[] = [];
  try {
    const articlesResult = await db`
      SELECT id, title, authors, abstract, doi, pages, pdf_url, type, date_published 
      FROM articles 
      ORDER BY id ASC
    `;
    articles = articlesResult.rows as Article[];
  } catch (e) {
    console.error('Error fetching articles for home page:', e);
  }

  // Group by Editorial and Research Articles
  const editorials = articles.filter(a => a.type === 'Editorial');
  const researchArticles = articles.filter(a => a.type === 'Research Article');

  const indexingPartners = [
    { name: 'Google Scholar', status: 'Inclusion Pending' },
    { name: 'Crossref (DOIs)', status: 'Active Integration' },
    { name: 'TR Dizin', status: 'Evaluating' },
    { name: 'Scopus', status: 'Pre-evaluating' },
    { name: 'DOAJ', status: 'Diamond OA' }
  ];

  return (
    <div className="flex-1 flex flex-col bg-bg-page font-serif">
      {/* Hero section */}
      <section className="bg-bg-page text-text-primary pt-12 pb-12">
        <div className="max-w-[1120px] mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
            {/* Left Column: Text Content */}
            <div className="md:col-span-8 space-y-5 text-left">
              <span className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-text-heading block">
                The African Nexus Quarterly
              </span>
              <h1 className="text-5xl sm:text-6xl font-serif text-text-heading tracking-tight leading-none">
                TANQ
              </h1>
              <p className="text-sm sm:text-base text-text-primary/95 leading-relaxed font-serif max-w-[62ch]">
                An interdisciplinary, peer-reviewed international academic journal dedicated to expanding knowledge democracy, structural curriculum transformations, and developmental partnerships concerning the African continent.
              </p>
              
              <div className="flex flex-col sm:flex-row justify-start gap-4 pt-4">
                <Link 
                  href="/about/submissions" 
                  className="bg-olive hover:bg-link-hover text-white font-sans font-bold text-xs uppercase tracking-[0.15em] px-6 py-3 rounded-sm transition-colors cursor-pointer shadow-sm text-center"
                >
                  Submit Manuscript
                </Link>
                <Link 
                  href="/current" 
                  className="border-1.5 border-olive text-olive hover:bg-olive/5 font-sans font-bold text-xs uppercase tracking-[0.15em] px-6 py-3 rounded-sm transition-colors cursor-pointer text-center"
                >
                  Current Issue
                </Link>
              </div>
            </div>

            {/* Right Column: Current Issue Cover */}
            <div className="md:col-span-4 flex justify-center md:justify-end">
              <JournalCover size="md" priority />
            </div>
          </div>
        </div>
      </section>

      {/* Charcoal Disciplines Band */}
      <div className="w-full bg-bg-band text-text-on-dark py-4 px-6 text-center border-y border-border-custom font-lato">
        <span className="font-lato font-black text-[10px] sm:text-xs uppercase tracking-[0.18em] whitespace-normal break-words inline-block leading-relaxed max-w-full">
          Politics · Economics · Social · Environment · Education · Technology · Public Health
        </span>
      </div>

      {/* Main Grid Content */}
      <section className="py-12 max-w-[1120px] mx-auto w-full px-6 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start">
          
          {/* Main Content Area: Articles */}
          <div className="lg:col-span-8 space-y-10">
            
            {/* Editorials */}
            {editorials.length > 0 && (
              <div>
                <h2 className="font-serif font-bold text-lg text-text-heading border-b border-border-light pb-2 mb-6 uppercase tracking-wider">
                  Editorial
                </h2>
                <div className="space-y-6">
                  {editorials.map(article => (
                    <div 
                      key={article.id} 
                      className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md transition-all duration-200 cursor-pointer"
                    >
                      <span className="font-sans font-bold text-[9px] uppercase tracking-[0.15em] text-text-muted mb-2 block">
                        {article.type}
                      </span>
                      <h3 className="font-serif font-bold text-lg text-text-primary hover:text-link transition-colors mb-2">
                        <Link href={`/article/${article.id}`}>{article.title}</Link>
                      </h3>
                      <p className="text-xs text-text-heading italic mb-4 font-serif">{article.authors}</p>
                      <p className="text-sm text-text-primary/80 line-clamp-3 mb-4 leading-relaxed font-serif">
                        {article.abstract}
                      </p>
                      <div className="border-t border-border-light pt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                        <span className="min-w-0">DOI: <span className="normal-case font-normal text-text-primary break-all">{article.doi}</span></span>
                        <div className="flex gap-4 shrink-0">
                          <Link href={`/article/${article.id}`} className="text-link hover:text-link-hover">Read</Link>
                          <a href={article.pdf_url} download className="text-link hover:text-link-hover whitespace-nowrap">PDF ↓</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Research Articles List */}
            {researchArticles.length > 0 && (
              <div className="space-y-6">
                <h2 className="font-serif font-bold text-lg text-text-heading border-b border-border-light pb-2 mb-6 uppercase tracking-wider">
                  Research Articles
                </h2>
                <div className="space-y-6">
                  {researchArticles.map(article => (
                    <div 
                      key={article.id} 
                      className="bg-bg-card border border-border-custom p-6 border-l-4 border-l-olive hover:shadow-md transition-all duration-200 cursor-pointer"
                    >
                      <span className="font-sans font-bold text-[9px] uppercase tracking-[0.15em] text-text-muted mb-2 block">
                        {article.type}
                      </span>
                      <h3 className="font-serif font-bold text-lg text-text-primary hover:text-link transition-colors mb-2">
                        <Link href={`/article/${article.id}`}>{article.title}</Link>
                      </h3>
                      <p className="text-xs text-text-heading italic mb-4 font-serif">{article.authors}</p>
                      <p className="text-sm text-text-primary/80 line-clamp-3 mb-4 leading-relaxed font-serif">
                        {article.abstract}
                      </p>
                      <div className="border-t border-border-light pt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-sans font-bold uppercase tracking-wider text-text-muted">
                        <span className="min-w-0">DOI: <span className="normal-case font-normal text-text-primary break-all">{article.doi}</span></span>
                        <div className="flex gap-4 shrink-0">
                          <Link href={`/article/${article.id}`} className="text-link hover:text-link-hover">Read</Link>
                          <a href={article.pdf_url} download className="text-link hover:text-link-hover whitespace-nowrap">PDF ↓</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-8">
            
            {/* Call for Papers */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Call for Papers
              </h3>
              <p className="text-xs text-text-primary/80 leading-relaxed font-serif mb-4">
                We invite researchers, educators, and policy experts to submit original research papers, book reviews, and commentaries for upcoming issues. All articles are published under **Diamond Open Access** (no APCs, no submission fees).
              </p>
              <ul className="text-[11px] text-text-muted space-y-2 list-disc pl-4 mb-5 font-serif">
                <li>Double-blind peer-review</li>
                <li>Rigorous evaluation (2-3 reviewers)</li>
                <li>Fast-track publication</li>
                <li>Compliant with TR Dizin & Scopus</li>
              </ul>
              <Link 
                href="/about/submissions" 
                className="block text-center bg-olive hover:bg-link-hover text-white py-3 rounded-sm font-sans font-bold text-xs uppercase tracking-[0.12em] transition-colors shadow-sm cursor-pointer"
              >
                Submissions Portal
              </Link>
            </div>

            {/* Indexing status box */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Indexing & Abstracting
              </h3>
              <p className="text-xs text-text-muted leading-relaxed font-serif mb-4">
                TANQ is actively aligning with global standards to seek indexing in core reference databases post-launch.
              </p>
              <div className="space-y-3 pt-2">
                {indexingPartners.map(idx => (
                  <div key={idx.name} className="flex justify-between items-center text-xs">
                    <span className="font-bold text-text-primary">{idx.name}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded-sm font-sans font-bold uppercase tracking-wider border ${
                      idx.status.includes('Active') 
                        ? 'bg-olive text-white border-olive' 
                        : idx.status.includes('Diamond') 
                          ? 'bg-sand text-olive border-border-custom'
                          : 'bg-white text-text-muted border-border-light'
                    }`}>
                      {idx.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Publisher information */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                About Publisher
              </h3>
              <p className="text-xs text-text-primary/85 leading-relaxed font-serif mb-4">
                Published by **Okul Yöneticileri Derneği** (School Administrators Association), a leading Türkiye-based sivil toplum kuruluşu (NGO) promoting educational governance and leadership research since 2012.
              </p>
              <a 
                href="http://okulyoneticileri.org.tr" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-link hover:text-link-hover font-bold text-xs uppercase tracking-wider block"
              >
                Publisher Website &rarr;
              </a>
            </div>

          </aside>

        </div>
      </section>
    </div>
  );
}
