import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { createOtp, hashOtp } from '@/lib/otp';
import { normalizePhone } from '@/lib/phone';
import { sendOtp } from '@/lib/twilio';
import { recordAudit } from '@/lib/audit';
import { isAllowedOrigin } from '@/lib/origin';
import { checkApiKeyRateLimit } from '@/lib/api-key-rate-limit';
import { readJson, failure } from '@/lib/http';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RESEND_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  // Rate limit: 5 OTP requests per minute per IP
  const rateLimitResult = await checkRateLimit(request, {
    limit: 5,
    window: 60 * 1000,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please try again later.' },
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
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }

    const db = await getDb();
    const quota = await checkApiKeyRateLimit(`otp-phone:${phone}`, { limit: 5, window: 3600000 });
    if (!quota.allowed) return NextResponse.json({ error: 'Too many codes requested. Try again later.' }, { status: 429 });
    const useVerify = process.env.NODE_ENV === 'production' || Boolean(process.env.TWILIO_VERIFY_SERVICE_SID);
    const code = useVerify ? undefined : createOtp();
    const hashed = code ? hashOtp(code) : null;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
      await db.collection('verifications').updateOne({ phone, $or: [
        { createdAt: { $lte: new Date(Date.now() - RESEND_WINDOW_MS) } }, { createdAt: { $exists: false } },
      ] }, { $set: {
        phone, ...(hashed ? { hash: hashed.hash, salt: hashed.salt } : {}), expiresAt,
        createdAt: new Date(), attempts: 0, provider: useVerify ? 'verify' : 'sms',
      } }, { upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return NextResponse.json({ error: 'Wait one minute before requesting another code.' }, { status: 429 });
      throw error;
    }

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

    return NextResponse.json(response, {
      headers: getRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    return failure(error);
  }
}
