export function normalizeDoi(value: string | null | undefined): string | null {
  const doi = (value ?? '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^(?:doi|do):\s*/i, '');

  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : null;
}

export function doiUrl(value: string | null | undefined): string | null {
  const doi = normalizeDoi(value);
  return doi ? `https://doi.org/${encodeURIComponent(doi).replace(/%2F/gi, '/')}` : null;
}
