import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAllowedOrigin } from '@/lib/origin';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  (await cookies()).delete('shaasam_session');
  return NextResponse.json({ ok: true });
}
