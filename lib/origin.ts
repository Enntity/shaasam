const LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function addOrigin(origins: Set<string>, value?: string | null) {
  if (!value) return;
  try {
    const url = new URL(value);
    origins.add(url.origin);
    return;
  } catch {
    // treat as bare domain
  }
  const trimmed = value.trim();
  if (!trimmed) return;
  origins.add(`https://${trimmed}`);
  origins.add(`https://www.${trimmed}`);
}

function getAllowedOrigins(request?: Request): Set<string> {
  const origins = new Set<string>(LOCAL_ORIGINS);
  addOrigin(origins, process.env.DOMAIN);
  addOrigin(origins, process.env.NEXT_PUBLIC_SITE_URL);
  addOrigin(origins, process.env.SITE_URL);
  if (request) {
    try {
      origins.add(new URL(request.url).origin);
    } catch {
      // ignore malformed URL
    }
  }
  return origins;
}

export function isAllowedOrigin(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const allowed = getAllowedOrigins(request);
  const origin = request.headers.get('origin');
  if (origin && allowed.has(origin)) {
    return true;
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allowed.has(refOrigin)) {
        return true;
      }
    } catch {
      // ignore invalid referer
    }
  }

  return false;
}
