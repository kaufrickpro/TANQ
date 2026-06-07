/**
 * Safely parse a Response body as JSON.
 * Consumes the response stream as text first, then attempts to parse it.
 * This avoids stream-already-read errors if JSON parsing fails and we need to fall back to raw text.
 */
export async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text || res.statusText || 'Response parse failed' };
    }
  } catch {
    return { error: res.statusText || 'Network request failed' };
  }
}
