document.addEventListener('DOMContentLoaded', () => {
  // 1. Navigation Tab Switching
  const navBtns = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('pageTitle');

  const titles = {
    overview: 'System Overview & Metrics',
    extensions: 'SIP Extensions & Softphone PINs',
    handsets: 'Physical IP Handset Directory',
    routers: 'VoIP Router & Network Gateway Profiles',
    config: 'PBX Integration & Gateway Settings',
    gdpr: 'GDPR Compliance & Data Retention Vault'
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

  // 2. Data Loading Routing
  function loadTabData(tab) {
    if (tab === 'overview') loadOverview();
    else if (tab === 'extensions') loadExtensions();
    else if (tab === 'handsets') loadHandsets();
    else if (tab === 'routers') loadRouters();
    else if (tab === 'config') loadConfig();
    else if (tab === 'gdpr') loadGdprPolicy();
  }

  // Helper fetch with credentials
  async function fetchJson(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        alert('Admin authorization required. Please reload and enter admin credentials.');
        return null;
      }
      return await res.json();
    } catch (e) {
      console.error('Fetch error:', e);
      return null;
    }
  }

  // 3. Overview Tab
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
  }

  // 4. Extensions Tab
  async function loadExtensions() {
    const data = await fetchJson('/api/admin/extensions');
    const tbody = document.getElementById('extTableBody');
    if (!data || !data.ok || !data.extensions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No extensions registered yet. Click "+ New Extension" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = data.extensions.map(ext => `
      <tr>
        <td><strong>${ext.extension}</strong></td>
        <td>${ext.display_name}</td>
        <td><code>${ext.sip_username}</code></td>
        <td>${ext.active_pin ? `<strong style="color:#0284c7;font-size:14px;">${ext.active_pin}</strong>` : '<span class="muted">None active</span>'}</td>
        <td>${ext.bound_handsets} handset(s)</td>
        <td><span class="badge ${ext.is_active ? 'badge-primary' : 'badge-secondary'}">${ext.is_active ? 'Active' : 'Disabled'}</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="generatePin('${ext.extension}')">Generate PIN</button>
          <button class="btn btn-sm btn-danger" onclick="deleteExtension('${ext.extension}')">Delete</button>
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
      alert(`Generated 8-digit PIN for Ext ${ext}: ${res.code}\n\nValid for 72 hours.`);
      loadExtensions();
    }
  };

  window.deleteExtension = async (ext) => {
    if (!confirm(`Are you sure you want to delete Extension ${ext}?`)) return;
    const res = await fetchJson(`/api/admin/extensions/${ext}`, { method: 'DELETE' });
    if (res && res.ok) loadExtensions();
  };

  document.getElementById('btnOpenAddExtModal')?.addEventListener('click', async () => {
    const ext = prompt('Enter Extension Number (e.g. 101):');
    if (!ext) return;
    const name = prompt('Enter User Display Name (e.g. Alice Walker):') || `Extension ${ext}`;
    const pwd = prompt('Enter SIP Secret Password:');
    if (!pwd) return;

    const res = await fetchJson('/api/admin/extensions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extension: ext, displayName: name, password: pwd })
    });
    if (res && res.ok) loadExtensions();
  });

  document.getElementById('btnSyncPbx')?.addEventListener('click', async () => {
    const amiUser = prompt('Enter Asterisk AMI Username:', 'admin') || 'admin';
    const amiSecret = prompt('Enter Asterisk AMI Secret / Password:') || '';
    if (!amiSecret) return;

    const res = await fetchJson('/api/admin/pbx/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amiUser, amiSecret })
    });

    if (res && res.ok) {
      alert(`PBX Sync Completed:\n${res.message}`);
      loadExtensions();
    } else if (res) {
      alert(`PBX Sync Notice:\n${res.error || 'Check AMI credentials on port 5038.'}`);
    }
  });

  // 5. Handsets Tab
  async function loadHandsets() {
    const data = await fetchJson('/api/admin/handsets');
    const tbody = document.getElementById('handsetTableBody');
    if (!data || !data.ok || !data.handsets.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No physical handsets registered. Click "+ Register Physical Handset" to add one by MAC address.</td></tr>';
      return;
    }

    tbody.innerHTML = data.handsets.map(h => `
      <tr>
        <td><code>${h.mac_address.toUpperCase()}</code></td>
        <td><strong>${h.brand.toUpperCase()}</strong> ${h.model || ''}</td>
        <td>Ext ${h.extension} (${h.display_name})</td>
        <td>${h.line_label || 'Default'}</td>
        <td>${h.last_provisioned_at ? new Date(h.last_provisioned_at).toLocaleString() : '<span class="muted">Never fetched</span>'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteHandset('${h.mac_address}')">Remove</button>
        </td>
      </tr>
    `).join('');
  }

  window.deleteHandset = async (mac) => {
    if (!confirm(`Remove handset with MAC [${mac}]?`)) return;
    const res = await fetchJson(`/api/admin/handsets/${mac}`, { method: 'DELETE' });
    if (res && res.ok) loadHandsets();
  };

  document.getElementById('btnOpenAddHandsetModal')?.addEventListener('click', async () => {
    const mac = prompt('Enter Physical Handset MAC Address (12 Hex characters, e.g. 001565A1B2C3):');
    if (!mac) return;
    const ext = prompt('Enter Assigned Extension Number (e.g. 101):');
    if (!ext) return;
    const brand = prompt('Enter Phone Brand (yealink / fanvil / grandstream):', 'yealink') || 'yealink';

    const res = await fetchJson('/api/admin/handsets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macAddress: mac, extension: ext, brand })
    });
    if (res && res.ok) loadHandsets();
  });

  // 6. Routers & Voice Gateways Tab
  async function loadRouters() {
    const data = await fetchJson('/api/admin/routers');
    const tbody = document.getElementById('routerTableBody');
    if (!data || !data.ok || !data.routers.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No router profiles generated yet. Click "+ New Router Profile" to create a VoIP-optimized setup.</td></tr>';
      return;
    }

    tbody.innerHTML = data.routers.map(r => `
      <tr>
        <td><strong>${r.site_name}</strong></td>
        <td>${r.brand.toUpperCase()} ${r.model || ''}</td>
        <td>VLAN ${r.voice_vlan_id}</td>
        <td><code>${r.voice_subnet}</code></td>
        <td><span class="badge ${r.disable_sip_alg ? 'badge-primary' : 'badge-secondary'}">${r.disable_sip_alg ? 'Disabled' : 'Active'}</span></td>
        <td><span class="badge ${r.enable_qos ? 'badge-primary' : 'badge-secondary'}">${r.enable_qos ? 'DSCP 46 / EF' : 'Off'}</span></td>
        <td>
          <a class="btn btn-sm btn-primary" href="/api/admin/routers/${r.id}/script" download>Download Script</a>
          <button class="btn btn-sm" onclick="copyRouterUrl(${r.id})">Copy Boot URL</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRouter(${r.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  }

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

  document.getElementById('btnOpenAddRouterModal')?.addEventListener('click', async () => {
    const site = prompt('Enter Client / Site Name (e.g. Branch Office London):');
    if (!site) return;
    const brand = prompt('Enter Router Platform (mikrotik / ubiquiti / cisco):', 'mikrotik') || 'mikrotik';
    const vlan = prompt('Enter Voice VLAN ID (Default 20):', '20') || '20';
    const subnet = prompt('Enter Voice Subnet (Default 10.20.0.1/24):', '10.20.0.1/24') || '10.20.0.1/24';

    const res = await fetchJson('/api/admin/routers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteName: site,
        brand,
        voiceVlanId: parseInt(vlan, 10),
        voiceSubnet: subnet,
        disableSipAlg: true,
        enableQos: true
      })
    });
    if (res && res.ok) loadRouters();
  });

  // 7. PBX Config Tab & API Key Management
  async function loadConfig() {
    const data = await fetchJson('/api/admin/config');
    if (!data || !data.ok || !data.config) return;
    const c = data.config;
    document.getElementById('cfgPbxServer').value = c.pbx_server;
    document.getElementById('cfgPbxPort').value = c.pbx_port;
    document.getElementById('cfgPbxTransport').value = c.pbx_transport;
    document.getElementById('cfgDataHandlerUrl').value = c.data_handler_url;

    const apiKeyInput = document.getElementById('cfgApiKey');
    if (apiKeyInput) apiKeyInput.value = c.api_key || '';

    updateCurlExample(c.api_key, c.data_handler_url);
  }

  function updateCurlExample(key, handlerUrl) {
    const pre = document.getElementById('curlExample');
    if (!pre) return;
    const domain = handlerUrl || window.location.origin;
    const cleanKey = key || 'ckm_live_xxxxxxxxxxxxxxxxxxxxxxxx';
    pre.textContent = `# 1. Pull extension details from PBX and generate 8-digit provisioning PIN
curl -X POST "${domain}/api/v1/integrations/provision-user" \\
  -H "X-API-Key: ${cleanKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"extension": "101", "displayName": "Alice Walker", "queryPbx": true}'

# 2. Query active PIN code and deep-link for extension 101
curl -X GET "${domain}/api/v1/integrations/extension/101/code" \\
  -H "X-API-Key: ${cleanKey}"`;
  }

  document.getElementById('btnCopyApiKey')?.addEventListener('click', () => {
    const key = document.getElementById('cfgApiKey')?.value;
    if (key) {
      navigator.clipboard.writeText(key);
      alert('API Key copied to clipboard!');
    }
  });

  document.getElementById('btnRegenApiKey')?.addEventListener('click', async () => {
    if (!confirm('CAUTION: Regenerating the API Key will immediately invalidate the current key for all external systems.\n\nProceed?')) return;
    const res = await fetchJson('/api/admin/config/regenerate-api-key', { method: 'POST' });
    if (res && res.ok && res.apiKey) {
      document.getElementById('cfgApiKey').value = res.apiKey;
      const handlerUrl = document.getElementById('cfgDataHandlerUrl')?.value;
      updateCurlExample(res.apiKey, handlerUrl);
      alert('New API Key generated successfully!');
    }
  });

  document.getElementById('formConfig')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      pbxServer: document.getElementById('cfgPbxServer').value,
      pbxPort: document.getElementById('cfgPbxPort').value,
      pbxTransport: document.getElementById('cfgPbxTransport').value,
      dataHandlerUrl: document.getElementById('cfgDataHandlerUrl').value
    };

    const res = await fetchJson('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res && res.ok) {
      alert(res.message || 'Configuration saved successfully.');
    }
  });

  // 8. Quick Pull & Provision Modal
  const modalQuickProv = document.getElementById('modalQuickProvision');
  const btnOpenQuickProv = document.getElementById('btnOpenQuickProvModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const formQuickProv = document.getElementById('formQuickProvision');
  const qpResult = document.getElementById('qpResult');

  function openQuickProvModal() {
    if (!modalQuickProv) return;
    formQuickProv.reset();
    document.getElementById('qpExpiry').value = '72';
    document.getElementById('qpQueryPbx').checked = true;
    qpResult.classList.add('hidden');
    formQuickProv.classList.remove('hidden');
    modalQuickProv.classList.remove('hidden');
    document.getElementById('qpExt')?.focus();
  }

  function closeQuickProvModal() {
    if (modalQuickProv) modalQuickProv.classList.add('hidden');
  }

  btnOpenQuickProv?.addEventListener('click', openQuickProvModal);
  btnCloseModal?.addEventListener('click', closeQuickProvModal);
  btnCancelModal?.addEventListener('click', closeQuickProvModal);

  modalQuickProv?.addEventListener('click', (e) => {
    if (e.target === modalQuickProv) closeQuickProvModal();
  });

  formQuickProv?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ext = document.getElementById('qpExt')?.value.trim();
    if (!ext) return;

    const btnSubmit = document.getElementById('btnSubmitQuickProv');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Provisioning...';
    }

    const payload = {
      extension: ext,
      displayName: document.getElementById('qpName')?.value.trim() || undefined,
      sipPassword: document.getElementById('qpPass')?.value.trim() || undefined,
      expiryHours: parseInt(document.getElementById('qpExpiry')?.value || '72', 10),
      queryPbx: document.getElementById('qpQueryPbx')?.checked ?? true
    };

    try {
      const res = await fetchJson('/api/admin/extensions/quick-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && res.ok) {
        document.getElementById('qpResultCode').textContent = res.code;
        document.getElementById('qpResultExt').textContent = `Extension ${res.extension} (${res.displayName || 'Active'}) — Expires in ${payload.expiryHours}h`;
        document.getElementById('qpResultDeepLink').value = res.deepLink || '';
        document.getElementById('qpResultCard').value = res.userWelcomeCard || '';
        qpResult.classList.remove('hidden');
        loadExtensions();
      } else {
        alert(res?.error || 'Failed to provision extension.');
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = '⚡ Provision Now';
      }
    }
  });

  document.getElementById('btnCopyDeepLink')?.addEventListener('click', () => {
    const link = document.getElementById('qpResultDeepLink')?.value;
    if (link) {
      navigator.clipboard.writeText(link);
      alert('MerlinSIP Auto-Setup deep link copied to clipboard!');
    }
  });

  document.getElementById('btnCopyWelcomeCard')?.addEventListener('click', () => {
    const card = document.getElementById('qpResultCard')?.value;
    if (card) {
      navigator.clipboard.writeText(card);
      alert('Welcome card instructions copied to clipboard! You can paste this in an email or message to the user.');
    }
  });

  // 7. GDPR Tab
  async function loadGdprPolicy() {
    const data = await fetchJson('/api/v1/gdpr/policy');
    if (!data || !data.ok || !data.policy) return;
    document.getElementById('gdprChatDays').value = data.policy.chat_retention_days;
    document.getElementById('gdprMediaDays').value = data.policy.media_retention_days;
    document.getElementById('gdprAutoPrune').checked = data.policy.auto_prune_enabled === 1;
  }

  document.getElementById('formGdprPolicy')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      chatDays: document.getElementById('gdprChatDays').value,
      mediaDays: document.getElementById('gdprMediaDays').value,
      autoPrune: document.getElementById('gdprAutoPrune').checked
    };
    const res = await fetchJson('/api/v1/gdpr/policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res && res.ok) alert('GDPR retention policy updated.');
  });

  document.getElementById('btnExecutePurge')?.addEventListener('click', async () => {
    const ext = document.getElementById('purgeExt')?.value.trim();
    if (!ext) {
      alert('Please enter an extension to purge.');
      return;
    }
    if (!confirm(`CAUTION: This will permanently purge all chat messages, contact details, and media files for Extension ${ext} under GDPR Article 17.\n\nProceed?`)) {
      return;
    }

    const res = await fetchJson(`/api/v1/gdpr/user/${ext}`, { method: 'DELETE' });
    const resultBox = document.getElementById('purgeResult');
    if (res && res.ok) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `
        <strong>Right to Erasure Completed for Extension ${ext}</strong><br>
        - Messages Scrubbed: ${res.messagesRemoved}<br>
        - Media Files Removed: ${res.filesRemoved}<br>
        - Audit Certificate SHA-256: <code>${res.certificateHash}</code>
      `;
    }
  });

  // Initial Load
  loadOverview();
});
