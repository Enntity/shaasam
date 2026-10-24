export function isAllowedOrigin(request: Request): boolean {
  const allowed = new Set<string>();
  for (const value of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.DOMAIN ? `https://${process.env.DOMAIN}` : undefined]) {
    if (value) { try { allowed.add(new URL(value).origin); } catch { /* invalid config fails closed */ } }
  }
  if (process.env.NODE_ENV !== 'production') {
    allowed.add(new URL(request.url).origin);
    if (!request.headers.has('origin') && !request.headers.has('referer')) return true;
  }
  // An explicit hostile Origin cannot be overridden by a good Referer.
  const origin = request.headers.get('origin');
  if (origin !== null) return allowed.has(origin);
  try { return allowed.has(new URL(request.headers.get('referer') || '').origin); } catch { return false; }
}
