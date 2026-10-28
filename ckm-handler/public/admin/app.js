document.addEventListener('DOMContentLoaded', () => {
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
        roleBadge.textContent = `👤 ${currentUser.displayName || currentUser.username} (${(currentUser.role || 'user').toUpperCase()})`;
        roleBadge.className = currentUser.role === 'superadmin' ? 'badge badge-primary' : 'badge badge-secondary';
      }

      // Hide or show Users tab based on manage_users permission
      const usersNav = document.getElementById('navBtnUsers');
      if (usersNav) {
        usersNav.style.display = hasPerm('manage_users') ? 'flex' : 'none';
      }
    } else {
      if (roleBadge) roleBadge.textContent = '👤 Not Authenticated';
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

    const host = window.location.origin;
    document.getElementById('epChat').textContent = `${host.replace(/^http/, 'ws')}/socket.io`;
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
  }

  window.copyEndpointText = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim());
    alert(`Copied endpoint URL to clipboard:\n\n${el.textContent.trim()}`);
  };

  // --------------------------------------------------------------------------
  // 5. TAB 2: Extensions & Softphones
  // --------------------------------------------------------------------------
  let cachedExtensions = [];

  async function loadExtensions() {
    const data = await fetchJson('/api/admin/extensions');
    const tbody = document.getElementById('extTableBody');
    if (!data || !data.ok || !data.extensions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No extensions registered yet. Click "+ New Extension" to create one.</td></tr>';
      cachedExtensions = [];
      return;
    }

    cachedExtensions = data.extensions;
    const canManage = hasPerm('manage_extensions');

    tbody.innerHTML = data.extensions.map(ext => `
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
    alert('Copied 1-Click Setup Link to clipboard!');
  });

  document.getElementById('btnCopyWelcomeCard')?.addEventListener('click', () => {
    const val = document.getElementById('qpResultCard').value;
    navigator.clipboard.writeText(val);
    alert('Copied Customer Welcome Card to clipboard!');
  });

  // --------------------------------------------------------------------------
  // 6. TAB 3: Physical IP Handsets
  // --------------------------------------------------------------------------
  async function loadHandsets() {
    const data = await fetchJson('/api/admin/handsets');
    const tbody = document.getElementById('handsetTableBody');
    if (!data || !data.ok || !data.handsets.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No physical handsets registered. Click "+ Register Physical Handset" to add one by MAC address.</td></tr>';
      return;
    }

    const canManage = hasPerm('manage_handsets');

    tbody.innerHTML = data.handsets.map(h => `
      <tr>
        <td><code>${h.mac_address.toUpperCase()}</code></td>
        <td><strong>${h.brand.toUpperCase()}</strong> ${h.model || ''}</td>
        <td>Ext ${h.extension} (${h.display_name || ''})</td>
        <td>${h.line_label || 'Default'}</td>
        <td>${h.last_provisioned_at ? new Date(h.last_provisioned_at).toLocaleString() : '<span class="muted">Never fetched</span>'}</td>
        <td>
          ${canManage ? `
            <button class="btn btn-sm btn-danger" onclick="deleteHandset('${h.mac_address}')">Remove</button>
          ` : '<span class="muted">Read Only</span>'}
        </td>
      </tr>
    `).join('');
  }

  window.deleteHandset = async (mac) => {
    if (!confirm(`Remove handset with MAC [${mac}]?`)) return;
    const res = await fetchJson(`/api/admin/handsets/${mac}`, { method: 'DELETE' });
    if (res && res.ok) loadHandsets();
  };

  document.getElementById('btnOpenAddHandsetModal')?.addEventListener('click', () => {
    document.getElementById('formAddHandset')?.reset();
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
  // 7. TAB 4: Routers & Network Gateways
  // --------------------------------------------------------------------------
  async function loadRouters() {
    const data = await fetchJson('/api/admin/routers');
    const tbody = document.getElementById('routerTableBody');
    if (!data || !data.ok || !data.routers.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No router profiles generated yet. Click "+ New Router Profile" to create a VoIP-optimized setup.</td></tr>';
      return;
    }

    const canManage = hasPerm('manage_routers');

    tbody.innerHTML = data.routers.map(r => `
      <tr>
        <td><strong>${r.site_name}</strong></td>
        <td>${r.brand.toUpperCase()} ${r.model || ''}</td>
        <td>VLAN ${r.voice_vlan_id}</td>
        <td><code>${r.voice_subnet}</code></td>
        <td><span class="badge ${r.disable_sip_alg ? 'badge-primary' : 'badge-secondary'}">${r.disable_sip_alg ? 'Disabled' : 'Active'}</span></td>
        <td><span class="badge ${r.enable_qos ? 'badge-primary' : 'badge-secondary'}">${r.enable_qos ? 'DSCP 46 / EF' : 'Off'}</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="downloadRouterScript(${r.id}, '${r.site_name.replace(/'/g, "\\'")}', '${r.brand}')">Download Script</button>
          <button class="btn btn-sm btn-secondary" onclick="copyRouterUrl(${r.id})">Copy Boot URL</button>
          ${canManage ? `<button class="btn btn-sm btn-danger" onclick="deleteRouter(${r.id})">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
  }

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
      const ext = brand === 'ubiquiti' ? 'sh' : (brand === 'cisco' ? 'cfg' : 'rsc');
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
    openModal('modalAddRouter');
  });

  document.getElementById('formAddRouter')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const site = document.getElementById('addRouterSite').value.trim();
    const brand = document.getElementById('addRouterBrand').value;
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
    alert('API Key copied to clipboard!');
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

  async function loadUsers() {
    const data = await fetchJson('/api/admin/users');
    const tbody = document.getElementById('userTableBody');
    if (!data || !data.ok || !data.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No admin accounts found.</td></tr>';
      cachedUsers = [];
      return;
    }

    cachedUsers = data.users;
    tbody.innerHTML = data.users.map(u => {
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

  // --------------------------------------------------------------------------
  // 12. Initial Application Boot & Telemetry Loop
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
