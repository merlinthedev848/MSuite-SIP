import { useState, useEffect, useRef } from 'react';
import logo from './assets/logo.png';
import type { Contact, CallRecord, ActiveCall, AudioDevice, SipSettings } from './types';
import { CredentialsScreen } from './components/CredentialsScreen';
import { DialPad } from './components/DialPad';
import { CallHistoryList } from './components/CallHistoryList';
import { ContactList } from './components/ContactList';
import { ActiveCallOverlay } from './components/ActiveCallOverlay';
import { SettingsModal } from './components/SettingsModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';

const INITIAL_CONTACTS: Contact[] = [];

export default function App() {
  // Navigation & Authentication
  const [step, setStep] = useState<'credentials' | 'main'>(() => {
    try {
      const cached = localStorage.getItem('merlin_sip_config');
      return cached ? 'main' : 'credentials';
    } catch {
      return 'credentials';
    }
  });
  const [allowCustomSip] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [authMode, setAuthMode] = useState<'provision' | 'manual'>('provision');
  const [provisionCode, setProvisionCode] = useState('');

  // Settings & Configuration
  const [settings, setSettings] = useState<SipSettings>(() => {
    const defaultSettings: SipSettings = {
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
      licenseStatus: 'Active (Commercial)'
    };
    try {
      const cached = localStorage.getItem('merlin_sip_config');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...defaultSettings, ...parsed };
        }
      }
    } catch (e) {
      console.error('Failed to parse cached config', e);
    }
    return defaultSettings;
  });

  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([]);

  // Main UI State
  const [registered, setRegistered] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('merlin_sip_config'));
    } catch {
      return false;
    }
  });
  const [registerStatusText, setRegisterStatusText] = useState('Not registered. This page does not open a SIP connection.');
  const [destination, setDestination] = useState('');
  const [activeTab, setActiveTab] = useState<'phone' | 'history' | 'contacts'>('phone');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'account' | 'handling' | 'audio' | 'diagnostics' | 'about'>('general');

  // Call & Data State
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callHistory, setCallHistory] = useState<CallRecord[]>(() => {
    try {
      const cached = localStorage.getItem('merlin_sip_history');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse cached history', e);
    }
    return [];
  });
  const [contacts] = useState<Contact[]>(INITIAL_CONTACTS);

  // Diagnostics State
  const [showDiagConsole, setShowDiagConsole] = useState(false);
  const [diagLogs, setDiagLogs] = useState('');
  const [diagStatus, setDiagStatus] = useState('Initializing Diagnostics...');
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagComplete, setDiagComplete] = useState(false);
  const [diagPass, setDiagPass] = useState(true);

  // Timers & Cancellation
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diagCancelRef = useRef<boolean>(false);

  const clearCallProgressionTimers = () => {
    if (dialTimeoutRef.current) {
      clearTimeout(dialTimeoutRef.current);
      dialTimeoutRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearCallProgressionTimers();
    };
  }, []);

  // Audio media device enumeration on startup
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .catch(() => navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([]))
      .then(devices => {
        const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, name: d.label || `Microphone (${d.deviceId.slice(0, 4)})` }));
        const outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, name: d.label || `Speaker (${d.deviceId.slice(0, 4)})` }));
        setAudioInputs(inputs);
        setAudioOutputs(outputs);
        if (inputs.length > 0) setSettings(s => ({ ...s, audioInput: inputs[0].id }));
        if (outputs.length > 0) setSettings(s => ({ ...s, audioOutput: outputs[0].id }));
      })
      .catch(() => {
        const defIn = [{ id: 'default', name: 'Default Audio Input' }];
        const defOut = [{ id: 'default', name: 'Default Audio Output' }];
        setAudioInputs(defIn);
        setAudioOutputs(defOut);
        setSettings(s => ({ ...s, audioInput: 'default', audioOutput: 'default' }));
      });
  }, []);

  // Call duration timer
  const isCallConnected = activeCall?.state === 'connected';
  useEffect(() => {
    if (isCallConnected) {
      callTimerRef.current = setInterval(() => {
        setActiveCall(prev => prev ? { ...prev, duration: prev.duration + 1 } : null);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [isCallConnected]);

  const handleCredentialsSubmit = () => {
    setErrorText('');
    if (authMode === 'provision') {
      if (!provisionCode.trim()) {
        setErrorText('Enter a provisioning code.');
        return;
      }
    } else {
      if (!settings.extension.trim()) {
        setErrorText('Enter the user / extension.');
        return;
      }
      if (!settings.username.trim() || !settings.password?.trim()) {
        setErrorText('Enter the login username and password.');
        return;
      }
      if (allowCustomSip && !settings.sipServer.trim()) {
        setErrorText('Enter the PBX server.');
        return;
      }
    }

    const updatedConfig: SipSettings = { ...settings };

    try {
      localStorage.setItem('merlin_sip_config', JSON.stringify(updatedConfig));
    } catch (e) {
      console.error('Failed to save SIP settings', e);
      setErrorText('Could not save settings in this browser. Storage may be blocked.');
      return;
    }
    setSettings(updatedConfig);
    setRegistered(false);
    setRegisterStatusText(
      authMode === 'provision'
        ? 'Provisioning codes are not sent from this page. Use Merlin SIP Web or the desktop phone to activate an account.'
        : 'Settings saved. This page does not register with the PBX.'
    );
    setStep('main');
  };

  const handleKeyPress = (num: string) => {
    if (activeCall) return;
    setDestination(prev => prev + num);
  };

  const handleBackspace = () => {
    setDestination(prev => prev.slice(0, -1));
  };

  const handleMakeCall = () => {
    if (!destination.trim()) return;
    clearCallProgressionTimers();
    setActiveCall(null);
    setRegisterStatusText('This page cannot place a SIP call.');
  };

  const handleHangUp = () => {
    if (!activeCall) return;
    clearCallProgressionTimers();

    const durationMinSec = `${Math.floor(activeCall.duration / 60)}:${(activeCall.duration % 60).toString().padStart(2, '0')}`;
    const newRecord: CallRecord = {
      id: Date.now().toString(),
      destination: activeCall.destination,
      type: 'outgoing',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: activeCall.state === 'connected' ? durationMinSec : 'Cancelled'
    };
    const updatedHistory = [newRecord, ...callHistory];
    setCallHistory(updatedHistory);
    try {
      localStorage.setItem('merlin_sip_history', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('Failed to save call history', e);
      setRegisterStatusText('Call ended, but history could not be saved in this browser.');
    }

    setActiveCall(null);
    setDestination('');
  };

  const toggleMute = () => {
    setActiveCall(prev => prev ? { ...prev, muted: !prev.muted } : null);
  };

  const toggleHold = () => {
    setActiveCall(prev => prev ? {
      ...prev,
      state: prev.state === 'hold' ? 'connected' : 'hold'
    } : null);
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all call history?')) {
      setCallHistory([]);
      try {
        localStorage.removeItem('merlin_sip_history');
      } catch (e) {
        console.error('Failed to clear call history', e);
        setRegisterStatusText('Call history could not be cleared. Browser storage is blocked.');
      }
    }
  };

  const handleResetApp = () => {
    if (window.confirm('Reset application and remove cache?')) {
      clearCallProgressionTimers();
      try {
        localStorage.removeItem('merlin_sip_config');
        localStorage.removeItem('merlin_sip_history');
      } catch (e) {
        console.error('Failed to reset stored settings', e);
        setRegisterStatusText('Stored settings could not be removed. Browser storage is blocked.');
        return;
      }
      setStep('credentials');
      setRegistered(false);
      setShowSettings(false);
      setActiveCall(null);
    }
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    setDiagComplete(false);
    setDiagLogs('');
    diagCancelRef.current = false;

    const logs: string[] = [];
    const log = (msg: string, isError = false) => {
      const line = `${isError ? '[ERROR] ' : ''}${msg}\n`;
      logs.push(line);
      setDiagLogs(logs.join(''));
    };

    log("Starting Merlin Network Diagnostic Tool...");
    log("=================================================================");
    log(`Timestamp:         ${new Date().toISOString()}`);
    log("This page reports only checks the browser can actually perform.");
    log("=================================================================");

    const target = (settings.sipServer || '').trim();
    const steps: { name: string; action: () => Promise<boolean> }[] = [
      {
        name: "Configured server reachability", action: async () => {
          if (!target) {
            log("No SIP server is configured.");
            return false;
          }
          const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
          const started = performance.now();
          try {
            await fetch(url, { mode: 'no-cors', cache: 'no-store' });
            const ms = Math.round(performance.now() - started);
            log(`The browser reached ${url} in ${ms}ms. The response body is not readable from this page.`);
            return true;
          } catch (err) {
            log(`The browser could not reach ${url}. ${err instanceof Error ? err.message : ''}`.trim());
            return false;
          }
        }
      },
      {
        name: "Audio devices", action: async () => {
          if (!navigator.mediaDevices?.enumerateDevices) {
            log("This browser cannot list audio devices.");
            return false;
          }
          const devices = await navigator.mediaDevices.enumerateDevices();
          const inputs = devices.filter(device => device.kind === 'audioinput').length;
          const outputs = devices.filter(device => device.kind === 'audiooutput').length;
          log(`Audio inputs: ${inputs}. Audio outputs: ${outputs}.`);
          return inputs > 0 && outputs > 0;
        }
      }
    ];

    let passedCount = 0;

    for (let i = 0; i < steps.length; i++) {
      if (diagCancelRef.current) {
        log("Diagnostics aborted by user.");
        setDiagStatus("Diagnostics Aborted");
        setDiagRunning(false);
        return;
      }
      setDiagStatus(`Running: ${steps[i].name}...`);
      log(`\n=== CHECK ${i + 1}/${steps.length}: ${steps[i].name.toUpperCase()} ===`);
      log("-----------------------------------------------------------------");

      const pass = await steps[i].action();
      if (pass) passedCount += 1;
    }

    log("\n=================================================================");
    if (passedCount === steps.length) {
      log(`All ${steps.length} checks passed.`);
      setDiagStatus("Diagnostics Completed - PASS");
      setDiagPass(true);
    } else {
      log(`${passedCount} of ${steps.length} checks passed.`);
      setDiagStatus("Diagnostics Completed - FAIL/WARN");
      setDiagPass(false);
    }
    setDiagComplete(true);
    setDiagRunning(false);
  };

  return (
    <div className="app-container">
      {/* 1. Setup / Credentials Flow */}
      {step === 'credentials' && (
        <CredentialsScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          provisionCode={provisionCode}
          setProvisionCode={setProvisionCode}
          sipServer={settings.sipServer}
          setSipServer={server => setSettings(s => ({ ...s, sipServer: server }))}
          extension={settings.extension}
          setExtension={ext => setSettings(s => ({ ...s, extension: ext }))}
          username={settings.username}
          setUsername={user => setSettings(s => ({ ...s, username: user }))}
          password={settings.password || ''}
          setPassword={pwd => setSettings(s => ({ ...s, password: pwd }))}
          allowCustomSip={allowCustomSip}
          selectedInput={settings.audioInput}
          setSelectedInput={id => setSettings(s => ({ ...s, audioInput: id }))}
          selectedOutput={settings.audioOutput}
          setSelectedOutput={id => setSettings(s => ({ ...s, audioOutput: id }))}
          audioInputs={audioInputs}
          audioOutputs={audioOutputs}
          errorText={errorText}
          onSubmit={handleCredentialsSubmit}
        />
      )}

      {/* 2. Main Softphone App */}
      {step === 'main' && (
        <div className="main-layout">
          {/* Header */}
          <div className="header">
            <div className="header-brand">
              <div className="brand-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#101622' }}>
                <img src={logo} alt="CK Media logo" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              </div>
              <span className="brand-text">Merlin SIP</span>
            </div>
            <div className={`status-pill ${registered ? 'connected' : 'disconnected'}`}>
              <div className="status-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: registered ? 'var(--success-color)' : 'var(--danger-color)' }} />
              {registered ? 'Connected' : 'Offline'}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="main-content">
            {/* Tabs */}
            <div className="tab-control">
              <button 
                className={`tab-item ${activeTab === 'phone' ? 'active' : ''}`}
                onClick={() => setActiveTab('phone')}
              >
                Phone
              </button>
              <button 
                className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                History
              </button>
              <button 
                className={`tab-item ${activeTab === 'contacts' ? 'active' : ''}`}
                onClick={() => setActiveTab('contacts')}
              >
                Contacts
              </button>
            </div>

            {/* TAB: Phone Dialpad */}
            {activeTab === 'phone' && (
              <DialPad
                destination={destination}
                setDestination={setDestination}
                onMakeCall={handleMakeCall}
                onBackspace={handleBackspace}
                onKeyPress={handleKeyPress}
              />
            )}

            {/* TAB: Call History */}
            {activeTab === 'history' && (
              <CallHistoryList
                history={callHistory}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onSelectDestination={(dest) => {
                  setDestination(dest);
                  setActiveTab('phone');
                }}
                onClearHistory={handleClearHistory}
              />
            )}

            {/* TAB: Contacts */}
            {activeTab === 'contacts' && (
              <ContactList
                contacts={contacts}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onSelectDestination={(dest) => {
                  setDestination(dest);
                  setActiveTab('phone');
                }}
              />
            )}
          </div>

          {/* Footer status bar */}
          <div className="footer">
            <span>{registerStatusText}</span>
            <span className="footer-link" onClick={() => {
              setSettingsTab('general');
              setShowSettings(true);
            }}>
              Settings
            </span>
          </div>
        </div>
      )}

      {/* 3. Call overlay (Active Call) */}
      {activeCall && (
        <ActiveCallOverlay
          call={activeCall}
          onToggleMute={toggleMute}
          onToggleHold={toggleHold}
          onHangUp={handleHangUp}
          onTransfer={() => {
            setRegisterStatusText('Transfer is not available on this page.');
          }}
        />
      )}

      {/* 4. Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        settings={settings}
        setSettings={setSettings}
        audioInputs={audioInputs}
        audioOutputs={audioOutputs}
        onStartDiagnostics={() => {
          setShowSettings(false);
          setShowDiagConsole(true);
          runDiagnostics();
        }}
        onResetApp={handleResetApp}
      />

      {/* 5. Diagnostics Terminal Modal */}
      <DiagnosticsModal
        isOpen={showDiagConsole}
        onClose={() => setShowDiagConsole(false)}
        diagStatus={diagStatus}
        diagLogs={diagLogs}
        diagRunning={diagRunning}
        diagComplete={diagComplete}
        diagPass={diagPass}
        onRunDiagnostics={runDiagnostics}
        onAbortDiagnostics={() => {
          diagCancelRef.current = true;
        }}
      />
    </div>
  );
}
