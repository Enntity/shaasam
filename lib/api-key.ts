export function isValidApiKey(request: Request): boolean {
  const expected = process.env.SHAASAM_API_KEY;
  if (!expected) {
    return true;
  }
  const headerKey = request.headers.get('x-api-key');
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : null;
  const provided = headerKey || token;
  return provided === expected;
}
