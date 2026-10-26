import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { AudioDevice, SipSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settingsTab: 'general' | 'account' | 'handling' | 'audio' | 'diagnostics' | 'about';
  setSettingsTab: (tab: 'general' | 'account' | 'handling' | 'audio' | 'diagnostics' | 'about') => void;
  settings: SipSettings;
  setSettings: React.Dispatch<React.SetStateAction<SipSettings>>;
  audioInputs: AudioDevice[];
  audioOutputs: AudioDevice[];
  onStartDiagnostics: () => void;
  onResetApp: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <SettingsModalDialog {...props} />;
};

const SettingsModalDialog: React.FC<SettingsModalProps> = ({
  onClose,
  settingsTab,
  setSettingsTab,
  settings,
  setSettings,
  audioInputs,
  audioOutputs,
  onStartDiagnostics,
  onResetApp
}) => {
  const [draft, setDraft] = useState<SipSettings>(settings);

  const handleSave = () => {
    const normalized: SipSettings = {
      ...draft,
      sipServer: draft.sipServer.trim() || 'pbx.chriskendall.media',
      extension: draft.extension.trim(),
      username: draft.username.trim(),
      mobileNumber: draft.mobileNumber.trim(),
      queuePickupPrefix: (draft.queuePickupPrefix ?? '*8').trim() || '*8'
    };
    try {
      localStorage.setItem('merlin_sip_config', JSON.stringify(normalized));
    } catch (e) {
      console.error('Failed to save settings', e);
      window.alert('Could not save settings in this browser. Storage may be blocked.');
      return;
    }
    setSettings(normalized);
    onClose();
  };

  const handleExportErrorLog = () => {
    const logData = [
      `Merlin SIP Web Diagnostic Log`,
      `Generated: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
      `SIP Server: ${draft.sipServer || 'pbx.chriskendall.media'}`,
      `SIP Transport: ${draft.sipTransport}`,
      `Extension: ${draft.extension || 'none'}`,
      `SIP ALG Compatibility: ${draft.sipAlgCompat ? 'Enabled' : 'Disabled'}`,
      `DND Mode: ${draft.dndMode}`,
      `Queue Pickup Prefix: ${draft.queuePickupPrefix || '*8'}`,
      `Audio Input: ${draft.audioInput || 'default'}`,
      `Audio Output: ${draft.audioOutput || 'default'}`,
      `License Status: ${draft.licenseStatus || 'Active (Commercial)'}`
    ].join('\n');

    const blob = new Blob([logData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Merlin_SIP_Web_Log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        
        {/* Modal Navigation tabs */}
        <div className="tab-control" style={{ padding: '0 20px', borderBottom: '1px solid var(--line-color)' }}>
          {(['general', 'account', 'handling', 'audio', 'diagnostics', 'about'] as const).map(tab => (
            <button 
              key={tab}
              className={`tab-item ${settingsTab === tab ? 'active' : ''}`}
              onClick={() => setSettingsTab(tab)}
              style={{ textTransform: 'capitalize', padding: '10px 4px', fontSize: 13 }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {settingsTab === 'general' && (
            <div>
              <div className="form-group">
                <label className="form-label">SIP Signaling Transport</label>
                <select 
                  className="form-input" 
                  value={draft.sipTransport} 
                  onChange={e => setDraft(s => ({ ...s, sipTransport: e.target.value }))}
                >
                  <option value="UDP">UDP</option>
                  <option value="TCP">TCP</option>
                  <option value="TLS">TLS</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Do Not Disturb (DND)</label>
                <select 
                  className="form-input" 
                  value={draft.dndMode} 
                  onChange={e => setDraft(s => ({ ...s, dndMode: e.target.value }))}
                >
                  <option value="Off">Off</option>
                  <option value="On">On (Auto busy)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Twin Number</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={draft.mobileNumber} 
                  onChange={e => setDraft(s => ({ ...s, mobileNumber: e.target.value }))} 
                />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input 
                  type="checkbox" 
                  id="combineContacts" 
                  checked={draft.combineContacts} 
                  onChange={e => setDraft(s => ({ ...s, combineContacts: e.target.checked }))} 
                />
                <label htmlFor="combineContacts" className="form-label" style={{ margin: 0 }}>Combine Contacts in Search</label>
              </div>
            </div>
          )}

          {settingsTab === 'account' && (
            <div>
              <div className="form-group">
                <label className="form-label">SIP Server / PBX Host</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={draft.sipServer || 'pbx.chriskendall.media'} 
                  disabled={!draft.allowCustomSip}
                  onChange={e => setDraft(s => ({ ...s, sipServer: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Extension / User</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={draft.extension} 
                  onChange={e => setDraft(s => ({ ...s, extension: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Auth Username</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={draft.username} 
                  onChange={e => setDraft(s => ({ ...s, username: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={draft.password || ''} 
                  onChange={e => setDraft(s => ({ ...s, password: e.target.value }))} 
                />
              </div>
            </div>
          )}

          {settingsTab === 'handling' && (
            <div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input 
                  type="checkbox" 
                  id="sipAlgCompat" 
                  checked={draft.sipAlgCompat || false} 
                  onChange={e => setDraft(s => ({ ...s, sipAlgCompat: e.target.checked }))} 
                />
                <label htmlFor="sipAlgCompat" className="form-label" style={{ margin: 0 }}>
                  SIP ALG Compatibility Mode (15s NAT Keepalive)
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Queue Pickup Prefix</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={draft.queuePickupPrefix ?? '*8'} 
                  onChange={e => setDraft(s => ({ ...s, queuePickupPrefix: e.target.value }))}
                />
              </div>
            </div>
          )}

          {settingsTab === 'audio' && (
            <div>
              <div className="form-group">
                <label className="form-label">Audio Input (Microphone)</label>
                <select 
                  className="form-input" 
                  value={draft.audioInput} 
                  onChange={e => setDraft(s => ({ ...s, audioInput: e.target.value }))}
                >
                  {audioInputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Audio Output (Speaker)</label>
                <select 
                  className="form-input" 
                  value={draft.audioOutput} 
                  onChange={e => setDraft(s => ({ ...s, audioOutput: e.target.value }))}
                >
                  {audioOutputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Video Source (Camera)</label>
                <select 
                  className="form-input" 
                  value={draft.videoSource || 'default-video'} 
                  onChange={e => setDraft(s => ({ ...s, videoSource: e.target.value }))}
                >
                  <option value="default-video">Default camera</option>
                  <option value="integrated-webcam">Integrated Webcam</option>
                  <option value="usb-camera">USB Video Device</option>
                </select>
                <span style={{ fontSize: 11, color: 'var(--muted-color)', marginTop: 4, display: 'block' }}>
                  Webcam device configured for Yeastar SIP and WebRTC video calls (H.264 / VP8).
                </span>
              </div>
            </div>
          )}

          {settingsTab === 'diagnostics' && (
            <div>
              <div className="settings-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="settings-card-title">PBX Diagnostics</span>
                  <button 
                    className="btn btn-secondary" 
                    onClick={onStartDiagnostics}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    Diagnose
                  </button>
                </div>
                <p className="item-subtitle">Checks whether the browser can reach the configured server and whether audio input and output devices are available.</p>
              </div>

              <div className="settings-card">
                <span className="settings-card-title">Support Actions</span>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary" onClick={handleExportErrorLog} style={{ flex: 1, padding: '8px' }}>Send error log</button>
                  <button className="btn btn-danger" onClick={onResetApp} style={{ flex: 1, padding: '8px' }}>Reset app</button>
                </div>
              </div>
            </div>
          )}

          {settingsTab === 'about' && (
            <div>
              <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="settings-card-title">About Merlin SIP</span>
                <p className="item-subtitle" style={{ lineHeight: 1.5 }}>CK Media Services softphone for managed SIP, presence, contacts, and reception workflows.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 10px', fontSize: 13, marginTop: 10 }}>
                  <span style={{ color: 'var(--muted-color)' }}>Version</span>
                  <span>1.3.8</span>
                  <span style={{ color: 'var(--muted-color)' }}>Product</span>
                  <span>merlin-sip</span>
                  <span style={{ color: 'var(--muted-color)' }}>Licensed to</span>
                  <span>CK Media Services</span>
                  <span style={{ color: 'var(--muted-color)' }}>SIP session</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#94a3b8' }}></span>
                    <span>Offline. This page does not open a SIP session.</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
