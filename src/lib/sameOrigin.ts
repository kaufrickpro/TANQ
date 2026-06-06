/**
 * Validates that the request has the same origin as the host.
 * Checks Origin and Referer headers against Host / X-Forwarded-Host.
 */
export function validateSameOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  // Only state-changing requests need same-origin validation
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return true;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  
  if (!host) return false;
  
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) return false;
    } catch {
      return false;
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost !== host) return false;
    } catch {
      return false;
    }
  } else {
    // Both origin and referer are missing
    return false;
  }
  
  return true;
}
