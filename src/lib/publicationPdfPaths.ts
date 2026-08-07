export type PublicationPdfKind = 'article' | 'issue' | 'volume';

export function publicationPdfHref(kind: PublicationPdfKind, id: number): string {
  return `/api/publications/${kind}/${id}/pdf`;
}
