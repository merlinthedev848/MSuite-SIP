function initApp() {

  // --------------------------------------------------------------------------

  // Elegant Non-Intrusive Toast System

  // --------------------------------------------------------------------------

  window.showToast = function(message, type = 'info', duration = 3000) {

    const container = document.getElementById('toastContainer');

    if (!container) {

      console.log(`[Toast ${type}]: ${message}`);

      return;

    }

    const toast = document.createElement('div');

    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';

    if (type === 'success') icon = '';

    else if (type === 'error') icon = '';

    else if (type === 'warning') icon = '';



    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);



    setTimeout(() => {

      toast.style.opacity = '0';

      toast.style.transform = 'translateY(-6px)';

      setTimeout(() => toast.remove(), 250);

    }, duration);

  };



  // --------------------------------------------------------------------------

  // 1. Authentication & Session Management (Session Tokens + RBAC)

  // --------------------------------------------------------------------------

  const modalLogin = document.getElementById('modalLogin');

  const formLogin = document.getElementById('formLogin');

  const loginError = document.getElementById('loginError');



  let currentUser = null;



  let inMemoryStorage = {};



  function getAuthToken() {

    try {

      return sessionStorage.getItem('ckm_admin_token') || localStorage.getItem('ckm_admin_token') || inMemoryStorage['ckm_admin_token'] || '';

    } catch {

      return inMemoryStorage['ckm_admin_token'] || '';

    }

  }



  function getStoredUser() {

    try {

      const u = sessionStorage.getItem('ckm_admin_user') || localStorage.getItem('ckm_admin_user') || inMemoryStorage['ckm_admin_user'];

      return u ? JSON.parse(u) : null;

    } catch {

      try {

        const u = inMemoryStorage['ckm_admin_user'];

        return u ? JSON.parse(u) : null;

      } catch { return null; }

    }

  }



  function setAuthSession(token, user, persist = true) {

    if (token) {

      try { sessionStorage.setItem('ckm_admin_token', token); } catch {}

      try { if (user) sessionStorage.setItem('ckm_admin_user', JSON.stringify(user)); } catch {}

      if (persist) {

        try { localStorage.setItem('ckm_admin_token', token); } catch {}

        try { if (user) localStorage.setItem('ckm_admin_user', JSON.stringify(user)); } catch {}

      }

      inMemoryStorage['ckm_admin_token'] = token;

      if (user) inMemoryStorage['ckm_admin_user'] = JSON.stringify(user);

    } else {

      try { sessionStorage.removeItem('ckm_admin_token'); } catch {}

      try { sessionStorage.removeItem('ckm_admin_user'); } catch {}

      try { localStorage.removeItem('ckm_admin_token'); } catch {}

      try { localStorage.removeItem('ckm_admin_user'); } catch {}

      delete inMemoryStorage['ckm_admin_token'];

      delete inMemoryStorage['ckm_admin_user'];

    }

    currentUser = user || null;

    applyUserPermissions();

  }

  window.setAuthSession = setAuthSession;



  function showLogin() {

    if (modalLogin) modalLogin.classList.remove('hidden');

  }



  function hideLogin() {

    if (modalLogin) modalLogin.classList.add('hidden');

    if (loginError) loginError.classList.add('hidden');

  }



  // Granular Permission Checker

  window.hasPerm = (perm) => {

    if (!currentUser) return false;

    if (currentUser.role === 'superadmin') return true;

    const p = currentUser.permissions || [];

    return p.includes('*') || p.includes(perm);

  };



  window.escapeHtml = function(str) {

    if (str === null || str === undefined) return '';

    return String(str)

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;')

      .replace(/'/g, '&#039;');

  };



  function applyUserPermissions() {

    const roleBadge = document.getElementById('userRoleBadge');

    if (currentUser) {

      if (roleBadge) {

        roleBadge.textContent = `${currentUser.displayName || currentUser.username} (${(currentUser.role || 'user').toUpperCase()})`;

      }



      // Hide or show Users tab based on manage_users permission

      const usersNav = document.getElementById('navBtnUsers');

      if (usersNav) {

        usersNav.style.display = hasPerm('manage_users') ? 'flex' : 'none';

      }

    } else {

      if (roleBadge) roleBadge.textContent = 'Not Authenticated';

    }

  }



  // Handle Login Submission

  formLogin?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const u = document.getElementById('loginUsername').value.trim();

    const p = document.getElementById('loginPassword').value;

    if (!u || !p) return;



    try {

      const res = await fetch('/api/admin/login', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ username: u, password: p })

      });



      const data = await res.json();

      if (res.ok && data.ok) {

        setAuthSession(data.token, data.user, true);

        hideLogin();

        loadCatalogs();

        loadOverview();

      } else {

        if (loginError) {

          loginError.textContent = data.error || 'Invalid credentials.';

          loginError.classList.remove('hidden');

        }

      }

    } catch (err) {

      if (loginError) {

        loginError.textContent = 'Connection error contacting server.';

        loginError.classList.remove('hidden');

      }

    }

  });



  // Handle Logout

  document.getElementById('btnLogout')?.addEventListener('click', async () => {

    if (confirm('Log out of CKM Handler Admin Portal?')) {

      const token = getAuthToken();

      if (token) {

        try {

          await fetch('/api/admin/logout', {

            method: 'POST',

            headers: { 'Authorization': `Bearer ${token}` }

          });

        } catch {}

      }

      setAuthSession('', null, false);

      showLogin();

    }

  });



  // Global Authenticated Fetch Helper

  async function fetchJson(url, options = {}) {

    const token = getAuthToken();

    if (!token) {

      showLogin();

      return null;

    }



    options.headers = options.headers || {};

    if (options.headers instanceof Headers) {

      options.headers.set('Authorization', `Bearer ${token}`);

      if (options.body && typeof options.body === 'string' && !options.headers.has('Content-Type')) {

        options.headers.set('Content-Type', 'application/json');

      }

    } else {

      options.headers['Authorization'] = `Bearer ${token}`;

      if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {

        options.headers['Content-Type'] = 'application/json';

      }

    }



    try {

      const res = await fetch(url, options);

      if (res.status === 401) {

        setAuthSession('', null, false);

        showLogin();

        return null;

      }

      if (res.status === 403) {

        const json = await res.json().catch(() => ({}));

        window.showToast(`Access Denied: ${json.error || 'You do not have permission for this action.'}`, 'error');

        return null;

      }

      return await res.json();

    } catch (e) {

      console.error('Fetch error:', e);

      return null;

    }

  }



  // Generic 1-Click Clipboard Copy with Feedback

  window.copyText = (text, msg = 'Copied to clipboard!') => {

    if (!text) return;

    navigator.clipboard.writeText(text);

    window.showToast(msg, 'success');

  };



  // Subview Segment Switcher (Fleet vs Explorer)

  function initSubviews() {

    document.querySelectorAll('.view-segmented-bar').forEach(bar => {

      const btns = bar.querySelectorAll('.view-segment-btn');

      btns.forEach(btn => {

        btn.addEventListener('click', () => {

          const targetId = btn.dataset.target;

          const parentPane = btn.closest('.tab-pane');

          if (!parentPane || !targetId) return;

          btns.forEach(b => b.classList.remove('active'));

          btn.classList.add('active');

          parentPane.querySelectorAll('.subview-content').forEach(c => c.classList.remove('active'));

          parentPane.querySelector(`#${targetId}`)?.classList.add('active');



          if (targetId === 'subviewHandsetExplorer') {

            updateHandsetModelsDropdown();

            updateHandsetExplorerPreview();

          } else if (targetId === 'subviewRouterExplorer') {

            updateRouterModelsDropdown();

            updateRouterExplorerPreview();

          }

        });

      });

    });

  }



  // --------------------------------------------------------------------------

  // 2. Navigation & Tab Switching

  // --------------------------------------------------------------------------

  const navBtns = document.querySelectorAll('.nav-btn');

  const panes = document.querySelectorAll('.tab-pane');

  const pageTitle = document.getElementById('pageTitle');



  const titles = {

    overview: 'System Overview & Component Health',

    extensions: 'SIP Extensions & Softphone PINs',

    handsets: 'Physical IP Handset Directory',

    routers: 'VoIP Router & Network Gateway Profiles',

    firmware: 'Firmware Repository & Binary Cache',

    shell: 'Live Device Connectivity & Telemetry Shell',

    settings: 'Global Unified System Settings Center',

    branding: 'Softphone Custom Branding, Logo & Colors',

    config: 'PBX Integration & Gateway Settings',

    gdpr: 'GDPR Compliance & Data Retention Vault',

    users: 'Administrator Users & Role Permissions (RBAC)'

  };



  navBtns.forEach(btn => {

    btn.addEventListener('click', () => {

      const tab = btn.dataset.tab;

      navBtns.forEach(b => b.classList.remove('active'));

      panes.forEach(p => p.classList.remove('active'));



      btn.classList.add('active');

      const activePane = document.getElementById(`pane-${tab}`);

      if (activePane) activePane.classList.add('active');

      if (pageTitle && titles[tab]) pageTitle.textContent = titles[tab];



      const breadcrumb = document.querySelector('.topbar-breadcrumb');

      const sectionMap = {

        overview: 'Operations / Overview',

        extensions: 'Operations / Extensions & PINs',

        handsets: 'Operations / Physical Handsets',

        routers: 'Operations / Routers & Gateways',

        firmware: 'Services / Firmware Repository',

        shell: 'Operations / Live Device Shell',

        settings: 'Administration / Global System Settings',

        users: 'Administration / Admin Users & RBAC',

        branding: 'Administration / Theme & Branding',

        config: 'Administration / PBX Integration',

        gdpr: 'Administration / GDPR Vault'

      };

      if (breadcrumb && sectionMap[tab]) {

        breadcrumb.innerHTML = `CKM Gateway <span class="breadcrumb-sep">/</span> ${sectionMap[tab]}`;

      }



      loadTabData(tab);

    });

  });



  document.getElementById('btnRefresh')?.addEventListener('click', () => {

    const activeBtn = document.querySelector('.nav-btn.active');

    if (activeBtn) loadTabData(activeBtn.dataset.tab);

  });



  function loadTabData(tab) {

    if (tab === 'overview') loadOverview();

    else if (tab === 'extensions') loadExtensions();

    else if (tab === 'handsets') loadHandsets();

    else if (tab === 'routers') loadRouters();

    else if (tab === 'firmware') loadFirmwareRepository();

    else if (tab === 'shell') loadShellHistory();

    else if (tab === 'branding') loadBranding();

    else if (tab === 'config') loadConfig();

    else if (tab === 'gdpr') loadGdprPolicy();

    else if (tab === 'users') loadUsers();

    else if (tab === 'settings') {

      loadConfig();

      loadAutomationDaemonSettings();

      loadBranding();

      loadUsers();

      loadGdprPolicy();

    }

  }



  window.switchTab = function(tab, subtab) {

    const settingsSubtabs = {

      config: 'settings-pbx',

      pbx: 'settings-pbx',

      automation: 'settings-automation',

      branding: 'settings-branding',

      users: 'settings-security',

      security: 'settings-security',

      gdpr: 'settings-gdpr'

    };



    if (settingsSubtabs[tab]) {

      subtab = settingsSubtabs[tab];

      tab = 'settings';

    }



    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);

    if (btn) {

      btn.click();

    }



    if (tab === 'settings' && subtab) {

      const subBtn = document.querySelector(`.settings-nav-btn[data-subtab="${subtab}"]`);

      if (subBtn) {

        subBtn.click();

      }

    }

  };



  // --------------------------------------------------------------------------

  // 3. Modal Management (Open, Close, Outside Click)

  // --------------------------------------------------------------------------

  window.openModal = (id) => {

    const el = document.getElementById(id);

    if (el) el.classList.remove('hidden');

  };



  window.closeModal = (id) => {

    const el = document.getElementById(id);

    if (el) el.classList.add('hidden');

  };



  document.querySelectorAll('.modal-backdrop').forEach(modal => {

    modal.addEventListener('click', (e) => {

      if (e.target === modal && modal.id !== 'modalLogin') {

        modal.classList.add('hidden');

      }

    });

  });



  // --------------------------------------------------------------------------

  // 4. TAB 1: System Overview & Component Health Monitor

  // --------------------------------------------------------------------------

  async function loadOverview() {

    const data = await fetchJson('/api/admin/overview');

    if (!data || !data.ok) return;



    const s = data.stats;

    if (document.getElementById('statExt')) document.getElementById('statExt').textContent = s.extensions ?? 0;

    if (document.getElementById('statHandsets')) document.getElementById('statHandsets').textContent = s.handsets ?? 0;

    if (document.getElementById('statPins')) document.getElementById('statPins').textContent = s.unclaimedPins ?? 0;

    if (document.getElementById('statRouters')) document.getElementById('statRouters').textContent = s.routers ?? 0;

    if (document.getElementById('statFirmware')) document.getElementById('statFirmware').textContent = s.firmwareCount ?? 0;

    if (document.getElementById('statMessages')) document.getElementById('statMessages').textContent = s.messages ?? 0;

    if (document.getElementById('statStorage')) document.getElementById('statStorage').textContent = `${s.storageMb ?? 0} MB`;



    const rawPbx = (s.pbxServer || 'pbx.chriskendall.media').trim();

    const cleanPbxHost = rawPbx.replace(/:\d+.*$/, '').replace(/\s*\(.*\)$/, '').trim();

    const pbxPort = s.pbxPort || 5060;

    const pbxTransport = s.pbxTransport || 'UDP';

    const formattedPbx = `${cleanPbxHost}:${pbxPort} (${pbxTransport})`;

    document.getElementById('pbxBadge').textContent = `PBX: ${formattedPbx}`;

    document.getElementById('licenseBadge').textContent = `License: ${s.licenseKey || 'Active'}`;



    const host = s.handlerUrl || window.location.origin;

    const wssProtocol = host.startsWith('https:') ? 'wss:' : 'ws:';

    const cleanHost = host.replace(/^https?:\/\//, '');

    document.getElementById('epChat').textContent = `${wssProtocol}//${cleanHost}/socket.io`;

    document.getElementById('epProv').textContent = `${host}/provision/`;

    document.getElementById('epPhonebook').textContent = `${host}/phonebook/yealink.xml`;

    document.getElementById('epSync').textContent = `${host}/api/v1/config/sync`;



    // Render Consolidated Component Health Matrix

    const grid = document.getElementById('componentsGrid');

    const badge = document.getElementById('componentsSummaryBadge');

    if (grid && data.components) {

      grid.innerHTML = data.components.map(c => {

        const isOp = (c.status === 'operational');

        const dotClass = isOp ? 'dot-op' : (c.status === 'degraded' ? 'dot-warn' : 'dot-err');

        const badgeLabel = c.badge || (isOp ? 'Active' : (c.status || 'Alert'));

        return `

          <div class="health-row-item">

            <span class="health-dot ${dotClass}" title="${c.status || 'operational'}"></span>

            <div class="health-info">

              <span class="health-name">${c.name}</span>

              <span class="health-meta">${c.details}</span>

            </div>

            <div class="health-meta-group">

              <span class="health-latency">${c.latency}</span>

              <span class="health-pill ${isOp ? 'op' : 'warn'}">${badgeLabel}</span>

              <button class="health-log-btn" onclick="window.viewServiceLogs('${c.id}')" title="Filter live terminal to ${c.name} logs">

                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>

                <span>Logs</span>

              </button>

            </div>

          </div>

        `;

      }).join('');



      const total = data.components.length;

      const opCount = data.components.filter(c => c.status === 'operational').length;

      badge.textContent = `${opCount} / ${total} Operational`;

      badge.className = opCount === total ? 'badge badge-primary' : 'badge badge-secondary';

    }



    // Update PBX Ping Target Card

    const pingTarget = document.getElementById('pingPbxTarget');

    if (pingTarget) pingTarget.textContent = formattedPbx;



    // Update Autonomous Infrastructure Daemons Badges & Switches

    const autoAdoptOn = !!s.autoAdoptEnabled;

    const engineAutoAdoptBadge = document.getElementById('engineAutoAdoptBadge');

    if (engineAutoAdoptBadge) {

      engineAutoAdoptBadge.textContent = autoAdoptOn ? 'Zero-Touch Active' : 'Approval Required';

      engineAutoAdoptBadge.className = autoAdoptOn ? 'badge badge-success' : 'badge';

    }

    const chipAutoAdopt = document.getElementById('chipAutoAdoptStatus');

    if (chipAutoAdopt) chipAutoAdopt.textContent = `Auto-Adopt: ${autoAdoptOn ? 'Active' : 'Disabled'}`;



    const autoSyncOn = s.autoSync ? !!s.autoSync.enabled : true;

    const syncInterval = s.autoSync?.intervalMins || 5;

    const enginePbxSyncBadge = document.getElementById('enginePbxSyncBadge');

    if (enginePbxSyncBadge) {

      enginePbxSyncBadge.textContent = autoSyncOn ? `Automated (${syncInterval}m)` : 'Manual Only';

      enginePbxSyncBadge.className = autoSyncOn ? 'badge badge-success' : 'badge badge-secondary';

    }



    const enginePbxLastSync = document.getElementById('enginePbxLastSync');

    if (enginePbxLastSync) {

      if (s.autoSync?.lastSyncAt) {

        const d = new Date(s.autoSync.lastSyncAt);

        enginePbxLastSync.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      } else {

        enginePbxLastSync.textContent = 'Standby';

      }

    }



    // Keep all settings switches synchronized with server state

    const chkAdopt = document.getElementById('chkAutoAdoptPolicy');

    if (chkAdopt) chkAdopt.checked = autoAdoptOn;

    const settingsAdopt = document.getElementById('settingsAutoAdoptToggle');

    if (settingsAdopt) settingsAdopt.checked = autoAdoptOn;

    const settingsSync = document.getElementById('settingsAutoSyncToggle');

    if (settingsSync) settingsSync.checked = autoSyncOn;

    const settingsInterval = document.getElementById('settingsSyncInterval');

    if (settingsInterval) settingsInterval.value = String(syncInterval);



    // Load Live Activity & Audit Logs

    loadAuditLogs();

    loadDiscoveredDevices();

  }



  // Live Audit Event Stream Loader

  async function loadAuditLogs() {

    const streamEl = document.getElementById('auditLogStream');

    if (!streamEl) return;

    const res = await fetchJson('/api/admin/audit-logs');

    if (!res || !res.ok || !res.logs || !res.logs.length) {

      streamEl.innerHTML = '<div class="muted" style="padding: 10px; font-size: 13px;">No recent activity logged yet.</div>';

      return;

    }

    streamEl.innerHTML = res.logs.map(log => {

      const d = new Date(log.created_at);

      const hours = String(d.getHours()).padStart(2, '0');

      const minutes = String(d.getMinutes()).padStart(2, '0');

      const seconds = String(d.getSeconds()).padStart(2, '0');

      const time = `${hours}:${minutes}:${seconds}`;



      let cat = 'SYSTEM';

      let tagClass = 'log-tag-system';

      const ev = (log.event_type || '').toUpperCase();

      if (ev.includes('FIRMWARE')) { cat = 'FIRMWARE'; tagClass = 'log-tag-firmware'; }

      else if (ev.includes('AUTH') || ev.includes('LOGIN')) { cat = 'AUTH'; tagClass = 'log-tag-auth'; }

      else if (ev.includes('PROVISION') || ev.includes('PIN')) { cat = 'PROVISION'; tagClass = 'log-tag-provision'; }

      else if (ev.includes('SECURITY') || ev.includes('BLOCKED')) { cat = 'SECURITY'; tagClass = 'log-tag-security'; }

      else if (ev.includes('ERROR') || ev.includes('FAILED')) { cat = 'ERROR'; tagClass = 'log-tag-error'; }

      else if (ev.includes('PBX')) { cat = 'PBX'; tagClass = 'log-tag-pbx'; }



      const rawMsg = log.details || log.event_type || '';

      const safeMsg = rawMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');



      return `

        <div class="log-item">

          <span class="log-time">${time}</span>

          <span class="log-tag ${tagClass}">${cat}</span>

          <span class="log-msg" title="${safeMsg}">${safeMsg}</span>

          <span class="log-ip">${log.ip_address || ''}</span>

        </div>

      `;

    }).join('');

  }



  document.getElementById('btnRefreshLogs')?.addEventListener('click', () => {

    loadAuditLogs();

  });



  // PBX Ping & Latency Probe Action

  document.getElementById('btnPingPbx')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnPingPbx');

    const pill = document.getElementById('pingStatusPill');

    const details = document.getElementById('pingDetails');



    btn.disabled = true;

    btn.textContent = 'Probing...';

    if (pill) {

      pill.className = 'status-pill connecting';

      pill.textContent = 'Testing...';

    }

    if (details) details.textContent = 'Dispatching socket probe to PBX...';



    try {

      const res = await fetchJson('/api/admin/pbx/ping', { method: 'POST' });

      if (res && res.reachable) {

        if (pill) {

          pill.className = 'status-pill operational';

          pill.textContent = 'Operational';

        }

        const latEl = document.getElementById('pingLatencyVal');

        if (latEl) latEl.textContent = `${res.latencyMs} ms`;

        if (details) details.textContent = `[SUCCESS] PBX responded in ${res.latencyMs}ms. SIP socket handshake verified over UDP.`;

      } else {

        if (pill) {

          pill.className = 'status-pill degraded';

          pill.textContent = 'Unreachable';

        }

        const latEl = document.getElementById('pingLatencyVal');

        if (latEl) latEl.textContent = 'Timeout';

        if (details) details.textContent = `[FAILURE] ${res ? (res.error || res.message) : 'Connection timed out.'}`;

      }

    } catch (err) {

      if (pill) {

        pill.className = 'status-pill degraded';

        pill.textContent = 'Error';

      }

      if (details) details.textContent = 'Failed to execute ping probe.';

    } finally {

      btn.disabled = false;

      btn.textContent = 'Ping PBX Now';

    }

  });



  window.copyEndpointText = (id) => {

    const el = document.getElementById(id);

    if (!el) return;

    const txt = el.textContent.trim();

    navigator.clipboard.writeText(txt);

    window.showToast(`Copied ${txt} to clipboard!`, 'success');

  };



  // --------------------------------------------------------------------------

  // 5. TAB 2: Extensions & Softphones

  // --------------------------------------------------------------------------

  let cachedExtensions = [];



  function renderExtensionsTable(list) {

    const tbody = document.getElementById('extTableBody');

    if (!tbody) return;

    if (!list.length) {

      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No extensions match your search.</td></tr>';

      return;

    }



    const canManage = hasPerm('manage_extensions');

    tbody.innerHTML = list.map(ext => `

      <tr>

        <td><strong>${ext.extension}</strong></td>

        <td>${ext.display_name}</td>

        <td><code>${ext.sip_username}</code></td>

        <td>${ext.active_pin ? `<strong style="color:#0284c7;font-size:15px;letter-spacing:1px;">${ext.active_pin}</strong>` : '<span class="muted">None active</span>'}</td>

        <td>${ext.bound_handsets} handset(s)</td>

        <td><span class="badge ${ext.is_active ? 'badge-primary' : 'badge-secondary'}">${ext.is_active ? 'Active' : 'Disabled'}</span></td>

        <td>

          <div style="display: flex; gap: 4px; flex-wrap: wrap;">

            <button class="btn btn-sm btn-outline" onclick="window.viewDeviceLogs('Ext ${ext.extension}', 'softphone', { ext: '${ext.extension}', name: '${(ext.display_name || '').replace(/'/g, "\\'")}', sip: '${ext.sip_username}', ip: '${ext.last_ip || ''}' })" title="View device telemetry & logs">Logs</button>

            ${canManage ? `

              <button class="btn btn-sm btn-secondary" onclick="generatePin('${ext.extension}')">Generate PIN</button>

              <button class="btn btn-sm btn-danger" onclick="deleteExtension('${ext.extension}')">Delete</button>

            ` : '<span class="muted">Read Only</span>'}

          </div>

        </td>

      </tr>

    `).join('');

  }



  // Instant Live Search for Extensions

  document.getElementById('searchExt')?.addEventListener('input', (e) => {

    const query = e.target.value.toLowerCase().trim();

    if (!query) {

      renderExtensionsTable(cachedExtensions);

      return;

    }

    const filtered = cachedExtensions.filter(ext =>

      (ext.extension && String(ext.extension).toLowerCase().includes(query)) ||

      (ext.display_name && ext.display_name.toLowerCase().includes(query)) ||

      (ext.sip_username && ext.sip_username.toLowerCase().includes(query)) ||

      (ext.active_pin && String(ext.active_pin).includes(query))

    );

    renderExtensionsTable(filtered);

  });



  async function loadExtensions() {

    const data = await fetchJson('/api/admin/extensions');

    const tbody = document.getElementById('extTableBody');

    if (!data || !data.ok || !data.extensions.length) {

      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">No extensions registered yet. Click "+ New Extension" to create one.</td></tr>';

      cachedExtensions = [];

      return;

    }



    cachedExtensions = data.extensions;

    const searchVal = document.getElementById('searchExt')?.value.toLowerCase().trim();

    if (searchVal) {

      document.getElementById('searchExt').dispatchEvent(new Event('input'));

    } else {

      renderExtensionsTable(cachedExtensions);

    }

  }



  window.generatePin = async (ext) => {

    const res = await fetchJson('/api/admin/pins', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ extension: ext, expiryHours: 72 })

    });

    if (res && res.ok) {

      window.showToast(`PIN for Ext ${ext}: ${res.code} (Expires in 72h)`, 'success');

      loadExtensions();

    } else {

      window.showToast(res?.error || 'Failed to generate PIN', 'error');

    }

  };



  window.deleteExtension = async (ext) => {

    if (!confirm(`Are you sure you want to delete Extension ${ext}?`)) return;

    const res = await fetchJson(`/api/admin/extensions/${ext}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast(`Extension ${ext} deleted successfully.`, 'info');

      loadExtensions();

    }

  };



  // + New Extension Modal

  document.getElementById('btnOpenAddExtModal')?.addEventListener('click', () => {

    document.getElementById('formAddExt')?.reset();

    openModal('modalAddExt');

  });



  document.getElementById('btnGenExtPass')?.addEventListener('click', () => {

    const pass = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-6).toUpperCase();

    document.getElementById('addExtPass').value = pass;

  });



  document.getElementById('formAddExt')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const ext = document.getElementById('addExtNum').value.trim();

    const name = document.getElementById('addExtName').value.trim() || `Extension ${ext}`;

    const user = document.getElementById('addExtUser').value.trim() || ext;

    const pass = document.getElementById('addExtPass').value.trim();



    const res = await fetchJson('/api/admin/extensions', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ extension: ext, displayName: name, username: user, password: pass })

    });



    if (res && res.ok) {

      window.showToast(`Extension ${ext} registered successfully!`, 'success');

      closeModal('modalAddExt');

      loadExtensions();

    } else if (res) {

      window.showToast(`Error: ${res.error || 'Failed to save extension'}`, 'error');

    }

  });



  // Cached Global PBX Configuration

  let cachedPbxConfig = null;



  // Populate Sync Modal Status Card from Global Settings (Zero value entry fields in modal)

  async function populateSyncModalCard() {

    if (!cachedPbxConfig) {

      const data = await fetchJson('/api/admin/config');

      if (data && data.ok) cachedPbxConfig = data.config;

    }

    const c = cachedPbxConfig || {};

    const hostEl = document.getElementById('syncCardHost');

    const engineEl = document.getElementById('syncCardEngine');

    const userEl = document.getElementById('syncCardUser');

    const secEl = document.getElementById('syncCardSecurity');



    const host = c.api_host || c.pbx_server || 'pbx.chriskendall.media';

    const pbxType = c.pbx_type || 'yeastar_api';

    const port = c.api_port || (pbxType === 'yeastar_api' ? 8260 : 5038);

    const user = c.api_user || 'perfexapi';

    const proto = (c.api_protocol || 'https').toUpperCase();



    if (hostEl) hostEl.textContent = host;

    if (engineEl) {

      if (pbxType === 'yeastar_api') engineEl.textContent = `Yeastar REST API v2.0.0 (Port ${port})`;

      else if (pbxType === 'yeastar_ami') engineEl.textContent = `Yeastar Asterisk AMI (Port ${port})`;

      else engineEl.textContent = `Asterisk AMI (Port ${port})`;

    }

    if (userEl) userEl.textContent = user;

    if (secEl) {

      secEl.textContent = proto + (c.verify_ssl ? ' (Verified Certificate)' : ' (Self-Signed / Internal PBX)');

    }

  }



  // Quick navigation link from Sync Modal to Global Settings

  document.getElementById('linkEditGlobalPbx')?.addEventListener('click', (e) => {

    e.preventDefault();

    closeModal('modalSyncPbx');

    const tabBtn = document.querySelector('[data-tab="settings"]');

    if (tabBtn) tabBtn.click();

    const subBtn = document.querySelector('[data-subpane="settings-pbx"]');

    if (subBtn) subBtn.click();

  });



  // PBX Sync Modal Open - Displays current Global Profile and Options

  document.getElementById('btnSyncPbx')?.addEventListener('click', async () => {

    document.getElementById('amiSyncOutput')?.classList.add('hidden');

    await populateSyncModalCard();

    openModal('modalSyncPbx');

  });



  // Sync Form Submit - Uses Stored Global Credentials with User's Chosen Options

  document.getElementById('formSyncPbx')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const out = document.getElementById('amiSyncOutput');

    const btn = document.getElementById('btnRunSync');

    const engineChoice = document.getElementById('syncEngineOption')?.value || 'global';

    const pbxType = (engineChoice === 'global' ? (cachedPbxConfig?.pbx_type || 'yeastar_api') : engineChoice);

    const strategy = document.getElementById('syncStrategyOption')?.value || 'merge';

    const importVault = document.getElementById('syncImportVault')?.checked ?? true;

    const autoPin = document.getElementById('syncAutoPin')?.checked ?? false;



    btn.disabled = true;

    btn.textContent = '⚡ Synchronizing with PBX...';



    // Dispatches request using stored global credentials

    const payload = {

      pbxType: pbxType,

      strategy: strategy,

      importVault: importVault,

      autoPin: autoPin

    };



    const res = await fetchJson('/api/admin/pbx/sync', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    btn.disabled = false;

    btn.textContent = '⚡ Start PBX Synchronization';



    if (out) {

      out.classList.remove('hidden');

      if (res && res.ok) {

        out.style.background = '#f0fdf4';

        out.style.borderColor = '#bbf7d0';

        out.style.color = '#15803d';

        out.textContent = `Success: ${res.message}`;

        window.showToast?.(res.message, 'success');

        loadExtensions();

      } else {

        out.style.background = '#fef2f2';

        out.style.borderColor = '#fecaca';

        out.style.color = '#991b1b';

        out.textContent = `Error: ${res?.error || 'Failed to sync with PBX.'}`;

        window.showToast?.(res?.error || 'Sync failed', 'error');

      }

    }

  });



  // Quick Pull & Provision Modal

  document.getElementById('btnOpenQuickProvModal')?.addEventListener('click', () => {

    document.getElementById('formQuickProvision')?.reset();

    document.getElementById('qpResult')?.classList.add('hidden');

    openModal('modalQuickProvision');

  });



  document.getElementById('btnCloseModal')?.addEventListener('click', () => closeModal('modalQuickProvision'));

  document.getElementById('btnCancelModal')?.addEventListener('click', () => closeModal('modalQuickProvision'));



  document.getElementById('formQuickProvision')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const btn = document.getElementById('btnSubmitQuickProv');

    btn.disabled = true;

    btn.textContent = 'Provisioning...';



    const payload = {

      extension: document.getElementById('qpExt').value.trim(),

      displayName: document.getElementById('qpName').value.trim(),

      sipPassword: document.getElementById('qpPass').value.trim(),

      expiryHours: parseInt(document.getElementById('qpExpiry').value || '72', 10),

      queryPbx: document.getElementById('qpQueryPbx').checked

    };



    const res = await fetchJson('/api/admin/extensions/quick-provision', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    btn.disabled = false;

    btn.textContent = 'Provision Now';



    if (res && res.ok) {

      document.getElementById('qpResult')?.classList.remove('hidden');

      document.getElementById('qpResultCode').textContent = res.code;

      document.getElementById('qpResultExt').textContent = `Extension ${res.extension} (${res.displayName})`;

      document.getElementById('qpResultDeepLink').value = res.deepLink;

      document.getElementById('qpResultCard').value = res.userWelcomeCard;

      loadExtensions();

    } else if (res) {

      window.showToast(res.error || 'Provisioning failed. Check parameters.', 'error');

    }

  });



  document.getElementById('btnCopyDeepLink')?.addEventListener('click', () => {

    const val = document.getElementById('qpResultDeepLink').value;

    navigator.clipboard.writeText(val);

    window.showToast('Copied 1-Click Setup Link to clipboard!', 'success');

  });



  document.getElementById('btnCopyWelcomeCard')?.addEventListener('click', () => {

    const val = document.getElementById('qpResultCard').value;

    navigator.clipboard.writeText(val);

    window.showToast('Copied Customer Welcome Card to clipboard!', 'success');

  });



  // --------------------------------------------------------------------------

  // 6. TAB 3: Physical IP Handsets & Provisioning Profiles

  // --------------------------------------------------------------------------

  let cachedHandsets = [];

  let deviceCatalogs = {

    handsets: [

      {

        id: 'yealink',

        name: 'Yealink (CFG)',

        configExt: '.cfg',

        models: [

          { id: 'T30P', name: 'Yealink T30P', firmwareVersion: '124.86.0.40', firmwareFilename: 'T30P-124.86.0.40.rom' },

          { id: 'T31P', name: 'Yealink T31P', firmwareVersion: '124.86.0.40', firmwareFilename: 'T31P-124.86.0.40.rom' },

          { id: 'T31G', name: 'Yealink T31G', firmwareVersion: '124.86.0.40', firmwareFilename: 'T31G-124.86.0.40.rom' },

          { id: 'T33G', name: 'Yealink T33G', firmwareVersion: '124.86.0.40', firmwareFilename: 'T33G-124.86.0.40.rom' },

          { id: 'T41S', name: 'Yealink T41S', firmwareVersion: '66.86.0.15', firmwareFilename: 'T41S-66.86.0.15.rom' },

          { id: 'T42S', name: 'Yealink T42S', firmwareVersion: '66.86.0.15', firmwareFilename: 'T42S-66.86.0.15.rom' },

          { id: 'T42U', name: 'Yealink T42U', firmwareVersion: '108.86.0.70', firmwareFilename: 'T42U-108.86.0.70.rom' },

          { id: 'T43U', name: 'Yealink T43U', firmwareVersion: '108.86.0.70', firmwareFilename: 'T43U-108.86.0.70.rom' },

                    { id: 'T46G', name: 'Yealink T46G (Color Display Gigabit)', firmwareVersion: '28.83.0.120', firmwareFilename: 'T46G-28.83.0.120.rom' },

          { id: 'T46S', name: 'Yealink T46S', firmwareVersion: '66.86.0.15', firmwareFilename: 'T46S-66.86.0.15.rom' },

          { id: 'T46U', name: 'Yealink T46U', firmwareVersion: '108.86.0.70', firmwareFilename: 'T46U-108.86.0.70.rom' },

          { id: 'T48S', name: 'Yealink T48S', firmwareVersion: '66.86.0.15', firmwareFilename: 'T48S-66.86.0.15.rom' },

          { id: 'T48U', name: 'Yealink T48U', firmwareVersion: '108.86.0.70', firmwareFilename: 'T48U-108.86.0.70.rom' },

          { id: 'T53', name: 'Yealink T53', firmwareVersion: '96.86.0.75', firmwareFilename: 'T53-96.86.0.75.rom' },

          { id: 'T53W', name: 'Yealink T53W', firmwareVersion: '96.86.0.75', firmwareFilename: 'T53W-96.86.0.75.rom' },

          { id: 'T54W', name: 'Yealink T54W', firmwareVersion: '96.86.0.75', firmwareFilename: 'T54W-96.86.0.75.rom' },

          { id: 'T57W', name: 'Yealink T57W', firmwareVersion: '96.86.0.75', firmwareFilename: 'T57W-96.86.0.75.rom' },

          { id: 'T58W', name: 'Yealink T58W', firmwareVersion: '150.86.0.35', firmwareFilename: 'T58W-150.86.0.35.rom' },

          { id: 'W60B', name: 'Yealink W60B DECT', firmwareVersion: '77.85.0.35', firmwareFilename: 'W60B-77.85.0.35.rom' },

          { id: 'W70B', name: 'Yealink W70B DECT', firmwareVersion: '146.85.0.35', firmwareFilename: 'W70B-146.85.0.35.rom' },

          { id: 'W73P', name: 'Yealink W73P DECT', firmwareVersion: '146.85.0.35', firmwareFilename: 'W73P-146.85.0.35.rom' },

          { id: 'CP920', name: 'Yealink CP920', firmwareVersion: '78.86.0.15', firmwareFilename: 'CP920-78.86.0.15.rom' },

          { id: 'CP960', name: 'Yealink CP960', firmwareVersion: '73.86.0.30', firmwareFilename: 'CP960-73.86.0.30.rom' }

        ]

      },

      {

        id: 'snom',

        name: 'Snom (XML)',

        configExt: '.xml',

        models: [

          { id: 'D712', name: 'Snom D712 (4-Line Standard)', firmwareVersion: '10.1.184.14', firmwareFilename: 'snomD712-10.1.184.14-SIP-r.bin' },

          { id: 'D717', name: 'Snom D717 Color', firmwareVersion: '10.1.184.14', firmwareFilename: 'snomD717-10.1.184.14-SIP-r.bin' },

          { id: 'D735', name: 'Snom D735 Sensor', firmwareVersion: '10.1.184.14', firmwareFilename: 'snomD735-10.1.184.14-SIP-r.bin' },

          { id: 'D785', name: 'Snom D785 Dual Display', firmwareVersion: '10.1.184.14', firmwareFilename: 'snomD785-10.1.184.14-SIP-r.bin' },

          { id: 'D862', name: 'Snom D862 5" LCD', firmwareVersion: 'Carrier Managed', firmwareFilename: 'snomD862.bin' },

          { id: 'D865', name: 'Snom D865 Wi-Fi/BT', firmwareVersion: 'Carrier Managed', firmwareFilename: 'snomD865.bin' },

          { id: 'M300', name: 'Snom M300 DECT Base', firmwareVersion: '05.30.0002', firmwareFilename: 'M300_v0530_b0002.fwu' },

          { id: 'M900', name: 'Snom M900 Multi-Cell DECT', firmwareVersion: '05.30.0007', firmwareFilename: 'M900_v0530_b0007.fwu' }

        ]

      },

      {

        id: 'grandstream',

        name: 'Grandstream (XML)',

        configExt: '.xml',

        models: [

          { id: 'GXP1610', name: 'Grandstream GXP1610 / 1615', firmwareVersion: '1.0.7.53', firmwareFilename: 'gxp1600fw.bin' },

          { id: 'GXP1625', name: 'Grandstream GXP1625', firmwareVersion: '1.0.7.53', firmwareFilename: 'gxp1600fw.bin' },

          { id: 'GXP2130', name: 'Grandstream GXP2130', firmwareVersion: '1.0.11.106', firmwareFilename: 'gxp2130fw.bin' },

          { id: 'GXP2135', name: 'Grandstream GXP2135', firmwareVersion: '1.0.11.106', firmwareFilename: 'gxp2135fw.bin' },

          { id: 'GXP2140', name: 'Grandstream GXP2140', firmwareVersion: '1.0.11.106', firmwareFilename: 'gxp2140fw.bin' },

          { id: 'GXP2160', name: 'Grandstream GXP2160', firmwareVersion: '1.0.11.106', firmwareFilename: 'gxp2160fw.bin' },

          { id: 'GXP2170', name: 'Grandstream GXP2170', firmwareVersion: '1.0.11.106', firmwareFilename: 'gxp2170fw.bin' },

          { id: 'GRP2601', name: 'Grandstream GRP2601', firmwareVersion: '1.0.9.103', firmwareFilename: 'grp2600fw.bin' },

          { id: 'GRP2602', name: 'Grandstream GRP2602', firmwareVersion: '1.0.9.103', firmwareFilename: 'grp2600fw.bin' },

          { id: 'GRP2612', name: 'Grandstream GRP2612', firmwareVersion: '1.0.9.103', firmwareFilename: 'grp2610fw.bin' },

          { id: 'GRP2614', name: 'Grandstream GRP2614', firmwareVersion: '1.0.9.103', firmwareFilename: 'grp2610fw.bin' },

          { id: 'GRP2615', name: 'Grandstream GRP2615', firmwareVersion: '1.0.9.103', firmwareFilename: 'grp2610fw.bin' },

          { id: 'GRP2616', name: 'Grandstream GRP2616', firmwareVersion: '1.0.9.103', firmwareFilename: 'grp2610fw.bin' },

          { id: 'WP810', name: 'Grandstream WP810 Wi-Fi', firmwareVersion: '1.0.11.20', firmwareFilename: 'wp810fw.bin' },

          { id: 'DP750', name: 'Grandstream DP750 DECT', firmwareVersion: '1.0.21.33', firmwareFilename: 'dp75xfw.bin' },

          { id: 'DP752', name: 'Grandstream DP752 DECT', firmwareVersion: '1.0.21.33', firmwareFilename: 'dp75xfw.bin' }

        ]

      },

      {

        id: 'poly',

        name: 'Poly / Polycom (CFG)',

        configExt: '.cfg',

        models: [

          { id: 'VVX-150', name: 'Poly VVX 150', firmwareVersion: '6.4.5.0118', firmwareFilename: '3111-48810-001.sip.ld' },

          { id: 'VVX-250', name: 'Poly VVX 250 Color', firmwareVersion: '6.4.5.0118', firmwareFilename: '3111-48820-001.sip.ld' },

          { id: 'VVX-350', name: 'Poly VVX 350 Gigabit', firmwareVersion: '6.4.5.0118', firmwareFilename: '3111-48830-001.sip.ld' },

          { id: 'VVX-450', name: 'Poly VVX 450 Executive', firmwareVersion: '6.4.5.0118', firmwareFilename: '3111-48840-001.sip.ld' },

          { id: 'VVX-300', name: 'Poly VVX 300 / 310', firmwareVersion: '5.9.8.5959', firmwareFilename: '3111-46157-001.sip.ld' },

          { id: 'VVX-400', name: 'Poly VVX 400 / 410', firmwareVersion: '5.9.8.5959', firmwareFilename: '3111-46162-001.sip.ld' },

          { id: 'VVX-500', name: 'Poly VVX 500 / 501', firmwareVersion: '5.9.8.5959', firmwareFilename: '3111-44500-001.sip.ld' },

          { id: 'VVX-600', name: 'Poly VVX 600 / 601', firmwareVersion: '5.9.8.5959', firmwareFilename: '3111-44600-001.sip.ld' },

          { id: 'Edge-E100', name: 'Poly Edge E100', firmwareVersion: '8.1.3.1328', firmwareFilename: 'poly-edge-e100.bin' },

          { id: 'Edge-E220', name: 'Poly Edge E220', firmwareVersion: '8.1.3.1328', firmwareFilename: 'poly-edge-e220.bin' },

          { id: 'Edge-E320', name: 'Poly Edge E320', firmwareVersion: '8.1.3.1328', firmwareFilename: 'poly-edge-e320.bin' },

          { id: 'Edge-E450', name: 'Poly Edge E450 Dual LCD', firmwareVersion: '8.1.3.1328', firmwareFilename: 'poly-edge-e450.bin' },

          { id: 'Trio-8500', name: 'Poly Trio 8500 Conference', firmwareVersion: '7.2.5.0085', firmwareFilename: '3111-66700-001.sip.ld' }

        ]

      },

      {

        id: 'fanvil',

        name: 'Fanvil (XML)',

        configExt: '.xml',

        models: [

          { id: 'X1S', name: 'Fanvil X1S / X1SG', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x1sg_v2.bin' },

          { id: 'X3S', name: 'Fanvil X3S / X3SG', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x3sg_v2.bin' },

          { id: 'X3U', name: 'Fanvil X3U', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x3u_v2.bin' },

          { id: 'X4U', name: 'Fanvil X4U', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x4u_v2.bin' },

          { id: 'X5U', name: 'Fanvil X5U', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x5u_v2.bin' },

          { id: 'X6U', name: 'Fanvil X6U', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x6u_v2.bin' },

          { id: 'X7', name: 'Fanvil X7 Touch', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x7_v2.bin' },

          { id: 'X7C', name: 'Fanvil X7C Color', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x7c_v2.bin' },

          { id: 'X210', name: 'Fanvil X210 Enterprise', firmwareVersion: '2.12.16', firmwareFilename: 'fanvil_x210_v2.bin' },

          { id: 'V62', name: 'Fanvil V62 Gigabit', firmwareVersion: '2.14.3', firmwareFilename: 'fanvil_v62_v2.bin' },

          { id: 'V64', name: 'Fanvil V64 Wi-Fi/BT', firmwareVersion: '2.14.3', firmwareFilename: 'fanvil_v64_v2.bin' },

          { id: 'V65', name: 'Fanvil V65 Flagship', firmwareVersion: '2.14.3', firmwareFilename: 'fanvil_v65_v2.bin' },

          { id: 'H3', name: 'Fanvil H3 Hotel', firmwareVersion: '2.12.15', firmwareFilename: 'fanvil_h3_v2.bin' },

          { id: 'PA2', name: 'Fanvil PA2 Intercom Gateway', firmwareVersion: '2.12.15', firmwareFilename: 'fanvil_pa2_v2.bin' }

        ]

      },

      {

        id: 'gigaset',

        name: 'Gigaset pro (XML)',

        configExt: '.xml',

        models: [

          { id: 'Maxwell-2', name: 'Gigaset Maxwell 2', firmwareVersion: '2.24.4', firmwareFilename: 'maxwell2-2.24.4.bin' },

          { id: 'Maxwell-3', name: 'Gigaset Maxwell 3', firmwareVersion: '2.24.4', firmwareFilename: 'maxwell3-2.24.4.bin' },

          { id: 'Maxwell-4', name: 'Gigaset Maxwell 4 Touch', firmwareVersion: '2.24.4', firmwareFilename: 'maxwell4-2.24.4.bin' },

          { id: 'N510', name: 'Gigaset N510 IP Pro DECT', firmwareVersion: '42.259', firmwareFilename: 'n510-42.259.bin' },

          { id: 'N670', name: 'Gigaset N670 IP Pro DECT', firmwareVersion: '2.53.0', firmwareFilename: 'n670-2.53.0.bin' },

          { id: 'N870', name: 'Gigaset N870 Enterprise DECT', firmwareVersion: '2.53.0', firmwareFilename: 'n870-2.53.0.bin' }

        ]

      },

      {

        id: 'cisco',

        name: 'Cisco / Linksys (SPA & MPP XML)',

        configExt: '.cfg',

        models: [

          { id: 'SPA504G', name: 'Cisco SPA504G', firmwareVersion: '7.6.2e', firmwareFilename: 'spa50x-30x-7-6-2e.bin' },

          { id: 'SPA525G2', name: 'Cisco SPA525G2 Wi-Fi', firmwareVersion: '7.6.2e', firmwareFilename: 'spa525g-7-6-2e.bin' },

          { id: 'SPA112', name: 'Cisco SPA112 2-Port ATA', firmwareVersion: '1.4.1.SR5', firmwareFilename: 'spa112-1-4-1-SR5.bin' },

          { id: 'SPA122', name: 'Cisco SPA122 ATA Router', firmwareVersion: '1.4.1.SR5', firmwareFilename: 'spa122-1-4-1-SR5.bin' },

          { id: 'MPP-6821', name: 'Cisco MPP 6821', firmwareVersion: '12.0.2', firmwareFilename: 'sip68xx.12-0-2MPP.loads' },

          { id: 'MPP-6851', name: 'Cisco MPP 6851 Gigabit', firmwareVersion: '12.0.2', firmwareFilename: 'sip68xx.12-0-2MPP.loads' },

          { id: 'MPP-7821', name: 'Cisco MPP 7821', firmwareVersion: '14.2.1-0101', firmwareFilename: 'sip78xx.14-2-1-0101-44MPP.loads' },

          { id: 'MPP-7841', name: 'Cisco MPP 7841 Gigabit', firmwareVersion: '14.2.1-0101', firmwareFilename: 'sip78xx.14-2-1-0101-44MPP.loads' },

          { id: 'MPP-8841', name: 'Cisco MPP 8841 Color', firmwareVersion: '14.2.1-0101', firmwareFilename: 'sip88xx.14-2-1-0101-44MPP.loads' },

          { id: 'MPP-8851', name: 'Cisco MPP 8851 Executive', firmwareVersion: '14.2.1-0101', firmwareFilename: 'sip88xx.14-2-1-0101-44MPP.loads' },

          { id: 'MPP-8861', name: 'Cisco MPP 8861 Wi-Fi/BT', firmwareVersion: '14.2.1-0101', firmwareFilename: 'sip88xx.14-2-1-0101-44MPP.loads' }

        ]

      }

    ],

    routers: [

      {

        id: 'mikrotik',

        name: 'MikroTik RouterOS (v6/v7 .rsc)',

        configExt: '.rsc',

        models: [

          { id: 'hex', name: 'MikroTik hEX (RB750Gr3 / RB760iGS)', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-mmips.npk' },

          { id: 'rb3011', name: 'MikroTik RB3011UiAS-RM (10-Port GbE)', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-arm.npk' },

          { id: 'rb4011', name: 'MikroTik RB4011iGS+ (10G SFP+)', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-arm.npk' },

          { id: 'rb5009', name: 'MikroTik RB5009UG+S+IN (Heavy Duty 2.5G)', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-arm64.npk' },

          { id: 'ccr2004', name: 'MikroTik CCR2004-16G-2S+ Cloud Core', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-arm64.npk' },

          { id: 'ccr2116', name: 'MikroTik CCR2116-12G-4S+ Carrier', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-arm64.npk' },

          { id: 'hap-ax3', name: 'MikroTik hAP ax3 / ax2 Wi-Fi 6', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'routeros-7.16.1-arm64.npk' },

          { id: 'chr', name: 'MikroTik Cloud Hosted Router (CHR x86 VM)', firmwareVersion: 'RouterOS v7.16.1', firmwareFilename: 'chr-7.16.1.img' }

        ]

      },

      {

        id: 'tplink',

        name: 'TP-Link (Omada SDN & Archer/VR Series)',

        configExt: '.txt',

        models: [

          { id: 'er605', name: 'TP-Link Omada ER605 (TL-R605 Gigabit VPN)', firmwareVersion: 'Firmware v2.2.4', firmwareFilename: 'ER605v2_un_2.2.4.bin' },

          { id: 'er7206', name: 'TP-Link Omada ER7206 (TL-ER7206 SFP Gigabit)', firmwareVersion: 'Firmware v1.4.1', firmwareFilename: 'ER7206v1_un_1.4.1.bin' },

          { id: 'er707-m2', name: 'TP-Link Omada ER707-M2 (Multi-Gigabit 2.5G)', firmwareVersion: 'Firmware v1.2.2', firmwareFilename: 'ER707-M2v1_un_1.2.2.bin' },

          { id: 'er8411', name: 'TP-Link Omada ER8411 (Enterprise 10G SFP+)', firmwareVersion: 'Firmware v1.2.0', firmwareFilename: 'ER8411v1_un_1.2.0.bin' },

          { id: 'vr2100v', name: 'TP-Link Archer VR2100v (Super VDSL VoIP Gateway)', firmwareVersion: 'Firmware v1.1.0', firmwareFilename: 'Archer_VR2100vv1.bin' },

          { id: 'vx220-g2v', name: 'TP-Link VX220-G2v (Wi-Fi 6 VDSL VoIP Router)', firmwareVersion: 'Firmware v2.0.0', firmwareFilename: 'VX220-G2vv2.bin' }

        ]

      },

      {

        id: 'technicolor',

        name: 'Technicolor / Thomson (Homeware & OpenWrt)',

        configExt: '.sh',

        models: [

          { id: 'dga4130', name: 'Technicolor DGA4130 (VDSL2 35b / EVDSL Gateway)', firmwareVersion: 'Homeware 18.2 / OpenWrt', firmwareFilename: 'AGTEF_1.1.0_CLOSED.rbi' },

          { id: 'dga4132', name: 'Technicolor DGA4132 / Tim Hub (VDSL2 & SFP FTTH)', firmwareVersion: 'Homeware 18.2 / OpenWrt', firmwareFilename: 'DGA4132_2.2.1_CLOSED.rbi' },

          { id: 'tg588v2', name: 'Technicolor TG588v v2 (VDSL2 / ADSL2+ Gateway)', firmwareVersion: 'Homeware 17.2', firmwareFilename: 'TG588v2_17.2.rbi' },

          { id: 'tg589vac', name: 'Technicolor TG589vac v2 (Dual-Band AC VDSL Gateway)', firmwareVersion: 'Homeware 17.2', firmwareFilename: 'TG589vac_17.2.rbi' },

          { id: 'tg789vac', name: 'Technicolor TG789vac v2 (Gigabit Ethernet WAN/VDSL)', firmwareVersion: 'Homeware 17.2', firmwareFilename: 'TG789vac_17.2.rbi' },

          { id: 'cga4233', name: 'Technicolor CGA4233 (DOCSIS 3.1 Gigabit Cable)', firmwareVersion: 'Homeware 19.3', firmwareFilename: 'CGA4233_19.3.bin' },

          { id: 'dga0122', name: 'Technicolor DGA0122 (Wi-Fi VDSL Gateway)', firmwareVersion: 'Homeware 18.1', firmwareFilename: 'DGA0122_18.1.rbi' }

        ]

      },

      {

        id: 'cisco',

        name: 'Cisco IOS & ISR Gateway (.cfg)',

        configExt: '.cfg',

        models: [

          { id: 'isr-1100', name: 'Cisco ISR 1100 (1100-4P / 1100-8P)', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareFilename: 'isr1100-universalk9.17.09.05.SPA.bin' },

          { id: 'isr-4321', name: 'Cisco ISR 4321 Modular Router', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareFilename: 'isr4300-universalk9.17.09.05.SPA.bin' },

          { id: 'isr-4331', name: 'Cisco ISR 4331 Voice Gateway', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareFilename: 'isr4300-universalk9.17.09.05.SPA.bin' },

          { id: 'isr-4451', name: 'Cisco ISR 4451-X High-Performance', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareFilename: 'isr4400-universalk9.17.09.05.SPA.bin' },

          { id: 'rv340', name: 'Cisco Small Business RV340 / RV340W (Dual-WAN VPN)', firmwareVersion: 'Firmware 1.0.03.30', firmwareFilename: 'RV34X-v1.0.03.30.img' },

          { id: 'rv260', name: 'Cisco Small Business RV260 / RV260W (VPN Router)', firmwareVersion: 'Firmware 1.0.01.12', firmwareFilename: 'RV260-v1.0.01.12.img' },

          { id: 'c8200', name: 'Cisco Catalyst 8200 Edge Platform', firmwareVersion: 'Cisco IOS XE 17.12.3', firmwareFilename: 'c8200-universalk9.17.12.03.SPA.bin' },

          { id: 'c8300', name: 'Cisco Catalyst 8300 Edge Platform', firmwareVersion: 'Cisco IOS XE 17.12.3', firmwareFilename: 'c8300-universalk9.17.12.03.SPA.bin' }

        ]

      },

      {

        id: 'draytek',

        name: 'DrayTek Vigor Series',

        configExt: '.txt',

        models: [

          { id: 'vigor-2860', name: 'DrayTek Vigor 2860 / 2860n / 2860ac', firmwareVersion: 'Firmware 3.9.2', firmwareFilename: 'v2860_392.all' },

          { id: 'vigor-2862', name: 'DrayTek Vigor 2862 / 2862Lac (VDSL / LTE)', firmwareVersion: 'Firmware 3.9.7', firmwareFilename: 'v2862_397.all' },

          { id: 'vigor-2865', name: 'DrayTek Vigor 2865 / 2865ac (VDSL / GbE)', firmwareVersion: 'Firmware 4.4.5', firmwareFilename: 'v2865_445.all' },

          { id: 'vigor-2866', name: 'DrayTek Vigor 2866 / 2866Lac (G.Fast / LTE)', firmwareVersion: 'Firmware 4.4.5', firmwareFilename: 'v2866_445.all' },

          { id: 'vigor-2925', name: 'DrayTek Vigor 2925 / 2925n (Dual-WAN GbE)', firmwareVersion: 'Firmware 3.9.2', firmwareFilename: 'v2925_392.all' },

          { id: 'vigor-2926', name: 'DrayTek Vigor 2926 / 2926ac (Dual-WAN GbE)', firmwareVersion: 'Firmware 3.9.7', firmwareFilename: 'v2926_397.all' },

          { id: 'vigor-2927', name: 'DrayTek Vigor 2927 / 2927ac (Dual-WAN GbE)', firmwareVersion: 'Firmware 4.4.5', firmwareFilename: 'v2927_445.all' },

          { id: 'vigor-2960', name: 'DrayTek Vigor 2960 (High-Throughput Dual-WAN)', firmwareVersion: 'Firmware 1.5.1.4', firmwareFilename: 'v2960_1514.all' },

          { id: 'vigor-2962', name: 'DrayTek Vigor 2962 (2.5G Multi-WAN)', firmwareVersion: 'Firmware 4.4.5', firmwareFilename: 'v2962_445.all' },

          { id: 'vigor-3910', name: 'DrayTek Vigor 3910 (10G Multi-WAN Enterprise)', firmwareVersion: 'Firmware 4.4.5', firmwareFilename: 'v3910_445.all' }

        ]

      },

      {

        id: 'ubiquiti',

        name: 'Ubiquiti EdgeRouter (EdgeOS .sh)',

        configExt: '.sh',

        models: [

          { id: 'er-x', name: 'Ubiquiti EdgeRouter X (ER-X / SFP)', firmwareVersion: 'EdgeOS v2.0.9-hotfix.7' },

          { id: 'er-4', name: 'Ubiquiti EdgeRouter 4 (ER-4)', firmwareVersion: 'EdgeOS v2.0.9-hotfix.7' },

          { id: 'er-6p', name: 'Ubiquiti EdgeRouter 6P (ER-6P PoE)', firmwareVersion: 'EdgeOS v2.0.9-hotfix.7' },

          { id: 'er-12', name: 'Ubiquiti EdgeRouter 12 (ER-12 10-Port)', firmwareVersion: 'EdgeOS v2.0.9-hotfix.7' },

          { id: 'er-8-xg', name: 'Ubiquiti EdgeRouter Infinity (ER-8-XG 10G)', firmwareVersion: 'EdgeOS v2.0.9-hotfix.7' }

        ]

      },

      {

        id: 'unifi',

        name: 'Ubiquiti UniFi Gateway (UDM / UXG)',

        configExt: '.sh',

        models: [

          { id: 'udm-pro', name: 'UniFi Dream Machine Pro (UDM-Pro)', firmwareVersion: 'UniFi OS v3.2.12' },

          { id: 'udm-se', name: 'UniFi Dream Machine Special Edition (UDM-SE)', firmwareVersion: 'UniFi OS v3.2.12' },

          { id: 'uxg-pro', name: 'UniFi Next-Gen Gateway Pro (UXG-Pro)', firmwareVersion: 'UniFi OS v3.2.12' },

          { id: 'uxg-lite', name: 'UniFi Next-Gen Gateway Lite (UXG-Lite)', firmwareVersion: 'UniFi OS v3.2.12' },

          { id: 'ucg-ultra', name: 'UniFi Cloud Gateway Ultra (UCG-Ultra)', firmwareVersion: 'UniFi OS v3.2.12' }

        ]

      },

      {

        id: 'pfsense',

        name: 'pfSense / Netgate (Static Port & QoS)',

        configExt: '.txt',

        models: [

          { id: 'netgate-1100', name: 'Netgate 1100 (SOHO Appliance)', firmwareVersion: 'pfSense Plus 23.09.1 / CE 2.7.2' },

          { id: 'netgate-2100', name: 'Netgate 2100 (Branch Appliance)', firmwareVersion: 'pfSense Plus 23.09.1' },

          { id: 'netgate-4100', name: 'Netgate 4100 (Enterprise Appliance)', firmwareVersion: 'pfSense Plus 23.09.1' },

          { id: 'netgate-6100', name: 'Netgate 6100 (10G SFP+ Appliance)', firmwareVersion: 'pfSense Plus 23.09.1' },

          { id: 'netgate-8200', name: 'Netgate 8200 (1U Rackmount Enterprise)', firmwareVersion: 'pfSense Plus 23.09.1' },

          { id: 'pfsense-custom', name: 'pfSense Community Edition (x86 Bare Metal / VM)', firmwareVersion: 'pfSense CE 2.7.2-RELEASE' }

        ]

      },

      {

        id: 'opnsense',

        name: 'OPNsense Firewall (Static Port NAT)',

        configExt: '.txt',

        models: [

          { id: 'dec600', name: 'Deciso DEC600 Series', firmwareVersion: 'OPNsense 24.7 Business Edition' },

          { id: 'dec700', name: 'Deciso DEC700 Series Desktop SFP+', firmwareVersion: 'OPNsense 24.7 Business Edition' },

          { id: 'dec800', name: 'Deciso DEC800 Series', firmwareVersion: 'OPNsense 24.7 Business Edition' },

          { id: 'dec2600', name: 'Deciso DEC2600 Series 1U Rackmount', firmwareVersion: 'OPNsense 24.7 Business Edition' },

          { id: 'opnsense-custom', name: 'OPNsense Community (Custom Appliance / VM)', firmwareVersion: 'OPNsense 24.7.4-amd64' }

        ]

      },

      {

        id: 'switch',

        name: 'Cisco Catalyst Switch (Voice VLAN .cfg)',

        configExt: '.cfg',

        models: [

          { id: 'c2960x', name: 'Cisco Catalyst 2960-X / 2960-XR PoE+', firmwareVersion: 'Cisco IOS 15.2(7)E10' },

          { id: 'c3560cx', name: 'Cisco Catalyst 3560-CX Compact Gigabit', firmwareVersion: 'Cisco IOS 15.2(7)E10' },

          { id: 'c3650', name: 'Cisco Catalyst 3650 / 3850 Multi-Gigabit', firmwareVersion: 'Cisco IOS XE 16.12.10a' },

          { id: 'c9200', name: 'Cisco Catalyst 9200 / 9200L Enterprise', firmwareVersion: 'Cisco IOS XE 17.9.5' },

          { id: 'c9300', name: 'Cisco Catalyst 9300 Stackable Enterprise', firmwareVersion: 'Cisco IOS XE 17.9.5' }

        ]

      },

      {

        id: 'meraki',

        name: 'Cisco Meraki MX Security Appliance',

        configExt: '.txt',

        models: [

          { id: 'mx67', name: 'Cisco Meraki MX67 / MX67W', firmwareVersion: 'Meraki MX 18.211' },

          { id: 'mx68', name: 'Cisco Meraki MX68 / MX68W PoE', firmwareVersion: 'Meraki MX 18.211' },

          { id: 'mx85', name: 'Cisco Meraki MX85 Gigabit Mid-Market', firmwareVersion: 'Meraki MX 18.211' },

          { id: 'mx95', name: 'Cisco Meraki MX95 Multi-Gigabit 10G', firmwareVersion: 'Meraki MX 18.211' },

          { id: 'mx105', name: 'Cisco Meraki MX105 Campus', firmwareVersion: 'Meraki MX 18.211' }

        ]

      },

      {

        id: 'fortinet',

        name: 'Fortinet FortiGate (FortiOS)',

        configExt: '.conf',

        models: [

          { id: 'fg-40f', name: 'Fortinet FortiGate 40F', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8' },

          { id: 'fg-60f', name: 'Fortinet FortiGate 60F SMB', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8' },

          { id: 'fg-70f', name: 'Fortinet FortiGate 70F Branch', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8' },

          { id: 'fg-80f', name: 'Fortinet FortiGate 80F Dual Power', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8' },

          { id: 'fg-100f', name: 'Fortinet FortiGate 100F 10G SFP+', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8' }

        ]

      },

      {

        id: 'sonicwall',

        name: 'SonicWall TZ & NSA Series',

        configExt: '.txt',

        models: [

          { id: 'tz270', name: 'SonicWall TZ270 Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058' },

          { id: 'tz370', name: 'SonicWall TZ370 Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058' },

          { id: 'tz470', name: 'SonicWall TZ470 Multi-Gigabit', firmwareVersion: 'SonicOS 7.1.1-7058' },

          { id: 'tz570', name: 'SonicWall TZ570 5GbE SFP+', firmwareVersion: 'SonicOS 7.1.1-7058' },

          { id: 'tz670', name: 'SonicWall TZ670 10GbE', firmwareVersion: 'SonicOS 7.1.1-7058' },

          { id: 'nsa2700', name: 'SonicWall NSA 2700 Enterprise', firmwareVersion: 'SonicOS 7.1.1-7058' }

        ]

      },

      {

        id: 'sophos',

        name: 'Sophos XGS Firewall',

        configExt: '.txt',

        models: [

          { id: 'xgs-87', name: 'Sophos XGS 87 Small Office', firmwareVersion: 'SFOS v20.0 MR2' },

          { id: 'xgs-107', name: 'Sophos XGS 107 Branch Office', firmwareVersion: 'SFOS v20.0 MR2' },

          { id: 'xgs-116', name: 'Sophos XGS 116 GbE & SFP', firmwareVersion: 'SFOS v20.0 MR2' },

          { id: 'xgs-126', name: 'Sophos XGS 126 Multi-Port', firmwareVersion: 'SFOS v20.0 MR2' },

          { id: 'xgs-136', name: 'Sophos XGS 136 Dual SFP+ 2.5G', firmwareVersion: 'SFOS v20.0 MR2' }

        ]

      },

      {

        id: 'linux',

        name: 'Generic Linux / Dnsmasq (Option 66)',

        configExt: '.sh',

        models: [

          { id: 'dnsmasq', name: 'Debian / Ubuntu dnsmasq Gateway', firmwareVersion: 'dnsmasq 2.90+' },

          { id: 'isc-dhcp', name: 'ISC DHCP Server (dhcpd.conf)', firmwareVersion: 'isc-dhcp-server 4.4.3+' },

          { id: 'kea-dhcp', name: 'ISC Kea Modern DHCP Server', firmwareVersion: 'Kea 2.6.1 LTS' }

        ]

      }

    ]

  };



  // Populate dropdowns immediately with built-in catalog

  setTimeout(() => {

    updateHandsetModelsDropdown();

    updateRouterModelsDropdown();

    updateHandsetExplorerPreview();

    updateRouterExplorerPreview();

  }, 50);



  function downloadTextFile(filename, content) {

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = filename;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

  }



  async function loadCatalogs() {

    try {

      const res = await fetch('/api/admin/catalogs');

      const data = await res.json();

      if (data && data.ok) {

        deviceCatalogs = { handsets: data.handsets || [], routers: data.routers || [] };

      }

    } catch (err) {

      console.warn('Failed to fetch catalogs from server:', err);

    }

    // Refresh models dropdowns and previews for both handsets & routers

    updateHandsetModelsDropdown();

    updateRouterModelsDropdown();

    updateHandsetExplorerPreview();

    updateRouterExplorerPreview();

  }



  function updateHandsetModelsDropdown() {

    // 1. Modal Select

    const brandSel = document.getElementById('addHandsetBrand');

    const modelSel = document.getElementById('addHandsetModel');

    if (brandSel && modelSel) {

      const brandId = (brandSel.value || 'yealink').toLowerCase();

      const brandObj = deviceCatalogs.handsets.find(b => (b.id || '').toLowerCase() === brandId);

      if (brandObj && brandObj.models && brandObj.models.length) {

        modelSel.innerHTML = brandObj.models.map(m => `

          <option value="${m.id}">${m.name} (${m.series || 'Desktop'})</option>

        `).join('') + '<option value="Custom">Custom / Other Model</option>';

      } else {

        modelSel.innerHTML = '<option value="">Standard / Generic Model</option>';

      }

    }



    // 2. Explorer Select

    const expBrandSel = document.getElementById('explorerHandsetBrand');

    const expModelSel = document.getElementById('explorerHandsetModel');

    if (expBrandSel && expModelSel) {

      const brandId = (expBrandSel.value || 'yealink').toLowerCase();

      const brandObj = deviceCatalogs.handsets.find(b => (b.id || '').toLowerCase() === brandId);

      if (brandObj && brandObj.models && brandObj.models.length) {

        const curVal = expModelSel.value;

        expModelSel.innerHTML = brandObj.models.map(m => `

          <option value="${m.id}">${m.name} — ${m.firmwareVersion || ''}</option>

        `).join('');

        if (curVal && brandObj.models.some(m => m.id === curVal)) {

          expModelSel.value = curVal;

        } else {

          expModelSel.value = brandObj.models[0].id;

        }

      } else {

        expModelSel.innerHTML = '<option value="">Standard Model</option>';

      }

    }

  }



  function updateRouterModelsDropdown() {

    // 1. Modal Select

    const brandSel = document.getElementById('addRouterBrand');

    const modelSel = document.getElementById('addRouterModel');

    if (brandSel && modelSel) {

      const brandId = (brandSel.value || 'mikrotik').toLowerCase();

      const brandObj = deviceCatalogs.routers.find(b => (b.id || '').toLowerCase() === brandId);

      if (brandObj && brandObj.models && brandObj.models.length) {

        modelSel.innerHTML = brandObj.models.map(m => `

          <option value="${m.id}">${m.name} (${m.series || 'Gateway'})</option>

        `).join('') + '<option value="Custom">Custom / Other Model</option>';

      } else {

        modelSel.innerHTML = '<option value="">Standard / Generic Model</option>';

      }

    }



    // 2. Explorer Select

    const expBrandSel = document.getElementById('explorerRouterBrand');

    const expModelSel = document.getElementById('explorerRouterModel');

    if (expBrandSel && expModelSel) {

      const brandId = (expBrandSel.value || 'mikrotik').toLowerCase();

      const brandObj = deviceCatalogs.routers.find(b => (b.id || '').toLowerCase() === brandId);

      if (brandObj && brandObj.models && brandObj.models.length) {

        const curVal = expModelSel.value;

        expModelSel.innerHTML = brandObj.models.map(m => `

          <option value="${m.id}">${m.name} — ${m.firmwareVersion || ''}</option>

        `).join('');

        if (curVal && brandObj.models.some(m => m.id === curVal)) {

          expModelSel.value = curVal;

        } else {

          expModelSel.value = brandObj.models[0].id;

        }

      } else {

        expModelSel.innerHTML = '<option value="">Standard Model</option>';

      }

    }

  }



  // --------------------------------------------------------------------------

  // Firmware Storage & Auto-Downloader Helpers

  // --------------------------------------------------------------------------

  async function refreshHandsetFirmwareStatus(brand, model) {

    const badge = document.getElementById('explorerHandsetStorageBadge');

    const pathTag = document.getElementById('explorerHandsetPathTag');

    const bootUrlEl = document.getElementById('explorerHandsetBootUrl');

    const purgeBtn = document.getElementById('btnPurgeHandsetFw');

    const autoBtn = document.getElementById('btnAutoDownloadHandsetFw');



    const safeBrand = (brand || 'yealink').toLowerCase();

    const safeModel = (model || 'standard').toUpperCase().replace(/[^a-zA-Z0-9_-]/g, '_');

    if (pathTag) pathTag.textContent = `data/firmware/${safeBrand}/${safeModel}/`;



    try {

      const res = await fetchJson('/api/admin/firmware/status');

      if (res && res.ok && res.catalog) {

        const brandObj = res.catalog.handsets?.find(b => b.id.toLowerCase() === brand.toLowerCase());

        const modelObj = brandObj?.models?.find(m => m.id.toLowerCase() === model.toLowerCase());

        if (modelObj) {

          if (bootUrlEl) {

            const bootUrl = `${window.location.origin}/firmware/${brand.toLowerCase()}/${model.toUpperCase()}/${modelObj.firmwareFilename}`;

            bootUrlEl.textContent = bootUrl;

          }

          if (modelObj.isCached) {

            if (badge) {

              badge.textContent = `● Stored Internally (${modelObj.fileSizeFormatted})`;

              badge.className = 'badge badge-firmware-cached';

            }

            if (purgeBtn) purgeBtn.classList.remove('hidden');

            if (autoBtn) autoBtn.innerHTML = 'Re-Download Package';

          } else {

            if (badge) {

              badge.textContent = '○ Not Stored Internally';

              badge.className = 'badge badge-firmware-missing';

            }

            if (purgeBtn) purgeBtn.classList.add('hidden');

            if (autoBtn) autoBtn.innerHTML = 'Auto-Download to Server';

          }

        }

      }

    } catch (err) {

      console.warn('Could not check firmware status:', err);

    }

  }



  async function refreshRouterFirmwareStatus(brand, model) {

    const badge = document.getElementById('explorerRouterStorageBadge');

    const pathTag = document.getElementById('explorerRouterPathTag');

    const bootUrlEl = document.getElementById('explorerRouterBootUrl');

    const purgeBtn = document.getElementById('btnPurgeRouterFw');

    const autoBtn = document.getElementById('btnAutoDownloadRouterFw');



    const safeBrand = (brand || 'mikrotik').toLowerCase();

    const safeModel = (model || 'standard').toUpperCase().replace(/[^a-zA-Z0-9_-]/g, '_');

    if (pathTag) pathTag.textContent = `data/firmware/${safeBrand}/${safeModel}/`;



    try {

      const res = await fetchJson('/api/admin/firmware/status');

      if (res && res.ok && res.catalog) {

        const brandObj = res.catalog.routers?.find(b => b.id.toLowerCase() === brand.toLowerCase());

        const modelObj = brandObj?.models?.find(m => m.id.toLowerCase() === model.toLowerCase());

        if (modelObj) {

          if (bootUrlEl) {

            const bootUrl = `${window.location.origin}/firmware/${brand.toLowerCase()}/${model.toUpperCase()}/${modelObj.firmwareFilename}`;

            bootUrlEl.textContent = bootUrl;

          }

          if (modelObj.isCached) {

            if (badge) {

              badge.textContent = `● Stored Internally (${modelObj.fileSizeFormatted})`;

              badge.className = 'badge badge-firmware-cached';

            }

            if (purgeBtn) purgeBtn.classList.remove('hidden');

            if (autoBtn) autoBtn.innerHTML = 'Re-Download Package';

          } else {

            if (badge) {

              badge.textContent = '○ Not Stored Internally';

              badge.className = 'badge badge-firmware-missing';

            }

            if (purgeBtn) purgeBtn.classList.add('hidden');

            if (autoBtn) autoBtn.innerHTML = 'Auto-Download to Server';

          }

        }

      }

    } catch (err) {

      console.warn('Could not check firmware status:', err);

    }

  }



  async function updateHandsetExplorerPreview() {

    const brand = document.getElementById('explorerHandsetBrand')?.value || 'yealink';

    const model = document.getElementById('explorerHandsetModel')?.value || '';

    const ext = document.getElementById('explorerHandsetExt')?.value.trim() || '101';

    const label = document.getElementById('explorerHandsetLabel')?.value.trim() || 'Demo User';



    const brandMeta = deviceCatalogs.handsets.find(b => b.id === brand);

    const modelMeta = brandMeta?.models.find(m => m.id === model) || brandMeta?.models[0];

    const targetModelId = modelMeta ? modelMeta.id : model;



    // Update Firmware Banner

    const fwVer = document.getElementById('explorerHandsetFwVer');

    const fwFile = document.getElementById('explorerHandsetFwFile');

    const fwNotes = document.getElementById('explorerHandsetFwNotes');

    const fwLink = document.getElementById('explorerHandsetFwLink');

    if (modelMeta) {

      if (fwVer) fwVer.textContent = `Firmware: ${modelMeta.firmwareVersion || 'Latest Stable'}`;

      if (fwFile) fwFile.textContent = modelMeta.firmwareFilename || 'standard.rom';

      if (fwNotes) fwNotes.textContent = modelMeta.firmwareNotes ? `(${modelMeta.firmwareNotes})` : '';

      if (fwLink) {

        fwLink.href = modelMeta.firmwareUrl || brandMeta?.vendorDocUrl || '#';

        fwLink.style.display = 'inline-flex';

      }

    }



    refreshHandsetFirmwareStatus(brand, targetModelId);



    try {

      const res = await fetch('/api/admin/catalogs/preview', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ type: 'handset', brand, model: targetModelId, extension: ext, displayName: label })

      });

      const data = await res.json();

      if (data && data.ok) {

        const txt = document.getElementById('explorerHandsetConfig');

        if (txt) txt.value = data.content;

      }

    } catch (e) {

      console.error('Error fetching handset preview:', e);

    }

  }



  async function updateRouterExplorerPreview() {

    const brand = document.getElementById('explorerRouterBrand')?.value || 'mikrotik';

    const model = document.getElementById('explorerRouterModel')?.value || '';

    const vlan = document.getElementById('explorerRouterVlan')?.value || '20';

    const subnet = document.getElementById('explorerRouterSubnet')?.value || '10.20.0.1/24';

    const alg = document.getElementById('explorerRouterAlg')?.checked ?? true;

    const qos = document.getElementById('explorerRouterQos')?.checked ?? true;



    const brandMeta = deviceCatalogs.routers.find(b => b.id === brand);

    const modelMeta = brandMeta?.models.find(m => m.id === model) || brandMeta?.models[0];

    const targetModelId = modelMeta ? modelMeta.id : model;



    // Update Firmware Banner

    const fwVer = document.getElementById('explorerRouterFwVer');

    const fwFile = document.getElementById('explorerRouterFwFile');

    const fwLink = document.getElementById('explorerRouterFwLink');

    if (modelMeta) {

      if (fwVer) fwVer.textContent = `Recommended OS: ${modelMeta.firmwareVersion || 'Latest Release'}`;

      if (fwFile) fwFile.textContent = modelMeta.firmwareFilename || 'firmware.bin';

      if (fwLink) {

        fwLink.href = modelMeta.firmwareUrl || brandMeta?.vendorDocUrl || '#';

        fwLink.style.display = 'inline-flex';

      }

    }



    refreshRouterFirmwareStatus(brand, targetModelId);



    try {

      const res = await fetch('/api/admin/catalogs/preview', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ type: 'router', brand, model: targetModelId, vlan, subnet, alg, qos })

      });

      const data = await res.json();

      if (data && data.ok) {

        const txt = document.getElementById('explorerRouterConfig');

        if (txt) txt.value = data.content;

      }

    } catch (e) {

      console.error('Error fetching router preview:', e);

    }

  }



  // Bind Handset Explorer Events

  document.getElementById('explorerHandsetBrand')?.addEventListener('change', () => {

    updateHandsetModelsDropdown();

    updateHandsetExplorerPreview();

  });

  document.getElementById('explorerHandsetModel')?.addEventListener('change', updateHandsetExplorerPreview);

  document.getElementById('explorerHandsetExt')?.addEventListener('input', updateHandsetExplorerPreview);

  document.getElementById('explorerHandsetLabel')?.addEventListener('input', updateHandsetExplorerPreview);



  document.getElementById('btnCopyHandsetExplorerConfig')?.addEventListener('click', () => {

    const content = document.getElementById('explorerHandsetConfig')?.value;

    if (content) {

      navigator.clipboard.writeText(content);

      window.showToast('Handset configuration copied to clipboard!', 'success');

    }

  });



  document.getElementById('btnDownloadHandsetExplorerConfig')?.addEventListener('click', () => {

    const content = document.getElementById('explorerHandsetConfig')?.value;

    const brand = document.getElementById('explorerHandsetBrand')?.value || 'handset';

    const model = document.getElementById('explorerHandsetModel')?.value || 'config';

    const brandMeta = deviceCatalogs.handsets.find(b => b.id === brand);

    const ext = brandMeta?.configExt || '.cfg';

    if (content) {

      downloadTextFile(`${brand}_${model}_profile${ext}`, content);

      window.showToast(`Downloaded ${brand}_${model}_profile${ext}`, 'success');

    }

  });



  // Bind Router Explorer Events

  document.getElementById('explorerRouterBrand')?.addEventListener('change', () => {

    updateRouterModelsDropdown();

    updateRouterExplorerPreview();

  });

  document.getElementById('explorerRouterModel')?.addEventListener('change', updateRouterExplorerPreview);

  document.getElementById('explorerRouterVlan')?.addEventListener('input', updateRouterExplorerPreview);

  document.getElementById('explorerRouterSubnet')?.addEventListener('input', updateRouterExplorerPreview);

  document.getElementById('explorerRouterAlg')?.addEventListener('change', updateRouterExplorerPreview);

  document.getElementById('explorerRouterQos')?.addEventListener('change', updateRouterExplorerPreview);



  document.getElementById('btnCopyRouterExplorerConfig')?.addEventListener('click', () => {

    const content = document.getElementById('explorerRouterConfig')?.value;

    if (content) {

      navigator.clipboard.writeText(content);

      window.showToast('Router script copied to clipboard!', 'success');

    }

  });



  document.getElementById('btnDownloadRouterExplorerConfig')?.addEventListener('click', () => {

    const content = document.getElementById('explorerRouterConfig')?.value;

    const brand = document.getElementById('explorerRouterBrand')?.value || 'router';

    const model = document.getElementById('explorerRouterModel')?.value || 'script';

    const brandMeta = deviceCatalogs.routers.find(b => b.id === brand);

    const ext = brandMeta?.configExt || '.rsc';

    if (content) {

      downloadTextFile(`${brand}_${model}_script${ext}`, content);

      window.showToast(`Downloaded ${brand}_${model}_script${ext}`, 'success');

    }

  });



  // --------------------------------------------------------------------------

  // Firmware Action Handlers (Auto-Download, Upload, Purge, Option 66 Copy)

  // --------------------------------------------------------------------------

  // Handset Auto-Download

  document.getElementById('btnAutoDownloadHandsetFw')?.addEventListener('click', async () => {

    const brand = document.getElementById('explorerHandsetBrand')?.value || 'yealink';

    const model = document.getElementById('explorerHandsetModel')?.value || '';

    const btn = document.getElementById('btnAutoDownloadHandsetFw');



    btn.disabled = true;

    btn.innerHTML = '<span>⏳</span> Downloading...';

    window.showToast(`Contacting vendor repository for ${brand.toUpperCase()} ${model} firmware...`, 'info');



    try {

      const res = await fetchJson('/api/admin/firmware/download', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ brand, model })

      });



      if (res && res.ok) {

        window.showToast(`Firmware ${res.result.filename} successfully downloaded and stored!`, 'success');

        refreshHandsetFirmwareStatus(brand, model);

      } else {

        window.showToast(res?.error || 'Failed to auto-download firmware.', 'error');

      }

    } catch (e) {

      window.showToast('Network error while requesting firmware download.', 'error');

    } finally {

      btn.disabled = false;

      btn.innerHTML = 'Auto-Download to Server';

    }

  });



  // Handset Upload

  document.getElementById('fileUploadHandsetFw')?.addEventListener('change', async (e) => {

    const file = e.target.files?.[0];

    if (!file) return;



    const brand = document.getElementById('explorerHandsetBrand')?.value || 'yealink';

    const model = document.getElementById('explorerHandsetModel')?.value || '';



    const formData = new FormData();

    formData.append('brand', brand);

    formData.append('model', model);

    formData.append('firmwareFile', file);



    window.showToast(`Uploading firmware ${file.name} to model directory...`, 'info');



    try {

      const token = getAuthToken();

      const res = await fetch('/api/admin/firmware/upload', {

        method: 'POST',

        headers: { 'Authorization': `Bearer ${token}` },

        body: formData

      });

      const data = await res.json();

      if (data && data.ok) {

        window.showToast(`Firmware ${data.result.filename} stored in internal model directory!`, 'success');

        refreshHandsetFirmwareStatus(brand, model);

      } else {

        window.showToast(data?.error || 'Upload failed.', 'error');

      }

    } catch (err) {

      window.showToast('Error uploading firmware file.', 'error');

    }

    e.target.value = '';

  });



  // Handset Purge

  document.getElementById('btnPurgeHandsetFw')?.addEventListener('click', async () => {

    const brand = document.getElementById('explorerHandsetBrand')?.value || 'yealink';

    const model = document.getElementById('explorerHandsetModel')?.value || '';

    if (!confirm(`Purge the locally stored firmware binary for ${brand.toUpperCase()} ${model}?`)) return;



    const res = await fetchJson(`/api/admin/firmware/${brand}/${model}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast(`Local firmware for ${brand.toUpperCase()} ${model} purged.`, 'success');

      refreshHandsetFirmwareStatus(brand, model);

    } else {

      window.showToast(res?.error || 'Failed to purge firmware.', 'error');

    }

  });



  // Handset Option 66 URL Copy

  document.getElementById('btnCopyHandsetBootUrl')?.addEventListener('click', () => {

    const url = document.getElementById('explorerHandsetBootUrl')?.textContent;

    if (url && url !== '--') {

      window.copyText(url, 'Copied Device Option 66 Firmware URL to clipboard!');

    }

  });



  // Router Auto-Download

  document.getElementById('btnAutoDownloadRouterFw')?.addEventListener('click', async () => {

    const brand = document.getElementById('explorerRouterBrand')?.value || 'mikrotik';

    const model = document.getElementById('explorerRouterModel')?.value || '';

    const btn = document.getElementById('btnAutoDownloadRouterFw');



    btn.disabled = true;

    btn.innerHTML = '<span>⏳</span> Downloading...';

    window.showToast(`Contacting vendor repository for ${brand.toUpperCase()} ${model} firmware...`, 'info');



    try {

      const res = await fetchJson('/api/admin/firmware/download', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ brand, model })

      });



      if (res && res.ok) {

        window.showToast(`Firmware ${res.result.filename} successfully downloaded and stored!`, 'success');

        refreshRouterFirmwareStatus(brand, model);

      } else {

        window.showToast(res?.error || 'Failed to auto-download firmware.', 'error');

      }

    } catch (e) {

      window.showToast('Network error while requesting firmware download.', 'error');

    } finally {

      btn.disabled = false;

      btn.innerHTML = 'Auto-Download to Server';

    }

  });



  // Router Upload

  document.getElementById('fileUploadRouterFw')?.addEventListener('change', async (e) => {

    const file = e.target.files?.[0];

    if (!file) return;



    const brand = document.getElementById('explorerRouterBrand')?.value || 'mikrotik';

    const model = document.getElementById('explorerRouterModel')?.value || '';



    const formData = new FormData();

    formData.append('brand', brand);

    formData.append('model', model);

    formData.append('firmwareFile', file);



    window.showToast(`Uploading firmware ${file.name} to model directory...`, 'info');



    try {

      const token = getAuthToken();

      const res = await fetch('/api/admin/firmware/upload', {

        method: 'POST',

        headers: { 'Authorization': `Bearer ${token}` },

        body: formData

      });

      const data = await res.json();

      if (data && data.ok) {

        window.showToast(`Firmware ${data.result.filename} stored in internal model directory!`, 'success');

        refreshRouterFirmwareStatus(brand, model);

      } else {

        window.showToast(data?.error || 'Upload failed.', 'error');

      }

    } catch (err) {

      window.showToast('Error uploading firmware file.', 'error');

    }

    e.target.value = '';

  });



  // Router Purge

  document.getElementById('btnPurgeRouterFw')?.addEventListener('click', async () => {

    const brand = document.getElementById('explorerRouterBrand')?.value || 'mikrotik';

    const model = document.getElementById('explorerRouterModel')?.value || '';

    if (!confirm(`Purge the locally stored firmware binary for ${brand.toUpperCase()} ${model}?`)) return;



    const res = await fetchJson(`/api/admin/firmware/${brand}/${model}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast(`Local firmware for ${brand.toUpperCase()} ${model} purged.`, 'success');

      refreshRouterFirmwareStatus(brand, model);

    } else {

      window.showToast(res?.error || 'Failed to purge firmware.', 'error');

    }

  });



  // Router Boot URL Copy

  document.getElementById('btnCopyRouterBootUrl')?.addEventListener('click', () => {

    const url = document.getElementById('explorerRouterBootUrl')?.textContent;

    if (url && url !== '--') {

      window.copyText(url, 'Copied Router Firmware URL to clipboard!');

    }

  });



  // Global Batch Auto-Download Sync Buttons

  const handleBatchFwSync = async () => {

    if (!confirm('Start automated background batch download of all vendor stable firmwares into internal model directories?')) return;

    window.showToast('Queued stable firmware packages for auto-download. Watch Shell for live progress.', 'info');

    const res = await fetchJson('/api/admin/firmware/sync-all', { method: 'POST' });

    if (res && res.ok) {

      window.showToast(res.message, 'success');

    }

  };



  document.getElementById('btnSyncAllHandsetFw')?.addEventListener('click', handleBatchFwSync);

  document.getElementById('btnSyncAllRouterFw')?.addEventListener('click', handleBatchFwSync);



  // Modal Brand Listeners

  document.getElementById('addHandsetBrand')?.addEventListener('change', updateHandsetModelsDropdown);

  document.getElementById('addRouterBrand')?.addEventListener('change', updateRouterModelsDropdown);



  function getHandsetProvisionUrl(brand, mac) {

    const cleanMac = mac.toLowerCase().replace(/[^0-9a-f]/g, '');

    const b = (brand || '').toLowerCase();

    if (b === 'grandstream') return `/provision/cfg${cleanMac}.xml`;

    if (b === 'fanvil' || b === 'snom' || b === 'gigaset') return `/provision/${cleanMac}.xml`;

    if (b === 'cisco') return `/provision/spa${cleanMac}.cfg`;

    return `/provision/${cleanMac}.cfg`;

  }



  function renderHandsetsTable(list) {

    const tbody = document.getElementById('handsetTableBody');

    if (!tbody) return;

    if (!list.length) {

      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No physical handsets match your search.</td></tr>';

      return;

    }



    const canManage = hasPerm('manage_handsets');

    tbody.innerHTML = list.map(h => {

      const cleanMac = h.mac_address.toLowerCase().replace(/[^0-9a-f]/g, '');

      const provUrl = getHandsetProvisionUrl(h.brand, cleanMac);

      const isCustom = h.custom_config && h.custom_config.trim().length > 0;



      return `

        <tr>

          <td>

            <code>${h.mac_address.toUpperCase()}</code>

            ${isCustom ? '<span class="tag badge-primary" style="margin-left:6px;font-size:10px;">Custom Profile</span>' : ''}

          </td>

          <td><strong>${h.brand.toUpperCase()}</strong> ${h.model || ''}</td>

          <td>Ext ${h.extension} (${h.display_name || ''})</td>

          <td>${h.line_label || 'Default'}</td>

          <td>${h.last_provisioned_at ? new Date(h.last_provisioned_at).toLocaleString() : '<span class="muted">Never fetched</span>'}${h.ip_address ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">IP: <code>${h.ip_address}</code></div>` : ''}</td>

          <td>

            <div style="display: flex; gap: 4px; flex-wrap: wrap;">

              <button class="btn btn-sm btn-outline" onclick="window.viewDeviceLogs('${cleanMac}', 'handset', { mac: '${cleanMac.toUpperCase()}', brand: '${h.brand}', model: '${h.model || ''}', ext: '${h.extension}', ip: '${h.ip_address || ''}' })" title="Live Telemetry & Logs">Logs</button>

              <button class="btn btn-sm btn-primary" onclick="editHandsetConfig('${cleanMac}')">Edit Config</button>

              <a class="btn btn-sm btn-secondary" href="${provUrl}" target="_blank" title="Test Fetch Profile">Test</a>

              ${canManage ? `

                <button class="btn btn-sm btn-danger" onclick="deleteHandset('${cleanMac}')">Remove</button>

              ` : ''}

            </div>

          </td>

        </tr>

      `;

    }).join('');

  }



  // Instant Live Search for Handsets

  document.getElementById('searchHandset')?.addEventListener('input', (e) => {

    const query = e.target.value.toLowerCase().trim();

    if (!query) {

      renderHandsetsTable(cachedHandsets);

      loadDiscoveredDevices();

      return;

    }

    const filtered = cachedHandsets.filter(h =>

      (h.mac_address && h.mac_address.toLowerCase().includes(query)) ||

      (h.brand && h.brand.toLowerCase().includes(query)) ||

      (h.model && h.model.toLowerCase().includes(query)) ||

      (h.extension && String(h.extension).toLowerCase().includes(query)) ||

      (h.display_name && h.display_name.toLowerCase().includes(query)) ||

      (h.line_label && h.line_label.toLowerCase().includes(query))

    );

    renderHandsetsTable(filtered);

  });



  async function loadHandsets() {

    const data = await fetchJson('/api/admin/handsets');

    const tbody = document.getElementById('handsetTableBody');

    const countEl = document.getElementById('handsetCountPill');

    const total = (data && data.handsets) ? data.handsets.length : 0;

    if (countEl) countEl.textContent = total;



    if (!data || !data.ok || !data.handsets.length) {

      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center">No physical handsets registered. Click "+ Register Physical Handset" to add one by MAC address.</td></tr>';

      cachedHandsets = [];

      return;

    }



    cachedHandsets = data.handsets;

    const searchVal = document.getElementById('searchHandset')?.value.toLowerCase().trim();

    if (searchVal) {

      document.getElementById('searchHandset').dispatchEvent(new Event('input'));

    } else {

      renderHandsetsTable(cachedHandsets);

    }

  }



  // Handset Config Editor Modal Handlers

  let activeHandsetMac = '';

  let activeHandsetDefaultConfig = '';



  window.editHandsetConfig = async (mac) => {

    activeHandsetMac = mac;

    const res = await fetchJson(`/api/admin/handsets/${mac}/preview`);

    if (!res || !res.ok) {

      window.showToast(res?.error || 'Failed to load handset configuration preview.', 'error');

      return;

    }



    document.getElementById('editHandsetTitle').textContent = `Edit Provisioning Profile — ${res.brand.toUpperCase()} ${res.model || ''}`;

    document.getElementById('editHandsetSub').textContent = `Device MAC: ${mac.toUpperCase()} | Assigned to Extension ${res.extension} (${res.displayName})`;



    const provUrl = getHandsetProvisionUrl(res.brand, mac);

    document.getElementById('editHandsetFileTag').textContent = provUrl.replace('/provision/', '');

    document.getElementById('btnTestFetchHandset').href = provUrl;



    const badge = document.getElementById('editHandsetStatusBadge');

    if (res.isCustomized) {

      badge.textContent = 'Customized Profile Active';

      badge.className = 'badge badge-primary';

    } else {

      badge.textContent = 'Standard Brand Default';

      badge.className = 'badge badge-secondary';

    }



    activeHandsetDefaultConfig = res.defaultContent;

    document.getElementById('handsetConfigEditor').value = res.content;

    openModal('modalEditHandsetConfig');

  };



  document.getElementById('btnResetHandsetDefault')?.addEventListener('click', () => {

    if (confirm('Reset this handset configuration to the standard manufacturer default template?')) {

      document.getElementById('handsetConfigEditor').value = activeHandsetDefaultConfig;

      const badge = document.getElementById('editHandsetStatusBadge');

      badge.textContent = 'Standard Brand Default';

      badge.className = 'badge badge-secondary';

      window.showToast('Reset to manufacturer default template', 'info');

    }

  });



  document.getElementById('btnCopyHandsetConfig')?.addEventListener('click', () => {

    const val = document.getElementById('handsetConfigEditor').value;

    navigator.clipboard.writeText(val);

    window.showToast('Handset configuration copied to clipboard!', 'success');

  });



  document.getElementById('btnSaveHandsetConfig')?.addEventListener('click', async () => {

    const content = document.getElementById('handsetConfigEditor').value;

    const btn = document.getElementById('btnSaveHandsetConfig');

    btn.disabled = true;

    btn.textContent = 'Saving...';



    const toSave = content.trim() === activeHandsetDefaultConfig.trim() ? '' : content;



    const res = await fetchJson(`/api/admin/handsets/${activeHandsetMac}/config`, {

      method: 'PUT',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ customConfig: toSave })

    });



    btn.disabled = false;

    btn.textContent = 'Save Custom Profile';



    if (res && res.ok) {

      window.showToast('Handset provisioning profile saved successfully!', 'success');

      closeModal('modalEditHandsetConfig');

      loadHandsets();

    } else if (res) {

      window.showToast(res.error || 'Failed to save configuration.', 'error');

    }

  });



  window.deleteHandset = async (mac) => {

    if (!confirm(`Remove handset with MAC [${mac}]?`)) return;

    const res = await fetchJson(`/api/admin/handsets/${mac}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast(`Handset [${mac}] removed.`, 'info');

      loadHandsets();

    }

  };



  document.getElementById('btnOpenAddHandsetModal')?.addEventListener('click', async () => {

    document.getElementById('formAddHandset')?.reset();

    updateHandsetModelsDropdown();

    

    // Ensure extensions are fetched and populated in dropdown

    if (!cachedExtensions || !cachedExtensions.length) {

      const extData = await fetchJson('/api/admin/extensions');

      if (extData && extData.ok && extData.extensions) {

        cachedExtensions = extData.extensions;

      }

    }



    const sel = document.getElementById('addHandsetExt');

    if (sel) {

      if (cachedExtensions && cachedExtensions.length) {

        sel.innerHTML = '<option value="">Select an extension...</option>' + cachedExtensions.map(e => `

          <option value="${e.extension}">Ext ${e.extension} (${e.display_name})</option>

        `).join('');

      } else {

        sel.innerHTML = '<option value="">No extensions found - create one first</option>';

      }

    }

    openModal('modalAddHandset');

  });



  document.getElementById('formAddHandset')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const mac = document.getElementById('addHandsetMac').value.trim();

    const brand = document.getElementById('addHandsetBrand').value;

    const model = document.getElementById('addHandsetModel').value.trim();

    const ext = document.getElementById('addHandsetExt').value;

    const label = document.getElementById('addHandsetLabel').value.trim();



    const res = await fetchJson('/api/admin/handsets', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ macAddress: mac, brand, model, extension: ext, lineLabel: label })

    });



    if (res && res.ok) {

      window.showToast(`Handset ${mac.toUpperCase()} registered successfully!`, 'success');

      closeModal('modalAddHandset');

      loadHandsets();

    } else if (res) {

      window.showToast(`Error: ${res.error || 'Failed to register handset'}`, 'error');

    }

  });



  // --------------------------------------------------------------------------

  // 7. TAB 4: Routers & Network Gateways (14 Platforms Supported)

  // --------------------------------------------------------------------------

  let cachedRouters = [];



  function renderRoutersTable(list) {

    const tbody = document.getElementById('routerTableBody');

    if (!tbody) return;

    if (!list.length) {

      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No router profiles generated yet. Click "+ New Router Profile" to create a VoIP-optimized setup.</td></tr>';

      return;

    }



    const canManage = hasPerm('manage_routers');

    tbody.innerHTML = list.map(r => {

      const isCustom = r.custom_script && r.custom_script.trim().length > 0;

      return `

        <tr>

          <td>

            <strong>${r.site_name}</strong>

            ${isCustom ? '<span class="tag badge-primary" style="margin-left:6px;font-size:10px;">Custom Script</span>' : ''}

            ${r.last_fetched_at ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">Booted: ${new Date(r.last_fetched_at).toLocaleDateString()} ${r.last_ip ? `(${r.last_ip})` : ''}</div>` : ''}

          </td>

          <td><strong>${r.brand.toUpperCase()}</strong> ${r.model || ''}</td>

          <td>VLAN ${r.voice_vlan_id}</td>

          <td><code>${r.voice_subnet}</code></td>

          <td><span class="badge ${r.disable_sip_alg ? 'badge-primary' : 'badge-secondary'}">${r.disable_sip_alg ? 'Disabled' : 'Active'}</span></td>

          <td><span class="badge ${r.enable_qos ? 'badge-primary' : 'badge-secondary'}">${r.enable_qos ? 'DSCP 46 / EF' : 'Off'}</span></td>

          <td>

            <div style="display: flex; gap: 4px; flex-wrap: wrap;">

              <button class="btn btn-sm btn-outline" onclick="window.viewDeviceLogs('${r.site_name.replace(/'/g, "\\'")}', 'router', { site: '${r.site_name.replace(/'/g, "\\'")}', brand: '${r.brand}', id: ${r.id} })" title="Live Telemetry & Logs">Logs</button>

              <button class="btn btn-sm btn-primary" onclick="editRouterScript(${r.id})">Edit Script</button>

              <button class="btn btn-sm btn-secondary" onclick="downloadRouterScript(${r.id}, '${r.site_name.replace(/'/g, "\\'")}', '${r.brand}')">Download</button>

              <button class="btn btn-sm btn-secondary" onclick="copyRouterUrl(${r.id})">Boot URL</button>

              ${canManage ? `<button class="btn btn-sm btn-danger" onclick="deleteRouter(${r.id})">Delete</button>` : ''}

            </div>

          </td>

        </tr>

      `;

    }).join('');

  }



  // Instant Live Search for Routers

  document.getElementById('searchRouter')?.addEventListener('input', (e) => {

    const query = e.target.value.toLowerCase().trim();

    if (!query) {

      renderRoutersTable(cachedRouters);

      return;

    }

    const filtered = cachedRouters.filter(r =>

      (r.site_name && r.site_name.toLowerCase().includes(query)) ||

      (r.brand && r.brand.toLowerCase().includes(query)) ||

      (r.model && r.model.toLowerCase().includes(query)) ||

      (r.voice_subnet && r.voice_subnet.toLowerCase().includes(query)) ||

      (r.voice_vlan_id && String(r.voice_vlan_id).includes(query))

    );

    renderRoutersTable(filtered);

  });



  async function loadRouters() {

    const data = await fetchJson('/api/admin/routers');

    const tbody = document.getElementById('routerTableBody');

    const countEl = document.getElementById('routerCountPill');

    const total = (data && data.routers) ? data.routers.length : 0;

    if (countEl) countEl.textContent = total;



    if (!data || !data.ok || !data.routers.length) {

      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">No router profiles generated yet. Click "+ New Router Profile" to create a VoIP-optimized setup.</td></tr>';

      cachedRouters = [];

      return;

    }



    cachedRouters = data.routers;

    const searchVal = document.getElementById('searchRouter')?.value.toLowerCase().trim();

    if (searchVal) {

      document.getElementById('searchRouter').dispatchEvent(new Event('input'));

    } else {

      renderRoutersTable(cachedRouters);

    }

  }



  // Router Script Editor Modal Handlers

  let activeRouterId = 0;

  let activeRouterDefaultScript = '';

  let activeRouterFilename = '';



  window.editRouterScript = async (id) => {

    activeRouterId = id;

    const res = await fetchJson(`/api/admin/routers/${id}/preview`);

    if (!res || !res.ok) {

      window.showToast(res?.error || 'Failed to load router configuration script.', 'error');

      return;

    }



    document.getElementById('editRouterTitle').textContent = `Edit VoIP Script — ${res.siteName} (${res.brand.toUpperCase()} ${res.model || ''})`;

    document.getElementById('editRouterSub').textContent = `Target Platform: ${res.brand.toUpperCase()} | File: ${res.filename}`;

    document.getElementById('editRouterFileTag').textContent = res.filename;



    const bootUrl = `${window.location.origin}/provision/router/${id}.rsc`;

    document.getElementById('btnTestFetchRouter').href = bootUrl;



    const badge = document.getElementById('editRouterStatusBadge');

    if (res.isCustomized) {

      badge.textContent = 'Customized Script Active';

      badge.className = 'badge badge-primary';

    } else {

      badge.textContent = 'Platform Standard Default';

      badge.className = 'badge badge-secondary';

    }



    activeRouterDefaultScript = res.defaultContent;

    activeRouterFilename = res.filename;

    document.getElementById('routerScriptEditor').value = res.content;

    openModal('modalEditRouterScript');

  };



  document.getElementById('btnResetRouterDefault')?.addEventListener('click', () => {

    if (confirm('Reset this router configuration script to the platform default template?')) {

      document.getElementById('routerScriptEditor').value = activeRouterDefaultScript;

      const badge = document.getElementById('editRouterStatusBadge');

      badge.textContent = 'Platform Standard Default';

      badge.className = 'badge badge-secondary';

    }

  });



  document.getElementById('btnCopyRouterScript')?.addEventListener('click', () => {

    const val = document.getElementById('routerScriptEditor').value;

    navigator.clipboard.writeText(val);

    window.showToast('Router script copied to clipboard!', 'success');

  });



  document.getElementById('btnDownloadRouterScriptModal')?.addEventListener('click', () => {

    const val = document.getElementById('routerScriptEditor').value;

    const blob = new Blob([val], { type: 'text/plain' });

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = activeRouterFilename || `router-config-${activeRouterId}.txt`;

    document.body.appendChild(a);

    a.click();

    a.remove();

    window.URL.revokeObjectURL(url);

  });



  document.getElementById('btnSaveRouterScript')?.addEventListener('click', async () => {

    const content = document.getElementById('routerScriptEditor').value;

    const btn = document.getElementById('btnSaveRouterScript');

    btn.disabled = true;

    btn.textContent = 'Saving...';



    const toSave = content.trim() === activeRouterDefaultScript.trim() ? '' : content;



    const res = await fetchJson(`/api/admin/routers/${activeRouterId}/script`, {

      method: 'PUT',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ customScript: toSave })

    });



    btn.disabled = false;

    btn.textContent = 'Save Custom Script';



    if (res && res.ok) {

      window.showToast('Router deployment script saved successfully!', 'success');

      closeModal('modalEditRouterScript');

      loadRouters();

    } else if (res) {

      window.showToast(res.error || 'Failed to save router script.', 'error');

    }

  });



  window.downloadRouterScript = async (id, siteName, brand) => {

    const token = getAuthToken();

    try {

      const res = await fetch(`/api/admin/routers/${id}/script?token=${encodeURIComponent(token)}`, {

        headers: { 'Authorization': `Bearer ${token}` }

      });

      if (!res.ok) throw new Error('Failed to download script');

      const blob = await res.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url;

      const b = (brand || '').toLowerCase();

      const ext = (b.includes('ubiquiti') || b.includes('linux')) ? 'sh' : (b.includes('cisco') || b.includes('switch')) ? 'cfg' : (b.includes('fortinet')) ? 'conf' : (b.includes('pfsense') || b.includes('opnsense') || b.includes('meraki') || b.includes('draytek') || b.includes('sonicwall') || b.includes('sophos') || b.includes('omada')) ? 'txt' : 'rsc';

      a.download = `${siteName.replace(/[^a-zA-Z0-9_-]/g, '_')}_voip.${ext}`;

      document.body.appendChild(a);

      a.click();

      a.remove();

      window.URL.revokeObjectURL(url);

    } catch (e) {

      window.showToast('Failed to download router script. Ensure you are authenticated.', 'error');

    }

  };



  window.copyRouterUrl = (id) => {

    const url = `${window.location.origin}/provision/router/${id}.rsc`;

    window.copyText(url, 'Copied Router Bootstrap Provisioning URL to clipboard!');

  };



  window.deleteRouter = async (id) => {

    if (!confirm('Are you sure you want to remove this router profile?')) return;

    const res = await fetchJson(`/api/admin/routers/${id}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast('Router profile removed successfully.', 'success');

      loadRouters();

    }

  };



  document.getElementById('btnOpenAddRouterModal')?.addEventListener('click', () => {

    document.getElementById('formAddRouter')?.reset();

    updateRouterModelsDropdown();

    openModal('modalAddRouter');

  });



  document.getElementById('formAddRouter')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const site = document.getElementById('addRouterSite').value.trim();

    const brand = document.getElementById('addRouterBrand').value;

    const model = document.getElementById('addRouterModel').value.trim();

    const vlan = parseInt(document.getElementById('addRouterVlan').value || '20', 10);

    const subnet = document.getElementById('addRouterSubnet').value.trim() || '10.20.0.1/24';

    const alg = document.getElementById('addRouterAlg').checked;

    const qos = document.getElementById('addRouterQos').checked;



    const res = await fetchJson('/api/admin/routers', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        siteName: site,

        brand,

        model,

        voiceVlanId: vlan,

        voiceSubnet: subnet,

        disableSipAlg: alg,

        enableQos: qos

      })

    });



    if (res && res.ok) {

      window.showToast('Router profile generated successfully!', 'success');

      closeModal('modalAddRouter');

      loadRouters();

    } else if (res) {

      window.showToast(res.error || 'Failed to generate router profile', 'error');

    }

  });



  // --------------------------------------------------------------------------

  // 8. TAB 5: Branding & Customization

  // --------------------------------------------------------------------------

  async function loadBranding() {

    const data = await fetchJson('/api/admin/branding');

    if (!data || !data.ok) return;



    const b = data.branding;

    document.getElementById('brandName').value = b.brandName || 'MerlinSIP';

    document.getElementById('primaryColorPicker').value = b.primaryColor || '#2563eb';

    document.getElementById('primaryColorText').value = (b.primaryColor || '#2563EB').toUpperCase();

    document.getElementById('accentColorPicker').value = b.accentColor || '#38bdf8';

    document.getElementById('accentColorText').value = (b.accentColor || '#38BDF8').toUpperCase();

    document.getElementById('logoUrl').value = b.logoUrl || '';



    updateLivePreview(b.brandName, b.primaryColor, b.accentColor, b.logoUrl);

  }



  function updateLivePreview(name, primary, accent, logo) {

    if (name) document.getElementById('previewBrandTitle').textContent = name;

    if (primary) {

      document.getElementById('previewLogoBox').style.backgroundColor = primary;

      document.getElementById('previewCallBtn').style.backgroundColor = primary;

    }

    if (accent) {

      document.getElementById('previewAccentBadge').style.backgroundColor = accent;

    }

    const img = document.getElementById('previewLogoImg');

    const fallback = document.getElementById('previewLogoFallback');

    if (logo) {

      img.src = logo;

      img.style.display = 'block';

      fallback.style.display = 'none';

    } else {

      img.style.display = 'none';

      fallback.style.display = 'block';

    }

  }



  // Color picker sync listeners

  document.getElementById('primaryColorPicker')?.addEventListener('input', (e) => {

    document.getElementById('primaryColorText').value = e.target.value.toUpperCase();

    updateLivePreview(null, e.target.value, null, null);

  });

  document.getElementById('primaryColorText')?.addEventListener('input', (e) => {

    document.getElementById('primaryColorPicker').value = e.target.value;

    updateLivePreview(null, e.target.value, null, null);

  });

  document.getElementById('accentColorPicker')?.addEventListener('input', (e) => {

    document.getElementById('accentColorText').value = e.target.value.toUpperCase();

    updateLivePreview(null, null, e.target.value, null);

  });

  document.getElementById('accentColorText')?.addEventListener('input', (e) => {

    document.getElementById('accentColorPicker').value = e.target.value;

    updateLivePreview(null, null, e.target.value, null);

  });

  document.getElementById('brandName')?.addEventListener('input', (e) => {

    updateLivePreview(e.target.value, null, null, null);

  });

  document.getElementById('logoUrl')?.addEventListener('input', (e) => {

    updateLivePreview(null, null, null, e.target.value);

  });



  // Logo file upload

  document.getElementById('btnUploadLogo')?.addEventListener('click', () => {

    document.getElementById('logoFileInput')?.click();

  });



  document.getElementById('logoFileInput')?.addEventListener('change', async (e) => {

    const file = e.target.files[0];

    if (!file) return;



    document.getElementById('logoFileName').textContent = file.name;

    const formData = new FormData();

    formData.append('logo', file);



    const token = getAuthToken();

    try {

      const res = await fetch('/api/admin/branding/logo', {

        method: 'POST',

        headers: { 'Authorization': `Bearer ${token}` },

        body: formData

      });

      const data = await res.json();

      if (data && data.ok) {

        document.getElementById('logoUrl').value = data.logoUrl;

        updateLivePreview(null, null, null, data.logoUrl);

        window.showToast('Logo uploaded successfully and applied to softphone preview!', 'success');

      } else {

        window.showToast(`Logo upload failed: ${data.error || 'Server rejected file'}`, 'error');

      }

    } catch (err) {

      window.showToast('Error uploading logo image.', 'error');

    }

  });



  document.getElementById('formBranding')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const payload = {

      brandName: document.getElementById('brandName').value.trim(),

      primaryColor: document.getElementById('primaryColorText').value.trim(),

      accentColor: document.getElementById('accentColorText').value.trim(),

      logoUrl: document.getElementById('logoUrl').value.trim()

    };



    const res = await fetchJson('/api/admin/branding', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    if (res && res.ok) {

      window.showToast('Custom branding and colors saved successfully!', 'success');

      loadBranding();

    } else if (res) {

      window.showToast(`Error saving branding: ${res.error}`, 'error');

    }

  });



  // --------------------------------------------------------------------------

  // 9. TAB 6: PBX & Gateways Config

  // --------------------------------------------------------------------------

  function updateCfgPbxTypeFields() {

    const pbxType = document.getElementById('cfgPbxType')?.value || 'yeastar_api';

    const portInput = document.getElementById('cfgApiPort');

    const rowProtocol = document.getElementById('rowCfgProtocol');

    const lblPort = document.getElementById('lblCfgApiPort');

    const lblUser = document.getElementById('lblCfgApiUser');

    const lblSecret = document.getElementById('lblCfgApiSecret');



    if (pbxType === 'yeastar_api') {

      if (portInput && (!portInput.value || portInput.value === '5038')) portInput.value = '8088';

      if (lblPort) lblPort.textContent = 'API Port';

      if (lblUser) lblUser.textContent = 'API Username *';

      if (lblSecret) lblSecret.textContent = 'API Password / Secret *';

      if (rowProtocol) rowProtocol.style.display = 'flex';

    } else {

      if (portInput && (!portInput.value || portInput.value === '8260')) portInput.value = '5038';

      if (lblPort) lblPort.textContent = 'AMI Port';

      if (lblUser) lblUser.textContent = 'AMI Username *';

      if (lblSecret) lblSecret.textContent = 'AMI Secret *';

      if (rowProtocol) rowProtocol.style.display = 'none';

    }

  }



  document.getElementById('cfgPbxType')?.addEventListener('change', updateCfgPbxTypeFields);



  async function loadConfig() {

    const data = await fetchJson('/api/admin/config');

    if (!data || !data.ok) return;



    const c = data.config;

    cachedPbxConfig = c;



    if (document.getElementById('cfgPbxServer')) document.getElementById('cfgPbxServer').value = c.pbx_server || '';

    if (document.getElementById('cfgPbxPort')) document.getElementById('cfgPbxPort').value = c.pbx_port || 5060;

    if (document.getElementById('cfgPbxTransport')) document.getElementById('cfgPbxTransport').value = c.pbx_transport || 'UDP';

    if (document.getElementById('cfgDataHandlerUrl')) document.getElementById('cfgDataHandlerUrl').value = c.data_handler_url || '';

    if (document.getElementById('cfgApiKey')) document.getElementById('cfgApiKey').value = c.api_key || '';



    // Master PBX Integration & Credentials

    if (document.getElementById('cfgPbxType')) document.getElementById('cfgPbxType').value = c.pbx_type || 'yeastar_api';

    if (document.getElementById('cfgApiHost')) document.getElementById('cfgApiHost').value = c.api_host || c.pbx_server || '';

    if (document.getElementById('cfgApiPort')) document.getElementById('cfgApiPort').value = c.api_port || (c.pbx_type === 'yeastar_api' ? 8088 : 5038);

    if (document.getElementById('cfgApiProtocol')) document.getElementById('cfgApiProtocol').value = c.api_protocol || 'https';

    if (document.getElementById('cfgApiPath')) document.getElementById('cfgApiPath').value = c.api_path || 'api/v2.0.0';

    if (document.getElementById('cfgApiUser')) document.getElementById('cfgApiUser').value = c.api_user || 'perfexapi';

    if (document.getElementById('cfgApiSecret')) document.getElementById('cfgApiSecret').value = c.api_secret || '';

    if (document.getElementById('cfgVerifySsl')) document.getElementById('cfgVerifySsl').checked = !!c.verify_ssl;



    updateCfgPbxTypeFields();

    updateCurlExample(c.data_handler_url, c.api_key);

  }



  function updateCurlExample(url, key) {

    const curlEl = document.getElementById('curlExample');

    if (!curlEl) return;

    const base = url || window.location.origin;

    curlEl.textContent = `curl -X POST "${base}/api/v1/integrations/provision-user" \\

  -H "X-API-Key: ${key || 'YOUR_API_KEY'}" \\

  -H "Content-Type: application/json" \\

  -d '{"extension":"101","displayName":"Alice Walker","queryPbx":true}'`;

  }



  document.getElementById('formConfig')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const payload = {

      pbxServer: document.getElementById('cfgPbxServer').value.trim(),

      pbxPort: parseInt(document.getElementById('cfgPbxPort').value, 10),

      pbxTransport: document.getElementById('cfgPbxTransport').value,

      dataHandlerUrl: document.getElementById('cfgDataHandlerUrl').value.trim(),

      pbxType: document.getElementById('cfgPbxType')?.value || 'yeastar_api',

      apiHost: document.getElementById('cfgApiHost')?.value?.trim() || document.getElementById('cfgPbxServer').value.trim(),

      apiPort: parseInt(document.getElementById('cfgApiPort')?.value || '8088', 10),

      apiProtocol: document.getElementById('cfgApiProtocol')?.value || 'https',

      apiPath: document.getElementById('cfgApiPath')?.value?.trim() || 'api/v2.0.0',

      apiUser: document.getElementById('cfgApiUser')?.value?.trim() || '',

      apiSecret: document.getElementById('cfgApiSecret')?.value || '',

      verifySsl: document.getElementById('cfgVerifySsl')?.checked ? 1 : 0

    };



    const res = await fetchJson('/api/admin/config', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    if (res && res.ok) {

      window.showToast('Global PBX & VoIP configuration saved successfully!', 'success');

      loadConfig();

    } else {

      window.showToast(res?.error || 'Failed to save configuration', 'error');

    }

  });



  // Test PBX Connection from Global Settings

  document.getElementById('btnTestPbxConfig')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnTestPbxConfig');

    const out = document.getElementById('cfgPbxTestOutput');

    if (!out) return;



    btn.disabled = true;

    btn.textContent = '⚡ Testing Connection...';

    out.classList.remove('hidden');

    out.style.background = '#f8fafc';

    out.style.borderColor = '#cbd5e1';

    out.style.color = '#334155';

    out.textContent = 'Connecting to PBX and querying extension status...';



    const payload = {

      pbxType: document.getElementById('cfgPbxType')?.value || 'yeastar_api',

      amiHost: document.getElementById('cfgApiHost')?.value?.trim() || document.getElementById('cfgPbxServer')?.value?.trim() || 'pbx.chriskendall.media',

      amiPort: parseInt(document.getElementById('cfgApiPort')?.value || '8260', 10),

      amiUser: document.getElementById('cfgApiUser')?.value?.trim() || 'perfexapi',

      amiSecret: document.getElementById('cfgApiSecret')?.value || '',

      apiProtocol: document.getElementById('cfgApiProtocol')?.value || 'https',

      apiPath: document.getElementById('cfgApiPath')?.value?.trim() || 'api/v2.0.0',

      verifySsl: document.getElementById('cfgVerifySsl')?.checked ? 1 : 0,

      saveAsDefault: true

    };



    const res = await fetchJson('/api/admin/pbx/sync', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    btn.disabled = false;

    btn.textContent = '⚡ Test PBX Connection';



    if (res && res.ok) {

      out.style.background = '#f0fdf4';

      out.style.borderColor = '#bbf7d0';

      out.style.color = '#15803d';

      out.textContent = `Success: ${res.message}`;

      window.showToast?.(res.message, 'success');

      loadExtensions();

    } else {

      out.style.background = '#fef2f2';

      out.style.borderColor = '#fecaca';

      out.style.color = '#991b1b';

      out.textContent = `Connection Error: ${res?.error || 'Failed to connect to PBX.'}`;

      window.showToast?.(res?.error || 'Connection failed', 'error');

    }

  });



  document.getElementById('btnCopyApiKey')?.addEventListener('click', () => {

    const key = document.getElementById('cfgApiKey').value;

    window.copyText(key, 'API Key copied to clipboard!');

  });



  document.getElementById('btnRegenApiKey')?.addEventListener('click', async () => {

    if (!confirm('Regenerate server API key? Any existing billing/CRM integration using the old key will need to be updated.')) return;

    const res = await fetchJson('/api/admin/config/regenerate-api-key', { method: 'POST' });

    if (res && res.ok) {

      document.getElementById('cfgApiKey').value = res.apiKey;

      updateCurlExample(document.getElementById('cfgDataHandlerUrl').value, res.apiKey);

      window.showToast('New API Key generated successfully!', 'success');

    }

  });



  // --------------------------------------------------------------------------

  // 10. TAB 7: GDPR Compliance & Retention Vault

  // --------------------------------------------------------------------------

  async function loadGdprPolicy() {

    const data = await fetchJson('/api/admin/gdpr/policy');

    if (!data || !data.ok) return;



    const p = data.policy;

    document.getElementById('gdprChatDays').value = p.chat_retention_days;

    document.getElementById('gdprMediaDays').value = p.media_retention_days;

    document.getElementById('gdprAutoPrune').checked = !!p.auto_prune_enabled;

  }



  document.getElementById('formGdprPolicy')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const payload = {

      chatDays: parseInt(document.getElementById('gdprChatDays').value, 10),

      mediaDays: parseInt(document.getElementById('gdprMediaDays').value, 10),

      autoPrune: document.getElementById('gdprAutoPrune').checked

    };



    const res = await fetchJson('/api/admin/gdpr/policy', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    if (res && res.ok) {

      window.showToast('GDPR Retention Policy saved successfully!', 'success');

      loadGdprPolicy();

    }

  });



  document.getElementById('btnExecutePurge')?.addEventListener('click', async () => {

    const ext = document.getElementById('purgeExt').value.trim();

    if (!ext) {

      window.showToast('Please enter an extension number to purge.', 'error');

      return;

    }

    if (!confirm(`CAUTION: Permanently erase all GDPR communications records and files for Extension ${ext}? This action is irreversible.`)) return;



    const res = await fetchJson(`/api/v1/gdpr/user/${ext}`, { method: 'DELETE' });

    const resultBox = document.getElementById('purgeResult');

    if (res && res.ok) {

      resultBox.classList.remove('hidden');

      resultBox.innerHTML = `<strong>Article 17 Erasure Executed!</strong><br>SHA-256 Audit Certificate: <code>${res.certificateHash || 'Generated'}</code>`;

      window.showToast(`Extension ${ext} records purged under GDPR Article 17`, 'success');

      loadOverview();

    } else if (res) {

      window.showToast(`Purge failed: ${res.error || 'Check extension'}`, 'error');

    }

  });



  document.getElementById('btnPurgeVaultTestRecords')?.addEventListener('click', async () => {

    if (!confirm('Are you sure you want to purge all stored messages and vault media files? This will reset all message and file counts to 0.')) return;

    const res = await fetchJson('/api/admin/vault/purge', { method: 'POST' });

    if (res && res.ok) {

      window.showToast('All vault messages and files successfully purged to 0.', 'success');

      loadOverview();

    } else {

      window.showToast(res?.message || 'Purge failed', 'error');

    }

  });



  // --------------------------------------------------------------------------

  // 11. TAB 8: Administrator Users & RBAC Permissions

  // --------------------------------------------------------------------------

  let cachedUsers = [];



  function renderUsersTable(list) {

    const tbody = document.getElementById('userTableBody');

    if (!tbody) return;

    if (!list.length) {

      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No administrator accounts match your search.</td></tr>';

      return;

    }



    tbody.innerHTML = list.map(u => {

      const isSuper = u.role === 'superadmin';

      const perms = isSuper ? ['Full Superadmin Access'] : (u.permissions || []);

      const permPills = perms.map(p => `<span class="tag" style="margin: 2px 2px 2px 0;">${p}</span>`).join('');

      const isSelf = currentUser && currentUser.id === u.id;



      return `

        <tr>

          <td><strong>${u.username}</strong> ${isSelf ? '<span class="badge badge-secondary" style="font-size:10px;">YOU</span>' : ''}</td>

          <td>${u.display_name}</td>

          <td><span class="badge ${isSuper ? 'badge-primary' : 'badge-secondary'}">${u.role.toUpperCase()}</span></td>

          <td style="max-width: 280px;">${permPills}</td>

          <td><span class="badge ${u.is_active ? 'badge-primary' : 'badge-secondary'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>

          <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '<span class="muted">Never logged in</span>'}</td>

          <td>

            <button class="btn btn-sm btn-secondary" onclick="editUser(${u.id})">Edit</button>

            ${!isSelf ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.username}')">Delete</button>` : ''}

          </td>

        </tr>

      `;

    }).join('');

  }



  // Instant Live Search for Admin Users

  document.getElementById('searchUser')?.addEventListener('input', (e) => {

    const query = e.target.value.toLowerCase().trim();

    if (!query) {

      renderUsersTable(cachedUsers);

      return;

    }

    const filtered = cachedUsers.filter(u =>

      (u.username && u.username.toLowerCase().includes(query)) ||

      (u.display_name && u.display_name.toLowerCase().includes(query)) ||

      (u.role && u.role.toLowerCase().includes(query))

    );

    renderUsersTable(filtered);

  });



  async function loadUsers() {

    const data = await fetchJson('/api/admin/users');

    const tbody = document.getElementById('userTableBody');

    if (!data || !data.ok || !data.users.length) {

      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">No admin accounts found.</td></tr>';

      cachedUsers = [];

      return;

    }



    cachedUsers = data.users;

    const searchVal = document.getElementById('searchUser')?.value.toLowerCase().trim();

    if (searchVal) {

      document.getElementById('searchUser').dispatchEvent(new Event('input'));

    } else {

      renderUsersTable(cachedUsers);

    }

  }



  // Role Preset Change Listener (Check/Uncheck Permissions automatically)

  document.getElementById('userRole')?.addEventListener('change', (e) => {

    const role = e.target.value;

    const checks = document.querySelectorAll('.perm-check');

    if (role === 'superadmin') {

      checks.forEach(c => c.checked = true);

    } else if (role === 'technician') {

      checks.forEach(c => {

        c.checked = ['manage_extensions', 'manage_handsets', 'manage_routers'].includes(c.value);

      });

    } else if (role === 'support') {

      checks.forEach(c => c.checked = false);

    }

  });



  // Open Create User Modal

  document.getElementById('btnOpenAddUserModal')?.addEventListener('click', () => {

    document.getElementById('formAddUser')?.reset();

    document.getElementById('editUserId').value = '';

    document.getElementById('modalUserTitle').textContent = '+ Create Administrator Account';

    document.getElementById('userUsername').disabled = false;

    document.getElementById('userPassword').required = true;

    document.getElementById('userPasswordLabel').textContent = 'Password *';

    document.getElementById('userPasswordHelp').textContent = 'Enter a secure password for this user.';

    document.getElementById('activeStatusGroup').style.display = 'none';



    // Trigger role preset defaults

    document.getElementById('userRole').value = 'technician';

    document.getElementById('userRole').dispatchEvent(new Event('change'));



    openModal('modalAddUser');

  });



  // Open Edit User Modal

  window.editUser = (id) => {

    const u = cachedUsers.find(x => x.id === id);

    if (!u) return;



    document.getElementById('editUserId').value = u.id;

    document.getElementById('modalUserTitle').textContent = `Edit Administrator: ${u.username}`;

    document.getElementById('userUsername').value = u.username;

    document.getElementById('userUsername').disabled = true;

    document.getElementById('userDisplayName').value = u.display_name;

    document.getElementById('userPassword').value = '';

    document.getElementById('userPassword').required = false;

    document.getElementById('userPasswordLabel').textContent = 'New Password (Optional)';

    document.getElementById('userPasswordHelp').textContent = 'Leave blank to preserve current password.';

    document.getElementById('userRole').value = u.role;

    document.getElementById('userIsActive').checked = !!u.is_active;

    document.getElementById('activeStatusGroup').style.display = 'block';



    const checks = document.querySelectorAll('.perm-check');

    const userPerms = u.permissions || [];

    checks.forEach(c => {

      c.checked = u.role === 'superadmin' || userPerms.includes('*') || userPerms.includes(c.value);

    });



    openModal('modalAddUser');

  };



  // Submit Add / Edit User Form

  document.getElementById('formAddUser')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const editId = document.getElementById('editUserId').value;

    const u = document.getElementById('userUsername').value.trim();

    const dName = document.getElementById('userDisplayName').value.trim();

    const pass = document.getElementById('userPassword').value;

    const role = document.getElementById('userRole').value;

    const isActive = document.getElementById('userIsActive').checked;



    const perms = [];

    document.querySelectorAll('.perm-check:checked').forEach(c => perms.push(c.value));



    const payload = {

      username: u,

      displayName: dName,

      role,

      permissions: role === 'superadmin' ? ['*'] : perms,

      isActive

    };

    if (pass) payload.password = pass;



    const url = editId ? `/api/admin/users/${editId}` : '/api/admin/users';

    const method = editId ? 'PUT' : 'POST';



    const res = await fetchJson(url, {

      method,

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(payload)

    });



    if (res && res.ok) {

      closeModal('modalAddUser');

      window.showToast('Administrator account saved successfully!', 'success');

      loadUsers();

      // If we updated ourselves, refresh current user state

      if (editId && currentUser && currentUser.id === parseInt(editId, 10)) {

        loadMe();

      }

    } else if (res) {

      window.showToast(res.error || 'Failed to save user account', 'error');

    }

  });



  // Delete User

  window.deleteUser = async (id, username) => {

    if (!confirm(`Are you sure you want to delete administrator account [${username}]? This cannot be undone.`)) return;

    const res = await fetchJson(`/api/admin/users/${id}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast(`User ${username} removed successfully.`, 'success');

      loadUsers();

    } else if (res) {

      window.showToast(res.error || 'Delete failed', 'error');

    }

  };



  // Topbar Shortcut: Jump directly to Users & Permissions Tab

  document.getElementById('btnTopbarUser')?.addEventListener('click', () => {

    window.switchTab('settings', 'settings-security');

  });



  // Self-Service Change Password Modal Handlers

  document.getElementById('btnOpenChangePassModal')?.addEventListener('click', () => {

    document.getElementById('formChangePass')?.reset();

    document.getElementById('changePassError')?.classList.add('hidden');

    document.getElementById('changePassSuccess')?.classList.add('hidden');

    openModal('modalChangePass');

  });



  document.getElementById('formChangePass')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const curPass = document.getElementById('curPassword').value;

    const newPass = document.getElementById('newPassword').value;

    const confirmPass = document.getElementById('confirmNewPassword').value;

    const errBox = document.getElementById('changePassError');

    const succBox = document.getElementById('changePassSuccess');

    const btn = document.getElementById('btnSubmitChangePass');



    errBox?.classList.add('hidden');

    succBox?.classList.add('hidden');



    if (newPass !== confirmPass) {

      if (errBox) {

        errBox.textContent = 'New passwords do not match.';

        errBox.classList.remove('hidden');

      }

      return;

    }

    if (newPass.length < 6) {

      if (errBox) {

        errBox.textContent = 'New password must be at least 6 characters.';

        errBox.classList.remove('hidden');

      }

      return;

    }



    btn.disabled = true;

    btn.textContent = 'Updating...';



    const res = await fetchJson('/api/admin/change-password', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ currentPassword: curPass, newPassword: newPass })

    });



    btn.disabled = false;

    btn.textContent = 'Update Password';



    if (res && res.ok) {

      if (succBox) {

        succBox.textContent = 'Password changed successfully!';

        succBox.classList.remove('hidden');

      }

      setTimeout(() => {

        closeModal('modalChangePass');

      }, 1500);

    } else if (res) {

      if (errBox) {

        errBox.textContent = res.error || 'Failed to change password.';

        errBox.classList.remove('hidden');

      }

    }

  });



  // ==============================================================================

  // 12. Real-Time Device Connectivity Shell & Live SSE Telemetry Engine

  // ==============================================================================

  let shellLogs = [];

  let activeShellFilter = 'ALL';

  let isShellPaused = false;

  let shellEventSource = null;

  let activeDeviceModalFilter = '';

  let activeDeviceLogs = [];



  function isDeviceModalOpen() {

    const modal = document.getElementById('modalDeviceTelemetry');

    return modal && !modal.classList.contains('hidden');

  }



  function initShellStream() {

    const token = getAuthToken();

    if (!token || shellEventSource) return;



    try {

      shellEventSource = new EventSource(`/api/admin/shell/stream?token=${encodeURIComponent(token)}`);



      shellEventSource.onmessage = (e) => {

        if (!e.data || e.data.startsWith(':')) return;

        try {

          const event = JSON.parse(e.data);

          appendShellLog(event);

        } catch {}

      };



      shellEventSource.onerror = () => {

        // EventSource will automatically retry connection

      };

    } catch (err) {

      console.warn('Could not initialize SSE shell stream:', err);

    }

  }



  function appendShellLog(event) {

    shellLogs.push(event);

    if (shellLogs.length > 1000) shellLogs.shift();



    if (!isShellPaused) {

      renderShellEvents();

    }



    if (activeDeviceModalFilter && isDeviceModalOpen()) {

      const matchMac = (event.deviceIdentifier || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchMsg = (event.message || '').toLowerCase();

      const matchIp = (event.ipAddress || '').toLowerCase();

      if (matchMac.includes(activeDeviceModalFilter) || matchMsg.includes(activeDeviceModalFilter) || matchIp.includes(activeDeviceModalFilter)) {

        activeDeviceLogs.push(event);

        if (activeDeviceLogs.length > 500) activeDeviceLogs.shift();

        renderDeviceModalEvents();

      }

    }

  }



  function renderShellEvents() {

    const term = document.getElementById('shellTerminal');

    const drawer = document.getElementById('drawerTerminal');

    const searchVal = document.getElementById('shellSearchInput')?.value.toLowerCase().trim() || '';



    const filtered = shellLogs.filter(item => {

      if (activeShellFilter !== 'ALL' && item.category !== activeShellFilter) {

        return false;

      }

      if (searchVal) {

        const text = `${item.timestamp} ${item.category} ${item.level} ${item.deviceIdentifier} ${item.ipAddress} ${item.message}`.toLowerCase();

        if (!text.includes(searchVal)) return false;

      }

      return true;

    });



    const html = filtered.map(item => {

      const d = new Date(item.timestamp);

      const hours = String(d.getHours()).padStart(2, '0');

      const minutes = String(d.getMinutes()).padStart(2, '0');

      const seconds = String(d.getSeconds()).padStart(2, '0');

      const ms = String(d.getMilliseconds()).padStart(3, '0');

      const time = `${hours}:${minutes}:${seconds}.${ms}`;

      const catClass = `shell-cat-${(item.category || 'system').toLowerCase()}`;

      const lvlClass = `shell-lvl-${item.level || 'INFO'}`;

      const devBadge = item.deviceIdentifier ? `<span class="shell-dev">[${item.deviceIdentifier}]</span> ` : '';



      return `

        <div class="shell-entry">

          <span class="shell-time">${time}</span>

          <span class="shell-cat ${catClass}">${item.category}</span>

          <span class="shell-msg ${lvlClass}">${devBadge}${item.message}</span>

          <span class="shell-ip">${item.ipAddress || ''}</span>

        </div>

      `;

    }).join('');



    if (term) {

      term.innerHTML = html || '<div class="shell-entry"><span class="shell-time">--:--:--.---</span><span class="shell-cat shell-cat-system">SYSTEM</span><span class="shell-msg shell-lvl-INFO">No connectivity events match current filter.</span><span class="shell-ip"></span></div>';

      if (document.getElementById('shellAutoScroll')?.checked) {

        term.scrollTop = term.scrollHeight;

      }

    }



    if (drawer) {

      drawer.innerHTML = html || '<div class="shell-entry"><span class="shell-time">--:--:--.---</span><span class="shell-cat shell-cat-system">SYSTEM</span><span class="shell-msg shell-lvl-INFO">Waiting for device events...</span><span class="shell-ip"></span></div>';

      drawer.scrollTop = drawer.scrollHeight;

    }



    // Update stats bar

    const statsEl = document.getElementById('shellStats');

    if (statsEl) {

      statsEl.textContent = `Stream: ${isShellPaused ? 'PAUSED' : 'LIVE'} | Showing ${filtered.length} of ${shellLogs.length} events | Buffer: ${shellLogs.length}/1000`;

    }



    const drawerCount = document.getElementById('drawerEventCounter');

    if (drawerCount) {

      drawerCount.textContent = `${shellLogs.length} events`;

    }

  }



  async function loadShellHistory() {

    initShellStream();

    const data = await fetchJson('/api/admin/shell/history?limit=300');

    if (data && data.ok && data.logs) {

      shellLogs = data.logs;

      renderShellEvents();

    }

  }



  // Filter Buttons

  document.querySelectorAll('.shell-filter-btn').forEach(btn => {

    btn.addEventListener('click', () => {

      document.querySelectorAll('.shell-filter-btn').forEach(b => b.classList.remove('active'));

      btn.classList.add('active');

      activeShellFilter = btn.dataset.filter;

      renderShellEvents();

    });

  });



  // Search grep filter

  document.getElementById('shellSearchInput')?.addEventListener('input', () => {

    renderShellEvents();

  });



  // Pause / Resume

  document.getElementById('btnPauseShell')?.addEventListener('click', () => {

    isShellPaused = !isShellPaused;

    const btn = document.getElementById('btnPauseShell');

    if (isShellPaused) {

      btn.textContent = '▶ Resume';

      btn.className = 'btn btn-sm btn-primary';

    } else {

      btn.textContent = '⏸ Pause';

      btn.className = 'btn btn-sm btn-secondary';

      renderShellEvents();

    }

  });



  // Clear Console

  document.getElementById('btnClearShell')?.addEventListener('click', async () => {

    if (confirm('Clear the in-memory device connectivity log buffer?')) {

      await fetchJson('/api/admin/shell/clear', { method: 'POST' });

      shellLogs = [];

      renderShellEvents();

    }

  });



  // Export .log file

  document.getElementById('btnExportShellLogs')?.addEventListener('click', () => {

    if (!shellLogs.length) {

      window.showToast('No log events to export.', 'info');

      return;

    }

    const lines = shellLogs.map(l => `[${l.timestamp}] [${l.category}] [${l.level}] [${l.ipAddress}] ${l.deviceIdentifier ? `(${l.deviceIdentifier}) ` : ''}${l.message}`);

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain' });

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `ckm-handler-device-connectivity-${Date.now()}.log`;

    document.body.appendChild(a);

    a.click();

    a.remove();

    window.URL.revokeObjectURL(url);

    window.showToast('Device connectivity logs exported successfully.', 'success');

  });



  // Global Drawer Terminal Controls

  const shellDrawer = document.getElementById('shellDrawer');

  document.getElementById('btnToggleShellDrawer')?.addEventListener('click', () => {

    if (!shellDrawer) return;

    initShellStream();

    shellDrawer.classList.toggle('hidden');

    if (!shellDrawer.classList.contains('hidden')) {

      renderShellEvents();

    }

  });



  document.getElementById('btnCloseDrawer')?.addEventListener('click', () => {

    shellDrawer?.classList.add('hidden');

  });



  document.getElementById('btnMinimizeDrawer')?.addEventListener('click', () => {

    if (!shellDrawer) return;

    shellDrawer.classList.toggle('minimized');

    const btn = document.getElementById('btnMinimizeDrawer');

    btn.textContent = shellDrawer.classList.contains('minimized') ? '▲ Expand' : '_ Minimize';

  });



  // --------------------------------------------------------------------------

  // Dedicated Device Telemetry Modal & Service Logs Direct Filtering

  // --------------------------------------------------------------------------

  function renderDeviceModalEvents() {

    const term = document.getElementById('devTelemTerminal');

    if (!term) return;



    const searchVal = document.getElementById('devTelemSearch')?.value.toLowerCase().trim() || '';

    const filtered = activeDeviceLogs.filter(item => {

      if (!searchVal) return true;

      const text = `${item.timestamp} ${item.category} ${item.level} ${item.deviceIdentifier} ${item.ipAddress} ${item.message}`.toLowerCase();

      return text.includes(searchVal);

    });



    if (!filtered.length) {

      term.innerHTML = `

        <div class="shell-entry" style="opacity: 0.75; font-style: italic;">

          <span class="shell-time">--:--:--.---</span>

          <span class="shell-cat shell-cat-system">STREAM</span>

          <span class="shell-lvl-INFO">No events recorded for this device yet. Listening for Option 66 requests, SIP registrations, or admin events...</span>

        </div>

      `;

    } else {

      term.innerHTML = filtered.map(item => {

        const d = new Date(item.timestamp);

        const hours = String(d.getHours()).padStart(2, '0');

        const minutes = String(d.getMinutes()).padStart(2, '0');

        const seconds = String(d.getSeconds()).padStart(2, '0');

        const ms = String(d.getMilliseconds()).padStart(3, '0');

        const time = `${hours}:${minutes}:${seconds}.${ms}`;

        const catClass = `shell-cat-${(item.category || 'system').toLowerCase()}`;

        const lvlClass = `shell-lvl-${item.level || 'INFO'}`;

        const devBadge = item.deviceIdentifier ? `<span class="shell-dev">[${item.deviceIdentifier}]</span> ` : '';



        return `

          <div class="shell-entry">

            <span class="shell-time">${time}</span>

            <span class="shell-cat ${catClass}">${item.category}</span>

            <span class="shell-msg ${lvlClass}">${devBadge}${escapeHtml(item.message)}</span>

            <span class="shell-ip">${item.ipAddress || ''}</span>

          </div>

        `;

      }).join('');

    }



    const autoScroll = document.getElementById('devTelemAutoScroll')?.checked;

    if (autoScroll !== false) {

      term.scrollTop = term.scrollHeight;

    }



    const countElem = document.getElementById('devTelemEventCount');

    if (countElem) {

      countElem.textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'}`;

    }

  }



  window.viewDeviceLogs = async function(identifier, type, extraMeta = {}) {

    initShellStream();

    activeDeviceModalFilter = String(identifier).toLowerCase().replace(/[^a-z0-9]/g, '');



    const title = document.getElementById('devTelemTitle');

    const brandBadge = document.getElementById('devTelemBadgeBrand');

    const idElem = document.getElementById('devTelemIdentifier');

    const metaElem = document.getElementById('devTelemMetaExtra');

    const termHeader = document.getElementById('devTelemTerminalHeader');

    const fetchDirectBtn = document.getElementById('btnDevTelemFetchDirect');



    const brand = (extraMeta.brand || type || 'Device').toUpperCase();

    if (title) title.innerHTML = `<span class="status-pulse" style="background: #22c55e;"></span><span>Live Telemetry: ${escapeHtml(extraMeta.name || extraMeta.mac || identifier)}</span>`;

    if (brandBadge) brandBadge.textContent = brand;

    if (idElem) idElem.textContent = identifier;

    if (metaElem) {

      const parts = [];

      if (extraMeta.ext) parts.push(`Ext ${extraMeta.ext}`);

      if (extraMeta.model) parts.push(extraMeta.model);

      if (extraMeta.ip) parts.push(`IP: ${extraMeta.ip}`);

      if (extraMeta.sip) parts.push(`SIP: ${extraMeta.sip}`);

      if (extraMeta.site) parts.push(`Site: ${extraMeta.site}`);

      metaElem.textContent = parts.length ? `• ${parts.join(' | ')}` : '';

    }

    if (termHeader) termHeader.textContent = `telemetry@ckm-handler: live stream [${identifier}]`;



    if (fetchDirectBtn) {

      if (type === 'handset' || extraMeta.mac) {

        const cleanMac = (extraMeta.mac || identifier).toLowerCase().replace(/[^0-9a-f]/g, '');

        fetchDirectBtn.href = getHandsetProvisionUrl(extraMeta.brand || 'yealink', cleanMac);

        fetchDirectBtn.style.display = 'inline-block';

        fetchDirectBtn.textContent = 'Fetch Config (Option 66)';

      } else if (type === 'router' || extraMeta.id) {

        fetchDirectBtn.href = `/provision/router/${extraMeta.id || identifier}`;

        fetchDirectBtn.style.display = 'inline-block';

        fetchDirectBtn.textContent = 'Test Router Boot Script';

      } else {

        fetchDirectBtn.style.display = 'none';

      }

    }



    activeDeviceLogs = shellLogs.filter(item => {

      const matchMac = (item.deviceIdentifier || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchMsg = (item.message || '').toLowerCase();

      const matchIp = (item.ipAddress || '').toLowerCase();

      return matchMac.includes(activeDeviceModalFilter) || matchMsg.includes(activeDeviceModalFilter) || matchIp.includes(activeDeviceModalFilter);

    });



    renderDeviceModalEvents();

    openModal('modalDeviceTelemetry');



    try {

      const data = await fetchJson(`/api/admin/telemetry/device/${encodeURIComponent(identifier)}?limit=100`);

      if (data && data.logs && Array.isArray(data.logs)) {

        const existingIds = new Set(activeDeviceLogs.map(l => l.id));

        for (const log of data.logs) {

          if (!existingIds.has(log.id)) {

            activeDeviceLogs.push(log);

          }

        }

        activeDeviceLogs.sort((a, b) => (a.id || 0) - (b.id || 0));

        renderDeviceModalEvents();

      }

    } catch (err) {

      console.warn('Could not fetch server-side device telemetry history:', err);

    }

  };



  window.clearDeviceModalLogs = function() {

    activeDeviceLogs = [];

    renderDeviceModalEvents();

  };



  window.copyDeviceLogs = function() {

    if (!activeDeviceLogs.length) {

      window.showToast('No device logs to copy.', 'info');

      return;

    }

    const lines = activeDeviceLogs.map(l => `[${l.timestamp}] [${l.category}] [${l.level}] [${l.ipAddress}] ${l.deviceIdentifier ? `(${l.deviceIdentifier}) ` : ''}${l.message}`);

    navigator.clipboard.writeText(lines.join('\r\n')).then(() => {

      window.showToast('Device telemetry copied to clipboard.', 'success');

    }).catch(() => {

      window.showToast('Failed to copy to clipboard.', 'error');

    });

  };



  window.viewServiceLogs = function(serviceId) {

    const catMap = {

      'api': 'SYSTEM',

      'socket': 'SOCKET',

      'system_db': 'SYSTEM',

      'vault_db': 'SYSTEM',

      'softphone_prov': 'SOFTPHONE',

      'deskphone_prov': 'DESKPHONE',

      'router_engine': 'ROUTER',

      'firmware_repo': 'FIRMWARE',

      'pbx_sip': 'PBX',

      'gdpr_daemon': 'SYSTEM'

    };

    const category = catMap[serviceId] || 'ALL';

    initShellStream();

    window.switchTab('shell');

    const filterBtn = document.querySelector(`.shell-filter-btn[data-filter="${category}"]`);

    if (filterBtn) {

      filterBtn.click();

    }

  };



  document.getElementById('devTelemSearch')?.addEventListener('input', () => {

    renderDeviceModalEvents();

  });



  // --------------------------------------------------------------------------

  // 13. Initial Application Boot & Telemetry Loop

  // --------------------------------------------------------------------------

  async function loadMe() {

    const data = await fetchJson('/api/admin/me');

    if (data && data.ok && data.user) {

      currentUser = data.user;

      sessionStorage.setItem('ckm_admin_user', JSON.stringify(data.user));

      applyUserPermissions();

    }

  }



  // Initialize segmented subviews (Fleet vs Explorer)

  initSubviews();

    initSettingsSubnav();



  const initialToken = getAuthToken();

  if (!initialToken) {

    showLogin();

  } else {

    hideLogin();

    currentUser = getStoredUser();

    applyUserPermissions();

    loadMe();

    loadCatalogs();

    initShellStream();

    loadOverview();

  }



// Periodic telemetry managed via initTelemetryLoop()



  // ==============================================================================

  // 14. Command Palette (Ctrl+K) & Instant Global Search

  // ==============================================================================

  const modalPalette = document.getElementById('modalCommandPalette');

  const paletteInput = document.getElementById('paletteSearchInput');

  const paletteResults = document.getElementById('paletteResults');

  let activePaletteIndex = 0;

  let paletteItemsList = [];



  function openCommandPalette() {

    if (!modalPalette) return;

    openModal('modalCommandPalette');

    if (paletteInput) {

      paletteInput.value = '';

      paletteInput.focus();

    }

    renderPaletteResults('');

  }



  function closeCommandPalette() {

    closeModal('modalCommandPalette');

  }



  document.getElementById('btnOpenCommandPalette')?.addEventListener('click', openCommandPalette);

  document.getElementById('btnClosePalette')?.addEventListener('click', closeCommandPalette);



  // Global Ctrl+K / Cmd+K listener

  window.addEventListener('keydown', (e) => {

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {

      e.preventDefault();

      if (modalPalette && !modalPalette.classList.contains('hidden')) {

        closeCommandPalette();

      } else {

        openCommandPalette();

      }

    } else if (e.key === 'Escape' && modalPalette && !modalPalette.classList.contains('hidden')) {

      closeCommandPalette();

    }

  });



  function renderPaletteResults(query) {

    if (!paletteResults) return;

    const q = (query || '').toLowerCase().trim();



    const staticCommands = [

      { type: 'nav', id: 'overview', title: 'System Overview & Telemetry', tag: 'Navigation', icon: '📊' },

      { type: 'nav', id: 'extensions', title: 'SIP Extensions & Softphone PINs', tag: 'Navigation', icon: '📱' },

      { type: 'nav', id: 'handsets', title: 'Physical Deskphone Fleet & Profiles', tag: 'Navigation', icon: '☎️' },

      { type: 'nav', id: 'routers', title: 'Network Gateways & Firewall Scripts', tag: 'Navigation', icon: '🌐' },

      { type: 'nav', id: 'shell', title: 'Live Device Connectivity Stream', tag: 'Navigation', icon: '💻' },

      { type: 'nav', id: 'users', title: 'Administrator Accounts & RBAC', tag: 'Navigation', icon: '👥' },

      { type: 'nav', id: 'branding', title: 'Whitelabel Branding & Assets', tag: 'Navigation', icon: '🎨' },

      { type: 'nav', id: 'config', title: 'PBX Core & Integration Settings', tag: 'Navigation', icon: '⚙️' },

      { type: 'nav', id: 'gdpr', title: 'GDPR Compliance & Storage Vault', tag: 'Navigation', icon: '🔒' },

      { type: 'action', action: 'addExt', title: 'Create New SIP Extension', tag: 'Action', icon: '➕' },

      { type: 'action', action: 'addHandset', title: 'Register Physical Deskphone MAC', tag: 'Action', icon: '➕' },

      { type: 'action', action: 'addRouter', title: 'Create New Router Profile', tag: 'Action', icon: '➕' },

      { type: 'action', action: 'syncPbx', title: 'Synchronize All PBX Accounts', tag: 'Action', icon: '🔄' },

      { type: 'action', action: 'clearShell', title: 'Clear Device Log Buffer', tag: 'Action', icon: '🗑️' },

      { type: 'action', action: 'exportLogs', title: 'Export Device Connectivity Logs', tag: 'Action', icon: '📥' }

    ];



    // Filter static commands

    let filtered = staticCommands.filter(c => c.title.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q));



    // Append dynamic extension records

    if (cachedExtensions && cachedExtensions.length) {

      const extMatches = cachedExtensions

        .filter(e => String(e.extension).includes(q) || (e.display_name && e.display_name.toLowerCase().includes(q)))

        .slice(0, 5)

        .map(e => ({

          type: 'record',

          recordType: 'extension',

          id: e.extension,

          title: `Ext ${e.extension} — ${e.display_name || 'Extension'}`,

          tag: 'Extension',

          icon: '📱'

        }));

      filtered = filtered.concat(extMatches);

    }



    // Append dynamic handset records

    if (cachedHandsets && cachedHandsets.length) {

      const handsetMatches = cachedHandsets

        .filter(h => (h.mac_address && h.mac_address.toLowerCase().includes(q)) || (h.brand && h.brand.toLowerCase().includes(q)))

        .slice(0, 5)

        .map(h => ({

          type: 'record',

          recordType: 'handset',

          id: h.mac_address,

          title: `${h.mac_address} (${(h.brand || '').toUpperCase()} ${h.model || ''})`,

          tag: 'Handset',

          icon: '☎️'

        }));

      filtered = filtered.concat(handsetMatches);

    }



    // Append dynamic router records

    if (cachedRouters && cachedRouters.length) {

      const routerMatches = cachedRouters

        .filter(r => (r.site_name && r.site_name.toLowerCase().includes(q)) || (r.brand && r.brand.toLowerCase().includes(q)))

        .slice(0, 5)

        .map(r => ({

          type: 'record',

          recordType: 'router',

          id: r.id,

          title: `${r.site_name} (${(r.brand || '').toUpperCase()} ${r.model || ''})`,

          tag: 'Router',

          icon: '🌐'

        }));

      filtered = filtered.concat(routerMatches);

    }



    paletteItemsList = filtered;

    activePaletteIndex = 0;



    if (!filtered.length) {

      paletteResults.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No commands or records match your search.</div>';

      return;

    }



    paletteResults.innerHTML = filtered.map((item, idx) => `

      <div class="palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}">

        <div class="palette-item-left">

          <span class="palette-item-icon">${item.icon}</span>

          <span>${item.title}</span>

        </div>

        <span class="palette-item-tag">${item.tag}</span>

      </div>

    `).join('');



    paletteResults.querySelectorAll('.palette-item').forEach(el => {

      el.addEventListener('click', () => {

        executePaletteItem(parseInt(el.dataset.idx, 10));

      });

    });

  }



  function executePaletteItem(index) {

    const item = paletteItemsList[index];

    if (!item) return;

    closeCommandPalette();



    if (item.type === 'nav') {

      const btn = document.querySelector(`.nav-btn[data-tab="${item.id}"]`);

      btn?.click();

    } else if (item.type === 'action') {

      if (item.action === 'addExt') document.getElementById('btnOpenAddExtModal')?.click();

      else if (item.action === 'addHandset') document.getElementById('btnOpenAddHandsetModal')?.click();

      else if (item.action === 'addRouter') document.getElementById('btnOpenAddRouterModal')?.click();

      else if (item.action === 'syncPbx') document.getElementById('btnSyncPbx')?.click();

      else if (item.action === 'clearShell') document.getElementById('btnClearShell')?.click();

      else if (item.action === 'exportLogs') document.getElementById('btnExportShellLogs')?.click();

    } else if (item.type === 'record') {

      if (item.recordType === 'extension') {

        document.querySelector('.nav-btn[data-tab="extensions"]')?.click();

        const search = document.getElementById('searchExt');

        if (search) {

          search.value = item.id;

          search.dispatchEvent(new Event('input'));

        }

      } else if (item.recordType === 'handset') {

        document.querySelector('.nav-btn[data-tab="handsets"]')?.click();

        const search = document.getElementById('searchHandset');

        if (search) {

          search.value = item.id;

          search.dispatchEvent(new Event('input'));

        }

      } else if (item.recordType === 'router') {

        document.querySelector('.nav-btn[data-tab="routers"]')?.click();

        const search = document.getElementById('searchRouter');

        if (search) {

          search.value = item.id;

          search.dispatchEvent(new Event('input'));

        }

      }

    }

  }



  paletteInput?.addEventListener('input', (e) => {

    renderPaletteResults(e.target.value);

  });



  paletteInput?.addEventListener('keydown', (e) => {

    if (e.key === 'ArrowDown') {

      e.preventDefault();

      if (paletteItemsList.length > 0) {

        activePaletteIndex = (activePaletteIndex + 1) % paletteItemsList.length;

        updatePaletteActiveState();

      }

    } else if (e.key === 'ArrowUp') {

      e.preventDefault();

      if (paletteItemsList.length > 0) {

        activePaletteIndex = (activePaletteIndex - 1 + paletteItemsList.length) % paletteItemsList.length;

        updatePaletteActiveState();

      }

    } else if (e.key === 'Enter') {

      e.preventDefault();

      executePaletteItem(activePaletteIndex);

    }

  });



  function updatePaletteActiveState() {

    paletteResults?.querySelectorAll('.palette-item').forEach((el, idx) => {

      el.classList.toggle('active', idx === activePaletteIndex);

      if (idx === activePaletteIndex) {

        el.scrollIntoView({ block: 'nearest' });

      }

    });

  }



  // ==============================================================================

  // 15. CSV Export Engine for Extensions, Handsets, Routers, and Audit Logs

  // ==============================================================================

  function exportToCsv(filename, headers, rows) {

    if (!rows || !rows.length) {

      window.showToast('No records available to export.', 'info');

      return;

    }



    const escapeCsv = (val) => {

      if (val === null || val === undefined) return '""';

      const str = String(val).replace(/"/g, '""');

      return `"${str}"`;

    };



    const csvContent = [

      headers.map(escapeCsv).join(','),

      ...rows.map(row => row.map(escapeCsv).join(','))

    ].join('\r\n');



    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.setAttribute('href', url);

    link.setAttribute('download', filename);

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    window.showToast(`Successfully exported ${rows.length} records to ${filename}`, 'success');

  }



  // Extensions CSV Export

  document.getElementById('btnExportExtCsv')?.addEventListener('click', () => {

    if (!cachedExtensions || !cachedExtensions.length) {

      window.showToast('No extensions available to export.', 'info');

      return;

    }

    const headers = ['Extension', 'Display Name', 'SIP Username', 'Assigned PIN', 'Bound Handsets', 'Status', 'Created At'];

    const rows = cachedExtensions.map(e => [

      e.extension,

      e.display_name || '',

      e.sip_username || '',

      e.assigned_pin || '',

      e.bound_handsets_count || 0,

      e.is_active ? 'Active' : 'Deactivated',

      e.created_at || ''

    ]);

    exportToCsv(`ckm-extensions-${Date.now()}.csv`, headers, rows);

  });



  // Handsets CSV Export

  document.getElementById('btnExportHandsetCsv')?.addEventListener('click', () => {

    if (!cachedHandsets || !cachedHandsets.length) {

      window.showToast('No physical handsets registered to export.', 'info');

      return;

    }

    const headers = ['MAC Address', 'Brand', 'Model', 'Assigned Extension', 'Line Label', 'Last Provisioned', 'Created At'];

    const rows = cachedHandsets.map(h => [

      h.mac_address,

      (h.brand || '').toUpperCase(),

      h.model || '',

      h.extension || '',

      h.line_label || '',

      h.last_provisioned_at || 'Never',

      h.created_at || ''

    ]);

    exportToCsv(`ckm-handsets-${Date.now()}.csv`, headers, rows);

  });



  // Routers CSV Export

  document.getElementById('btnExportRouterCsv')?.addEventListener('click', () => {

    if (!cachedRouters || !cachedRouters.length) {

      window.showToast('No router profiles available to export.', 'info');

      return;

    }

    const headers = ['ID', 'Site Name', 'Platform', 'Model', 'Voice VLAN', 'Voice Subnet', 'SIP ALG Disabled', 'QoS Enabled', 'Provision URL'];

    const rows = cachedRouters.map(r => [

      r.id,

      r.site_name,

      (r.brand || '').toUpperCase(),

      r.model || '',

      r.voice_vlan_id || 20,

      r.voice_subnet || '10.20.0.1/24',

      r.disable_sip_alg ? 'Yes' : 'No',

      r.enable_qos ? 'Yes' : 'No',

      `${window.location.origin}/provision/router/${r.id}.rsc`

    ]);

    exportToCsv(`ckm-routers-${Date.now()}.csv`, headers, rows);

  });



  // Audit Logs CSV Export

  document.getElementById('btnExportAuditCsv')?.addEventListener('click', async () => {

    const data = await fetchJson('/api/admin/audit-logs');

    if (!data || !data.ok || !data.logs || !data.logs.length) {

      window.showToast('No audit logs available to export.', 'info');

      return;

    }

    const headers = ['ID', 'Action', 'Details', 'IP Address', 'Timestamp'];

    const rows = data.logs.map(l => [

      l.id,

      l.action,

      l.details || '',

      l.ip_address || '',

      l.created_at || ''

    ]);

    exportToCsv(`ckm-audit-log-${Date.now()}.csv`, headers, rows);

  });



  // ==============================================================================

  // 16. Console & Telemetry Preferences Management

  // ==============================================================================

  let telemetryIntervalMs = parseInt(localStorage.getItem('ckm_pref_poll_rate') || '15000', 10);

  let telemetryTimer = null;



  function initTelemetryLoop() {

    if (telemetryTimer) clearInterval(telemetryTimer);

    if (telemetryIntervalMs > 0) {

      telemetryTimer = setInterval(() => {

        if (!getAuthToken()) return;

        const activeBtn = document.querySelector('.nav-btn.active');

        const currentTab = activeBtn?.dataset?.tab;



        if (currentTab === 'overview') {

          loadOverview();

        } else if (currentTab === 'handsets') {

          loadDiscoveredDevices();

        }



        // Always check discovered devices in real-time to update top nav badge

        if (currentTab !== 'handsets') {

          fetchJson('/api/admin/discovered-devices').then(data => {

            if (data && data.devices) {

              const count = data.devices.length;

              const navBadge = document.getElementById('navBadgeDiscovered');

              if (navBadge) {

                navBadge.textContent = `${count} New`;

                if (count > 0) navBadge.classList.remove('hidden');

                else navBadge.classList.add('hidden');

              }

            }

          }).catch(() => {});

        }

      }, telemetryIntervalMs);

    }

  }



  // Open & Close Preferences Modal

  document.getElementById('btnOpenPreferences')?.addEventListener('click', () => {

    const rateSel = document.getElementById('prefPollRate');

    const bufSel = document.getElementById('prefShellBuffer');

    const autoScroll = document.getElementById('prefShellAutoScroll');



    if (rateSel) rateSel.value = String(telemetryIntervalMs);

    if (bufSel) bufSel.value = localStorage.getItem('ckm_pref_shell_buf') || '300';

    if (autoScroll) autoScroll.checked = localStorage.getItem('ckm_pref_auto_scroll') !== 'false';



    openModal('modalPreferences');

  });



  document.getElementById('btnClosePreferences')?.addEventListener('click', () => closeModal('modalPreferences'));

  document.getElementById('btnCancelPreferences')?.addEventListener('click', () => closeModal('modalPreferences'));



  document.getElementById('formPreferences')?.addEventListener('submit', (e) => {

    e.preventDefault();

    const rateVal = parseInt(document.getElementById('prefPollRate')?.value || '15000', 10);

    const bufVal = document.getElementById('prefShellBuffer')?.value || '300';

    const autoScroll = document.getElementById('prefShellAutoScroll')?.checked;



    telemetryIntervalMs = rateVal;

    localStorage.setItem('ckm_pref_poll_rate', String(rateVal));

    localStorage.setItem('ckm_pref_shell_buf', bufVal);

    localStorage.setItem('ckm_pref_auto_scroll', String(autoScroll));



    initTelemetryLoop();

    closeModal('modalPreferences');

    window.showToast('Preferences updated and applied successfully.', 'success');

  });



  // Start telemetry loop with user preference

  initTelemetryLoop();



  // ==========================================================================

  // Omada / GenieACS Zero-Touch Device Discovery & Adoption Engine

  // ==========================================================================

  let cachedDiscoveredDevices = [];



  async function loadDiscoveredDevices() {

    const data = await fetchJson('/api/admin/discovered-devices');

    const banner = document.getElementById('bannerDiscoveredDevices');

    const bannerCount = document.getElementById('discoveredCountBanner');

    const navBadge = document.getElementById('navBadgeDiscovered');

    const pendingSection = document.getElementById('sectionPendingAdoption');

    const pendingBody = document.getElementById('discoveredTableBody');

    const statDiscovered = document.getElementById('statDiscovered');

    const pendingBadge = document.getElementById('pendingBadgeCount');



    const devices = (data && data.devices) ? data.devices : [];

    cachedDiscoveredDevices = devices;

    const count = devices.length;



    if (bannerCount) bannerCount.textContent = count;

    if (statDiscovered) statDiscovered.textContent = count;

    if (pendingBadge) pendingBadge.textContent = `${count} Device${count === 1 ? '' : 's'}`;



    if (navBadge) {

      navBadge.textContent = `${count} New`;

      if (count > 0) navBadge.classList.remove('hidden');

      else navBadge.classList.add('hidden');

    }



    if (count > 0) {

      if (banner) banner.classList.remove('hidden');

      if (pendingSection) pendingSection.classList.remove('hidden');

    } else {

      if (banner) banner.classList.add('hidden');

      if (pendingSection) pendingSection.classList.add('hidden');

    }



    if (pendingBody) {

      if (count === 0) {

        pendingBody.innerHTML = '<tr><td colspan="6" class="text-center muted">No unadopted devices on network. Plug a deskphone into LAN to discover.</td></tr>';

        return;

      }

      pendingBody.innerHTML = devices.map(d => `

        <tr>

          <td><code style="font-weight: 700;">${d.mac_address}</code></td>

          <td><strong>${(d.brand || 'Yealink').toUpperCase()}</strong> ${d.model || ''}</td>

          <td><span class="font-mono">${d.ip_address}</span></td>

          <td><span class="badge" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">Pending Adoption</span></td>

          <td>${new Date(d.last_seen_at).toLocaleTimeString()}</td>

          <td style="text-align: right;">

            <div style="display: inline-flex; gap: 4px;">

              <button class="btn btn-sm btn-outline" onclick="window.viewDeviceLogs('${d.mac_address}', 'discovered', { mac: '${d.mac_address}', brand: '${d.brand}', ip: '${d.ip_address}' })">Logs</button>

              <button class="btn btn-sm btn-primary" onclick="window.openAdoptModal('${d.mac_address}', '${d.brand}', '${d.model}')">Adopt Device</button>

              <button class="btn btn-sm btn-secondary" onclick="window.ignoreDiscoveredDevice('${d.mac_address}')">Dismiss</button>

            </div>

          </td>

        </tr>

      `).join('');

    }

  }



  window.openAdoptModal = async (mac, brand, model) => {

    document.getElementById('adoptDeviceMac').value = mac;

    document.getElementById('adoptDisplayMac').value = mac;

    document.getElementById('adoptDisplayBrand').value = (brand || 'Yealink').toUpperCase();

    document.getElementById('adoptDisplayModel').value = model || 'T46U';

    document.getElementById('adoptLineLabel').value = '';



    // Populate available extensions

    const sel = document.getElementById('adoptExtensionSelect');

    sel.innerHTML = '<option value="">Loading extensions...</option>';

    const extData = await fetchJson('/api/admin/extensions');

    if (extData && extData.extensions && extData.extensions.length) {

      sel.innerHTML = '<option value="">Select an extension...</option>' + 

        extData.extensions.map(e => `<option value="${e.extension}">Ext ${e.extension} — ${e.display_name} (${e.sip_username})</option>`).join('');

    } else {

      sel.innerHTML = '<option value="">No extensions available</option>';

    }



    openModal('modalAdoptDevice');

  };



  window.ignoreDiscoveredDevice = async (mac) => {

    if (!confirm(`Dismiss device ${mac} from pending adoption?`)) return;

    const res = await fetchJson(`/api/admin/discovered-devices/${mac}`, { method: 'DELETE' });

    if (res && res.ok) {

      window.showToast('Device dismissed.', 'info');

      loadDiscoveredDevices();

    }

  };



  // Handle Adopt Device Form Submission

  document.getElementById('formAdoptDevice')?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const mac = document.getElementById('adoptDeviceMac').value;

    const brand = document.getElementById('adoptDisplayBrand').value;

    const model = document.getElementById('adoptDisplayModel').value;

    const extension = document.getElementById('adoptExtensionSelect').value;

    const lineLabel = document.getElementById('adoptLineLabel').value;



    if (!extension) {

      alert('Please select an extension.');

      return;

    }



    const res = await fetchJson(`/api/admin/discovered-devices/${mac}/adopt`, {

      method: 'POST',

      body: JSON.stringify({ extension, brand, model, lineLabel })

    });



    if (res && res.ok) {

      window.showToast(`Device ${mac} successfully adopted and provisioned!`, 'success');

      closeModal('modalAdoptDevice');

      loadDiscoveredDevices();

      loadHandsets();

      loadOverview();

    } else {

      window.showToast(res?.error || 'Adoption failed.', 'error');

    }

  });



  // Zero-Touch Auto-Adoption Policy Toggle Handler

  document.getElementById('chkAutoAdoptPolicy')?.addEventListener('change', async (e) => {

    const enabled = e.target.checked;

    const res = await fetchJson('/api/admin/auto-adopt/toggle', {

      method: 'POST',

      body: JSON.stringify({ enabled })

    });

    if (res && res.ok) {

      window.showToast(`Zero-Touch Auto-Adoption ${enabled ? 'Enabled' : 'Disabled'}`, 'info');

      const settingsAdopt = document.getElementById('settingsAutoAdoptToggle');

      if (settingsAdopt) settingsAdopt.checked = enabled;

      const badge = document.getElementById('chipAutoAdoptStatus');

      if (badge) badge.textContent = `Auto-Adopt: ${enabled ? 'Active' : 'Disabled'}`;

      const engineBadge = document.getElementById('engineAutoAdoptBadge');

      if (engineBadge) {

        engineBadge.textContent = enabled ? 'Zero-Touch Active' : 'Approval Required';

        engineBadge.className = enabled ? 'badge badge-success' : 'badge';

      }

    }

  });



  document.getElementById('btnToggleAutoAdoptEngine')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnToggleAutoAdoptEngine');

    btn.disabled = true;

    try {

      const currentVal = document.getElementById('settingsAutoAdoptToggle')?.checked ?? document.getElementById('chkAutoAdoptPolicy')?.checked ?? false;

      const nextVal = !currentVal;

      const res = await fetchJson('/api/admin/auto-adopt/toggle', {

        method: 'POST',

        body: JSON.stringify({ enabled: nextVal })

      });

      if (res && res.ok) {

        window.showToast(`Zero-Touch Auto-Adoption ${nextVal ? 'Enabled' : 'Disabled'}`, 'info');

        const chk1 = document.getElementById('chkAutoAdoptPolicy');

        if (chk1) chk1.checked = nextVal;

        const chk2 = document.getElementById('settingsAutoAdoptToggle');

        if (chk2) chk2.checked = nextVal;

        const engineBadge = document.getElementById('engineAutoAdoptBadge');

        if (engineBadge) {

          engineBadge.textContent = nextVal ? 'Zero-Touch Active' : 'Approval Required';

          engineBadge.className = nextVal ? 'badge badge-success' : 'badge';

        }

        const chip = document.getElementById('chipAutoAdoptStatus');

        if (chip) chip.textContent = `Auto-Adopt: ${nextVal ? 'Active' : 'Disabled'}`;

      } else {

        window.showToast(res?.error || 'Failed to toggle Auto-Adopt.', 'error');

      }

    } finally {

      btn.disabled = false;

    }

  });



  // Endpoints modal triggers

  document.getElementById('btnOpenEndpointsModal')?.addEventListener('click', () => {

    openModal('modalEndpoints');

  });



  document.getElementById('btnGoToAdoption')?.addEventListener('click', () => {

    switchTab('handsets');

  });



  document.getElementById('btnTriggerQuickSync')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnTriggerQuickSync');

    btn.textContent = 'Syncing...';

    btn.disabled = true;

    try {

      const res = await fetchJson('/api/admin/pbx/sync', { method: 'POST', body: JSON.stringify({}) });

      if (res && res.ok) {

        window.showToast(`PBX Sync successful: ${res.count ?? 0} extensions synced.`, 'success');

        loadExtensions();

        loadOverview();

      } else {

        window.showToast(res?.error || 'Sync failed.', 'error');

      }

    } finally {

      btn.textContent = 'Force Sync Now';

      btn.disabled = false;

    }

  });

  document.getElementById('btnRunRetentionQuick')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRunRetentionQuick');
    btn.textContent = 'Scrubbing...';
    btn.disabled = true;
    try {
      const res = await fetchJson('/api/admin/retention/run', { method: 'POST', body: JSON.stringify({}) });
      if (res && res.ok) {
        window.showToast(res.message || 'GDPR cryptographic scrub completed successfully.', 'success');
        loadOverview();
      } else {
        window.showToast(res?.error || 'Retention scrub failed.', 'error');
      }
    } catch {
      window.showToast('Error communicating with retention daemon.', 'error');
    } finally {
      btn.textContent = 'Run Scrub Now';
      btn.disabled = false;
    }
  });



  // Direct file uploader for models requiring manual vendor binary files
  window.openFirmwareUploadModal = function(brandId, modelId, brandName, modelName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rom,.bin,.zip,.tar,.img,.ld,.npk,.all,.rbi';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      window.showToast?.(`Uploading ${file.name} for ${brandName} ${modelName}...`, 'info');
      const formData = new FormData();
      formData.append('brand', brandId);
      formData.append('model', modelId);
      formData.append('firmwareFile', file);
      try {
        const token = getAuthToken();
        const res = await fetch('/api/admin/firmware/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (data && data.ok) {
          window.showToast?.(`Firmware ${data.result?.filename || file.name} cached locally for Option 66!`, 'success');
          loadFirmwareRepository();
        } else {
          window.showToast?.(`Upload failed: ${data?.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        window.showToast?.(`Upload error: ${err.message || err}`, 'error');
      }
    };
    input.click();
  };

  // Direct custom URL prompt for vendor binaries hosted on internal/mirror servers
  window.promptCustomFirmwareUrl = async function(brandId, modelId, brandName, modelName) {
    const url = window.prompt(`Enter direct download URL for ${brandName} ${modelName} firmware binary (.rom / .bin):`);
    if (!url || !url.trim()) return;
    window.showToast?.(`Downloading firmware from custom URL...`, 'info');
    try {
      const res = await fetchJson('/api/admin/firmware/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandId, model: modelId, customUrl: url.trim() })
      });
      if (res && res.ok) {
        window.showToast?.(`Firmware successfully downloaded and cached!`, 'success');
        loadFirmwareRepository();
      } else {
        window.showToast?.(`Download failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      window.showToast?.(`Download error: ${err.message || err}`, 'error');
    }
  };

  // Global handler to trigger local download of a firmware binary
  window.autoDownloadFirmware = async function(brand, model) {
    if (!brand || !model) return;
    window.showToast?.(`Caching firmware for ${brand.toUpperCase()} ${model}...`, 'info');
    try {
      const res = await fetchJson('/api/admin/firmware/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, model })
      });
      if (res && res.ok) {
        window.showToast?.(`Successfully cached firmware for ${brand.toUpperCase()} ${model}!`, 'success');
        loadFirmwareRepository();
      } else {
        window.showToast?.(res?.error || 'Failed to download firmware.', 'error');
      }
    } catch (err) {
      window.showToast?.(`Error downloading firmware: ${err.message || err}`, 'error');
    }
  };

  // Load firmware repository table
  async function loadFirmwareRepository() {
    const tbody = document.getElementById('firmwareTableBody');
    if (!tbody) return;

    const data = await fetchJson('/api/admin/firmware/status');
    const catalog = data?.catalog || {};
    
    // Flatten models from each brand across handsets and routers
    const list = [];
    if (Array.isArray(catalog.handsets)) {
      catalog.handsets.forEach(b => {
        const brandName = b.name || b.id || 'Vendor';
        const brandId = b.id || brandName.toLowerCase();
        if (Array.isArray(b.models)) {
          b.models.forEach(m => {
            list.push({
              ...m,
              brandId: brandId,
              brandName: brandName,
              modelName: m.name || m.id,
              version: m.firmwareVersion || 'Latest',
              filename: m.firmwareFilename || '--',
              directDownloadUrl: m.directDownloadUrl || null,
              portalUrl: m.firmwareUrl || null,
              fileSizeFormatted: m.fileSizeFormatted || (m.fileSizeBytes ? (m.fileSizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : '--'),
              isDownloaded: m.isCached || m.status === 'AVAILABLE' || m.status === 'DOWNLOADED'
            });
          });
        }
      });
    }

    if (Array.isArray(catalog.routers)) {
      catalog.routers.forEach(b => {
        const brandName = b.name || b.id || 'Vendor';
        const brandId = b.id || brandName.toLowerCase();
        if (Array.isArray(b.models)) {
          b.models.forEach(m => {
            list.push({
              ...m,
              brandId: brandId,
              brandName: brandName,
              modelName: m.name || m.id,
              version: m.firmwareVersion || 'Latest',
              filename: m.firmwareFilename || '--',
              directDownloadUrl: m.directDownloadUrl || null,
              portalUrl: m.firmwareUrl || null,
              fileSizeFormatted: m.fileSizeFormatted || (m.fileSizeBytes ? (m.fileSizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : '--'),
              isDownloaded: m.isCached || m.status === 'AVAILABLE' || m.status === 'DOWNLOADED'
            });
          });
        }
      });
    }

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">No firmware images cataloged.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(f => {
      const isDownloaded = f.isDownloaded;
      const statusBadge = isDownloaded 
        ? '<span class="badge badge-success">Cached Locally</span>'
        : f.directDownloadUrl
          ? '<span class="badge badge-warning">Vendor Cloud</span>'
          : '<span class="badge" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Vendor Portal</span>';

      return `
        <tr>
          <td><strong>${f.brandName.toUpperCase()}</strong> ${f.modelName}</td>
          <td><code>${f.version}</code></td>
          <td><code class="text-xs">${f.filename}</code></td>
          <td>${statusBadge}</td>
          <td>${f.fileSizeFormatted}</td>
          <td style="text-align: right; white-space: nowrap;">
            ${isDownloaded 
              ? '<span class="text-xs muted" style="color: #10b981; font-weight: 600;">✓ Option 66 Ready</span>' 
              : f.directDownloadUrl 
                ? `<button class="btn btn-xs btn-primary" onclick="autoDownloadFirmware('${f.brandId}', '${f.id}')">⚡ Cache Locally</button>`
                : `<div style="display: inline-flex; gap: 6px;">
                     <button class="btn btn-xs btn-primary" onclick="openFirmwareUploadModal('${f.brandId}', '${f.id}', '${f.brandName}', '${f.modelName}')" title="Upload official binary file (.rom / .bin)">📁 Upload</button>
                     <button class="btn btn-xs btn-secondary" onclick="promptCustomFirmwareUrl('${f.brandId}', '${f.id}', '${f.brandName}', '${f.modelName}')" title="Enter custom direct download URL">🔗 URL</button>
                     ${f.portalUrl ? `<a href="${f.portalUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-secondary" title="Open vendor support portal in new tab" style="text-decoration: none;">↗ Portal</a>` : ''}
                   </div>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('btnSyncAllFwRepository')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnSyncAllFwRepository');

    btn.textContent = 'Downloading...';

    btn.disabled = true;

    try {

      const res = await fetchJson('/api/admin/firmware/sync-all', { method: 'POST' });

      if (res && res.ok) {

        window.showToast('Firmware binaries sync started in background.', 'success');

        loadFirmwareRepository();

      }

    } finally {

      btn.textContent = 'Auto-Cache All Recommended Binaries';

      btn.disabled = false;

    }

  });



  document.getElementById('btnSyncAllFwQuick')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnSyncAllFwQuick');

    btn.textContent = 'Syncing...';

    btn.disabled = true;

    try {

      const res = await fetchJson('/api/admin/firmware/sync-all', { method: 'POST' });

      if (res && res.ok) {

        window.showToast('Firmware binaries sync started in background.', 'success');

        loadFirmwareRepository();

      } else {

        window.showToast(res?.error || 'Failed to trigger firmware sync.', 'error');

      }

    } finally {

      btn.textContent = 'Sync Binaries';

      btn.disabled = false;

    }

  });





  // ==========================================================================

  // FreePBX Style Variable Insertion Engine

  // ==========================================================================

  window.insertVariableIntoEditor = function(tag) {

    const editor = document.getElementById('handsetConfigEditor');

    if (!editor) return;



    const startPos = editor.selectionStart;

    const endPos = editor.selectionEnd;

    const currentVal = editor.value;



    editor.value = currentVal.substring(0, startPos) + tag + currentVal.substring(endPos, currentVal.length);

    editor.selectionStart = startPos + tag.length;

    editor.selectionEnd = startPos + tag.length;

    editor.focus();

    window.showToast(`Inserted ${tag} at cursor`, 'info');

  };



  // ==========================================================================

  // Master Settings Subtab Navigation & Daemon Controller

  // ==========================================================================

  function initSettingsSubnav() {

    const btns = document.querySelectorAll('.settings-nav-btn');

    btns.forEach(btn => {

      btn.addEventListener('click', () => {

        btns.forEach(b => b.classList.remove('active'));

        btn.classList.add('active');



        const target = btn.dataset.subtab;

        document.querySelectorAll('.settings-subpane').forEach(p => p.classList.remove('active'));

        const pane = document.getElementById('subpane-' + target);

        if (pane) pane.classList.add('active');



        if (target === 'settings-pbx') loadConfig();

        else if (target === 'settings-automation') loadAutomationDaemonSettings();

        else if (target === 'settings-branding') loadBranding();

        else if (target === 'settings-security') loadUsers();

        else if (target === 'settings-gdpr') loadGdprPolicy();

      });

    });

  }



  // Load automation daemon settings in settings pane

  async function loadAutomationDaemonSettings() {

    const res = await fetchJson('/api/admin/overview');

    if (!res || !res.ok || !res.stats) return;

    const s = res.stats;



    const chkAdopt = document.getElementById('settingsAutoAdoptToggle');

    if (chkAdopt) chkAdopt.checked = !!s.autoAdoptEnabled;



    const chkSync = document.getElementById('settingsAutoSyncToggle');

    if (chkSync) chkSync.checked = s.autoSync ? !!s.autoSync.enabled : true;



    const selInterval = document.getElementById('settingsSyncInterval');

    if (selInterval && s.autoSync) selInterval.value = String(s.autoSync.intervalMins || 5);

  }



  // Interactive Live Change Listeners for Settings Controls

  document.getElementById('settingsAutoAdoptToggle')?.addEventListener('change', async (e) => {

    const enabled = e.target.checked;

    const res = await fetchJson('/api/admin/auto-adopt/toggle', {

      method: 'POST',

      body: JSON.stringify({ enabled })

    });

    if (res && res.ok) {

      window.showToast(`Zero-Touch Auto-Adoption ${enabled ? 'Enabled' : 'Disabled'}`, 'info');

      const chk = document.getElementById('chkAutoAdoptPolicy');

      if (chk) chk.checked = enabled;

      const engineBadge = document.getElementById('engineAutoAdoptBadge');

      if (engineBadge) {

        engineBadge.textContent = enabled ? 'Zero-Touch Active' : 'Approval Required';

        engineBadge.className = enabled ? 'badge badge-success' : 'badge';

      }

      const chip = document.getElementById('chipAutoAdoptStatus');

      if (chip) chip.textContent = `Auto-Adopt: ${enabled ? 'Active' : 'Disabled'}`;

    }

  });



  document.getElementById('settingsAutoSyncToggle')?.addEventListener('change', async (e) => {

    const enabled = e.target.checked;

    const intervalMins = document.getElementById('settingsSyncInterval')?.value || '5';

    const res = await fetchJson('/api/admin/auto-sync/toggle', {

      method: 'POST',

      body: JSON.stringify({ enabled, intervalMins })

    });

    if (res && res.ok) {

      window.showToast(`PBX Auto-Sync ${enabled ? 'Enabled' : 'Disabled'}`, 'info');

      const engineBadge = document.getElementById('enginePbxSyncBadge');

      if (engineBadge) {

        engineBadge.textContent = enabled ? `Automated (${intervalMins}m)` : 'Manual Only';

        engineBadge.className = enabled ? 'badge badge-success' : 'badge badge-secondary';

      }

    }

  });



  document.getElementById('settingsSyncInterval')?.addEventListener('change', async (e) => {

    const intervalMins = e.target.value;

    const enabled = document.getElementById('settingsAutoSyncToggle')?.checked !== false;

    const res = await fetchJson('/api/admin/auto-sync/toggle', {

      method: 'POST',

      body: JSON.stringify({ enabled, intervalMins })

    });

    if (res && res.ok) {

      window.showToast(`PBX Auto-Sync interval set to ${intervalMins} minutes`, 'info');

      const engineBadge = document.getElementById('enginePbxSyncBadge');

      if (engineBadge && enabled) {

        engineBadge.textContent = `Automated (${intervalMins}m)`;

      }

    }

  });



  // Save Daemon Settings (Form Submission & Button Click Handler)

  async function saveAutomationDaemonSettings(e) {

    if (e && e.preventDefault) e.preventDefault();

    const btn = document.getElementById('btnSaveAutomationSettings');

    if (btn) {

      btn.textContent = 'Saving...';

      btn.disabled = true;

    }

    try {

      const autoAdopt = !!document.getElementById('settingsAutoAdoptToggle')?.checked;

      const autoSync = !!document.getElementById('settingsAutoSyncToggle')?.checked;

      const intervalMins = document.getElementById('settingsSyncInterval')?.value || '5';



      const res = await fetchJson('/api/admin/automation/settings', {

        method: 'POST',

        body: JSON.stringify({

          autoAdoptEnabled: autoAdopt,

          autoSyncEnabled: autoSync,

          autoSyncIntervalMins: intervalMins

        })

      });



      if (!res || !res.ok) {

        window.showToast(res?.error || 'Failed to save autonomous daemon settings.', 'error');

        return;

      }



      window.showToast('Autonomous daemon and background settings saved successfully!', 'success');



      // Synchronize badges & chips across dashboard

      const chkPolicy = document.getElementById('chkAutoAdoptPolicy');

      if (chkPolicy) chkPolicy.checked = autoAdopt;



      const engineAdoptBadge = document.getElementById('engineAutoAdoptBadge');

      if (engineAdoptBadge) {

        engineAdoptBadge.textContent = autoAdopt ? 'Zero-Touch Active' : 'Approval Required';

        engineAdoptBadge.className = autoAdopt ? 'badge badge-success' : 'badge';

      }



      const chipAdopt = document.getElementById('chipAutoAdoptStatus');

      if (chipAdopt) chipAdopt.textContent = `Auto-Adopt: ${autoAdopt ? 'Active' : 'Disabled'}`;



      const engineSyncBadge = document.getElementById('enginePbxSyncBadge');

      if (engineSyncBadge) {

        engineSyncBadge.textContent = autoSync ? `Automated (${intervalMins}m)` : 'Manual Only';

        engineSyncBadge.className = autoSync ? 'badge badge-success' : 'badge badge-secondary';

      }



      const chipSync = document.getElementById('chipAutoSyncStatus');

      if (chipSync) chipSync.textContent = `Auto-Sync: ${autoSync ? `Active (${intervalMins}m)` : 'Disabled'}`;



      loadOverview();

    } catch (err) {

      window.showToast('Failed to save daemon settings: ' + (err.message || 'Network error'), 'error');

    } finally {

      if (btn) {

        btn.textContent = 'Save Daemon Settings';

        btn.disabled = false;

      }

    }

  }



  document.getElementById('formAutomationDaemons')?.addEventListener('submit', saveAutomationDaemonSettings);

  document.getElementById('btnSaveAutomationSettings')?.addEventListener('click', saveAutomationDaemonSettings);



  // Force PBX Sync From Settings Button Handler

  document.getElementById('btnForcePbxSyncFromSettings')?.addEventListener('click', async () => {

    const btn = document.getElementById('btnForcePbxSyncFromSettings');

    btn.textContent = 'Syncing PBX...';

    btn.disabled = true;

    try {

      const res = await fetchJson('/api/admin/pbx/sync', { method: 'POST', body: JSON.stringify({}) });

      if (res && res.ok) {

        window.showToast(`PBX Sync successful: ${res.count ?? 0} extensions synced.`, 'success');

        loadExtensions();

        loadOverview();

      } else {

        window.showToast(res?.error || 'PBX Sync failed. Ensure Asterisk AMI is online.', 'error');

      }

    } catch (err) {

      window.showToast('PBX Sync error: ' + (err.message || 'Network error'), 'error');

    } finally {

      btn.textContent = 'Force PBX Sync Now';

      btn.disabled = false;

    }

  });



}



if (document.readyState === 'loading') {

  document.addEventListener('DOMContentLoaded', initApp);

} else {

  initApp();

}

