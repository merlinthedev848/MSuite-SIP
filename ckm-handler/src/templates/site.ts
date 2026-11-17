/**
 * One clock and one dial plan for every brand file.
 * Vendor tokens differ; the PBX row stores an IANA zone and one digit map.
 */
export const DEFAULT_TIMEZONE = 'Europe/London';
export const DEFAULT_DIAL_PLAN = '999|112|911|[0-9*#+].T';

export interface VendorClock {
  iana: string;
  yealinkOffset: string;
  yealinkName: string;
  snomZone: string;
  snomTone: string;
  polyOffsetSeconds: number;
  ciscoZone: string;
  gigasetZone: string;
}

const CLOCKS: Record<string, VendorClock> = {
  'Europe/London': clock('Europe/London', '+0', 'United Kingdom(London)', 'GBR-0', 'GB', 0, 'GMT-00:00'),
  'Europe/Dublin': clock('Europe/Dublin', '+0', 'Ireland(Dublin)', 'IRL-0', 'GB', 0, 'GMT-00:00'),
  UTC: clock('UTC', '+0', 'UTC', 'UTC', 'GB', 0, 'GMT-00:00'),
  'Europe/Paris': clock('Europe/Paris', '+1', 'France(Paris)', 'FRA-1', 'FR', 3600, 'GMT+01:00'),
  'Europe/Berlin': clock('Europe/Berlin', '+1', 'Germany(Berlin)', 'GER-1', 'DE', 3600, 'GMT+01:00'),
  'Europe/Madrid': clock('Europe/Madrid', '+1', 'Spain(Madrid)', 'ESP-1', 'ES', 3600, 'GMT+01:00'),
  'America/New_York': clock('America/New_York', '-5', 'United States-Eastern Time', 'USA-5', 'US', -18000, 'GMT-05:00'),
  'America/Chicago': clock('America/Chicago', '-6', 'United States-Central Time', 'USA-6', 'US', -21600, 'GMT-06:00'),
  'America/Denver': clock('America/Denver', '-7', 'United States-Mountain Time', 'USA-7', 'US', -25200, 'GMT-07:00'),
  'America/Los_Angeles': clock('America/Los_Angeles', '-8', 'United States-Pacific Time', 'USA-8', 'US', -28800, 'GMT-08:00'),
  'Australia/Sydney': clock('Australia/Sydney', '+10', 'Australia(Sydney)', 'AUS+10', 'AU', 36000, 'GMT+10:00')
};

function clock(
  iana: string,
  yealinkOffset: string,
  yealinkName: string,
  snomZone: string,
  snomTone: string,
  polyOffsetSeconds: number,
  ciscoZone: string
): VendorClock {
  return {
    iana,
    yealinkOffset,
    yealinkName,
    snomZone,
    snomTone,
    polyOffsetSeconds,
    ciscoZone,
    gigasetZone: iana
  };
}

export function knownTimezones(): string[] {
  return Object.keys(CLOCKS);
}

export function sanitizeTimezone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_TIMEZONE;
  if (raw.length > 64 || !/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(raw)) {
    return DEFAULT_TIMEZONE;
  }
  return raw;
}

export function sanitizeDialPlan(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_DIAL_PLAN;
  if (raw.length > 160 || !/^[0-9*#+.\[\]|TSxX\-(),]+$/.test(raw)) {
    return DEFAULT_DIAL_PLAN;
  }
  return raw;
}

export function resolveVendorClock(iana?: string | null): VendorClock {
  const key = sanitizeTimezone(iana);
  return CLOCKS[key] || {
    iana: key,
    yealinkOffset: '+0',
    yealinkName: key,
    snomZone: key,
    snomTone: 'GB',
    polyOffsetSeconds: 0,
    ciscoZone: 'GMT-00:00',
    gigasetZone: key
  };
}
