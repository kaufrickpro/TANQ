import { notFound, permanentRedirect } from 'next/navigation';
import db from '@/lib/db';

interface Article {
  id: number;
  issue_id: number;
}

interface Issue {
  id: number;
  volume: number;
  number: number;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 60; // Revalidate every minute

export default async function ArticleRedirectPage({ params }: PageProps) {
  const { id } = await params;
  let article: Article | null = null;
  let issue: Issue | null = null;

  try {
    const articleResult = await db`SELECT id, issue_id FROM articles WHERE id = ${id}`;
    article = (articleResult.rows[0] as Article) || null;

    if (article) {
      const issueResult = await db`SELECT volume, number FROM issues WHERE id = ${article.issue_id}`;
      issue = (issueResult.rows[0] as Issue) || null;
    }
  } catch (e) {
    console.error('Error fetching article or issue for redirect:', e);
  }

  if (!article || !issue) {
    notFound();
  }

  // Canonical redirection
  permanentRedirect(`/volume${issue.volume}/issue${issue.number}/article/${article.id}`);
}
