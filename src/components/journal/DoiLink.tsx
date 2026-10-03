import { doiUrl } from '@/lib/doi';

export default function DoiLink({ doi, className }: { doi: string; className?: string }) {
  const url = doiUrl(doi);

  if (!url) {
    return <span className={className}>{doi || 'Pending'}</span>;
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {url}
    </a>
  );
}
