import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function readJson(request: Request): Promise<Record<string, any>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'JSON body required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new HttpError(413, 'Request body exceeds 16 KB.'); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON object.');
  }
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  // Provider errors can contain secrets and personal data. Keep them out of logs/responses.
  console.error('Operation failed', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({ error: 'Service temporarily unavailable. Retry the same operation.' }, { status: 503 });
}
export function textField(value: unknown, name: string, max: number, required = true): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, `Invalid ${name}.`);
  return value.trim();
}
export function siteOrigin(): string {
  const value = process.env.SITE_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  try {
    const url = new URL(value);
    if (url.username || url.password || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error();
    return url.origin;
  } catch { throw new HttpError(503, 'Site URL is not configured.'); }
}
