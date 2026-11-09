export type PresenceStatus = 'online' | 'offline' | 'busy';

export interface Contact {
  name: string;
  number: string;
  presence: PresenceStatus;
  company?: string;
}

export type CallDirection = 'incoming' | 'outgoing' | 'missed';

export interface CallRecord {
  id: string;
  destination: string;
  type: CallDirection;
  time: string;
  duration?: string;
}

export type CallState = 'dialing' | 'ringing' | 'connected' | 'hold';

export interface ActiveCall {
  destination: string;
  state: CallState;
  duration: number;
  muted: boolean;
}

export interface AudioDevice {
  id: string;
  name: string;
}

export interface VideoDevice {
  id: string;
  name: string;
}

export type AuthMode = 'provision' | 'manual';
export type AppStep = 'credentials' | 'main';
export type MainTab = 'phone' | 'history' | 'contacts';
export type SettingsTab = 'general' | 'account' | 'handling' | 'audio' | 'diagnostics' | 'about';

export interface SipSettings {
  sipServer: string;
  extension: string;
  username: string;
  password?: string;
  sipTransport: string;
  dndMode: string;
  mobileNumber: string;
  combineContacts: boolean;
  sipAlgCompat: boolean;
  audioInput: string;
  audioOutput: string;
  videoSource?: string;
  queuePickupPrefix?: string;
  licenseStatus?: string;
  allowCustomSip?: boolean;
}
