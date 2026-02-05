import twilio from 'twilio';

type SendResult = { delivered: boolean; simulated: boolean; provider: 'verify' | 'sms' };
type CheckResult = { valid: boolean; simulated: boolean };

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

export async function sendOtp(phone: string, code?: string): Promise<SendResult> {
  const useVerify = Boolean(verifyServiceSid);
  if (!accountSid || !authToken || (!useVerify && !fromNumber)) {
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

  const client = twilio(accountSid, authToken);
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
  if (!verifyServiceSid) {
    throw new Error('Twilio Verify is not configured.');
  }
  if (!accountSid || !authToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Twilio is not configured.');
    }
    return { valid: true, simulated: true };
  }
  const client = twilio(accountSid, authToken);
  const result = await client.verify.v2.services(verifyServiceSid).verificationChecks.create({
    to: phone,
    code,
  });
  return { valid: result.status === 'approved', simulated: false };
}
