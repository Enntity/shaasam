import { NextResponse } from 'next/server';
import { SKILL_OPTIONS } from '@/lib/skills';
export function GET() { return NextResponse.json({ data: SKILL_OPTIONS.map(({ id, label }) => ({ id, label })) }); }
