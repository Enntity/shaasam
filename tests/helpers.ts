export const API_KEY = 'test-api-key';
export const ADMIN_KEY = 'test-admin-key';

export function jsonRequest(
  url: string,
  body: unknown,
  init?: RequestInit
) {
  const { headers, ...rest } = init ?? {};
  return new Request(url, {
    method: 'POST',
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  });
}

export function withApiKey(headers: HeadersInit = {}) {
  return {
    ...headers,
    'x-api-key': API_KEY,
  };
}

export function withAdminKey(headers: HeadersInit = {}) {
  return {
    ...headers,
    'x-admin-key': ADMIN_KEY,
  };
}
