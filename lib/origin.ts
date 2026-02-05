const LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>(LOCAL_ORIGINS);
  const domain = process.env.DOMAIN;
  if (domain) {
    origins.add(`https://${domain}`);
    origins.add(`https://www.${domain}`);
  }
  return origins;
}

export function isAllowedOrigin(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const allowed = getAllowedOrigins();
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
