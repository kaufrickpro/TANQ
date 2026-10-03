import { describe, expect, it } from 'vitest';
import { doiUrl, normalizeDoi } from '@/lib/doi';

describe('DOI links', () => {
  it('normalizes the published Issue 2 typo and existing DOI URLs', () => {
    expect(normalizeDoi('do:10.5281/zenodo.22286685')).toBe('10.5281/zenodo.22286685');
    expect(doiUrl('https://doi.org/10.5281/zenodo.22286685')).toBe('https://doi.org/10.5281/zenodo.22286685');
  });

  it('does not turn blank or malformed DOI values into links', () => {
    expect(doiUrl('')).toBeNull();
    expect(doiUrl('not-a-doi')).toBeNull();
  });

  it('keeps DOI punctuation inside the resolver path', () => {
    expect(doiUrl('10.1234/a?b#c')).toBe('https://doi.org/10.1234/a%3Fb%23c');
  });
});
