import { describe, expect, it } from 'vitest';
import { createOtp, hashOtp, verifyOtp } from '@/lib/otp';

describe('otp', () => {
  it('creates numeric codes', () => {
    const code = createOtp();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d+$/);
  });

  it('verifies hash correctly', () => {
    const code = '123456';
    const { hash, salt } = hashOtp(code);
    expect(verifyOtp(code, hash, salt)).toBe(true);
    expect(verifyOtp('000000', hash, salt)).toBe(false);
  });
});
