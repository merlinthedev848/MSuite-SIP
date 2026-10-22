<?php
declare(strict_types=1);

$version = '1.2.8';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#111317">
  <title>Merlin SIP Web - Enterprise WebRTC Softphone</title>
  <link rel="icon" href="assets/CKMedia-Icon.ico">
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <!-- Background Remote Audio Track -->
  <audio id="remoteAudio" autoplay playsinline></audio>

  <!-- 1. Permission Gate Modal -->
  <div id="permissionGate" class="permission-gate hidden" role="dialog" aria-modal="true" aria-labelledby="permHeading">
    <div class="setup-card">
      <img src="assets/CKMedia-Icon.png" alt="Merlin SIP" class="setup-logo">
      <h1 id="permHeading">Merlin SIP</h1>
      <p style="color: var(--muted); margin-bottom: 20px;">Preparing high-definition secure browser voice calling.</p>
      <button id="enableAudioButton" class="primary-button" style="width: 100%;">Allow microphone and speakers</button>
      <p id="permissionGateText" style="font-size: 12px; color: var(--muted); margin-top: 14px;">Your browser will request microphone permission to connect WebRTC voice streams.</p>
    </div>
  </div>

  <!-- 2. Setup & Provisioning Mandatory Gate Modal -->
  <div id="setupOverlay" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="setupHeading">
    <div class="setup-card" style="width: min(100%, 460px);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="assets/CKMedia-Icon.png" alt="Merlin SIP" style="width: 32px; height: 32px;">
          <h2 id="setupHeading" style="margin: 0; font-size: 20px;">Setup Merlin SIP</h2>
        </div>
        <button id="btnCloseSetup" class="soft-button hidden" style="min-height: 32px; padding: 4px 10px;">Close</button>
      </div>
      <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">Enter your PIN code or SIP connectivity credentials to access the softphone.</p>

      <div class="tabs" style="margin-bottom: 18px;">
        <button id="btnAuthModeProvision" class="tab-button active" type="button">Provisioning PIN Code</button>
        <button id="btnAuthModeManual" class="tab-button" type="button">Manual SIP Setup</button>
      </div>

      <div id="provisionFields">
        <label style="display: block; margin-bottom: 16px;">
          <span style="font-size: 13px; font-weight: 600; color: var(--muted);">8-Digit Provisioning PIN Code</span>
          <input id="setupProvisionCode" type="text" maxlength="8" placeholder="e.g. 84920194" style="font-size: 18px; font-weight: 700; letter-spacing: 2px; text-align: center; margin-top: 6px;" autocomplete="off">
        </label>
        <p style="font-size: 12px; color: var(--muted); margin: 0 0 16px 0;">Enter the 8-digit activation PIN supplied by your PBX administrator or telephony portal.</p>
      </div>

      <div id="manualSipFields" class="hidden">
        <div style="display: grid; gap: 12px; margin-bottom: 16px;">
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted);">
            SIP WebSocket URL
            <input id="setupSipServer" type="text" placeholder="wss://your-sip-server:8089/ws" autocomplete="off">
          </label>
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted);">
            SIP Domain
            <input id="setupSipDomain" type="text" placeholder="your-pbx-domain.com" autocomplete="off">
          </label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted);">
              Extension
              <input id="setupExtension" type="text" placeholder="e.g. 101" autocomplete="off">
            </label>
            <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted);">
              Auth Username
              <input id="setupAuthUser" type="text" placeholder="optional (defaults to ext)" autocomplete="off">
            </label>
          </div>
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted);">
            Password
            <input id="setupPassword" type="password" placeholder="SIP secret password" autocomplete="current-password">
          </label>
        </div>
      </div>

      <div id="setupErrorText" style="color: var(--danger); font-size: 13px; font-weight: 600; margin-bottom: 14px; text-align: center;"></div>

      <button id="btnSubmitSetup" class="primary-button" style="width: 100%;">Connect & Activate</button>
    </div>
  </div>

  <!-- 3. Main Enterprise Workspace (Locked Until Authenticated) -->
  <main id="appShell" class="app-shell hidden">
    <!-- Side Rail Navigation -->
    <aside class="side-rail">
      <div class="brand-block">
        <div class="brand-icon-wrapper">
          <img src="assets/CKMedia-Icon.png" alt="Merlin SIP" class="brand-icon">
        </div>
        <strong>Merlin</strong>
        <span>SIP Web</span>
      </div>

      <nav class="rail-nav" aria-label="Primary Navigation">
        <button class="rail-button active" data-view="dialView" title="Softphone Dialer">Dial</button>
        <button class="rail-button" data-view="blfView" title="BLF Switchboard & Presence">Switchboard</button>
        <button class="rail-button" data-view="contactsView" title="Corporate Directory">Contacts</button>
        <button class="rail-button" data-view="callsView" title="Call History Logs">History</button>
        <button class="rail-button" data-view="featuresView" title="Voicemail & PBX Feature Codes">Voicemail</button>
        <button class="rail-button" data-view="recordingsView" title="In-Call Audio Recordings">Recordings</button>
        <button class="rail-button" data-view="diagView" title="10-Step Network Diagnostic Suite">Diagnostics</button>
        <button class="rail-button" data-open-settings title="SIP & Audio Preferences">Settings</button>
      </nav>

      <div class="rail-footer">
        <span>Merlin SIP Web</span>
        <small>v<?= htmlspecialchars($version, ENT_QUOTES) ?></small>
      </div>
    </aside>

    <!-- Workspace Main Body -->
    <section class="workspace">
      <!-- Top Search & Presence Bar -->
      <header class="top-bar">
        <div class="search-shell">
          <label for="globalSearch">Search / Dial</label>
          <input id="globalSearch" type="text" inputmode="tel" autocomplete="off" placeholder="Enter number or contact name and press Enter...">
          <button id="toggleWidgetModeButton" class="soft-button" style="min-height: 32px; padding: 4px 10px; font-size: 12px;" title="Toggle Mini Softphone Widget">Mini Mode</button>
        </div>

        <div class="top-actions">
          <!-- Voicemail MWI Badge Button -->
          <button id="btnMwiVoicemail" class="soft-button mwi-button" type="button" title="Open Voicemail Box (*97)">
            <span class="mwi-icon">&#128223;</span>
            <span id="mwiBadgeText">Voicemail</span>
          </button>

          <!-- Recording Active Indicator Pill -->
          <div id="recordingStatusPill" class="recording-pill hidden">
            <span class="rec-dot"></span>
            <span id="recordingTimerText">REC 00:00</span>
          </div>

          <!-- Presence Selector -->
          <div class="presence-container">
            <button id="presenceButton" class="presence-button available" type="button">
              <span class="presence-dot"></span>
              <strong>Available</strong>
            </button>
            <div id="presenceDropdown" class="presence-dropdown">
              <button class="presence-item" data-presence="available"><span class="presence-dot" style="background: var(--success);"></span> Available</button>
              <button class="presence-item" data-presence="busy"><span class="presence-dot" style="background: var(--danger);"></span> Busy</button>
              <button class="presence-item" data-presence="dnd"><span class="presence-dot" style="background: #b91c1c;"></span> DND (Do Not Disturb)</button>
              <button class="presence-item" data-presence="away"><span class="presence-dot" style="background: #eab308;"></span> Away</button>
              <button class="presence-item" data-presence="offline"><span class="presence-dot" style="background: #64748b;"></span> Offline</button>
            </div>
          </div>
        </div>
      </header>

      <!-- VIEW 1: Phone Dialer & Directory -->
      <section id="dialView" class="view active">
        <div class="dial-grid">
          <!-- Left: Dialer Panel -->
          <section class="panel dial-panel">
            <!-- Line 1 / Line 2 Multi-Line Bar -->
            <div class="line-selector-bar">
              <button id="btnLine1" class="line-tab active" type="button">Line 1: <span id="line1Status">Idle</span></button>
              <button id="btnLine2" class="line-tab" type="button">Line 2: <span id="line2Status">Idle</span></button>
              <button id="btnMergeConference" class="line-tab conf-tab hidden" type="button">Merge 3-Way Conf</button>
            </div>

            <div class="panel-heading">
              <div>
                <span class="eyebrow" style="color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase;">Softphone Line 1</span>
                <h2 id="displayNumber">Ready</h2>
                <p id="matchingContact">No active call</p>
              </div>
              <span id="callTimer" class="status-pill inactive">Inactive</span>
            </div>

            <div class="number-row">
              <input id="dialInput" type="text" inputmode="tel" autocomplete="off" aria-label="Phone number" placeholder="Destination...">
              <button id="clearDialButton" class="soft-button" type="button">Clear</button>
            </div>

            <div class="keypad" aria-label="Dial pad">
              <button class="dialpad-key" data-key="1"><span class="key-number">1</span><span class="key-letters">&nbsp;</span></button>
              <button class="dialpad-key" data-key="2"><span class="key-number">2</span><span class="key-letters">ABC</span></button>
              <button class="dialpad-key" data-key="3"><span class="key-number">3</span><span class="key-letters">DEF</span></button>
              <button class="dialpad-key" data-key="4"><span class="key-number">4</span><span class="key-letters">GHI</span></button>
              <button class="dialpad-key" data-key="5"><span class="key-number">5</span><span class="key-letters">JKL</span></button>
              <button class="dialpad-key" data-key="6"><span class="key-number">6</span><span class="key-letters">MNO</span></button>
              <button class="dialpad-key" data-key="7"><span class="key-number">7</span><span class="key-letters">PQRS</span></button>
              <button class="dialpad-key" data-key="8"><span class="key-number">8</span><span class="key-letters">TUV</span></button>
              <button class="dialpad-key" data-key="9"><span class="key-number">9</span><span class="key-letters">WXYZ</span></button>
              <button class="dialpad-key" data-key="*"><span class="key-number">*</span><span class="key-letters">&nbsp;</span></button>
              <button class="dialpad-key" data-key="0"><span class="key-number">0</span><span class="key-letters">+</span></button>
              <button class="dialpad-key" data-key="#"><span class="key-number">#</span><span class="key-letters">&nbsp;</span></button>
            </div>

            <button id="dialButton" class="call-button" type="button">Dial</button>
            <button id="hangupButton" class="hangup-button hidden" type="button">Hang Up</button>

            <!-- In-Call Control Strip -->
            <div id="inCallControls" class="in-call-controls hidden">
              <button id="muteButton" class="icon-button" type="button" title="Mute Microphone">Mic</button>
              <button id="holdButton" class="icon-button" type="button" title="Hold Call">Hold</button>
              <button id="transferButton" class="icon-button" type="button" title="Transfer Call">Transfer</button>
              <button id="recordButton" class="icon-button" type="button" title="Record Call Audio">Record</button>
              <button id="dtmfButton" class="icon-button" type="button" title="Send DTMF Key">DTMF</button>
            </div>
          </section>

          <!-- Right: Directory Panel -->
          <section class="panel directory-panel">
            <div class="panel-heading">
              <h2>Directory & Speed Dial</h2>
            </div>
            <div class="tabs">
              <button class="tab-button active" data-directory-tab="historyList">History</button>
              <button class="tab-button" data-directory-tab="contactsList">Contacts</button>
              <button class="tab-button" data-directory-tab="favoritesList">Favorites</button>
            </div>
            <div class="directory-table">
              <div class="table-head">
                <span>Name</span>
                <span>Number</span>
                <span style="text-align: right;">Action</span>
              </div>
              <div id="historyList" class="directory-list active"></div>
              <div id="contactsList" class="directory-list"></div>
              <div id="favoritesList" class="directory-list"></div>
            </div>
          </section>
        </div>
      </section>

      <!-- VIEW 2: BLF Switchboard Wallboard View -->
      <section id="blfView" class="view">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <h2>BLF Switchboard & Extension Monitor</h2>
              <p>Real-time corporate Busy Lamp Field (BLF) status, 1-click intercom, and direct call pickup (*8).</p>
            </div>
            <div class="blf-quick-actions">
              <button id="btnGroupPickup" class="primary-button" style="min-height: 36px; padding: 6px 14px; font-size: 13px;" type="button">Group Pickup (*8)</button>
              <button id="btnRefreshBlf" class="soft-button" style="min-height: 36px; padding: 6px 14px; font-size: 13px;" type="button">Refresh BLF</button>
            </div>
          </div>

          <div id="blfGrid" class="blf-wallboard-grid">
            <!-- Dynamic BLF Extension Cards rendered via JavaScript -->
          </div>
        </section>
      </section>

      <!-- VIEW 3: Contacts Management View -->
      <section id="contactsView" class="view">
        <div class="two-column">
          <section class="panel">
            <div class="panel-heading">
              <h2>Corporate Contacts</h2>
              <button id="callSelectedContactButton" class="soft-button" type="button">Call Selected</button>
            </div>
            <div id="phonebookList" class="contact-list"></div>
          </section>

          <section class="panel contact-editor">
            <h2>Contact Details</h2>
            <label>Name<input id="contactName" type="text" placeholder="e.g. Jane Doe"></label>
            <label>Number / Extension<input id="contactNumber" type="text" inputmode="tel" placeholder="e.g. 102"></label>
            <label>Company / Department<input id="contactCompany" type="text" placeholder="e.g. Sales"></label>
            <label>Notes<textarea id="contactNotes" rows="3" placeholder="Direct line notes..."></textarea></label>
            <label class="checkbox-line"><input id="contactFavorite" type="checkbox"> Add to speed dial favorites</label>
            <button id="saveContactButton" class="primary-button" type="button">Save Contact</button>
            <div class="button-row">
              <button id="deleteContactButton" class="soft-button" type="button">Delete</button>
              <button id="newContactButton" class="soft-button" type="button">New / Clear</button>
            </div>
          </section>
        </div>
      </section>

      <!-- VIEW 4: Full Call History View -->
      <section id="callsView" class="view">
        <section class="panel">
          <div class="panel-heading">
            <h2>Call History</h2>
            <button id="clearHistoryButton" class="soft-button" type="button">Clear All History</button>
          </div>
          <div id="callHistoryFull" class="history-list"></div>
        </section>
      </section>

      <!-- VIEW 5: Voicemail & PBX Feature Codes View -->
      <section id="featuresView" class="view">
        <div class="features-grid">
          <!-- Voicemail Control Card -->
          <section class="panel feature-card">
            <div class="feature-card-header">
              <div class="feature-icon-badge">&#128223;</div>
              <div>
                <h3>Visual Voicemail Box</h3>
                <p>Speed dial your PBX mailbox (*97) to listen, save, or manage voicemails.</p>
              </div>
            </div>
            <div class="feature-action-box">
              <button id="btnDialVoicemail" class="primary-button" type="button">Dial Voicemail (*97)</button>
              <button id="btnVoicemailPIN" class="soft-button" type="button">Send Voicemail PIN</button>
            </div>
          </section>

          <!-- Call Parking Lot Card -->
          <section class="panel feature-card">
            <div class="feature-card-header">
              <div class="feature-icon-badge">&#128663;</div>
              <div>
                <h3>Call Parking Lot</h3>
                <p>Park an active call to slot 70, and retrieve from slots 71, 72, or 73.</p>
              </div>
            </div>
            <div class="parking-slots-grid">
              <button class="parking-slot-btn" data-park-code="*70"><strong>Park Current Call</strong><span>Code *70</span></button>
              <button class="parking-slot-btn" data-park-code="71"><strong>Retrieve Slot 71</strong><span>Ext 71</span></button>
              <button class="parking-slot-btn" data-park-code="72"><strong>Retrieve Slot 72</strong><span>Ext 72</span></button>
              <button class="parking-slot-btn" data-park-code="73"><strong>Retrieve Slot 73</strong><span>Ext 73</span></button>
            </div>
          </section>

          <!-- Echo Audio Test Card -->
          <section class="panel feature-card">
            <div class="feature-card-header">
              <div class="feature-icon-badge">&#127897;</div>
              <div>
                <h3>Echo Loopback Test</h3>
                <p>Dial *43 to perform an instant live microphone loopback test to verify audio clarity & latency.</p>
              </div>
            </div>
            <div class="feature-action-box">
              <button id="btnDialEchoTest" class="primary-button" type="button">Dial Echo Test (*43)</button>
            </div>
          </section>

          <!-- Call Forwarding Controls Card -->
          <section class="panel feature-card">
            <div class="feature-card-header">
              <div class="feature-icon-badge">&#10145;</div>
              <div>
                <h3>Call Forwarding & DND</h3>
                <p>Manage server-side PBX forwarding and Do Not Disturb activation codes.</p>
              </div>
            </div>
            <div class="feature-codes-list">
              <div class="code-row">
                <span>DND Activation (*78) / Deactivation (*79)</span>
                <button class="soft-button" data-dial-code="*78">Toggle DND</button>
              </div>
              <div class="code-row">
                <span>Forward All Calls (*72 + Target Ext)</span>
                <button class="soft-button" data-dial-code="*72">Forward All</button>
              </div>
              <div class="code-row">
                <span>Cancel All Forwarding (*73)</span>
                <button class="soft-button" data-dial-code="*73">Cancel Fwd</button>
              </div>
            </div>
          </section>
        </div>
      </section>

      <!-- VIEW 6: Call Recordings Library View -->
      <section id="recordingsView" class="view">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <h2>In-Call Audio Recordings Library</h2>
              <p>Listen, inspect, and download dual-channel WebRTC audio recordings made during live calls.</p>
            </div>
            <button id="btnClearRecordings" class="soft-button" type="button">Clear All Recordings</button>
          </div>
          <div id="recordingsList" class="recordings-table">
            <!-- Dynamic recording items rendered via JavaScript -->
          </div>
        </section>
      </section>

      <!-- VIEW 7: 10-Step Network Diagnostics View -->
      <section id="diagView" class="view">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <h2>Network & PBX Diagnostic Suite</h2>
              <p>Strictly tests network guidance, SIP ALG, STUN, MOS audio quality, and PBX transport compliance.</p>
            </div>
            <span id="diagStatusText" class="status-pill active" style="min-width: 140px;">Ready</span>
          </div>

          <div class="diagnostics-shell">
            <div class="diag-toolbar">
              <button id="btnRunDiagnostics" class="primary-button" type="button">Run 10-Step Check</button>
              <div class="diag-progress-bar">
                <div id="diagProgressFill" class="diag-progress-fill"></div>
              </div>
              <button id="btnExportDiagReport" class="soft-button" type="button">Export Log</button>
            </div>
            <div id="diagConsole" class="diag-console">
Ready to run diagnostics. Press "Run 10-Step Check" above to verify all DNS, STUN, SIP ALG, and WebSockets endpoints.
            </div>
          </div>
        </section>
      </section>

      <!-- Footer Status Notice -->
      <div id="footerNotice" class="footer-notice neutral">Merlin SIP Web is ready for calling.</div>
    </section>
  </main>

  <!-- 4. Active Call HUD / In-Call Overlay -->
  <div id="activeCallOverlay" class="active-call-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="hudDestination">
    <div class="call-card">
      <div class="call-avatar" aria-hidden="true">&#9742;</div>
      <div id="hudDestination" class="call-target">Active Call</div>
      <div id="hudStatus" class="call-status">Connecting...</div>

      <!-- Real-time Animated Audio Waveform Visualizer -->
      <div class="waveform-container">
        <canvas id="hudWaveformCanvas" width="380" height="44"></canvas>
      </div>

      <!-- Real-time Call Quality Monitor Card -->
      <div class="call-quality-card">
        <div class="quality-stat">
          <strong id="hudMos">4.40 / 5.0</strong>
          <span>MOS Quality</span>
        </div>
        <div class="quality-stat">
          <strong id="hudJitter">2 ms</strong>
          <span>Jitter</span>
        </div>
        <div class="quality-stat">
          <strong id="hudLoss">0.0%</strong>
          <span>Packet Loss</span>
        </div>
        <div class="quality-stat">
          <strong id="hudCodec">G.711 / Opus</strong>
          <span>Audio Codec</span>
        </div>
      </div>

      <div class="call-actions-grid">
        <button id="hudMuteBtn" class="call-action-btn" type="button" title="Mute Mic">
          <div class="action-icon-circle" aria-hidden="true">&#127908;</div>
          <span>Mute</span>
        </button>
        <button id="hudHoldBtn" class="call-action-btn" type="button" title="Hold Call">
          <div class="action-icon-circle" aria-hidden="true">&#9208;</div>
          <span>Hold</span>
        </button>
        <button id="hudTransferBtn" class="call-action-btn" type="button" title="Transfer Call">
          <div class="action-icon-circle" aria-hidden="true">&#10145;</div>
          <span>Transfer</span>
        </button>
        <button id="hudRecordBtn" class="call-action-btn" type="button" title="Record Dual-Channel Audio">
          <div class="action-icon-circle" aria-hidden="true">&#9899;</div>
          <span id="hudRecordText">Record</span>
        </button>
        <button id="hudHangupBtn" class="call-action-btn" type="button" style="color: #ef4444;" title="End Call">
          <div class="action-icon-circle" aria-hidden="true" style="background: rgba(239, 68, 68, 0.2); border-color: #ef4444;">&#10006;</div>
          <span>Hang Up</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 5. Incoming Call Modal -->
  <div id="incomingOverlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="incomingCaller">
    <section class="incoming-card">
      <img src="assets/CKMedia-Icon.png" alt="" class="incoming-logo">
      <span style="font-size: 12px; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Incoming Call</span>
      <h2 id="incomingCaller">Unknown Caller</h2>
      <div class="button-row" style="margin-top: 18px;">
        <button id="rejectCallButton" class="hangup-button" style="flex: 1;" type="button">Decline</button>
        <button id="answerCallButton" class="call-button" style="flex: 1;" type="button">Answer</button>
      </div>
    </section>
  </div>

  <!-- 6. Transfer Dialog Modal -->
  <div id="transferOverlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="transferHeading">
    <section class="settings-dialog transfer-dialog">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 id="transferHeading" style="margin: 0; font-size: 20px;">Transfer Call</h2>
        <button class="soft-button" data-close-transfer style="min-height: 32px; padding: 4px 10px;" type="button">Close</button>
      </div>
      <p style="color: var(--muted); font-size: 13px; margin: 0 0 16px 0;">Choose transfer mode and destination extension.</p>
      <div class="transfer-mode" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;"><input type="radio" name="transferMode" value="blind" checked> Blind Transfer</label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;"><input type="radio" name="transferMode" value="assisted"> Assisted Transfer</label>
      </div>
      <label>Target Extension<input id="transferTarget" type="text" inputmode="tel" placeholder="e.g. 105"></label>
      <button id="confirmTransferButton" class="primary-button" style="margin-top: 14px;" type="button">Complete Transfer</button>
    </section>
  </div>

  <!-- 7. Settings Modal -->
  <div id="settingsOverlay" class="settings-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="settingsHeading">
    <section class="settings-window">
      <aside class="settings-nav">
        <h2>Settings</h2>
        <button class="settings-tab active" data-settings-tab="generalSettings">General</button>
        <button class="settings-tab" data-settings-tab="accountSettings">Account</button>
        <button class="settings-tab" data-settings-tab="routingSettings">Call Routing</button>
        <button class="settings-tab" data-settings-tab="audioSettings">Audio</button>
        <button class="settings-tab" data-settings-tab="licenseSettings">Licensing</button>
        <button class="settings-tab" data-settings-tab="aboutSettings">About</button>
        <button class="soft-button" data-close-settings style="margin-top: auto;" type="button">Close</button>
      </aside>

      <div class="settings-content">
        <!-- Tab: General -->
        <section id="generalSettings" class="settings-page active">
          <div class="settings-card">
            <h3>Call & Telephony Preferences</h3>
            <div class="settings-grid">
              <label>DND Mode
                <select id="cfgDndMode">
                  <option value="off">Off (Available)</option>
                  <option value="on">On (Auto busy)</option>
                  <option value="silent">Silent Ringing</option>
                </select>
              </label>
              <label>Decline Action
                <select id="cfgDeclineAction">
                  <option value="busy">Send Busy (486)</option>
                  <option value="decline">Decline (603)</option>
                </select>
              </label>
            </div>
          </div>
          <div class="settings-card">
            <h3>Launch Behavior</h3>
            <label class="checkbox-line"><input id="cfgAutoRegister" type="checkbox"> Register automatically when page opens</label>
          </div>
        </section>

        <!-- Tab: Account -->
        <section id="accountSettings" class="settings-page">
          <div class="settings-card">
            <h3>SIP Account & PBX Connection</h3>
            <div class="settings-grid">
              <label>SIP WebSocket Server<input id="cfgSipServer" type="text" placeholder="wss://your-sip-server:8089/ws"></label>
              <label>SIP Domain<input id="cfgSipDomain" type="text" placeholder="your-domain.com"></label>
              <label>Extension / User<input id="cfgExtension" type="text" placeholder="100"></label>
              <label>Auth Username<input id="cfgAuthUser" type="text" placeholder="100"></label>
              <label>SIP Password<input id="cfgPassword" type="password" autocomplete="current-password"></label>
              <label>Display Name<input id="cfgDisplayName" type="text" placeholder="Merlin SIP Web"></label>
            </div>
            <p style="font-size: 12px; color: var(--muted); margin: 12px 0 0 0;">Password is stored in your secure browser localStorage only. Non-secret settings and contacts are stored in shared hosting JSON.</p>
          </div>
        </section>

        <!-- Tab: Call Routing -->
        <section id="routingSettings" class="settings-page">
          <div class="settings-card">
            <h3>Transfer & PBX Integration</h3>
            <p style="font-size: 13px; color: var(--muted); line-height: 1.5; margin: 0 0 14px 0;">
              Blind transfer redirects the caller directly to the target extension. Assisted transfer places the caller on hold while you consult with the recipient, completing upon confirmation.
            </p>
            <div class="settings-grid">
              <label>Voicemail Feature Code<input type="text" value="*97" readonly></label>
              <label>Echo Test Feature Code<input type="text" value="*43" readonly></label>
            </div>
          </div>
        </section>

        <!-- Tab: Audio -->
        <section id="audioSettings" class="settings-page">
          <div class="settings-card">
            <h3>Audio Devices & Synthesizer</h3>
            <div class="settings-grid">
              <label>Microphone Input<select id="microphoneSelect"></select></label>
              <label>Speaker Output<select id="speakerSelect"></select></label>
              <label>Ringtone Profile
                <select id="cfgRingtone">
                  <option value="classic">Classic Corporate Chime</option>
                  <option value="pulse">Soft Pulse Marimba</option>
                  <option value="bright">Bright Desk Phone</option>
                </select>
              </label>
            </div>
            <button id="testAudioButton" class="soft-button" style="margin-top: 14px;" type="button">Test Audio Tone</button>
          </div>
        </section>

        <!-- Tab: Licensing -->
        <section id="licenseSettings" class="settings-page">
          <div class="settings-card">
            <h3>Commercial License</h3>
            <label>License Key / Token<input id="cfgLicenseKey" type="text" value="MERLIN-COMMERCIAL-UNLIMITED"></label>
            <p style="font-size: 12px; color: var(--muted); margin-top: 8px;">Status: <strong>Active & Licensed (Unlimited Seats)</strong></p>
          </div>
        </section>

        <!-- Tab: About -->
        <section id="aboutSettings" class="settings-page">
          <div class="settings-card">
            <h3>About Merlin SIP Web</h3>
            <p style="font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 12px;">Browser-based SIP softphone for managed calling, contacts, directory, call history, and reception workflows.</p>
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; font-size: 13px;">
              <strong style="color: var(--muted);">Version:</strong> <span><?= htmlspecialchars($version, ENT_QUOTES) ?></span>
              <strong style="color: var(--muted);">Runtime:</strong> <span>PHP <?= PHP_VERSION ?> + Browser WebRTC SIP.js</span>
              <strong style="color: var(--muted);">Vendor:</strong> <span>Merlin Systems</span>
            </div>
          </div>
        </section>

        <footer class="settings-actions">
          <button class="soft-button" data-close-settings type="button">Cancel</button>
          <button id="saveSettingsButton" class="primary-button" type="button">Save Changes</button>
        </footer>
      </div>
    </section>
  </div>

  <!-- Audio Tone Synthesizer & SIP.js -->
  <script src="assets/tones.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sip.js@0.21.2/dist/sip.min.js"></script>
  <script src="assets/app.js"></script>
</body>
</html>
