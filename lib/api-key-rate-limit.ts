import { consumeQuota } from './rate-limit';
export const checkApiKeyRateLimit = consumeQuota;
export { getRateLimitHeaders } from './rate-limit';
