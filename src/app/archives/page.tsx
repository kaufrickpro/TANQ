import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import db from '@/lib/db';
import { Archive } from 'lucide-react';
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

interface JournalVolume {
  id: number;
  volume: number;
  year: number;
  title: string;
  subtitle: string | null;
  pdf_url: string | null;
}

interface Article {
  id: number;
  issue_id: number;
  title: string;
  authors: string;
  doi: string;
  pages: string;
  pdf_url: string;
  type: string;
}

interface IssueWithArticles {
  issue: Issue;
  articles: Article[];
}

interface VolumeGroup {
  volume: JournalVolume;
  issues: IssueWithArticles[];
}

export const revalidate = 60; // Revalidate every minute

export default async function ArchivesPage() {
  const volumeGroups = new Map<string, VolumeGroup>();

  try {
    const volumesResult = await db`
      SELECT * FROM journal_volumes
      ORDER BY year DESC, volume DESC
    `;
    const volumes = volumesResult.rows as JournalVolume[];

    for (const volume of volumes) {
      volumeGroups.set(`${volume.volume}-${volume.year}`, {
        volume,
        issues: []
      });
    }

    const issuesResult = await db`
      SELECT * FROM issues 
      WHERE is_published = 1 
      ORDER BY year DESC, volume DESC, number DESC
    `;
    const issues = issuesResult.rows as Issue[];

    for (const issue of issues) {
      const articlesResult = await db`
        SELECT id, issue_id, title, authors, doi, pages, pdf_url, type 
        FROM articles 
        WHERE issue_id = ${issue.id} 
        ORDER BY id ASC
      `;
      const articles = articlesResult.rows as Article[];

      const key = `${issue.volume}-${issue.year}`;
      if (!volumeGroups.has(key)) {
        volumeGroups.set(key, {
          volume: {
            id: 0,
            volume: issue.volume,
            year: issue.year,
            title: `The African Nexus Quarterly, Volume ${issue.volume}`,
            subtitle: null,
            pdf_url: null
          },
          issues: []
        });
      }

      volumeGroups.get(key)?.issues.push({ issue, articles });
    }
  } catch (e) {
    console.error('Error fetching archives:', e);
  }

  const archives = Array.from(volumeGroups.values())
    .filter((group) => group.issues.length > 0)
    .sort((a, b) => {
      if (b.volume.year !== a.volume.year) return b.volume.year - a.volume.year;
      return b.volume.volume - a.volume.volume;
    });

  if (archives.length === 0) {
    return (
      <div className="max-w-[1120px] mx-auto px-6 sm:px-8 py-20 text-center font-serif space-y-4 bg-bg-page flex-1 flex flex-col justify-center items-center">
        <Archive className="text-text-muted" size={48} />
        <h1 className="text-2xl font-bold text-text-heading">Archives Empty</h1>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          No past issues have been archived yet. All published issues will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-page font-serif">
      {/* Charcoal Header Band */}
      <div className="w-full bg-bg-band text-text-on-dark py-4 text-center border-b border-border-custom font-lato">
        <span className="font-lato font-black text-xs uppercase tracking-[0.18em]">
          Journal Archives
        </span>
      </div>

      {/* Main Content Area */}
      <div className="py-12 max-w-[1120px] mx-auto w-full px-6 sm:px-8 flex-1 space-y-12">
        {archives.map(({ volume, issues }) => (
          <section key={`${volume.volume}-${volume.year}`} className="space-y-6">
            {/* Year / Volume Header */}
            <div className="border-b border-border-light pb-2 flex justify-between items-baseline">
              <h2 className="font-serif font-bold text-2xl text-text-heading">
                {volume.year}
              </h2>
              <span className="font-sans font-bold text-xs uppercase tracking-[0.12em] text-text-muted">
                Volume {volume.volume}
              </span>
            </div>

            {/* Issue Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {issues.map(({ issue, articles }) => (
                <div 
                  key={issue.id} 
                  className="bg-bg-card border border-border-custom p-6 shadow-sm flex flex-col h-full hover:shadow-md transition-shadow duration-200"
                >
                  {/* Issue Cover Thumbnail */}
                  <div className="flex justify-center mb-4">
                    <JournalCover size="sm" />
                  </div>

                  {/* Issue Info */}
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-serif font-bold text-base text-text-primary leading-tight">
                      {issue.title}
                    </h3>
                    <div className="font-sans font-bold text-[10px] uppercase tracking-wider text-text-muted">
                      Vol. {issue.volume}, No. {issue.number} · {issue.month} {issue.year}
                    </div>
                    <div className="pt-2">
                      <span className="font-sans font-bold text-[9px] uppercase tracking-wider block text-text-muted mb-1">
                        Articles in this issue ({articles.length})
                      </span>
                      <ul className="text-xs space-y-1.5 list-disc pl-4 font-serif text-text-primary/90">
                        {articles.map((article) => (
                          <li key={article.id} className="leading-snug">
                            <Link href={`/article/${article.id}`} className="hover:underline hover:text-link">
                              {article.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Actions footer of issue card */}
                  <div className="border-t border-border-light mt-5 pt-3 flex items-center justify-between font-sans font-bold text-[10px] uppercase tracking-wider text-text-muted">
                    <Link href="/current" className="text-link hover:text-link-hover">
                      View Issue &rarr;
                    </Link>
                    {issue.issue_pdf_url ? (
                      <a href={issue.issue_pdf_url} download className="text-link hover:text-link-hover">
                        Download PDF ↓
                      </a>
                    ) : (
                      <span className="normal-case font-normal text-text-muted/60">PDF pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
