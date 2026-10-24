import twilio from 'twilio';

type SendResult = { delivered: boolean; simulated: boolean; provider: 'verify' | 'sms' };
type CheckResult = { valid: boolean; simulated: boolean };

function configuration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const production = process.env.NODE_ENV === 'production';

  // Never fall back to the account Auth Token or direct Messaging in production.
  if (production && (!accountSid || !apiKeySid || !apiKeySecret || !verifyServiceSid)) {
    throw new Error('Twilio Verify restricted API key is not configured.');
  }
  if (Boolean(apiKeySid) !== Boolean(apiKeySecret)) {
    throw new Error('Twilio API key configuration is incomplete.');
  }
  const authToken = production ? undefined : process.env.TWILIO_AUTH_TOKEN;
  const client = accountSid && apiKeySid && apiKeySecret
    ? twilio(apiKeySid, apiKeySecret, { accountSid })
    : accountSid && authToken ? twilio(accountSid, authToken) : null;
  return { client, verifyServiceSid, fromNumber: process.env.TWILIO_FROM };
}

export async function sendOtp(phone: string, code?: string): Promise<SendResult> {
  const { client, verifyServiceSid, fromNumber } = configuration();
  const useVerify = Boolean(verifyServiceSid);
  if (!client || (!useVerify && !fromNumber)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Twilio is not configured.');
    }
    if (code) {
      console.info(`[dev] OTP for ${phone}: ${code}`);
    } else {
      console.info(`[dev] OTP for ${phone} simulated.`);
    }
    return { delivered: false, simulated: true, provider: useVerify ? 'verify' : 'sms' };
  }

  if (useVerify) {
    await client.verify.v2.services(verifyServiceSid!).verifications.create({
      to: phone,
      channel: 'sms',
    });
    return { delivered: true, simulated: false, provider: 'verify' };
  }

  if (!code) {
    throw new Error('OTP code is required for SMS delivery.');
  }

  await client.messages.create({
    to: phone,
    from: fromNumber,
    body: `Your Shaasam verification code is ${code}. It expires in 10 minutes.`,
  });

  return { delivered: true, simulated: false, provider: 'sms' };
}

export async function checkOtp(phone: string, code: string): Promise<CheckResult> {
  const { client, verifyServiceSid } = configuration();
  if (!verifyServiceSid) {
    throw new Error('Twilio Verify is not configured.');
  }
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Twilio is not configured.');
    }
    return { valid: true, simulated: true };
  }
  const result = await client.verify.v2.services(verifyServiceSid).verificationChecks.create({
    to: phone,
    code,
  });
  return { valid: result.status === 'approved', simulated: false };
}
