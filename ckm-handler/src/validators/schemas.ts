import { z } from 'zod';

export const AdminConfigInputSchema = z.object({
  pbxServer: z.string().min(1, 'PBX Server hostname/IP is required'),
  pbxPort: z.coerce.number().int().min(1).max(65535).default(5060),
  pbxTransport: z.enum(['UDP', 'TCP', 'TLS']).default('UDP'),
  dataHandlerUrl: z.string().min(1, 'Data Handler URL is required'),
  pbxType: z.enum(['yeastar_api', 'yeastar_ami', 'asterisk_ami']).default('yeastar_api'),
  apiHost: z.string().optional().nullable(),
  apiPort: z.coerce.number().int().min(1).max(65535).default(8088),
  apiProtocol: z.enum(['http', 'https']).default('https'),
  apiPath: z.string().default('api/v2.0.0'),
  apiUser: z.string().optional().nullable(),
  apiSecret: z.string().optional().nullable(),
  verifySsl: z.coerce.number().int().min(0).max(1).default(0)
});

export const ServerConfigSchema = z.object({
  pbx_server: z.string().min(1, 'PBX Server hostname/IP is required'),
  sip_port: z.coerce.number().int().min(1).max(65535).default(5060),
  sip_transport: z.enum(['UDP', 'TCP', 'TLS']).default('UDP'),
  data_handler_url: z.string().min(1, 'Data Handler URL is required'),
  pbx_type: z.enum(['yeastar_api', 'yeastar_ami', 'asterisk_ami']).default('yeastar_api'),
  pbx_api_host: z.string().optional().nullable(),
  pbx_api_port: z.coerce.number().int().min(1).max(65535).default(8088),
  pbx_api_protocol: z.enum(['http', 'https']).default('https'),
  pbx_api_path: z.string().default('api/v2.0.0'),
  pbx_api_user: z.string().optional().nullable(),
  pbx_api_secret: z.string().optional().nullable(),
  pbx_verify_ssl: z.coerce.boolean().default(false),
  organization_name: z.string().optional().nullable(),
  support_email: z.string().optional().nullable(),
  auto_adopt_enabled: z.coerce.boolean().default(false),
  auto_sync_interval_mins: z.coerce.number().int().min(1).max(1440).default(5),
  auto_sync_enabled: z.coerce.boolean().default(true),
  theme_mode: z.enum(['system', 'light', 'dark']).default('system')
});

export const HandsetRegisterSchema = z.object({
  mac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address format'),
  extension: z.string().min(2).max(10).regex(/^\d+$/, 'Extension must be numeric'),
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  ip: z.string().optional().nullable(),
  label: z.string().optional().nullable()
});

export const RouterProfileSchema = z.object({
  site_name: z.string().min(1, 'Site name is required'),
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  voice_vlan_id: z.coerce.number().int().min(1).max(4094).default(100),
  voice_subnet: z.string().min(7, 'Subnet CIDR is required'),
  sip_alg_disabled: z.coerce.boolean().default(true),
  dscp_voice_tag: z.coerce.number().int().min(0).max(63).default(46),
  notes: z.string().optional().nullable()
});

export const AdminUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_.-]+$/, 'Username contains invalid characters'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.enum(['SUPERADMIN', 'ADMIN', 'READONLY']).default('ADMIN'),
  full_name: z.string().min(1, 'Full name is required')
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters')
});

export const GdprPolicySchema = z.object({
  chatDays: z.coerce.number().int().min(1).max(3650).default(90),
  mediaDays: z.coerce.number().int().min(1).max(3650).default(90),
  autoPrune: z.coerce.boolean().default(true)
});
