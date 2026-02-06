export const ONLINE_LOCATION = 'Online / Remote';

export const LOCATION_OPTIONS = [
  ONLINE_LOCATION,
  'San Francisco Bay Area',
  'New York City',
  'Los Angeles',
  'Seattle',
  'Austin',
  'Chicago',
  'Denver',
  'Miami',
  'Toronto',
  'London',
  'Berlin',
  'Amsterdam',
  'Singapore',
  'Tokyo',
  'Sydney',
];

const TIMEZONE_MAP: Record<string, string> = {
  'America/Los_Angeles': 'San Francisco Bay Area',
  'America/Anchorage': 'Seattle',
  'America/Vancouver': 'Seattle',
  'America/Denver': 'Denver',
  'America/Phoenix': 'Denver',
  'America/Chicago': 'Chicago',
  'America/New_York': 'New York City',
  'America/Toronto': 'Toronto',
  'Europe/London': 'London',
  'Europe/Berlin': 'Berlin',
  'Europe/Amsterdam': 'Amsterdam',
  'Asia/Singapore': 'Singapore',
  'Asia/Tokyo': 'Tokyo',
  'Australia/Sydney': 'Sydney',
};

export function guessLocation(): string {
  if (typeof Intl === 'undefined') {
    return ONLINE_LOCATION;
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!tz) return ONLINE_LOCATION;
  if (TIMEZONE_MAP[tz]) return TIMEZONE_MAP[tz];
  if (tz.startsWith('America/')) {
    if (tz.includes('Los_Angeles')) return 'San Francisco Bay Area';
    if (tz.includes('New_York')) return 'New York City';
    if (tz.includes('Chicago')) return 'Chicago';
    if (tz.includes('Denver')) return 'Denver';
  }
  return ONLINE_LOCATION;
}
