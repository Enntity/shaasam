import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(), check: vi.fn(), messages: vi.fn(), services: vi.fn(),
}));
vi.mock('twilio', () => ({ default: vi.fn(function () {
  return { verify: { v2: { services: mocks.services } }, messages: { create: mocks.messages } };
}) }));
import twilio from 'twilio';
import { checkOtp, sendOtp } from '@/lib/twilio';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID',
    'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID', 'TWILIO_FROM']) vi.stubEnv(key, '');
  vi.stubEnv('NODE_ENV', 'production');
  mocks.services.mockReturnValue({ verifications: { create: mocks.send }, verificationChecks: { create: mocks.check } });
  mocks.send.mockResolvedValue({ status: 'pending' });
  mocks.check.mockResolvedValue({ status: 'approved' });
});
afterEach(() => vi.unstubAllEnvs());
function restrictedConfig() {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest');
  vi.stubEnv('TWILIO_API_KEY_SID', 'SKtest');
  vi.stubEnv('TWILIO_API_KEY_SECRET', 'test-key-secret');
  vi.stubEnv('TWILIO_VERIFY_SERVICE_SID', 'VAtest');
}

describe('restricted Twilio verification', () => {
  it('sends and checks using the API key with the explicit account SID', async () => {
    restrictedConfig();
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'must-not-be-used');
    expect(await sendOtp('+14155550123')).toEqual({ delivered: true, simulated: false, provider: 'verify' });
    expect(await checkOtp('+14155550123', '123456')).toEqual({ valid: true, simulated: false });
    expect(twilio).toHaveBeenCalledWith('SKtest', 'test-key-secret', { accountSid: 'ACtest' });
    expect(mocks.services).toHaveBeenCalledWith('VAtest');
    expect(mocks.send).toHaveBeenCalledWith({ to: '+14155550123', channel: 'sms' });
    expect(mocks.check).toHaveBeenCalledWith({ to: '+14155550123', code: '123456' });
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it('rejects an unapproved code', async () => {
    restrictedConfig(); mocks.check.mockResolvedValue({ status: 'pending' });
    expect((await checkOtp('+14155550123', '000000')).valid).toBe(false);
  });
  it.each(['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID'])(
    'fails closed without %s even with a legacy token and sender', async (missing) => {
      restrictedConfig(); vi.stubEnv(missing, '');
      vi.stubEnv('TWILIO_AUTH_TOKEN', 'legacy-token'); vi.stubEnv('TWILIO_FROM', '+14155550124');
      await expect(sendOtp('+14155550123', '123456')).rejects.toThrow('restricted API key');
      await expect(checkOtp('+14155550123', '123456')).rejects.toThrow('restricted API key');
      expect(twilio).not.toHaveBeenCalled(); expect(mocks.messages).not.toHaveBeenCalled();
    });
  it('propagates provider failures without falling back to direct SMS', async () => {
    restrictedConfig(); mocks.send.mockRejectedValue(new Error('provider unavailable'));
    await expect(sendOtp('+14155550123')).rejects.toThrow('provider unavailable');
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it('retains credential-free simulation only outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect((await sendOtp('+14155550123')).simulated).toBe(true);
    expect(twilio).not.toHaveBeenCalled();
  });
});
