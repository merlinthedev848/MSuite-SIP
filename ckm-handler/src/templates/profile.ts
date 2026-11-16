export const DEFAULT_LINE_COUNT = 2;
export const MAX_LINE_COUNT = 16;

export interface SipLineAccount {
  index: number;
  extension: string;
  username: string;
  password: string;
  displayName: string;
  label: string;
  /** 1-based factory ringtone slot. Phones map this to their built-in ring. */
  ringSlot: number;
}

export interface HandsetBlfKey {
  key: number;
  extension: string;
  label: string;
}

export interface HandsetLineOverride {
  index?: number;
  extension?: string;
  username?: string;
  password?: string;
  displayName?: string;
  label?: string;
}

/**
 * Shared deskphone profile. Vendor generators read this and emit their own
 * config format. Omitted lineCount means two lines.
 */
export interface HandsetAccountConfig {
  extension: string;
  username: string;
  password: string;
  displayName: string;
  sipServer: string;
  sipPort: number;
  sipTransport: string;
  dataHandlerUrl: string;
  directoryToken?: string;
  blfKeys?: HandsetBlfKey[];
  /** Set only when a profile explicitly chooses a line count. Otherwise two. */
  lineCount?: number;
  lines?: HandsetLineOverride[];
  ntpServer?: string;
  /** IANA zone. Generators map it into the vendor's own timezone token. */
  timezone?: string;
  /** Voice VLAN. 20 matches the handler's gateway default. 0 turns VLAN off. */
  vlanId?: number;
  vlanPriority?: number;
  dialPlan?: string;
  /** SIP registration expiry in seconds. */
  registerExpires?: number;
  /** Seconds to wait before retrying a failed registration. */
  registerRetry?: number;
  /** SIP session timer in seconds. */
  sessionExpires?: number;
  voiceDscp?: number;
  sipDscp?: number;
}

export interface ResolvedProfile {
  lines: SipLineAccount[];
  lineCount: number;
  ntpServer: string;
  timezone: string;
  vlanId: number;
  vlanPriority: number;
  dialPlan: string;
  registerExpires: number;
  registerRetry: number;
  sessionExpires: number;
  voiceDscp: number;
  sipDscp: number;
  blfKeys: HandsetBlfKey[];
}

export function resolveLineCount(cfg: Partial<HandsetAccountConfig> | null | undefined): number {
  const raw = cfg?.lineCount;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_LINE_COUNT) {
    return raw;
  }
  return DEFAULT_LINE_COUNT;
}

export function resolveProfile(cfg: HandsetAccountConfig): ResolvedProfile {
  const lineCount = resolveLineCount(cfg);
  const lines: SipLineAccount[] = [];
  for (let i = 1; i <= lineCount; i++) {
    const override = (cfg.lines || []).find(line => line.index === i) || (cfg.lines || [])[i - 1];
    const displayName = (override?.displayName || cfg.displayName || `Ext ${cfg.extension}`).trim();
    const label = (override?.label || (i === 1 ? displayName : `${displayName} L${i}`)).trim();
    lines.push({
      index: i,
      extension: (override?.extension || cfg.extension || '').trim(),
      username: (override?.username || cfg.username || cfg.extension || '').trim(),
      password: override?.password || cfg.password || '',
      displayName,
      label,
      ringSlot: ((i - 1) % 8) + 1
    });
  }

  const requestedVlan = cfg.vlanId;
  const vlanId = requestedVlan === undefined || requestedVlan === null ? 20 : requestedVlan;

  return {
    lines,
    lineCount,
    ntpServer: (cfg.ntpServer || 'pool.ntp.org').trim() || 'pool.ntp.org',
    timezone: (cfg.timezone || 'Europe/London').trim() || 'Europe/London',
    vlanId: Number.isFinite(vlanId) ? vlanId : 20,
    vlanPriority: cfg.vlanPriority ?? 6,
    dialPlan: cfg.dialPlan || '999|112|911|[0-9*#+].T',
    registerExpires: cfg.registerExpires || 3600,
    registerRetry: cfg.registerRetry || 30,
    sessionExpires: cfg.sessionExpires || 1800,
    voiceDscp: cfg.voiceDscp ?? 46,
    sipDscp: cfg.sipDscp ?? 26,
    blfKeys: Array.isArray(cfg.blfKeys) ? cfg.blfKeys : []
  };
}

/** Keep BLF keys off the line-key slots occupied by the SIP lines. */
export function blfKeySlot(requestedKey: number, lineCount: number): number {
  const key = Number.isFinite(requestedKey) && requestedKey > 0 ? Math.floor(requestedKey) : lineCount + 1;
  if (key <= lineCount) return lineCount + key;
  return key;
}

export function escapeXml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function phonebookQuery(cfg: HandsetAccountConfig): string {
  const token = cfg.directoryToken ? `&amp;token=${encodeURIComponent(cfg.directoryToken)}` : '';
  return `extension=${encodeURIComponent(cfg.extension || '')}${token}`;
}

export function transportCode(transport: string): '0' | '1' | '2' {
  const value = (transport || 'UDP').toUpperCase();
  if (value === 'TLS') return '2';
  if (value === 'TCP') return '1';
  return '0';
}

export function transportName(transport: string): 'UDP' | 'TCP' | 'TLS' {
  const value = (transport || 'UDP').toUpperCase();
  if (value === 'TLS') return 'TLS';
  if (value === 'TCP') return 'TCP';
  return 'UDP';
}

/** Yealink TOS byte for a DSCP value (DSCP << 2). */
export function dscpToTos(dscp: number): number {
  return (dscp & 0x3f) << 2;
}

export function yealinkRing(slot: number): string {
  return `Ring${slot}.wav`;
}
