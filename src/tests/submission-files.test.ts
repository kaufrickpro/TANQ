import { describe, expect, it } from 'vitest';
import {
  buildSubmissionUploadPath,
  isCanonicalSubmissionUploadPath,
} from '@/lib/submissionFiles';

describe('submission upload paths', () => {
  const upload = {
    publicId: 'b47111ed-5b05-4a36-bf4a-fdc71b257019',
    kind: 'manuscript' as const,
    uploadId: '00000000-0000-4000-8000-000000000001',
    originalFilename: 'anonymous manuscript.docx',
  };

  it('builds and accepts the canonical path bound to a draft, kind, UUID, and safe filename', () => {
    const pathname = buildSubmissionUploadPath(upload);

    expect(pathname).toBe(
      'manuscripts/b47111ed-5b05-4a36-bf4a-fdc71b257019/manuscript/' +
      '00000000-0000-4000-8000-000000000001-anonymous_manuscript.docx',
    );
    expect(isCanonicalSubmissionUploadPath({ ...upload, pathname })).toBe(true);
  });

  it('rejects a path bound to another draft or a malformed upload identifier', () => {
    const pathname = buildSubmissionUploadPath(upload);

    expect(isCanonicalSubmissionUploadPath({
      ...upload,
      publicId: 'another-draft',
      pathname,
    })).toBe(false);
    expect(isCanonicalSubmissionUploadPath({
      ...upload,
      pathname: pathname.replace(upload.uploadId, 'not-a-uuid'),
    })).toBe(false);
  });
});
