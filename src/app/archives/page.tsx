import React from 'react';
import Link from 'next/link';
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
            title: `African Nexus Quarterly, Volume ${issue.volume}`,
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
    .filter((group) => group.volume.pdf_url || group.issues.length > 0)
    .sort((a, b) => {
      if (b.volume.year !== a.volume.year) return b.volume.year - a.volume.year;
      return b.volume.volume - a.volume.volume;
    });

  const issueCount = archives.reduce((count, group) => count + group.issues.length, 0);

  if (archives.length === 0) {
    return (
      <div className="max-w-[1120px] mx-auto px-6 sm:px-8 py-20 text-center font-serif space-y-4 bg-bg-page flex-1 flex flex-col justify-center items-center">
        <Archive className="text-text-muted" size={48} />
        <h1 className="text-2xl font-bold text-text-heading">Archives Empty</h1>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          No volumes or past issues have been archived yet. Available volumes and published issues will appear here.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
          <div className="bg-bg-card border border-border-custom px-5 py-4 rounded-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Available Volumes</p>
            <p className="mt-1 text-2xl font-serif font-bold text-text-heading">{archives.length}</p>
          </div>
          <div className="bg-bg-card border border-border-custom px-5 py-4 rounded-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Available Issues</p>
            <p className="mt-1 text-2xl font-serif font-bold text-text-heading">{issueCount}</p>
          </div>
        </div>

        {archives.map(({ volume, issues }) => (
          <section key={`${volume.volume}-${volume.year}`} className="space-y-6">
            {/* Year / Volume Header */}
            <div className="border-b border-border-light pb-3 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
              <div>
                <h2 className="font-serif font-bold text-2xl text-text-heading">
                  {volume.title}
                </h2>
                <p className="mt-1 font-sans font-bold text-xs uppercase tracking-[0.12em] text-text-muted">
                  Volume {volume.volume} · {volume.year}
                  {volume.subtitle ? (
                    <span className="normal-case font-serif font-normal italic tracking-normal"> · {volume.subtitle}</span>
                  ) : null}
                </p>
              </div>
              {volume.pdf_url ? (
                <a
                  href={volume.pdf_url}
                  download
                  className="inline-flex items-center justify-center self-start sm:self-auto bg-olive hover:bg-link-hover text-white px-4 py-2 rounded-sm font-sans font-bold text-[10px] uppercase tracking-[0.14em] transition-colors"
                >
                  Download Volume PDF
                </a>
              ) : (
                <span className="font-sans text-[10px] text-text-muted/70 uppercase tracking-wider">Volume PDF pending</span>
              )}
            </div>

            {/* Issue Cards Grid */}
            {issues.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {issues.map(({ issue, articles }) => (
                  <div
                    id={`issue-${issue.id}`}
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
                        {articles.length > 0 ? (
                          <ul className="text-xs space-y-1.5 list-disc pl-4 font-serif text-text-primary/90">
                            {articles.map((article) => (
                              <li key={article.id} className="leading-snug">
                                <Link href={`/article/${article.id}`} className="hover:underline hover:text-link">
                                  {article.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs font-serif text-text-muted">Article records pending.</p>
                        )}
                      </div>
                    </div>

                    {/* Actions footer of issue card */}
                    <div className="border-t border-border-light mt-5 pt-3 flex items-center justify-between gap-3 font-sans font-bold text-[10px] uppercase tracking-wider text-text-muted">
                      <span>Issue available</span>
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
            ) : (
              <div className="bg-bg-card border border-border-custom px-6 py-8 rounded-sm text-center">
                <p className="font-serif text-sm text-text-primary">This volume is available.</p>
                <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  Published issue records will appear here when attached.
                </p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
