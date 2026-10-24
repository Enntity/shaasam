import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { normalizePhone } from '@/lib/phone';
import { verifyOtp } from '@/lib/otp';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { checkOtp } from '@/lib/twilio';
import { isAllowedOrigin } from '@/lib/origin';
import { readJson, failure } from '@/lib/http';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Rate limit: 10 OTP verify attempts per minute per IP
  const rateLimitResult = await checkRateLimit(request, {
    limit: 10,
    window: 60 * 1000,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many verify attempts. Please try again later.' },
      {
        status: 429,
        headers: getRateLimitHeaders(rateLimitResult),
      }
    );
  }

  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await readJson(request);
    const phone = normalizePhone(body?.phone || '');
    const code = String(body?.code || '').trim();

    if (!phone || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    const db = await getDb();
    const verification = await db.collection('verifications').findOneAndUpdate({
      phone, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() },
    }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (!verification) return NextResponse.json({ error: 'Code expired or attempts exhausted. Request a new code.' }, { status: 400 });

    const useVerify = Boolean(process.env.TWILIO_VERIFY_SERVICE_SID);
    let isValid = false;
    if (process.env.NODE_ENV === 'production') {
      const check = await checkOtp(phone, code);
      isValid = check.valid;
    } else if (verification.hash && verification.salt) {
      isValid = verifyOtp(code, verification.hash, verification.salt);
    } else if (useVerify) {
      const check = await checkOtp(phone, code);
      isValid = check.valid;
    }
    if (!isValid) {
      return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });
    }

    // Only one concurrent verification may consume this challenge and issue a session.
    const consumed = await db.collection('verifications').deleteOne({ _id: verification._id, createdAt: verification.createdAt });
    if (!consumed.deletedCount) return NextResponse.json({ error: 'Code already used. Request a new code.' }, { status: 409 });
    const now = new Date();
    const upsert = await db.collection('users').findOneAndUpdate(
      { phone },
      {
        $setOnInsert: {
          createdAt: now,
          reviewStatus: 'pending',
          status: 'active',
        },
        $set: {
          phone,
          verified: true,
          verifiedAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );


    const userDoc = (upsert && 'value' in upsert ? upsert.value : upsert) as
      | { _id?: ObjectId }
      | null;

    if (!userDoc?._id) {
      return NextResponse.json({ error: 'User record missing.' }, { status: 500 });
    }

    const userId = userDoc._id.toString();
    const token = await createSessionToken(userId);
    await setSessionCookie(token);

    await recordAudit({
      action: 'auth.otp.verify',
      actorType: 'human',
      actorId: userId,
      subjectType: 'user',
      subjectId: userId,
      meta: {
        verified: true,
      },
    });

    return NextResponse.json(
      { ok: true, userId },
      {
        headers: getRateLimitHeaders(rateLimitResult),
      }
    );
  } catch (error) {
    return failure(error);
  }
}
