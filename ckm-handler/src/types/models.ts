import { Request } from 'express';

export type AdminRole = 'superadmin' | 'ops' | 'readonly' | 'technician' | string;

export interface AuthenticatedAdmin {
  id: number;
  username: string;
  displayName: string;
  role: string;
  permissions: string[];
}

export interface AdminRequest extends Request {
  adminUser?: AuthenticatedAdmin;
}

export interface ServerConfigRow {
  id: number;
  pbx_server: string;
  pbx_port: number;
  pbx_transport: string;
  data_handler_url: string;
  license_key: string | null;
  api_key: string | null;
  brand_name: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  auto_adopt_enabled?: number;
  auto_sync_enabled?: number;
  auto_sync_interval_mins?: number;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  webhook_crm_url?: string | null;
  webhook_crm_secret?: string | null;
  updated_at?: string;
}

export interface ExtensionRow {
  extension: string;
  sip_username: string;
  sip_password: string;
  display_name: string;
  is_active: number;
  created_at?: string;
}

export interface SoftphonePinRow {
  code: string;
  extension: string;
  claimed: number;
  expires_at: string | null;
  created_at?: string;
}

export interface PhysicalHandsetRow {
  mac_address: string;
  brand: string;
  model: string;
  extension: string;
  line_label?: string | null;
  blf_keys_json?: string | null;
  custom_config?: string | null;
  ip_address?: string | null;
  firmware_version?: string | null;
  last_provisioned_at?: string | null;
  created_at?: string;
}

export interface HandsetWithExtensionRow extends PhysicalHandsetRow {
  sip_username: string;
  sip_password: string;
  display_name: string;
  is_active: number;
}

export interface RouterRow {
  id: number;
  site_name: string;
  brand: string;
  model?: string | null;
  mac_address?: string | null;
  lan_subnet?: string | null;
  voice_vlan_id: number;
  voice_subnet: string;
  disable_sip_alg: number;
  enable_qos: number;
  notes?: string | null;
  custom_script?: string | null;
  created_at?: string;
}

export interface AdminUserRow {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  display_name: string;
  role: string;
  permissions: string;
  is_active: number;
  last_login_at?: string | null;
  created_at?: string;
}

export interface AdminSessionRow {
  token: string;
  user_id: number;
  expires_at: string;
  created_at?: string;
  username?: string;
  display_name?: string;
  role?: string;
  is_active?: number;
  permissions?: string;
}

export interface ActivityLogRow {
  id: number;
  event_type: string;
  details: string;
  ip_address?: string | null;
  created_at: string;
}

export interface DiscoveredDeviceRow {
  mac_address: string;
  brand: string;
  model: string;
  ip_address: string;
  user_agent?: string | null;
  status: 'PENDING_ADOPTION' | 'ADOPTED' | 'IGNORED';
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface FirmwareBinaryRow {
  id: number;
  category?: 'handset' | 'router' | string;
  brand: string;
  model: string;
  version: string;
  filename: string;
  filepath?: string | null;
  file_size?: number | null;
  status: 'VENDOR_CLOUD' | 'DOWNLOADED' | 'NOT_DOWNLOADED' | 'ERROR' | string;
  download_url?: string | null;
  local_path?: string | null;
  sha256?: string | null;
  error_message?: string | null;
  downloaded_at?: string | null;
  updated_at?: string;
}

export interface MessageRow {
  id: number;
  conversation_id: string;
  sender_id: string;
  message_type: string;
  content: string;
  file_id: string | null;
  file_name: string | null;
  file_size: number | null;
  timestamp: string;
}

export interface MediaVaultFileRow {
  file_id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  stored_path: string;
  uploaded_by: string;
  conversation_id: string | null;
  created_at: string;
}

export interface GdprRetentionPolicyRow {
  id: number;
  chat_retention_days: number;
  media_retention_days: number;
  auto_prune_enabled: number;
  updated_at?: string;
}

export interface GdprAuditCertificateRow {
  id: number;
  certificate_hash: string;
  extension: string;
  records_erased: number;
  timestamp: string;
}

export interface CountRow {
  count: number;
}

export interface TotalBytesRow {
  totalBytes: number;
}

export const defaultServerConfig: ServerConfigRow = {
  id: 1,
  pbx_server: '127.0.0.1',
  pbx_port: 5060,
  pbx_transport: 'UDP',
  data_handler_url: 'http://127.0.0.1:4000',
  license_key: null,
  api_key: null,
  brand_name: 'MerlinSIP',
  primary_color: '#0284c7',
  accent_color: '#0369a1',
  logo_url: '/assets/logo.png',
  auto_adopt_enabled: 1,
  auto_sync_enabled: 1,
  auto_sync_interval_mins: 5
};

