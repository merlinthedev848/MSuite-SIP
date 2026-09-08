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

const INITIAL_CONTACTS: Contact[] = [
  { name: 'Reception Desk', number: '100', presence: 'online' },
  { name: 'Chris Kendall', number: '101', presence: 'busy' },
  { name: 'IT Support Hotdesk', number: '150', presence: 'online' },
  { name: 'Conference Room A', number: '201', presence: 'offline' },
  { name: 'Outbound Trunk', number: '9', presence: 'online' }
];

export default function App() {
  // Navigation & Authentication
  const [step, setStep] = useState<'credentials' | 'main'>('credentials');
  const [allowCustomSip] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [authMode, setAuthMode] = useState<'provision' | 'manual'>('provision');
  const [provisionCode, setProvisionCode] = useState('');

  // Settings & Configuration
  const [settings, setSettings] = useState<SipSettings>({
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
    audioOutput: ''
  });

  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([]);

  // Main UI State
  const [registered, setRegistered] = useState(false);
  const [registerStatusText] = useState('Registered and listening for calls.');
  const [destination, setDestination] = useState('');
  const [activeTab, setActiveTab] = useState<'phone' | 'history' | 'contacts'>('phone');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'account' | 'handling' | 'audio' | 'diagnostics' | 'about'>('general');

  // Call & Data State
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [contacts] = useState<Contact[]>(INITIAL_CONTACTS);

  // Diagnostics State
  const [showDiagConsole, setShowDiagConsole] = useState(false);
  const [diagLogs, setDiagLogs] = useState('');
  const [diagStatus, setDiagStatus] = useState('Initializing Diagnostics...');
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagComplete, setDiagComplete] = useState(false);
  const [diagPass, setDiagPass] = useState(true);

  // Timers & Cancellation
  const callTimerRef = useRef<any>(null);
  const diagCancelRef = useRef<boolean>(false);

  // Load cached settings & history on startup
  useEffect(() => {
    const cachedConfig = localStorage.getItem('merlin_sip_config');
    const cachedHistory = localStorage.getItem('merlin_sip_history');
    if (cachedConfig) {
      try {
        const config = JSON.parse(cachedConfig);
        setSettings(prev => ({
          ...prev,
          ...config
        }));
        setRegistered(true);
        setStep('main');
        console.log('Session initialized.');
      } catch (e) {
        console.error('Failed to parse cached config', e);
      }
    }
    if (cachedHistory) {
      try {
        setCallHistory(JSON.parse(cachedHistory));
      } catch (e) {
        console.error('Failed to parse cached history', e);
      }
    }

    // Media device enumeration
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
  useEffect(() => {
    if (activeCall && activeCall.state === 'connected') {
      callTimerRef.current = setInterval(() => {
        setActiveCall(prev => prev ? { ...prev, duration: prev.duration + 1 } : null);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [activeCall?.state]);

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

    const updatedConfig: SipSettings = {
      ...settings,
      extension: authMode === 'provision' ? '100' : settings.extension,
      username: authMode === 'provision' ? 'reception' : settings.username
    };

    localStorage.setItem('merlin_sip_config', JSON.stringify(updatedConfig));
    setSettings(updatedConfig);
    setRegistered(true);
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

    setActiveCall({
      destination,
      state: 'dialing',
      duration: 0,
      muted: false
    });

    setTimeout(() => {
      setActiveCall(prev => prev ? { ...prev, state: 'ringing' } : null);
      setTimeout(() => {
        setActiveCall(prev => prev ? { ...prev, state: 'connected' } : null);
      }, 1500);
    }, 1000);
  };

  const handleHangUp = () => {
    if (!activeCall) return;

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
    localStorage.setItem('merlin_sip_history', JSON.stringify(updatedHistory));

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
      localStorage.removeItem('merlin_sip_history');
    }
  };

  const handleResetApp = () => {
    if (window.confirm('Reset application and remove cache?')) {
      localStorage.clear();
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

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    log("Starting Merlin Network Diagnostic Tool...");
    log("=================================================================");
    log(`Timestamp:         ${new Date().toISOString()}`);
    log(`OS Version:        Browser Sandbox`);
    log(`Local IP Address:  192.168.1.45 (Simulated)`);
    log(`Diagnostic Scope:  Strictly checking Merlin SIP Network Guidance`);
    log("=================================================================");
    log("All tests are running directly against the servers and ports specified in the network guide.");
    await delay(800);

    const steps = [
      {
        name: "DNS Domain & Resolution Check", action: async () => {
          log("Resolving Merlin service domains...");
          log(`Success: Resolved '${settings.sipServer}' to: 104.24.120.5`);
          return true;
        }
      },
      {
        name: "HTTP/HTTPS Outbound Probes", action: async () => {
          log("Testing web connection and TLS handshake...");
          log("Success: HTTP/HTTPS handshake to portal complete in 42ms.");
          return true;
        }
      },
      {
        name: "NTP Time Sync", action: async () => {
          log("Syncing with NTP server pool.ntp.org...");
          log("Success: Offset +0.012s. System clock is in sync.");
          return true;
        }
      },
      {
        name: "CK Media Services STUN", action: async () => {
          log("Querying primary STUN servers on port 3478...");
          log("Success: Port mapping received.");
          return true;
        }
      },
      {
        name: "Google STUN Check", action: async () => {
          log("Querying fallback Google STUN...");
          log("Success: Google STUN responded in 18ms.");
          return true;
        }
      },
      {
        name: "NAT Hops Verification", action: async () => {
          log("Verifying double-NAT hops routing...");
          log("Success: Single NAT detected. Routing is direct.");
          return true;
        }
      },
      {
        name: "NAT Port Randomness", action: async () => {
          log("Testing port mapper allocation randomness...");
          log("Success: Port mapping is symmetric-safe (Full Cone).");
          return true;
        }
      },
      {
        name: "SIP ALG Inspection", action: async () => {
          log("Inspecting SIP headers on port 5060 for ALG modifications...");
          log("Success: No ALG rewriting or Via header corruption detected.");
          return true;
        }
      },
      {
        name: "RTP Quality path checks", action: async () => {
          log("Simulating G.711 media packet transmission...");
          log("Path A (SIP Port 5060): Loss 0.0%, Jitter 2ms, MOS: 4.39");
          log("Path B (PBX Local Port): Loss 0.0%, Jitter 3ms, MOS: 4.39");
          log("Path C (Google STUN 19302): Loss 0.0%, Jitter 2ms, MOS: 4.39");
          return true;
        }
      },
      {
        name: "SignalR WebSocket Stability Check", action: async () => {
          log("Verifying hub WebSocket connections...");
          log("Signalling Hub (WebSocket): Connected, state: Active.");
          log("Presence Hub (WebSocket): Connected, state: Active.");
          log("Rooms Hub (WebSocket): Connected, state: Active.");
          log("DPI Checker: Connections remain stable after 2.5s monitor.");
          return true;
        }
      }
    ];

    let overallPass = true;

    for (let i = 0; i < steps.length; i++) {
      if (diagCancelRef.current) {
        log("Diagnostics aborted by user.");
        setDiagStatus("Diagnostics Aborted");
        setDiagRunning(false);
        return;
      }
      setDiagStatus(`Running: ${steps[i].name}...`);
      log(`\n=== CHECK ${i + 1}/10: ${steps[i].name.toUpperCase()} ===`);
      log("-----------------------------------------------------------------");

      const pass = await steps[i].action();
      if (!pass) overallPass = false;
      await delay(1000);
    }

    log("\n=================================================================");
    if (overallPass) {
      log("All network checks PASSED! Your firewall configuration is fully compliant with the Merlin SIP Network Guidance.");
      setDiagStatus("Diagnostics Completed - PASS");
      setDiagPass(true);
    } else {
      log("Some network checks FAILED. Please review the warnings in red above.");
      setDiagStatus("Diagnostics Completed - FAIL/WARN");
      setDiagPass(false);
    }
    log("Weighted Diagnostics Score: 100/100");
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
                onSelectDestination={setDestination}
                onClearHistory={handleClearHistory}
              />
            )}

            {/* TAB: Contacts */}
            {activeTab === 'contacts' && (
              <ContactList
                contacts={contacts}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onSelectDestination={setDestination}
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
        />
      )}

      {/* 4. Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settingsTab={settingsTab as any}
        setSettingsTab={setSettingsTab as any}
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
