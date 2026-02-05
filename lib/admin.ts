export function isValidAdminKey(request: Request): boolean {
  const expected = process.env.SHAASAM_ADMIN_KEY;
  if (!expected) {
    return false;
  }
  const headerKey = request.headers.get('x-admin-key');
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : null;
  const provided = headerKey || token;
  return provided === expected;
}
