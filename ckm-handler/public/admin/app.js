document.addEventListener('DOMContentLoaded', () => {
  // 1. Navigation Tab Switching
  const navBtns = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('pageTitle');

  const titles = {
    overview: 'System Overview & Metrics',
    extensions: 'SIP Extensions & Softphone PINs',
    handsets: 'Physical IP Handset Directory',
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

  // 6. PBX Config Tab
  async function loadConfig() {
    const data = await fetchJson('/api/admin/config');
    if (!data || !data.ok || !data.config) return;
    const c = data.config;
    document.getElementById('cfgPbxServer').value = c.pbx_server;
    document.getElementById('cfgPbxPort').value = c.pbx_port;
    document.getElementById('cfgPbxTransport').value = c.pbx_transport;
    document.getElementById('cfgDataHandlerUrl').value = c.data_handler_url;
  }

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
