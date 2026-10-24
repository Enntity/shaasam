import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { configurationErrors } from '@/lib/readiness';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    if (configurationErrors().length) return NextResponse.json({ ok: false }, { status: 503 });
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
