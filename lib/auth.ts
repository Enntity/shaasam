import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import { getDb } from './mongodb';

declare global {
  var __shaasamAuthWarned: boolean | undefined;
}

const cookieName = 'shaasam_session';
const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';

if (!process.env.AUTH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production.');
  }
  if (!global.__shaasamAuthWarned) {
    console.warn('AUTH_SECRET is not set. Using a dev fallback secret.');
    global.__shaasamAuthWarned = true;
  }
}

const secretKey = new TextEncoder().encode(secret);

export async function createSessionToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (!payload.sub) return null;
    const db = await getDb();
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(payload.sub) });
    if (!user) return null;
    return {
      id: user._id.toString(),
      phone: user.phone,
      email: user.email,
      displayName: user.displayName,
      headline: user.headline,
      bio: user.bio,
      skills: user.skills || [],
      categories: user.categories || [],
      hourlyRate: user.hourlyRate,
      location: user.location,
      availability: user.availability,
      stripeAccountId: user.stripeAccountId,
      reviewStatus: user.reviewStatus,
      status: user.status,
    } as const;
  } catch (error) {
    console.warn('Session verification failed', error);
    return null;
  }
}
