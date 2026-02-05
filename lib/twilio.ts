import twilio from 'twilio';

type SendResult = { delivered: boolean; simulated: boolean };

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM;

export async function sendOtp(phone: string, code: string): Promise<SendResult> {
  if (!accountSid || !authToken || !fromNumber) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Twilio is not configured.');
    }
    console.info(`[dev] OTP for ${phone}: ${code}`);
    return { delivered: false, simulated: true };
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({
    to: phone,
    from: fromNumber,
    body: `Your Shaasam verification code is ${code}. It expires in 10 minutes.`,
  });

  return { delivered: true, simulated: false };
}
