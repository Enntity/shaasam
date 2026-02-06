const MIN_ALIAS_LENGTH = 3;
const MAX_ALIAS_LENGTH = 24;

const RESERVED_ALIASES = new Set([
  'admin',
  'api',
  'billing',
  'contact',
  'dashboard',
  'help',
  'humans',
  'join',
  'login',
  'profile',
  'requests',
  'root',
  'settings',
  'shaasam',
  'support',
  'system',
]);

export function normalizeAlias(input: string): string | null {
  if (!input) return null;
  let normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  normalized = normalized.replace(/[^a-z0-9]+/g, '-');
  normalized = normalized.replace(/^-+|-+$/g, '');
  normalized = normalized.replace(/--+/g, '-');
  if (!normalized) return null;
  return normalized;
}

export function validateAlias(input: string): {
  valid: boolean;
  normalized: string | null;
  reason?: string;
} {
  const normalized = normalizeAlias(input);
  if (!normalized) {
    return { valid: false, normalized: null, reason: 'Use letters and numbers only.' };
  }
  if (normalized.length < MIN_ALIAS_LENGTH) {
    return {
      valid: false,
      normalized,
      reason: `Alias must be at least ${MIN_ALIAS_LENGTH} characters.`,
    };
  }
  if (normalized.length > MAX_ALIAS_LENGTH) {
    return {
      valid: false,
      normalized,
      reason: `Alias must be ${MAX_ALIAS_LENGTH} characters or fewer.`,
    };
  }
  if (RESERVED_ALIASES.has(normalized)) {
    return { valid: false, normalized, reason: 'That alias is reserved.' };
  }
  return { valid: true, normalized };
}
