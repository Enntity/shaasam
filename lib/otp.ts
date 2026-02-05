import crypto from 'crypto';

export function createOtp(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

export function hashOtp(code: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
  return { hash, salt };
}

export function verifyOtp(code: string, hash: string, salt: string) {
  const candidate = crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}
