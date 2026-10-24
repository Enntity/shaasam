export function configurationErrors(): string[] {
  if (process.env.NODE_ENV !== 'production') return [];
  const errors: string[] = [];
  const env = process.env;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || env.AUTH_SECRET.includes('build-secret')) errors.push('AUTH_SECRET');
  if (!env.SHAASAM_ADMIN_KEY || env.SHAASAM_ADMIN_KEY.length < 32) errors.push('SHAASAM_ADMIN_KEY');
  try {
    const keys = JSON.parse(env.SHAASAM_AGENT_KEYS || '{}');
    if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.keys(keys).length || Object.entries(keys).some(([id, key]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof key !== 'string' || key.length < 32)) errors.push('SHAASAM_AGENT_KEYS');
  } catch { errors.push('SHAASAM_AGENT_KEYS'); }
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) if (!env[key]) errors.push(key);
  try { if (new URL(env.SITE_URL || '').protocol !== 'https:') errors.push('SITE_URL'); } catch { errors.push('SITE_URL'); }
  if (env.TRUST_PROXY !== 'true') errors.push('TRUST_PROXY');
  const bps = Number(env.SHAASAM_PLATFORM_FEE_BPS || 0);
  if (!Number.isInteger(bps) || bps < 0 || bps > 3000) errors.push('SHAASAM_PLATFORM_FEE_BPS');
  return errors;
}
