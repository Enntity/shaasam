import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { isValidApiKey } from '@/lib/api-key';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const MAX_SKILLS = 12;

export async function POST(request: Request) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const skills = Array.isArray(body?.skills)
      ? body.skills.map((skill: string) => String(skill).trim()).filter(Boolean).slice(0, MAX_SKILLS)
      : [];

    const skillsNormalized = skills.map((skill: string) => skill.toLowerCase());
    const doc = {
      title: body?.title ? String(body.title).slice(0, 120) : 'Help needed',
      description: body?.description ? String(body.description).slice(0, 2000) : '',
      skills,
      skillsNormalized,
      budget: body?.budget ? Number(body.budget) : null,
      callbackUrl: body?.callbackUrl ? String(body.callbackUrl).slice(0, 400) : null,
      requester: {
        name: body?.requester?.name ? String(body.requester.name).slice(0, 120) : null,
        org: body?.requester?.org ? String(body.requester.org).slice(0, 120) : null,
        email: body?.requester?.email ? String(body.requester.email).slice(0, 120) : null,
      },
      status: 'open',
      declinedBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDb();
    const result = await db.collection('requests').insertOne(doc);

    await recordAudit({
      action: 'request.create',
      actorType: 'agent',
      subjectType: 'request',
      subjectId: result.insertedId.toString(),
    });

    return NextResponse.json({ id: result.insertedId.toString(), status: doc.status });
  } catch (error) {
    console.error('Request create failed', error);
    return NextResponse.json({ error: 'Unable to create request.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);

  const db = await getDb();
  const query = status ? { status } : {};
  const results = await db
    .collection('requests')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({
    data: results.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      description: item.description,
      skills: item.skills,
      budget: item.budget,
      callbackUrl: item.callbackUrl,
      requester: item.requester,
      status: item.status,
      acceptedBy: item.acceptedBy ? item.acceptedBy.toString() : null,
      acceptedAt: item.acceptedAt || null,
      startedAt: item.startedAt || null,
      completedAt: item.completedAt || null,
      updatedAt: item.updatedAt || null,
      paymentId: item.paymentId ? item.paymentId.toString() : null,
      paymentStatus: item.paymentStatus || null,
      createdAt: item.createdAt,
    })),
    meta: { count: results.length },
  });
}
