import React from 'react';
import logo from '../assets/logo.png';
import type { AudioDevice } from '../types';

interface CredentialsScreenProps {
  authMode: 'provision' | 'manual';
  setAuthMode: (mode: 'provision' | 'manual') => void;
  provisionCode: string;
  setProvisionCode: (code: string) => void;
  sipServer: string;
  setSipServer: (server: string) => void;
  extension: string;
  setExtension: (ext: string) => void;
  username: string;
  setUsername: (user: string) => void;
  password: string;
  setPassword: (pwd: string) => void;
  allowCustomSip: boolean;
  selectedInput: string;
  setSelectedInput: (id: string) => void;
  selectedOutput: string;
  setSelectedOutput: (id: string) => void;
  audioInputs: AudioDevice[];
  audioOutputs: AudioDevice[];
  errorText: string;
  onSubmit: () => void;
}

export const CredentialsScreen: React.FC<CredentialsScreenProps> = ({
  authMode,
  setAuthMode,
  provisionCode,
  setProvisionCode,
  sipServer,
  setSipServer,
  extension,
  setExtension,
  username,
  setUsername,
  password,
  setPassword,
  allowCustomSip,
  selectedInput,
  setSelectedInput,
  selectedOutput,
  setSelectedOutput,
  audioInputs,
  audioOutputs,
  errorText,
  onSubmit
}) => {
  return (
    <div className="setup-container">
      <div className="setup-header">
        <div className="setup-logo-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={logo} className="setup-logo" alt="CK Media logo" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        </div>
        <h1 className="setup-title">Merlin SIP</h1>
        <p className="setup-subtitle">Choose how to authenticate this device.</p>
      </div>

      <div className="auth-modes" style={{ display: 'flex', gap: '24px', margin: '0 0 16px 0', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--muted-color)' }}>
          <input 
            type="radio" 
            name="authMode" 
            checked={authMode === 'provision'} 
            onChange={() => setAuthMode('provision')} 
            style={{ cursor: 'pointer', accentColor: 'var(--amber-color)' }}
          />
          Provisioning code
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--muted-color)' }}>
          <input 
            type="radio" 
            name="authMode" 
            checked={authMode === 'manual'} 
            onChange={() => setAuthMode('manual')} 
            style={{ cursor: 'pointer', accentColor: 'var(--amber-color)' }}
          />
          SIP details
        </label>
      </div>

      {authMode === 'provision' ? (
        <div className="form-group">
          <label className="form-label">Provisioning code</label>
          <input 
            type="text" 
            maxLength={8}
            className="form-input" 
            value={provisionCode} 
            onChange={e => setProvisionCode(e.target.value)} 
          />
        </div>
      ) : (
        <>
          {allowCustomSip && (
            <div className="form-group">
              <label className="form-label">PBX server</label>
              <input 
                type="text" 
                className="form-input" 
                value={sipServer} 
                onChange={e => setSipServer(e.target.value)} 
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">User / extension</label>
            <input 
              type="text" 
              className="form-input" 
              value={extension} 
              onChange={e => setExtension(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Auth username</label>
            <input 
              type="text" 
              className="form-input" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>
        </>
      )}

      <div className="form-group">
        <label className="form-label">Audio input</label>
        <select 
          className="form-input" 
          value={selectedInput} 
          onChange={e => setSelectedInput(e.target.value)}
        >
          {audioInputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 30 }}>
        <label className="form-label">Audio output</label>
        <select 
          className="form-input" 
          value={selectedOutput} 
          onChange={e => setSelectedOutput(e.target.value)}
        >
          {audioOutputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {errorText && <div className="error-text">{errorText}</div>}

      <div className="setup-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
        <button className="btn btn-primary" onClick={onSubmit} style={{ width: 140 }}>
          {authMode === 'provision' ? 'Provision' : 'Connect'}
        </button>
      </div>
    </div>
  );
};
