import { useState, useCallback } from 'react';
import type { SipSettings } from '../types';

export const DEFAULT_SIP_SETTINGS: SipSettings = {
  sipServer: 'pbx.chriskendall.media',
  extension: '',
  username: '',
  password: '',
  sipTransport: 'UDP',
  dndMode: 'Off',
  mobileNumber: '',
  combineContacts: true,
  sipAlgCompat: false,
  audioInput: '',
  audioOutput: '',
  licenseStatus: 'Active (Commercial)',
  queuePickupPrefix: '*8'
};

const STORAGE_KEY = 'merlin_sip_config';

export function useSipSettings() {
  const [settings, setSettingsState] = useState<SipSettings>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return { ...DEFAULT_SIP_SETTINGS, ...JSON.parse(cached) };
      }
    } catch (e) {
      console.error('Failed to parse cached SIP settings:', e);
    }
    return DEFAULT_SIP_SETTINGS;
  });

  const saveSettings = useCallback((newSettings: SipSettings | ((prev: SipSettings) => SipSettings)) => {
    setSettingsState(prev => {
      const resolved = typeof newSettings === 'function' ? newSettings(prev) : newSettings;
      const normalized: SipSettings = {
        ...resolved,
        sipServer: resolved.sipServer.trim() || DEFAULT_SIP_SETTINGS.sipServer,
        extension: resolved.extension.trim(),
        username: resolved.username.trim(),
        mobileNumber: resolved.mobileNumber.trim(),
        queuePickupPrefix: (resolved.queuePickupPrefix || '*8').trim() || '*8'
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch (err) {
        console.error('Failed to save SIP settings to localStorage:', err);
      }
      return normalized;
    });
  }, []);

  const updateSetting = useCallback(<K extends keyof SipSettings>(key: K, value: SipSettings[K]) => {
    saveSettings(prev => ({ ...prev, [key]: value }));
  }, [saveSettings]);

  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    setSettingsState(DEFAULT_SIP_SETTINGS);
  }, []);

  const hasConfig = Boolean(settings.extension && settings.username);

  return {
    settings,
    saveSettings,
    updateSetting,
    resetSettings,
    hasConfig
  };
}
