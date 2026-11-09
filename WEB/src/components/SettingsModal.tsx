import React, { useState } from 'react';
import { Download, RotateCcw, Activity } from 'lucide-react';
import type { AudioDevice, SipSettings, SettingsTab } from '../types';
import { Modal } from './ui/Modal';
import { Tabs } from './ui/Tabs';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  settings: SipSettings;
  onSaveSettings: (settings: SipSettings) => void;
  audioInputs: AudioDevice[];
  audioOutputs: AudioDevice[];
  onStartDiagnostics: () => void;
  onResetApp: () => void;
}

const SETTINGS_TABS = [
  { id: 'general' as const, label: 'General' },
  { id: 'account' as const, label: 'Account' },
  { id: 'handling' as const, label: 'Calls' },
  { id: 'audio' as const, label: 'Audio' },
  { id: 'diagnostics' as const, label: 'Diagnostics' },
  { id: 'about' as const, label: 'About' }
];

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <SettingsModalDialog {...props} />;
};

const SettingsModalDialog: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settingsTab,
  setSettingsTab,
  settings,
  onSaveSettings,
  audioInputs,
  audioOutputs,
  onStartDiagnostics,
  onResetApp
}) => {
  const [draft, setDraft] = useState<SipSettings>(settings);

  const handleSave = () => {
    onSaveSettings(draft);
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

  const inputOptions = audioInputs.map(d => ({ value: d.id, label: d.name }));
  const outputOptions = audioOutputs.map(d => ({ value: d.id, label: d.name }));

  const modalFooter = (
    <div className="settings-modal-actions">
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSave}>
        Save Changes
      </Button>
    </div>
  );

  const headerTabs = (
    <Tabs<SettingsTab>
      tabs={SETTINGS_TABS}
      activeTab={settingsTab}
      onChange={setSettingsTab}
      ariaLabel="Settings categories"
    />
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Application Settings"
      headerTabs={headerTabs}
      footer={modalFooter}
      maxWidth={520}
    >
      <div className="settings-tab-content">
        {/* TAB: GENERAL */}
        {settingsTab === 'general' && (
          <div className="settings-section">
            <div className="settings-card">
              <h3 className="settings-card-title">Dialing &amp; Features</h3>
              <Input
                label="Queue Pickup Prefix"
                type="text"
                value={draft.queuePickupPrefix || '*8'}
                onChange={e => setDraft(s => ({ ...s, queuePickupPrefix: e.target.value }))}
                helperText="Code dialed to intercept an incoming ring group or queue call"
              />
              <Input
                label="Direct Mobile Extension"
                type="tel"
                placeholder="e.g. +44 7700 900077"
                value={draft.mobileNumber}
                onChange={e => setDraft(s => ({ ...s, mobileNumber: e.target.value }))}
                helperText="Simultaneous ring target when away from softphone"
              />
            </div>
            <div className="settings-card">
              <h3 className="settings-card-title">Presence &amp; Contacts</h3>
              <label className="checkbox-control">
                <input
                  type="checkbox"
                  checked={draft.combineContacts}
                  onChange={e => setDraft(s => ({ ...s, combineContacts: e.target.checked }))}
                />
                <span className="checkbox-label">Combine PBX and local directory contacts</span>
              </label>
            </div>
          </div>
        )}

        {/* TAB: ACCOUNT */}
        {settingsTab === 'account' && (
          <div className="settings-section">
            <div className="settings-card">
              <h3 className="settings-card-title">SIP PBX Server</h3>
              <Input
                label="Server Address"
                type="text"
                value={draft.sipServer}
                onChange={e => setDraft(s => ({ ...s, sipServer: e.target.value }))}
              />
              <Select
                label="Transport Protocol"
                options={[
                  { value: 'UDP', label: 'UDP (Default standard)' },
                  { value: 'TCP', label: 'TCP (Reliable transport)' },
                  { value: 'TLS', label: 'TLS / WSS (Secure encrypted)' }
                ]}
                value={draft.sipTransport}
                onChange={e => setDraft(s => ({ ...s, sipTransport: e.target.value }))}
              />
            </div>
            <div className="settings-card">
              <h3 className="settings-card-title">Account Credentials</h3>
              <div className="form-row-grid">
                <Input
                  label="Extension"
                  type="text"
                  value={draft.extension}
                  onChange={e => setDraft(s => ({ ...s, extension: e.target.value }))}
                />
                <Input
                  label="Auth Username"
                  type="text"
                  value={draft.username}
                  onChange={e => setDraft(s => ({ ...s, username: e.target.value }))}
                />
              </div>
              <Input
                label="Password"
                type="password"
                value={draft.password || ''}
                onChange={e => setDraft(s => ({ ...s, password: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* TAB: CALL HANDLING */}
        {settingsTab === 'handling' && (
          <div className="settings-section">
            <div className="settings-card">
              <h3 className="settings-card-title">Do Not Disturb (DND)</h3>
              <Select
                label="DND Mode"
                options={[
                  { value: 'Off', label: 'Disabled (Accept all calls)' },
                  { value: 'Reject', label: 'Reject Inbound Calls' },
                  { value: 'Voicemail', label: 'Send directly to Voicemail' }
                ]}
                value={draft.dndMode}
                onChange={e => setDraft(s => ({ ...s, dndMode: e.target.value }))}
              />
            </div>
            <div className="settings-card">
              <h3 className="settings-card-title">Firewall &amp; NAT Traversal</h3>
              <label className="checkbox-control">
                <input
                  type="checkbox"
                  checked={draft.sipAlgCompat}
                  onChange={e => setDraft(s => ({ ...s, sipAlgCompat: e.target.checked }))}
                />
                <span className="checkbox-label">
                  Enable SIP ALG &amp; symmetric RTP compatibility
                </span>
              </label>
              <p className="form-helper-msg">
                Compensates for aggressive router SIP inspection and STUN port re-mapping.
              </p>
            </div>
          </div>
        )}

        {/* TAB: AUDIO */}
        {settingsTab === 'audio' && (
          <div className="settings-section">
            <div className="settings-card">
              <h3 className="settings-card-title">Audio Hardware</h3>
              <Select
                label="Microphone"
                options={inputOptions}
                value={draft.audioInput}
                onChange={e => setDraft(s => ({ ...s, audioInput: e.target.value }))}
              />
              <Select
                label="Speaker"
                options={outputOptions}
                value={draft.audioOutput}
                onChange={e => setDraft(s => ({ ...s, audioOutput: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* TAB: DIAGNOSTICS */}
        {settingsTab === 'diagnostics' && (
          <div className="settings-section">
            <div className="settings-card">
              <h3 className="settings-card-title">Diagnostics &amp; System Health</h3>
              <p className="card-desc">
                Run connectivity and device tests against your Yeastar PBX and inspect network latencies.
              </p>
              <div className="btn-group-row">
                <Button
                  variant="amber"
                  icon={<Activity size={16} aria-hidden="true" />}
                  onClick={onStartDiagnostics}
                >
                  Run Network Diagnostics
                </Button>
                <Button
                  variant="secondary"
                  icon={<Download size={16} aria-hidden="true" />}
                  onClick={handleExportErrorLog}
                >
                  Export Diagnostics Log
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ABOUT */}
        {settingsTab === 'about' && (
          <div className="settings-section">
            <div className="settings-card">
              <h3 className="settings-card-title">Merlin SIP Suite</h3>
              <div className="about-info-grid">
                <span className="about-label">Version:</span>
                <span className="about-value">v1.3.9.3</span>
                <span className="about-label">Platform:</span>
                <span className="about-value">Web Application (React 19 / TypeScript)</span>
                <span className="about-label">License:</span>
                <span className="about-value">{draft.licenseStatus || 'Commercial Enterprise'}</span>
                <span className="about-label">Vendor:</span>
                <span className="about-value">CK Media Services</span>
              </div>
            </div>
            <div className="settings-card settings-danger-zone">
              <h3 className="settings-card-title">Reset Softphone</h3>
              <p className="card-desc">
                Clear all stored configurations, accounts, and call records from this browser.
              </p>
              <Button
                variant="danger"
                icon={<RotateCcw size={16} aria-hidden="true" />}
                onClick={onResetApp}
              >
                Reset Application Data
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
