import { useState, useCallback, useMemo } from 'react';
import logo from './assets/logo.png';
import type { Contact, AppStep, MainTab, SettingsTab, SipSettings } from './types';
import { useSipSettings } from './hooks/useSipSettings';
import { useAudioDevices } from './hooks/useAudioDevices';
import { useCallManager } from './hooks/useCallManager';
import { useDiagnostics } from './hooks/useDiagnostics';
import { CredentialsScreen } from './components/CredentialsScreen';
import { DialPad } from './components/DialPad';
import { CallHistoryList } from './components/CallHistoryList';
import { ContactList } from './components/ContactList';
import { ActiveCallOverlay } from './components/ActiveCallOverlay';
import { SettingsModal } from './components/SettingsModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { Badge } from './components/ui/Badge';
import { Tabs } from './components/ui/Tabs';
import { Phone, Clock, Users, Settings } from 'lucide-react';

const INITIAL_CONTACTS: Contact[] = [
  { name: 'Technical Support', number: '100', presence: 'online', company: 'Operations' },
  { name: 'Engineering Queue', number: '101', presence: 'busy', company: 'Network Eng' },
  { name: 'Operations Bridge', number: '500', presence: 'online', company: 'NOC' },
  { name: 'Conference Room 1', number: '800', presence: 'offline', company: 'Main Office' }
];

const MAIN_TABS = [
  { id: 'phone' as const, label: 'Phone', icon: <Phone size={15} /> },
  { id: 'history' as const, label: 'History', icon: <Clock size={15} /> },
  { id: 'contacts' as const, label: 'Contacts', icon: <Users size={15} /> }
];

export default function App() {
  const { settings, saveSettings, resetSettings, hasConfig } = useSipSettings();
  const { audioInputs, audioOutputs } = useAudioDevices();
  const {
    destination,
    setDestination,
    handleKeyPress,
    handleBackspace,
    activeCall,
    callHistory,
    makeCall,
    hangUp,
    toggleMute,
    toggleHold,
    clearHistory,
    resetCalls
  } = useCallManager();

  const {
    isRunning: diagRunning,
    isComplete: diagComplete,
    isPass: diagPass,
    statusText: diagStatus,
    logs: diagLogs,
    runDiagnostics,
    abortDiagnostics
  } = useDiagnostics(settings.sipServer);

  // Navigation & Modal View States
  const [step, setStep] = useState<AppStep>(() => (hasConfig ? 'main' : 'credentials'));
  const [activeTab, setActiveTab] = useState<MainTab>('phone');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [footerNotice, setFooterNotice] = useState<string>('Connected to PBX signaling bridge.');

  const contacts = useMemo<Contact[]>(() => INITIAL_CONTACTS, []);

  // Handlers
  const handleCredentialsSubmit = useCallback((newSettings: SipSettings) => {
    saveSettings(newSettings);
    setStep('main');
    setFooterNotice(`Registered extension ${newSettings.extension} to ${newSettings.sipServer}`);
  }, [saveSettings]);

  const handleSelectContactDestination = useCallback((number: string) => {
    setDestination(number);
    setActiveTab('phone');
  }, [setDestination]);

  const handleVideoCall = useCallback((number: string) => {
    setDestination(number);
    makeCall(number);
  }, [setDestination, makeCall]);

  const handleResetApp = useCallback(() => {
    if (window.confirm('Reset application data and clear all saved settings?')) {
      resetCalls();
      resetSettings();
      setShowSettings(false);
      setStep('credentials');
    }
  }, [resetCalls, resetSettings]);

  const handleStartDiagnostics = useCallback(() => {
    setShowSettings(false);
    setShowDiagnostics(true);
    runDiagnostics();
  }, [runDiagnostics]);

  return (
    <div className="app-container" role="main">
      {/* 1. Setup / Credentials Screen */}
      {step === 'credentials' && (
        <CredentialsScreen
          initialSettings={settings}
          audioInputs={audioInputs}
          audioOutputs={audioOutputs}
          onSubmit={handleCredentialsSubmit}
        />
      )}

      {/* 2. Main Softphone Interface */}
      {step === 'main' && (
        <div className="main-layout">
          {/* Header */}
          <header className="header">
            <div className="header-brand">
              <div className="brand-icon" aria-hidden="true">
                <img src={logo} alt="Merlin SIP" className="brand-logo-img" />
              </div>
              <div className="brand-text-group">
                <span className="brand-text">Merlin SIP</span>
                <span className="brand-subtext">Ext {settings.extension || '100'}</span>
              </div>
            </div>

            <div className="header-right-actions">
              <Badge
                variant={hasConfig ? 'success' : 'neutral'}
                size="sm"
                dot
              >
                {hasConfig ? 'Online' : 'Offline'}
              </Badge>
              <button
                type="button"
                className="header-icon-btn"
                onClick={() => {
                  setSettingsTab('general');
                  setShowSettings(true);
                }}
                aria-label="Open application settings"
                title="Settings"
              >
                <Settings size={18} aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Navigation Tabs */}
          <nav className="main-nav">
            <Tabs<MainTab>
              tabs={MAIN_TABS}
              activeTab={activeTab}
              onChange={setActiveTab}
              ariaLabel="Softphone navigation tabs"
            />
          </nav>

          {/* Main Content Viewport */}
          <main className="main-content">
            {activeTab === 'phone' && (
              <DialPad
                destination={destination}
                setDestination={setDestination}
                onMakeCall={makeCall}
                onBackspace={handleBackspace}
                onKeyPress={handleKeyPress}
              />
            )}

            {activeTab === 'history' && (
              <CallHistoryList
                history={callHistory}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onSelectDestination={handleSelectContactDestination}
                onClearHistory={clearHistory}
              />
            )}

            {activeTab === 'contacts' && (
              <ContactList
                contacts={contacts}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onSelectDestination={handleSelectContactDestination}
                onVideoCallDestination={handleVideoCall}
              />
            )}
          </main>

          {/* Footer Bar */}
          <footer className="footer">
            <span className="footer-status" title={footerNotice}>
              {footerNotice}
            </span>
            <button
              type="button"
              className="footer-link-btn"
              onClick={() => {
                setSettingsTab('diagnostics');
                setShowSettings(true);
              }}
            >
              System Health
            </button>
          </footer>
        </div>
      )}

      {/* 3. Active Call Overlay */}
      {activeCall && (
        <ActiveCallOverlay
          call={activeCall}
          onToggleMute={toggleMute}
          onToggleHold={toggleHold}
          onHangUp={hangUp}
          onTransfer={(target) => {
            setFooterNotice(`Transferred call with ${activeCall.destination} to ${target}`);
            hangUp();
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
        onSaveSettings={saveSettings}
        audioInputs={audioInputs}
        audioOutputs={audioOutputs}
        onStartDiagnostics={handleStartDiagnostics}
        onResetApp={handleResetApp}
      />

      {/* 5. Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        diagStatus={diagStatus}
        diagLogs={diagLogs}
        diagRunning={diagRunning}
        diagComplete={diagComplete}
        diagPass={diagPass}
        onRunDiagnostics={runDiagnostics}
        onAbortDiagnostics={abortDiagnostics}
      />
    </div>
  );
}
