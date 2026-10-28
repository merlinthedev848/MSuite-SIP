document.addEventListener('DOMContentLoaded', () => {
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
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';

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

  function getAuthToken() {
    return sessionStorage.getItem('ckm_admin_token') || localStorage.getItem('ckm_admin_token') || '';
  }

  function getStoredUser() {
    try {
      const u = sessionStorage.getItem('ckm_admin_user') || localStorage.getItem('ckm_admin_user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  }

  function setAuthSession(token, user, persist = true) {
    if (token) {
      sessionStorage.setItem('ckm_admin_token', token);
      if (user) sessionStorage.setItem('ckm_admin_user', JSON.stringify(user));
      if (persist) {
        localStorage.setItem('ckm_admin_token', token);
        if (user) localStorage.setItem('ckm_admin_user', JSON.stringify(user));
      }
    } else {
      sessionStorage.removeItem('ckm_admin_token');
      sessionStorage.removeItem('ckm_admin_user');
      localStorage.removeItem('ckm_admin_token');
      localStorage.removeItem('ckm_admin_user');
    }
    currentUser = user || null;
    applyUserPermissions();
  }

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
    } else {
      options.headers['Authorization'] = `Bearer ${token}`;
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
        alert(`Access Denied: ${json.error || 'You do not have permission for this action.'}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      console.error('Fetch error:', e);
      return null;
    }
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
    shell: 'Live Device Connectivity & Telemetry Shell',
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
        shell: 'Operations / Live Device Shell',
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
    else if (tab === 'shell') loadShellHistory();
    else if (tab === 'branding') loadBranding();
    else if (tab === 'config') loadConfig();
    else if (tab === 'gdpr') loadGdprPolicy();
    else if (tab === 'users') loadUsers();
  }

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
    document.getElementById('statExt').textContent = s.extensions;
    document.getElementById('statHandsets').textContent = s.handsets;
    document.getElementById('statPins').textContent = s.unclaimedPins;
    document.getElementById('statMessages').textContent = s.messages;
    document.getElementById('statStorage').textContent = `${s.storageMb} MB`;

    document.getElementById('pbxBadge').textContent = `PBX: ${s.pbxServer}`;
    document.getElementById('licenseBadge').textContent = `License: ${s.licenseKey || 'Active'}`;

    const host = s.handlerUrl || window.location.origin;
    const wssProtocol = host.startsWith('https:') ? 'wss:' : 'ws:';
    const cleanHost = host.replace(/^https?:\/\//, '');
    document.getElementById('epChat').textContent = `${wssProtocol}//${cleanHost}/socket.io`;
    document.getElementById('epProv').textContent = `${host}/provision/`;
    document.getElementById('epPhonebook').textContent = `${host}/phonebook/yealink.xml`;
    document.getElementById('epSync').textContent = `${host}/api/v1/config/sync`;

    // Render Component Health Matrix
    const grid = document.getElementById('componentsGrid');
    const badge = document.getElementById('componentsSummaryBadge');
    if (grid && data.components) {
      grid.innerHTML = data.components.map(c => {
        const statusClass = c.status || 'operational';
        return `
          <div class="component-card">
            <div class="component-header">
              <span class="component-name">${c.name}</span>
              <span class="status-pill ${statusClass}">
                <span class="status-pulse"></span> ${c.status}
              </span>
            </div>
            <div class="component-details">${c.details}</div>
            <div class="component-footer">
              <span>Latency: <strong>${c.latency}</strong></span>
              <span class="tag">${c.badge}</span>
            </div>
          </div>
        `;
      }).join('');

      const total = data.components.length;
      const opCount = data.components.filter(c => c.status === 'operational').length;
      badge.textContent = `${opCount}/${total} Components Operational`;
      badge.className = opCount === total ? 'badge badge-primary' : 'badge badge-secondary';
    }

    // Update PBX Ping Target Card
    const pingTarget = document.getElementById('pingPbxTarget');
    if (pingTarget) pingTarget.textContent = `${s.pbxServer || 'pbx.chriskendall.media'}:${s.pbxPort || 5060}`;

    // Load Live Activity & Audit Logs
    loadAuditLogs();
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
      const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let badgeClass = 'badge-secondary';
      if (log.event_type.includes('LOGIN') || log.event_type.includes('AUTH')) badgeClass = 'badge-primary';
      if (log.event_type.includes('ERROR') || log.event_type.includes('PURGE')) badgeClass = 'badge-danger';
      if (log.event_type.includes('PROVISION') || log.event_type.includes('PIN')) badgeClass = 'badge-success';

      return `
        <div class="log-item">
          <span class="log-time">${time}</span>
          <span class="tag ${badgeClass}">${log.event_type}</span>
          <span class="log-msg" title="${log.details || ''}">${log.details}</span>
          ${log.ip_address ? `<span class="muted" style="font-size: 11px; margin-left: auto;">${log.ip_address}</span>` : ''}
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
    btn.textContent = '⚡ Probing...';
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
          pill.textContent = `${res.latencyMs} ms`;
        }
        if (details) details.textContent = res.message || 'PBX responded successfully.';
      } else {
        if (pill) {
          pill.className = 'status-pill degraded';
          pill.textContent = 'Unreachable';
        }
        if (details) details.textContent = res ? (res.error || res.message) : 'Connection failed.';
      }
    } catch (err) {
      if (pill) {
        pill.className = 'status-pill degraded';
        pill.textContent = 'Error';
      }
      if (details) details.textContent = 'Failed to execute ping probe.';
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Ping PBX Now';
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
          ${canManage ? `
            <button class="btn btn-sm btn-secondary" onclick="generatePin('${ext.extension}')">Generate PIN</button>
            <button class="btn btn-sm btn-danger" onclick="deleteExtension('${ext.extension}')">Delete</button>
          ` : '<span class="muted">Read Only</span>'}
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
      alert(`8-Digit Auto-Provisioning PIN Generated!\n\nExtension: ${ext}\nPIN: ${res.code}\nExpires: ${new Date(res.expiresAt).toLocaleString()}`);
      loadExtensions();
    }
  };

  window.deleteExtension = async (ext) => {
    if (!confirm(`Are you sure you want to delete Extension ${ext}?`)) return;
    const res = await fetchJson(`/api/admin/extensions/${ext}`, { method: 'DELETE' });
    if (res && res.ok) loadExtensions();
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
      closeModal('modalAddExt');
      loadExtensions();
    } else if (res) {
      alert(`Error: ${res.error || 'Failed to save extension'}`);
    }
  });

  // Asterisk AMI Sync Modal
  document.getElementById('btnSyncPbx')?.addEventListener('click', () => {
    document.getElementById('formSyncPbx')?.reset();
    document.getElementById('amiSyncOutput')?.classList.add('hidden');
    openModal('modalSyncPbx');
  });

  document.getElementById('formSyncPbx')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = document.getElementById('amiSyncOutput');
    const btn = document.getElementById('btnRunSync');
    btn.disabled = true;
    btn.textContent = 'Connecting to Asterisk AMI...';

    const payload = {
      amiHost: document.getElementById('amiHost').value.trim(),
      amiPort: parseInt(document.getElementById('amiPort').value || '5038', 10),
      amiUser: document.getElementById('amiUser').value.trim(),
      amiSecret: document.getElementById('amiSecret').value
    };

    const res = await fetchJson('/api/admin/pbx/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    btn.disabled = false;
    btn.textContent = '⚡ Start AMI Sync';

    if (out) {
      out.classList.remove('hidden');
      out.textContent = res ? (res.ok ? `✅ Success!\n${res.message}` : `❌ Failed:\n${res.error}`) : 'Network error.';
    }
    if (res && res.ok) loadExtensions();
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
    btn.textContent = '⚡ Provisioning...';

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
    btn.textContent = '⚡ Provision Now';

    if (res && res.ok) {
      document.getElementById('qpResult')?.classList.remove('hidden');
      document.getElementById('qpResultCode').textContent = res.code;
      document.getElementById('qpResultExt').textContent = `Extension ${res.extension} (${res.displayName})`;
      document.getElementById('qpResultDeepLink').value = res.deepLink;
      document.getElementById('qpResultCard').value = res.userWelcomeCard;
      loadExtensions();
    } else if (res) {
      alert(`Provisioning failed: ${res.error || 'Check parameters'}`);
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
  let deviceCatalogs = { handsets: [], routers: [] };

  async function loadCatalogs() {
    const data = await fetchJson('/api/admin/catalogs');
    if (data && data.ok) {
      deviceCatalogs = { handsets: data.handsets || [], routers: data.routers || [] };
      updateHandsetModelsDropdown();
      updateRouterModelsDropdown();
    }
  }

  function updateHandsetModelsDropdown() {
    const brandSel = document.getElementById('addHandsetBrand');
    const modelSel = document.getElementById('addHandsetModel');
    if (!brandSel || !modelSel) return;
    const brandId = brandSel.value;
    const brandObj = deviceCatalogs.handsets.find(b => b.id === brandId);
    if (!brandObj || !brandObj.models || !brandObj.models.length) {
      modelSel.innerHTML = '<option value="">Standard / Generic Model</option>';
      return;
    }
    modelSel.innerHTML = brandObj.models.map(m => `
      <option value="${m.id}">${m.name} (${m.series || 'Desktop'})</option>
    `).join('') + '<option value="Custom">Custom / Other Model</option>';
  }

  function updateRouterModelsDropdown() {
    const brandSel = document.getElementById('addRouterBrand');
    const modelSel = document.getElementById('addRouterModel');
    if (!brandSel || !modelSel) return;
    const brandId = brandSel.value;
    const brandObj = deviceCatalogs.routers.find(b => b.id === brandId);
    if (!brandObj || !brandObj.models || !brandObj.models.length) {
      modelSel.innerHTML = '<option value="">Standard / Generic Model</option>';
      return;
    }
    modelSel.innerHTML = brandObj.models.map(m => `
      <option value="${m.id}">${m.name} (${m.series || 'Gateway'})</option>
    `).join('') + '<option value="Custom">Custom / Other Model</option>';
  }

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
          <td>${h.last_provisioned_at ? new Date(h.last_provisioned_at).toLocaleString() : '<span class="muted">Never fetched</span>'}</td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" onclick="editHandsetConfig('${cleanMac}')">✏️ Edit Config</button>
              <a class="btn btn-sm btn-secondary" href="${provUrl}" target="_blank" title="Test Fetch Profile">🔗 Test</a>
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
      alert(res?.error || 'Failed to load handset configuration preview.');
      return;
    }

    document.getElementById('editHandsetTitle').textContent = `✏️ Edit Provisioning Profile — ${res.brand.toUpperCase()} ${res.model || ''}`;
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
      alert('Handset provisioning profile saved successfully! The physical phone will receive this updated configuration on its next boot or re-sync.');
      closeModal('modalEditHandsetConfig');
      loadHandsets();
    } else if (res) {
      alert(res.error || 'Failed to save configuration.');
    }
  });

  window.deleteHandset = async (mac) => {
    if (!confirm(`Remove handset with MAC [${mac}]?`)) return;
    const res = await fetchJson(`/api/admin/handsets/${mac}`, { method: 'DELETE' });
    if (res && res.ok) loadHandsets();
  };

  document.getElementById('btnOpenAddHandsetModal')?.addEventListener('click', () => {
    document.getElementById('formAddHandset')?.reset();
    updateHandsetModelsDropdown();
    const sel = document.getElementById('addHandsetExt');
    if (sel) {
      sel.innerHTML = '<option value="">Select an extension...</option>' + cachedExtensions.map(e => `
        <option value="${e.extension}">Ext ${e.extension} (${e.display_name})</option>
      `).join('');
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
      closeModal('modalAddHandset');
      loadHandsets();
    } else if (res) {
      alert(`Error: ${res.error || 'Failed to register handset'}`);
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
          </td>
          <td><strong>${r.brand.toUpperCase()}</strong> ${r.model || ''}</td>
          <td>VLAN ${r.voice_vlan_id}</td>
          <td><code>${r.voice_subnet}</code></td>
          <td><span class="badge ${r.disable_sip_alg ? 'badge-primary' : 'badge-secondary'}">${r.disable_sip_alg ? 'Disabled' : 'Active'}</span></td>
          <td><span class="badge ${r.enable_qos ? 'badge-primary' : 'badge-secondary'}">${r.enable_qos ? 'DSCP 46 / EF' : 'Off'}</span></td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" onclick="editRouterScript(${r.id})">✏️ Edit Script</button>
              <button class="btn btn-sm btn-secondary" onclick="downloadRouterScript(${r.id}, '${r.site_name.replace(/'/g, "\\'")}', '${r.brand}')">💾 Download</button>
              <button class="btn btn-sm btn-secondary" onclick="copyRouterUrl(${r.id})">🔗 Boot URL</button>
              ${canManage ? `<button class="btn btn-sm btn-danger" onclick="deleteRouter(${r.id})">Delete</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadRouters() {
    const data = await fetchJson('/api/admin/routers');
    const tbody = document.getElementById('routerTableBody');
    if (!data || !data.ok || !data.routers.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">No router profiles generated yet. Click "+ New Router Profile" to create a VoIP-optimized setup.</td></tr>';
      cachedRouters = [];
      return;
    }

    cachedRouters = data.routers;
    renderRoutersTable(cachedRouters);
  }

  // Router Script Editor Modal Handlers
  let activeRouterId = 0;
  let activeRouterDefaultScript = '';
  let activeRouterFilename = '';

  window.editRouterScript = async (id) => {
    activeRouterId = id;
    const res = await fetchJson(`/api/admin/routers/${id}/preview`);
    if (!res || !res.ok) {
      alert(res?.error || 'Failed to load router configuration script.');
      return;
    }

    document.getElementById('editRouterTitle').textContent = `✏️ Edit VoIP Script — ${res.siteName} (${res.brand.toUpperCase()} ${res.model || ''})`;
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
      alert('Router deployment script saved successfully! The router will receive this customized script when booting or provisioning.');
      closeModal('modalEditRouterScript');
      loadRouters();
    } else if (res) {
      alert(res.error || 'Failed to save router script.');
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
      alert('Failed to download router script. Please ensure you are authenticated.');
    }
  };

  window.copyRouterUrl = (id) => {
    const url = `${window.location.origin}/provision/router/${id}.rsc`;
    navigator.clipboard.writeText(url);
    alert(`Copied Router Bootstrap Provisioning URL to clipboard:\n\n${url}`);
  };

  window.deleteRouter = async (id) => {
    if (!confirm('Are you sure you want to remove this router profile?')) return;
    const res = await fetchJson(`/api/admin/routers/${id}`, { method: 'DELETE' });
    if (res && res.ok) loadRouters();
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
      closeModal('modalAddRouter');
      loadRouters();
    } else if (res) {
      alert(`Error: ${res.error || 'Failed to generate router profile'}`);
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
        alert('Logo uploaded successfully and applied to softphone preview!');
      } else {
        alert(`Logo upload failed: ${data.error || 'Server rejected file'}`);
      }
    } catch (err) {
      alert('Error uploading logo image.');
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
      alert('Custom branding and colors saved successfully! Softphones will pull these on registration & sync.');
      loadBranding();
    } else if (res) {
      alert(`Error saving branding: ${res.error}`);
    }
  });

  // --------------------------------------------------------------------------
  // 9. TAB 6: PBX & Gateways Config
  // --------------------------------------------------------------------------
  async function loadConfig() {
    const data = await fetchJson('/api/admin/config');
    if (!data || !data.ok) return;

    const c = data.config;
    document.getElementById('cfgPbxServer').value = c.pbx_server;
    document.getElementById('cfgPbxPort').value = c.pbx_port;
    document.getElementById('cfgPbxTransport').value = c.pbx_transport;
    document.getElementById('cfgDataHandlerUrl').value = c.data_handler_url;
    document.getElementById('cfgApiKey').value = c.api_key || '';

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
      dataHandlerUrl: document.getElementById('cfgDataHandlerUrl').value.trim()
    };

    const res = await fetchJson('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      alert('PBX Gateway configuration updated successfully!');
      loadConfig();
    }
  });

  document.getElementById('btnCopyApiKey')?.addEventListener('click', () => {
    const key = document.getElementById('cfgApiKey').value;
    navigator.clipboard.writeText(key);
    window.showToast('API Key copied to clipboard!', 'success');
  });

  document.getElementById('btnRegenApiKey')?.addEventListener('click', async () => {
    if (!confirm('Regenerate server API key? Any existing billing/CRM integration using the old key will need to be updated.')) return;
    const res = await fetchJson('/api/admin/config/regenerate-api-key', { method: 'POST' });
    if (res && res.ok) {
      document.getElementById('cfgApiKey').value = res.apiKey;
      updateCurlExample(document.getElementById('cfgDataHandlerUrl').value, res.apiKey);
      alert('New API Key generated successfully!');
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
      alert('GDPR Retention Policy saved successfully!');
      loadGdprPolicy();
    }
  });

  document.getElementById('btnExecutePurge')?.addEventListener('click', async () => {
    const ext = document.getElementById('purgeExt').value.trim();
    if (!ext) {
      alert('Please enter an extension number to purge.');
      return;
    }
    if (!confirm(`CAUTION: Permanently erase all GDPR communications records and files for Extension ${ext}? This action is irreversible.`)) return;

    const res = await fetchJson(`/api/v1/gdpr/user/${ext}`, { method: 'DELETE' });
    const resultBox = document.getElementById('purgeResult');
    if (res && res.ok) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `<strong>Article 17 Erasure Executed!</strong><br>SHA-256 Audit Certificate: <code>${res.certificateHash || 'Generated'}</code>`;
      loadOverview();
    } else if (res) {
      alert(`Purge failed: ${res.error || 'Check extension'}`);
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
      loadUsers();
      // If we updated ourselves, refresh current user state
      if (editId && currentUser && currentUser.id === parseInt(editId, 10)) {
        loadMe();
      }
    } else if (res) {
      alert(`Error: ${res.error || 'Failed to save user account'}`);
    }
  });

  // Delete User
  window.deleteUser = async (id, username) => {
    if (!confirm(`Are you sure you want to delete administrator account [${username}]? This cannot be undone.`)) return;
    const res = await fetchJson(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      loadUsers();
    } else if (res) {
      alert(`Delete failed: ${res.error}`);
    }
  };

  // Topbar Shortcut: Jump directly to Users & Permissions Tab
  document.getElementById('btnTopbarUser')?.addEventListener('click', () => {
    const usersBtn = document.querySelector('.nav-btn[data-tab="users"]');
    if (usersBtn) usersBtn.click();
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
      const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      const catClass = `shell-cat-${(item.category || 'system').toLowerCase()}`;
      const lvlClass = `shell-lvl-${item.level || 'INFO'}`;
      const devBadge = item.deviceIdentifier ? `<span class="shell-dev">[${item.deviceIdentifier}]</span> ` : '';

      return `
        <div class="shell-entry">
          <span class="shell-time">${time}</span>
          <span class="shell-cat ${catClass}">${item.category}</span>
          <span class="${lvlClass}">${devBadge}${item.message}</span>
          <span class="shell-ip">${item.ipAddress}</span>
        </div>
      `;
    }).join('');

    if (term) {
      term.innerHTML = html || '<div class="shell-entry"><span class="shell-time">--:--:--.---</span><span class="shell-cat shell-cat-system">SYSTEM</span><span class="shell-lvl-INFO">No connectivity events match current filter.</span></div>';
      if (document.getElementById('shellAutoScroll')?.checked) {
        term.scrollTop = term.scrollHeight;
      }
    }

    if (drawer) {
      drawer.innerHTML = html || '<div class="shell-entry"><span class="shell-time">--:--:--.---</span><span class="shell-cat shell-cat-system">SYSTEM</span><span class="shell-lvl-INFO">Waiting for device events...</span></div>';
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
      alert('No log events to export.');
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

  // Periodic Telemetry Auto-Refresh (Every 15 Seconds)
  setInterval(() => {
    const activeBtn = document.querySelector('.nav-btn.active');
    if (activeBtn && activeBtn.dataset.tab === 'overview' && getAuthToken()) {
      loadOverview();
    }
  }, 15000);
});
