import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { normalizePhone } from '@/lib/phone';
import { verifyOtp } from '@/lib/otp';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { checkOtp } from '@/lib/twilio';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = normalizePhone(body?.phone || '');
    const code = String(body?.code || '').trim();

    if (!phone || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    const db = await getDb();
    const verification = await db.collection('verifications').findOne({ phone });
    if (!verification) {
      return NextResponse.json({ error: 'Verification expired. Request a new code.' }, { status: 400 });
    }

    if (verification.attempts && verification.attempts >= 5) {
      await db.collection('verifications').deleteOne({ _id: verification._id });
      return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
    }

    if (verification.expiresAt && new Date(verification.expiresAt) < new Date()) {
      await db.collection('verifications').deleteOne({ _id: verification._id });
      return NextResponse.json({ error: 'Verification expired. Request a new code.' }, { status: 400 });
    }

    const useVerify = Boolean(process.env.TWILIO_VERIFY_SERVICE_SID);
    let isValid = false;
    if (verification.hash && verification.salt) {
      isValid = verifyOtp(code, verification.hash, verification.salt);
    } else if (useVerify) {
      const check = await checkOtp(phone, code);
      isValid = check.valid;
    }
    if (!isValid) {
      await db.collection('verifications').updateOne(
        { _id: verification._id },
        { $inc: { attempts: 1 } }
      );
      return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });
    }

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

    await db.collection('verifications').deleteOne({ _id: verification._id });

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

    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    console.error('OTP verify failed', error);
    return NextResponse.json({ error: 'Unable to verify code.' }, { status: 500 });
  }
}
