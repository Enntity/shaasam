import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getSessionUser } from '@/lib/auth';
import { normalizeAlias, validateAlias } from '@/lib/alias';
import { isAllowedOrigin } from '@/lib/origin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const aliasParam = url.searchParams.get('alias') || '';
  const validation = validateAlias(aliasParam);
  if (!validation.valid || !validation.normalized) {
    return NextResponse.json(
      { available: false, reason: validation.reason || 'Alias is invalid.' },
      { status: 200 }
    );
  }

  const session = await getSessionUser();
  const sessionAlias = session?.alias ? normalizeAlias(session.alias) : null;
  if (sessionAlias && validation.normalized === sessionAlias) {
    return NextResponse.json({ available: true, alias: validation.normalized });
  }

  const db = await getDb();
  const existing = await db.collection('users').findOne({
    aliasNormalized: validation.normalized,
  });

  return NextResponse.json({
    available: !existing,
    alias: validation.normalized,
    reason: existing ? 'Alias already taken.' : undefined,
  });
}
