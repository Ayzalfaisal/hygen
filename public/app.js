'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  authToken: localStorage.getItem('admin_token') || '',
  licTable: localStorage.getItem('lic_table') || 'licenses',
  codeTable: localStorage.getItem('code_table') || 'access_codes',
  licenses: [],
  codes: [],
  activity: [],
  currentPage: 'dashboard',
  eventsBound: false
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shortId(value, size = 11) {
  const s = String(value || '');
  if (!s) return '—';
  return s.length <= size + 6 ? s : `${s.slice(0, size)}…${s.slice(-4)}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function daysFromNow(dateValue) {
  if (!dateValue) return null;
  const exp = new Date(dateValue);
  if (Number.isNaN(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - Date.now()) / 86400000);
}

function formatDate(dateValue) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function tableName(name) {
  return String(name || '').trim().replace(/[^a-zA-Z0-9_]/g, '') || 'licenses';
}

function showResult(id, message, type = 'info') {
  const el = $(id);
  if (!el) return;
  el.className = `result-box show result-${type}`;
  el.innerHTML = message;
}

function hideResult(id) {
  const el = $(id);
  if (!el) return;
  el.className = 'result-box';
  el.innerHTML = '';
}

function setButtonLoading(btn, loading, textWhenDone) {
  if (!btn) return;
  if (loading) {
    btn.dataset.oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Working...';
  } else {
    btn.disabled = false;
    btn.innerHTML = textWhenDone || btn.dataset.oldText || btn.innerHTML;
  }
}

function updateConnectionPill(ok = null, text = '') {
  const el = $('connectionPill');
  if (!el) return;
  if (!state.sbUrl || !state.sbKey) {
    el.className = 'pill warn';
    el.textContent = 'Not connected';
    return;
  }
  if (ok === true) {
    el.className = 'pill ok';
    el.textContent = text || 'Connected';
  } else if (ok === false) {
    el.className = 'pill danger';
    el.textContent = text || 'Connection error';
  } else {
    el.className = 'pill warn';
    el.textContent = text || 'Config saved';
  }
}

async function sbFetch(path, options = {}) {
  if (!state.authToken) {
    throw new Error('Please login first.');
  }
  const method = options.method || 'GET';
  const res = await fetch('/api/supabase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.authToken}`
    },
    body: JSON.stringify({
      path,
      method,
      headers: options.headers || {},
      body: options.body || null
    })
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text }; }
  }
  if (res.status === 401) {
    logoutAdmin(false);
    throw new Error(data.message || 'Session expired. Login again.');
  }
  if (!res.ok) {
    const msg = data.message || data.error_description || data.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function licPath(query = '') {
  return `/rest/v1/${tableName(state.licTable)}${query}`;
}

function codePath(query = '') {
  return `/rest/v1/${tableName(state.codeTable)}${query}`;
}

function licenseStatus(lic) {
  const active = lic.is_active === true || String(lic.is_active).toLowerCase() === 'true';
  const days = daysFromNow(lic.expires_at);
  if (!active) return { key: 'inactive', label: 'Blocked / Pending', cls: 'yellow' };
  if (days !== null && days < 0) return { key: 'expired', label: 'Expired', cls: 'red' };
  return { key: 'active', label: 'Active', cls: 'green' };
}

function deviceStatus(lic) {
  const device = String(lic.device_id || '').trim();
  if (!device) return { key: 'none', label: 'Not Registered', cls: 'gray' };
  if (device === 'NO_LOCK') return { key: 'nolock', label: 'No Lock', cls: 'green' };
  return { key: 'locked', label: 'Locked', cls: 'blue' };
}

function matchesLicense(lic, q) {
  const query = normalize(q);
  if (!query) return true;
  const fields = [
    lic.id,
    lic.user_id,
    lic.full_name,
    lic.name,
    lic.phone,
    lic.package,
    lic.device_id,
    lic.notes,
    lic.email,
    lic.created_at,
    lic.expires_at
  ];
  return fields.some(v => normalize(v).includes(query));
}

function matchesCode(code, q) {
  const query = normalize(q);
  if (!query) return true;
  const fields = [code.code, code.notes, code.used_by, code.email, code.user_id, code.used_by_email, code.created_at];
  return fields.some(v => normalize(v).includes(query));
}

function addLog(message, type = 'green') {
  state.activity.unshift({ message, type, time: new Date().toLocaleTimeString() });
  renderActivity();
}

function renderActivity() {
  const el = $('activityLog');
  if (!el) return;
  if (!state.activity.length) {
    el.className = 'empty-log';
    el.textContent = 'No actions yet.';
    return;
  }
  el.className = '';
  el.innerHTML = state.activity.slice(0, 50).map(item => `
    <div class="log-item">
      <span class="log-dot ${item.type === 'red' ? 'red-dot' : item.type === 'yellow' ? 'yellow-dot' : 'green-dot'}"></span>
      <span class="log-msg">${escapeHtml(item.message)}</span>
      <span class="log-time">${escapeHtml(item.time)}</span>
    </div>
  `).join('');
}

function showPage(pageId) {
  state.currentPage = pageId;
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
  $(`page-${pageId}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');

  if (pageId === 'dashboard') loadLicenses();
  if (pageId === 'codes') loadCodes();
  if (pageId === 'activity') renderActivity();
}

async function loadLicenses() {
  const body = $('licensesTableBody');
  const warning = $('dashboardWarning');
  if (warning) warning.classList.add('hidden');
  if (body) body.innerHTML = '<tr><td colspan="10" class="table-empty">Loading licenses from Supabase...</td></tr>';

  try {
    const data = await sbFetch(licPath('?select=*&order=created_at.desc'));
    state.licenses = Array.isArray(data) ? data : [];
    updateConnectionPill(true, 'Connected');
    renderDashboard();

    if (state.licenses.length === 0 && warning) {
      warning.classList.remove('hidden');
      warning.innerHTML = 'No rows are visible from <strong>licenses</strong> table with this API key. If Supabase table has rows, this is usually an RLS/API-key permission issue. For personal admin panel use your admin/service-role key, or create secure backend admin APIs.';
    }
  } catch (err) {
    state.licenses = [];
    updateConnectionPill(false);
    renderDashboard();
    if (body) body.innerHTML = `<tr><td colspan="10" class="table-empty red-text">❌ ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDashboard() {
  const q = $('dashboardSearch')?.value || '';
  const list = state.licenses.filter(lic => matchesLicense(lic, q));

  let active = 0, expired = 0, inactive = 0, locked = 0;
  state.licenses.forEach(lic => {
    const s = licenseStatus(lic).key;
    const d = deviceStatus(lic).key;
    if (s === 'active') active += 1;
    if (s === 'expired') expired += 1;
    if (s === 'inactive') inactive += 1;
    if (d === 'locked') locked += 1;
  });

  $('statTotal').textContent = state.licenses.length;
  $('statActive').textContent = active;
  $('statExpired').textContent = expired;
  $('statInactive').textContent = inactive;
  $('statLocked').textContent = locked;

  const body = $('licensesTableBody');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="10" class="table-empty">No matching license users found.</td></tr>';
    return;
  }

  body.innerHTML = list.map(lic => {
    const st = licenseStatus(lic);
    const dev = deviceStatus(lic);
    const days = daysFromNow(lic.expires_at);
    const expText = lic.expires_at ? `${formatDate(lic.expires_at)}${days !== null ? ` (${days}d)` : ''}` : '—';
    const uid = String(lic.user_id || '');
    const id = String(lic.id || '');
    const uidData = escapeHtml(uid);
    return `
      <tr>
        <td><strong>${escapeHtml(lic.full_name || lic.name || '—')}</strong></td>
        <td>${escapeHtml(lic.phone || lic.email || '—')}</td>
        <td><span class="badge gray">${escapeHtml(lic.package || '—')}</span></td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td>${escapeHtml(expText)}</td>
        <td><span class="badge ${dev.cls}">${dev.label}</span></td>
        <td><span class="mono truncate" title="${escapeHtml(lic.device_id || '')}">${escapeHtml(shortId(lic.device_id, 14))}</span></td>
        <td><button class="btn sm ghost mono" data-copy="${uidData}" title="Copy UID">${escapeHtml(shortId(uid, 10))}</button></td>
        <td><span class="truncate" title="${escapeHtml(lic.notes || '')}">${escapeHtml(lic.notes || '—')}</span></td>
        <td>
          <div class="actions">
            <button class="btn sm blue" data-row-action="load" data-user-id="${uidData}">Edit</button>
            <button class="btn sm yellow" data-row-action="extend30" data-user-id="${uidData}">+30d</button>
            <button class="btn sm ghost" data-row-action="reset" data-user-id="${uidData}">Reset</button>
            <button class="btn sm green" data-row-action="nolock" data-user-id="${uidData}">No Lock</button>
            <button class="btn sm red" data-row-action="toggle" data-user-id="${uidData}">${st.key === 'inactive' ? 'Activate' : 'Block'}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadCodes() {
  const body = $('codesTableBody');
  if (body) body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading access codes...</td></tr>';
  try {
    const data = await sbFetch(codePath('?select=*&order=created_at.desc'));
    state.codes = Array.isArray(data) ? data : [];
    updateConnectionPill(true, 'Connected');
    renderCodes();
  } catch (err) {
    state.codes = [];
    renderCodes();
    if (body) body.innerHTML = `<tr><td colspan="6" class="table-empty red-text">❌ ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderCodes() {
  const q = $('codeSearch')?.value || '';
  const list = state.codes.filter(code => matchesCode(code, q));
  const used = state.codes.filter(c => c.used_by || c.used_by_email || c.user_id).length;
  const active = state.codes.filter(c => c.is_active && !(c.used_by || c.used_by_email || c.user_id)).length;
  const inactive = state.codes.filter(c => !c.is_active).length;

  $('codeTotal').textContent = state.codes.length;
  $('codeActive').textContent = active;
  $('codeUsed').textContent = used;
  $('codeInactive').textContent = inactive;

  const body = $('codesTableBody');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="table-empty">No access codes found.</td></tr>';
    return;
  }
  body.innerHTML = list.map(c => {
    const isUsed = Boolean(c.used_by || c.used_by_email || c.user_id);
    const status = isUsed
      ? '<span class="badge green">Used</span>'
      : c.is_active
        ? '<span class="badge yellow">Available</span>'
        : '<span class="badge red">Inactive</span>';
    return `
      <tr>
        <td><strong class="mono green-text">${escapeHtml(c.code || '—')}</strong></td>
        <td>${escapeHtml(c.notes || '—')}</td>
        <td>${status}</td>
        <td>${escapeHtml(c.used_by_email || c.used_by || c.user_id || '—')}</td>
        <td>${escapeHtml(formatDate(c.created_at))}</td>
        <td class="actions">
          <button class="btn sm ${c.is_active ? 'red' : 'green'}" data-code-toggle="${escapeHtml(c.code || '')}" data-next-active="${c.is_active ? 'false' : 'true'}">${c.is_active ? 'Deactivate' : 'Reactivate'}</button>
          <button class="btn sm ghost" data-copy="${escapeHtml(c.code || '')}">Copy</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function patchLicenseByUserId(userId, patch) {
  const encoded = encodeURIComponent(userId);
  return sbFetch(licPath(`?user_id=eq.${encoded}`), {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(patch)
  });
}

async function createLicense(row) {
  return sbFetch(licPath(''), {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(row)
  });
}

async function getLicenseByUserId(userId) {
  const encoded = encodeURIComponent(userId);
  const data = await sbFetch(licPath(`?user_id=eq.${encoded}&select=*`));
  return Array.isArray(data) ? data : [];
}

async function findLicensesSmart(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  if (isUuid(q)) {
    const direct = await getLicenseByUserId(q);
    if (direct.length) return direct;
  }

  if (!state.licenses.length) {
    try { await loadLicenses(); } catch (_) {}
  }
  let matches = state.licenses.filter(lic => matchesLicense(lic, q));
  if (matches.length) return matches;

  if (q.includes('@')) {
    try {
      const uid = await sbFetch('/rest/v1/rpc/get_user_id_by_email', {
        method: 'POST',
        body: JSON.stringify({ p_email: q })
      });
      if (uid) matches = await getLicenseByUserId(String(uid));
    } catch (_) {
      // RPC is optional. Some Supabase projects do not expose auth email lookup.
    }
  }
  return matches;
}

function fillLicenseForm(lic) {
  $('licUserId').value = lic.user_id || '';
  $('licFullName').value = lic.full_name || lic.name || '';
  $('licPhone').value = lic.phone || '';
  $('licPackage').value = lic.package || 'pro';
  $('licNotes').value = lic.notes || '';
  $('deviceUserId').value = lic.user_id || '';
}

function renderLookupResults(licenses, codes = []) {
  const parts = [];
  if (licenses.length) {
    parts.push(`<div class="lookup-title">License matches: ${licenses.length}</div>`);
    parts.push('<div class="lookup-list">');
    licenses.slice(0, 10).forEach(lic => {
      const st = licenseStatus(lic);
      const dev = deviceStatus(lic);
      parts.push(`
        <div class="lookup-card">
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Name</div><div class="info-value">${escapeHtml(lic.full_name || lic.name || '—')}</div></div>
            <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${escapeHtml(lic.phone || '—')}</div></div>
            <div class="info-item"><div class="info-label">Package</div><div class="info-value">${escapeHtml(lic.package || '—')}</div></div>
            <div class="info-item"><div class="info-label">Status</div><div class="info-value"><span class="badge ${st.cls}">${st.label}</span></div></div>
            <div class="info-item"><div class="info-label">Expires</div><div class="info-value">${escapeHtml(formatDate(lic.expires_at))}</div></div>
            <div class="info-item"><div class="info-label">Device</div><div class="info-value"><span class="badge ${dev.cls}">${dev.label}</span></div></div>
            <div class="info-item span-all"><div class="info-label">User ID</div><div class="info-value mono">${escapeHtml(lic.user_id || '—')}</div></div>
            <div class="info-item span-all"><div class="info-label">Device ID</div><div class="info-value mono">${escapeHtml(lic.device_id || '—')}</div></div>
          </div>
          <div class="actions mt-10">
            <button class="btn sm blue" data-row-action="load" data-user-id="${escapeHtml(lic.user_id || '')}">Load in License Tab</button>
            <button class="btn sm yellow" data-row-action="extend30" data-user-id="${escapeHtml(lic.user_id || '')}">Extend 30 Days</button>
            <button class="btn sm ghost" data-copy="${escapeHtml(lic.user_id || '')}">Copy UID</button>
          </div>
        </div>
      `);
    });
    parts.push('</div>');
  }

  if (codes.length) {
    parts.push(`<div class="lookup-title mt-14">Access code matches: ${codes.length}</div>`);
    parts.push('<div class="lookup-list">');
    codes.slice(0, 10).forEach(c => {
      parts.push(`
        <div class="lookup-card">
          <strong class="mono green-text">${escapeHtml(c.code || '—')}</strong>
          <div class="muted-line">Notes: ${escapeHtml(c.notes || '—')}</div>
          <div class="muted-line">Used by: ${escapeHtml(c.used_by_email || c.used_by || c.user_id || '—')}</div>
        </div>
      `);
    });
    parts.push('</div>');
  }

  if (!parts.length) return '<div class="alert">No matching license or access code found.</div>';
  return parts.join('');
}

async function doLookup() {
  const btn = $('lookupBtn');
  const q = $('lookupInput').value.trim();
  if (!q) return showResult('lookupResult', 'Please enter a search value.', 'error');
  setButtonLoading(btn, true);
  try {
    const licenses = await findLicensesSmart(q);
    if (!state.codes.length) {
      try { await loadCodes(); } catch (_) {}
    }
    const codes = state.codes.filter(c => matchesCode(c, q));
    showResult('lookupResult', renderLookupResults(licenses, codes), 'info');
    addLog(`Lookup searched: ${q}`, 'green');
  } catch (err) {
    showResult('lookupResult', `❌ ${escapeHtml(err.message)}`, 'error');
  } finally {
    setButtonLoading(btn, false, '🔍 Search User');
  }
}

async function findDeviceUser() {
  const q = $('deviceSearchInput').value.trim();
  if (!q) return showResult('deviceFindResult', 'Please enter UID/name/phone/device ID.', 'error');
  const licenses = await findLicensesSmart(q);
  if (!licenses.length) return showResult('deviceFindResult', 'No license found for this search.', 'error');
  const lic = licenses[0];
  $('deviceUserId').value = lic.user_id || '';
  showResult('deviceFindResult', `✅ Selected: <strong>${escapeHtml(lic.full_name || lic.phone || lic.user_id)}</strong><br><span class="mono">${escapeHtml(lic.user_id || '')}</span>`, 'success');
}

async function doDeviceAction(action) {
  const userId = $('deviceUserId').value.trim();
  if (!userId) return showResult('deviceResult', 'Please find or paste a User ID first.', 'error');

  let patch = {};
  let msg = '';
  if (action === 'reset') {
    patch = { device_id: null };
    msg = 'Device reset. User can register/login on a new device.';
  } else if (action === 'nolock') {
    patch = { device_id: 'NO_LOCK' };
    msg = 'Device lock removed forever. User can login from any device.';
  } else if (action === 'set') {
    const manual = $('manualDeviceId').value.trim();
    if (!manual) return showResult('deviceResult', 'Enter a Device ID to set manually.', 'error');
    patch = { device_id: manual };
    msg = `Device ID set to ${escapeHtml(manual)}.`;
  } else if (action === 'block') {
    patch = { is_active: false };
    msg = 'License blocked.';
  }

  try {
    await patchLicenseByUserId(userId, patch);
    showResult('deviceResult', `✅ ${msg}`, 'success');
    addLog(`Device action ${action} for UID ${userId}`, action === 'block' ? 'red' : 'green');
    await loadLicenses();
  } catch (err) {
    showResult('deviceResult', `❌ ${escapeHtml(err.message)}`, 'error');
  }
}

async function findForManage() {
  const q = $('manageSearchInput').value.trim();
  if (!q) return showResult('manageFindResult', 'Please enter search value.', 'error');
  const licenses = await findLicensesSmart(q);
  if (!licenses.length) return showResult('manageFindResult', 'No license found. Paste User ID manually to create a new license.', 'error');
  fillLicenseForm(licenses[0]);
  showResult('manageFindResult', `✅ Loaded: <strong>${escapeHtml(licenses[0].full_name || licenses[0].phone || licenses[0].user_id)}</strong>`, 'success');
}

function clearLicenseForm() {
  ['licUserId', 'licFullName', 'licPhone', 'licNotes', 'manageSearchInput'].forEach(id => { if ($(id)) $(id).value = ''; });
  $('licPackage').value = 'pro';
  $('licDays').value = '30';
  hideResult('licResult');
  hideResult('manageFindResult');
}

function licenseFormPayload(includeExpiry = true) {
  const days = Math.max(1, Number($('licDays').value || 30));
  const payload = {
    user_id: $('licUserId').value.trim(),
    full_name: $('licFullName').value.trim() || null,
    phone: $('licPhone').value.trim() || null,
    package: $('licPackage').value,
    notes: $('licNotes').value.trim() || null,
    is_active: true
  };
  if (includeExpiry) payload.expires_at = new Date(Date.now() + days * 86400000).toISOString();
  return payload;
}

async function saveActivateLicense() {
  const payload = licenseFormPayload(true);
  if (!payload.user_id) return showResult('licResult', 'User ID is required.', 'error');
  try {
    const existing = await getLicenseByUserId(payload.user_id);
    if (existing.length) {
      const patch = { ...payload };
      delete patch.user_id;
      await patchLicenseByUserId(payload.user_id, patch);
      showResult('licResult', '✅ Existing license updated and activated.', 'success');
      addLog(`Updated and activated ${payload.user_id}`, 'green');
    } else {
      await createLicense(payload);
      showResult('licResult', '✅ New license created and activated.', 'success');
      addLog(`Created license ${payload.user_id}`, 'green');
    }
    await loadLicenses();
  } catch (err) {
    showResult('licResult', `❌ ${escapeHtml(err.message)}`, 'error');
  }
}

async function extendLicenseFromForm() {
  const userId = $('licUserId').value.trim();
  const days = Math.max(1, Number($('licDays').value || 30));
  if (!userId) return showResult('licResult', 'User ID is required.', 'error');
  try {
    const existing = await getLicenseByUserId(userId);
    if (!existing.length) return showResult('licResult', 'No license row found. Click Save + Activate first.', 'error');
    const current = existing[0];
    const base = current.expires_at && new Date(current.expires_at) > new Date() ? new Date(current.expires_at) : new Date();
    await patchLicenseByUserId(userId, {
      expires_at: new Date(base.getTime() + days * 86400000).toISOString(),
      package: $('licPackage').value,
      is_active: true
    });
    showResult('licResult', `✅ License extended by ${days} days.`, 'success');
    addLog(`Extended ${userId} by ${days} days`, 'green');
    await loadLicenses();
  } catch (err) {
    showResult('licResult', `❌ ${escapeHtml(err.message)}`, 'error');
  }
}

async function blockLicenseFromForm() {
  const userId = $('licUserId').value.trim();
  if (!userId) return showResult('licResult', 'User ID is required.', 'error');
  try {
    await patchLicenseByUserId(userId, { is_active: false });
    showResult('licResult', '🚫 License blocked.', 'error');
    addLog(`Blocked license ${userId}`, 'red');
    await loadLicenses();
  } catch (err) {
    showResult('licResult', `❌ ${escapeHtml(err.message)}`, 'error');
  }
}

async function rowAction(action, userId) {
  if (!userId) return;
  const lic = state.licenses.find(l => String(l.user_id) === String(userId)) || (await getLicenseByUserId(userId))[0];
  if (action === 'load') {
    if (lic) fillLicenseForm(lic);
    showPage('license');
    showResult('manageFindResult', `✅ Loaded UID: <span class="mono">${escapeHtml(userId)}</span>`, 'success');
    return;
  }
  try {
    if (action === 'extend30') {
      const base = lic && lic.expires_at && new Date(lic.expires_at) > new Date() ? new Date(lic.expires_at) : new Date();
      await patchLicenseByUserId(userId, { expires_at: new Date(base.getTime() + 30 * 86400000).toISOString(), is_active: true });
      addLog(`Extended ${userId} by 30 days`, 'green');
    } else if (action === 'reset') {
      await patchLicenseByUserId(userId, { device_id: null });
      addLog(`Reset device for ${userId}`, 'yellow');
    } else if (action === 'nolock') {
      await patchLicenseByUserId(userId, { device_id: 'NO_LOCK' });
      addLog(`Removed device lock for ${userId}`, 'green');
    } else if (action === 'toggle') {
      const st = lic ? licenseStatus(lic).key : 'active';
      await patchLicenseByUserId(userId, { is_active: st === 'inactive' ? true : false });
      addLog(`${st === 'inactive' ? 'Activated' : 'Blocked'} ${userId}`, st === 'inactive' ? 'green' : 'red');
    }
    await loadLicenses();
  } catch (err) {
    alert(`Action failed: ${err.message}`);
  }
}

function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  $('newCode').value = code;
}

async function createCode() {
  const code = $('newCode').value.trim().toUpperCase();
  const notes = $('newCodeNote').value.trim();
  if (!code) return showResult('codeResult', 'Please enter a code.', 'error');
  try {
    await sbFetch(codePath(''), {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ code, notes: notes || null, is_active: true })
    });
    $('newCode').value = '';
    $('newCodeNote').value = '';
    showResult('codeResult', `✅ Code <strong>${escapeHtml(code)}</strong> created.`, 'success');
    addLog(`Created access code ${code}`, 'green');
    await loadCodes();
  } catch (err) {
    showResult('codeResult', `❌ ${escapeHtml(err.message)}`, 'error');
  }
}

async function toggleCode(code, nextActive) {
  if (!code) return;
  try {
    await sbFetch(codePath(`?code=eq.${encodeURIComponent(code)}`), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_active: nextActive })
    });
    addLog(`${nextActive ? 'Reactivated' : 'Deactivated'} code ${code}`, nextActive ? 'green' : 'red');
    await loadCodes();
  } catch (err) {
    alert(`Code update failed: ${err.message}`);
  }
}

function loadSettingsIntoForm() {
  if ($('cfgUrl')) $('cfgUrl').value = 'server';
  if ($('cfgKey')) $('cfgKey').value = 'server';
  $('cfgLicTable').value = state.licTable;
  $('cfgCodeTable').value = state.codeTable;
  updateConnectionPill(state.authToken ? null : false, state.authToken ? 'Logged in' : 'Not logged in');
}

function saveSettings() {
  state.licTable = tableName($('cfgLicTable').value || 'licenses');
  state.codeTable = tableName($('cfgCodeTable').value || 'access_codes');
  localStorage.setItem('lic_table', state.licTable);
  localStorage.setItem('code_table', state.codeTable);
  updateConnectionPill(null, 'Table names saved');
  showResult('configResult', '✅ Table names saved. Supabase credentials are stored on the server.', 'success');
}

async function testConnection() {
  saveSettings();
  const btn = $('testConnectionBtn');
  setButtonLoading(btn, true);
  try {
    const lic = await sbFetch(licPath('?select=*&limit=1'));
    const codes = await sbFetch(codePath('?select=*&limit=1'));
    updateConnectionPill(true, 'Connected');
    showResult('configResult', `✅ Connection OK.<br>Licenses table readable: <strong>${Array.isArray(lic) ? 'Yes' : 'Unknown'}</strong><br>Access codes table readable: <strong>${Array.isArray(codes) ? 'Yes' : 'Unknown'}</strong>`, 'success');
    addLog('Supabase connection tested successfully', 'green');
  } catch (err) {
    updateConnectionPill(false);
    showResult('configResult', `❌ Connection failed: ${escapeHtml(err.message)}<br><br>If your Supabase dashboard shows rows but this panel shows 0/error, use admin/service-role key for this private admin panel or fix RLS policies.`, 'error');
  } finally {
    setButtonLoading(btn, false, '🧪 Test Connection');
  }
}


async function loginAdmin() {
  const password = $('adminPassword')?.value || '';
  if (!password.trim()) return showResult('loginResult', 'Please enter the admin password.', 'error');
  const btn = $('loginBtn');
  setButtonLoading(btn, true, '🔐 Login');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw new Error(data.message || 'Login failed');
    state.authToken = data.token;
    localStorage.setItem('admin_token', state.authToken);
    hideResult('loginResult');
    showApp();
    startApp();
  } catch (err) {
    showResult('loginResult', `❌ ${escapeHtml(err.message)}`, 'error');
  } finally {
    setButtonLoading(btn, false, '🔐 Login');
  }
}

function logoutAdmin(showLoginAgain = true) {
  state.authToken = '';
  localStorage.removeItem('admin_token');
  updateConnectionPill(false, 'Logged out');
  if (showLoginAgain) {
    $('appShell')?.classList.add('hidden');
    $('loginScreen')?.classList.remove('hidden');
  }
}

function showApp() {
  $('loginScreen')?.classList.add('hidden');
  $('appShell')?.classList.remove('hidden');
}

function bindLoginEvents() {
  $('loginBtn')?.addEventListener('click', loginAdmin);
  $('adminPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginAdmin(); });
  $('logoutBtn')?.addEventListener('click', () => logoutAdmin(true));
}

async function copyToClipboard(value) {
  const text = String(value || '');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    addLog(`Copied: ${shortId(text, 16)}`, 'green');
  } catch (_) {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }
}

function bindEvents() {
  if (state.eventsBound) return;
  state.eventsBound = true;
  document.querySelectorAll('[data-page], [data-page-shortcut]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page || btn.dataset.pageShortcut));
  });

  $('dashboardRefreshBtn')?.addEventListener('click', loadLicenses);
  $('dashboardSearch')?.addEventListener('input', renderDashboard);
  $('lookupBtn')?.addEventListener('click', doLookup);
  $('lookupInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLookup(); });

  $('deviceFindBtn')?.addEventListener('click', findDeviceUser);
  $('deviceSearchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') findDeviceUser(); });
  document.querySelectorAll('[data-device-action]').forEach(btn => {
    btn.addEventListener('click', () => doDeviceAction(btn.dataset.deviceAction));
  });

  $('manageFindBtn')?.addEventListener('click', findForManage);
  $('manageSearchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') findForManage(); });
  $('saveActivateBtn')?.addEventListener('click', saveActivateLicense);
  $('extendLicenseBtn')?.addEventListener('click', extendLicenseFromForm);
  $('blockLicenseBtn')?.addEventListener('click', blockLicenseFromForm);
  $('clearLicenseFormBtn')?.addEventListener('click', clearLicenseForm);

  $('refreshCodesBtn')?.addEventListener('click', loadCodes);
  $('createCodeBtn')?.addEventListener('click', createCode);
  $('generateCodeBtn')?.addEventListener('click', generateRandomCode);
  $('codeSearch')?.addEventListener('input', renderCodes);

  $('saveConfigBtn')?.addEventListener('click', saveSettings);
  $('testConnectionBtn')?.addEventListener('click', testConnection);

  document.body.addEventListener('click', event => {
    const rowBtn = event.target.closest('[data-row-action]');
    if (rowBtn) {
      rowAction(rowBtn.dataset.rowAction, rowBtn.dataset.userId);
      return;
    }
    const codeBtn = event.target.closest('[data-code-toggle]');
    if (codeBtn) {
      toggleCode(codeBtn.dataset.codeToggle, codeBtn.dataset.nextActive === 'true');
      return;
    }
    const copyBtn = event.target.closest('[data-copy]');
    if (copyBtn) {
      copyToClipboard(copyBtn.dataset.copy);
    }
  });
}

function startApp() {
  loadSettingsIntoForm();
  bindEvents();
  renderActivity();
  loadLicenses();
}

function init() {
  bindLoginEvents();
  if (state.authToken) {
    showApp();
    startApp();
  } else {
    $('appShell')?.classList.add('hidden');
    $('loginScreen')?.classList.remove('hidden');
  }
}

init();
