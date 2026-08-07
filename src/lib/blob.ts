import * as realBlob from '@vercel/blob';

const isTest = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
const hasToken = typeof process !== 'undefined' && process.env && !!process.env.BLOB_READ_WRITE_TOKEN;
const shouldUseReal = isTest || hasToken;

export async function put(
  pathname: string,
  body: any,
  options?: any
): Promise<any> {
  if (shouldUseReal) {
    return realBlob.put(pathname, body, options);
  }

  // Mock fallback for local development when BLOB_READ_WRITE_TOKEN is missing
  console.log(`[Mock Blob] put called for pathname: ${pathname}`);
  const uuid = Math.random().toString(36).substring(2, 15);
  const mockUrl = `https://blob-mock.example.com/${pathname}`;

  return {
    url: mockUrl,
    downloadUrl: mockUrl,
    pathname: pathname,
    contentType: options?.contentType || 'application/octet-stream',
    size: body instanceof Buffer ? body.length : 0,
    uploadedAt: new Date(),
    etag: `mock-etag-${uuid}`,
  };
}

export async function del(url: string | string[], options?: any): Promise<void> {
  if (shouldUseReal) {
    return realBlob.del(url, options);
  }
  console.log(`[Mock Blob] del called for url: ${url}`);
  return;
}

export async function get(url: string, options?: any): Promise<any> {
  if (shouldUseReal) {
    return realBlob.get(url, options);
  }
  console.log(`[Mock Blob] get called for url: ${url}`);

  const body = new Blob(['Mock file content for development QA.'], {
    type: 'application/pdf',
  });

  return {
    statusCode: 200,
    stream: body.stream(),
    headers: new Headers({ 'Content-Type': body.type }),
    blob: {
      url,
      downloadUrl: url,
      pathname: new URL(url).pathname.slice(1),
      contentType: body.type,
      contentDisposition: 'attachment',
      cacheControl: 'public, max-age=60',
      size: body.size,
      uploadedAt: new Date(),
      etag: 'mock-get-etag',
    },
  };
}

export async function head(url: string, options?: any): Promise<any> {
  if (shouldUseReal) {
    return realBlob.head(url, options);
  }
  console.log(`[Mock Blob] head called for url: ${url}`);
  return {
    url,
    pathname: url,
    size: 1024,
    contentType: 'application/pdf',
    uploadedAt: new Date(),
  };
}
