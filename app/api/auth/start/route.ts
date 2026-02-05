import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { createOtp, hashOtp } from '@/lib/otp';
import { normalizePhone } from '@/lib/phone';
import { sendOtp } from '@/lib/twilio';
import { recordAudit } from '@/lib/audit';
import { isAllowedOrigin } from '@/lib/origin';

export const runtime = 'nodejs';

const RESEND_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const phone = normalizePhone(body?.phone || '');
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.collection('verifications').findOne({ phone });
    if (existing?.createdAt) {
      const createdAt = new Date(existing.createdAt).getTime();
      if (Date.now() - createdAt < RESEND_WINDOW_MS) {
        return NextResponse.json(
          { error: 'Please wait a moment before requesting another code.' },
          { status: 429 }
        );
      }
    }
    const useVerify = Boolean(process.env.TWILIO_VERIFY_SERVICE_SID);
    const code = useVerify ? undefined : createOtp();
    const hashed = code ? hashOtp(code) : null;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.collection('verifications').deleteMany({ phone });
    await db.collection('verifications').insertOne({
      phone,
      ...(hashed ? { hash: hashed.hash, salt: hashed.salt } : {}),
      expiresAt,
      createdAt: new Date(),
      attempts: 0,
      provider: useVerify ? 'verify' : 'sms',
    });

    const sendResult = await sendOtp(phone, code);

    await recordAudit({
      action: 'auth.otp.start',
      actorType: 'human',
      subjectType: 'user',
      subjectId: phone,
      meta: {
        simulated: sendResult.simulated,
      },
    });

    const response: Record<string, string> = {
      message: sendResult.simulated
        ? 'Dev mode: check server logs for the code.'
        : 'Verification code sent.',
    };

    if (sendResult.simulated && code && process.env.NODE_ENV !== 'production') {
      response.devCode = code;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('OTP start failed', error);
    return NextResponse.json({ error: 'Unable to send code.' }, { status: 500 });
  }
}
