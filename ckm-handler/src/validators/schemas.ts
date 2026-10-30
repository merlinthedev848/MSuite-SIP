/**
 * Zero-dependency type-safe schema validators for CKM Handler
 * Eliminates external runtime package dependencies so compilation never fails on missing node_modules.
 */

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { errors: Array<{ message: string }> } };

export interface SchemaValidator<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

export const AdminConfigInputSchema: SchemaValidator<{
  pbxServer: string;
  pbxPort: number;
  pbxTransport: 'UDP' | 'TCP' | 'TLS';
  dataHandlerUrl: string;
  pbxType: 'yeastar_api' | 'yeastar_ami' | 'asterisk_ami';
  apiHost?: string | null;
  apiPort: number;
  apiProtocol: 'http' | 'https';
  apiPath: string;
  apiUser?: string | null;
  apiSecret?: string | null;
  verifySsl: number;
  smtpHost?: string | null;
  smtpPort?: number;
  smtpSecure?: number;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
}> = {
  safeParse(input: unknown) {
    if (!input || typeof input !== 'object') {
      return { success: false, error: { errors: [{ message: 'Invalid configuration payload' }] } };
    }
    const b = input as Record<string, unknown>;
    const pbxServer = String(b.pbxServer || '').trim();
    if (!pbxServer) {
      return { success: false, error: { errors: [{ message: 'PBX Server hostname/IP is required' }] } };
    }
    const dataHandlerUrl = String(b.dataHandlerUrl || '').trim();
    if (!dataHandlerUrl) {
      return { success: false, error: { errors: [{ message: 'Data Handler URL is required' }] } };
    }
    const pbxPort = Math.max(1, Math.min(65535, parseInt(String(b.pbxPort || '5060'), 10) || 5060));
    const rawTransport = String(b.pbxTransport || 'UDP').toUpperCase();
    const pbxTransport: 'UDP' | 'TCP' | 'TLS' = (rawTransport === 'TCP' || rawTransport === 'TLS') ? rawTransport : 'UDP';
    const rawType = String(b.pbxType || 'yeastar_api');
    const pbxType: 'yeastar_api' | 'yeastar_ami' | 'asterisk_ami' = (rawType === 'yeastar_ami' || rawType === 'asterisk_ami') ? rawType : 'yeastar_api';
    const apiHost = b.apiHost ? String(b.apiHost).trim() : null;
    const apiPort = Math.max(1, Math.min(65535, parseInt(String(b.apiPort || '8088'), 10) || 8088));
    const apiProtocol = String(b.apiProtocol || 'https').toLowerCase() === 'http' ? 'http' : 'https';
    const apiPath = String(b.apiPath || 'api/v2.0.0').trim();
    const apiUser = b.apiUser !== undefined && b.apiUser !== null ? String(b.apiUser).trim() : null;
    const apiSecret = b.apiSecret !== undefined && b.apiSecret !== null ? String(b.apiSecret) : null;
    const verifySsl = b.verifySsl === 1 || b.verifySsl === true || String(b.verifySsl) === '1' ? 1 : 0;
    const smtpHost = b.smtpHost !== undefined && b.smtpHost !== null ? String(b.smtpHost).trim() : undefined;
    const smtpPort = b.smtpPort ? Math.max(1, Math.min(65535, parseInt(String(b.smtpPort), 10) || 587)) : 587;
    const smtpSecure = b.smtpSecure === 1 || b.smtpSecure === true || String(b.smtpSecure) === '1' ? 1 : 0;
    const smtpUser = b.smtpUser !== undefined && b.smtpUser !== null ? String(b.smtpUser).trim() : undefined;
    const smtpPass = b.smtpPass !== undefined && b.smtpPass !== null ? String(b.smtpPass) : undefined;
    const smtpFrom = b.smtpFrom !== undefined && b.smtpFrom !== null ? String(b.smtpFrom).trim() : undefined;

    return {
      success: true,
      data: {
        pbxServer,
        pbxPort,
        pbxTransport,
        dataHandlerUrl,
        pbxType,
        apiHost,
        apiPort,
        apiProtocol,
        apiPath,
        apiUser,
        apiSecret,
        verifySsl,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPass,
        smtpFrom
      }
    };
  }
};

export const GdprPolicySchema: SchemaValidator<{
  chatDays: number;
  mediaDays: number;
  autoPrune: boolean;
}> = {
  safeParse(input: unknown) {
    if (!input || typeof input !== 'object') {
      return { success: false, error: { errors: [{ message: 'Invalid GDPR policy payload' }] } };
    }
    const b = input as Record<string, unknown>;
    const chatDays = Math.max(1, Math.min(3650, parseInt(String(b.chatDays || '90'), 10) || 90));
    const mediaDays = Math.max(1, Math.min(3650, parseInt(String(b.mediaDays || '90'), 10) || 90));
    const autoPrune = b.autoPrune === true || b.autoPrune === 1 || String(b.autoPrune) === 'true';

    return {
      success: true,
      data: { chatDays, mediaDays, autoPrune }
    };
  }
};

export const HandsetRegisterSchema: SchemaValidator<{
  mac: string;
  extension: string;
  brand: string;
  model: string;
  ip?: string | null;
  label?: string | null;
}> = {
  safeParse(input: unknown) {
    if (!input || typeof input !== 'object') {
      return { success: false, error: { errors: [{ message: 'Invalid handset payload' }] } };
    }
    const b = input as Record<string, unknown>;
    const mac = String(b.mac || '').trim();
    if (!/^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$/.test(mac)) {
      return { success: false, error: { errors: [{ message: 'Invalid MAC address format' }] } };
    }
    const extension = String(b.extension || '').trim();
    if (!/^\d{2,10}$/.test(extension)) {
      return { success: false, error: { errors: [{ message: 'Extension must be numeric' }] } };
    }
    const brand = String(b.brand || '').trim();
    const model = String(b.model || '').trim();
    if (!brand || !model) {
      return { success: false, error: { errors: [{ message: 'Brand and Model are required' }] } };
    }
    return {
      success: true,
      data: {
        mac,
        extension,
        brand,
        model,
        ip: b.ip ? String(b.ip).trim() : null,
        label: b.label ? String(b.label).trim() : null
      }
    };
  }
};
