export interface Contact {
  name: string;
  number: string;
  presence: 'online' | 'offline' | 'busy';
}

export interface CallRecord {
  id: string;
  destination: string;
  type: 'incoming' | 'outgoing' | 'missed';
  time: string;
  duration?: string;
}

export interface ActiveCall {
  destination: string;
  state: 'dialing' | 'ringing' | 'connected' | 'hold';
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
