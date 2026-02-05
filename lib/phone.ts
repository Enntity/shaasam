export function normalizePhone(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const plusPrefixed = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  const digits = plusPrefixed.replace(/[^+\d]/g, '');
  if (!/^\+\d{8,15}$/.test(digits)) {
    return null;
  }
  return digits;
}
