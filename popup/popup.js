/* ─────────────────────────────────────────
   VOK Cookies – Popup Script
───────────────────────────────────────── */

'use strict';

// ── State ────────────────────────────────
let currentTab    = null;
let currentUrl    = '';
let currentDomain = '';
let cookies       = [];
let profiles      = {};
let importPayload = null;  // { type: 'cookies'|'profiles', data }

// ── Init ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => init());

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    currentUrl = tab.url || '';

    try {
      const parsed  = new URL(currentUrl);
      currentDomain = parsed.hostname;
    } catch {
      currentDomain = 'unknown';
    }

    document.getElementById('currentDomain').textContent = currentDomain || 'unknown';

    await loadCookies();
    await loadProfiles();
    setupListeners();
  } catch (err) {
    showToast('Failed to initialize: ' + err.message, 'error');
  }
}

// ── Data loaders ─────────────────────────
async function loadCookies() {
  try {
    cookies = await chrome.cookies.getAll({ url: currentUrl });
  } catch {
    cookies = [];
  }
  renderCookies();
  updateBadge('cookieCount', cookies.length);
}

async function loadProfiles() {
  const stored = await chrome.storage.local.get('profiles');
  profiles = stored.profiles || {};
  renderProfiles();
  updateBadge('profileCount', Object.keys(profiles).length);
}

// ── Tab navigation ────────────────────────
function setupListeners() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadCookies();
    showToast('Cookies refreshed', 'success');
  });

  // ── Cookies tab
  document.getElementById('cookieSearch').addEventListener('input', e => filterCookies(e.target.value));
  document.getElementById('addCookieBtn').addEventListener('click', () => toggleForm('addCookieForm'));
  document.getElementById('cancelAddBtn').addEventListener('click', () => hideForm('addCookieForm'));
  document.getElementById('saveNewCookieBtn').addEventListener('click', saveNewCookie);

  // ── Profiles tab
  document.getElementById('saveProfileBtn').addEventListener('click', () => toggleForm('saveProfileForm'));
  document.getElementById('cancelProfileBtn').addEventListener('click', () => hideForm('saveProfileForm'));
  document.getElementById('confirmSaveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('profileNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProfile();
  });

  // ── Transfer tab
  document.getElementById('exportCurrentBtn').addEventListener('click', exportCurrentCookies);
  document.getElementById('exportProfilesBtn').addEventListener('click', exportProfiles);
  document.getElementById('importCookiesFile').addEventListener('change', e => handleImportFile(e, 'cookies'));
  document.getElementById('importProfilesFile').addEventListener('change', e => handleImportFile(e, 'profiles'));
  document.getElementById('cancelImportBtn').addEventListener('click', cancelImport);
  document.getElementById('confirmImportBtn').addEventListener('click', applyImport);
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
}

// ── Cookie rendering ──────────────────────
function renderCookies(filter = '') {
  const list = document.getElementById('cookieList');
  const empty = document.getElementById('cookiesEmpty');
  const q = filter.toLowerCase();

  const filtered = cookies.filter(c =>
    !q || c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = filtered.map((c, i) => cookieItemHTML(c, i)).join('');

  // Bind item events
  list.querySelectorAll('.cookie-item-header').forEach(hdr => {
    hdr.addEventListener('click', () => toggleCookieItem(hdr.closest('.cookie-item')));
  });

  list.querySelectorAll('[data-action="copy-value"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); copyToClipboard(btn.dataset.value); });
  });

  list.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); startEditCookie(btn.dataset.name); });
  });

  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteCookie(btn.dataset.name); });
  });

  list.querySelectorAll('[data-action="save-edit"]').forEach(btn => {
    btn.addEventListener('click', () => saveEditCookie(btn.dataset.name));
  });

  list.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => {
    btn.addEventListener('click', () => cancelEditCookie(btn.dataset.name));
  });
}

function cookieItemHTML(c, idx) {
  const expiry = c.expirationDate
    ? new Date(c.expirationDate * 1000).toLocaleString()
    : 'Session';

  const flags = [
    c.secure   ? '<span class="flag-badge flag-secure">Secure</span>' : '',
    c.httpOnly ? '<span class="flag-badge flag-http">HttpOnly</span>' : '',
    !c.expirationDate ? '<span class="flag-badge flag-session">Session</span>' : '',
  ].join('');

  const valuePreview = c.value.length > 40 ? c.value.slice(0, 40) + '…' : c.value;

  return `
  <div class="cookie-item" data-name="${escHtml(c.name)}">
    <div class="cookie-item-header">
      <span class="cookie-name">${escHtml(c.name)}</span>
      <span class="cookie-value-preview">${escHtml(valuePreview || '(empty)')}</span>
      <div class="cookie-flags">${flags}</div>
      <svg class="cookie-expand-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>

    <div class="cookie-details">
      <div class="detail-grid">
        <span class="detail-key">Name</span>
        <span class="detail-val">${escHtml(c.name)}</span>
        <span class="detail-key">Value</span>
        <span class="detail-val" style="display:flex;align-items:flex-start;gap:6px;">
          <span style="flex:1;word-break:break-all;">${escHtml(c.value || '(empty)')}</span>
          <button class="copy-btn" data-action="copy-value" data-value="${escAttr(c.value)}" title="Copy value">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </span>
        <span class="detail-key">Domain</span>
        <span class="detail-val">${escHtml(c.domain)}</span>
        <span class="detail-key">Path</span>
        <span class="detail-val">${escHtml(c.path)}</span>
        <span class="detail-key">Expires</span>
        <span class="detail-val">${escHtml(expiry)}</span>
        <span class="detail-key">SameSite</span>
        <span class="detail-val">${escHtml(c.sameSite || 'unspecified')}</span>
      </div>
      <div class="detail-actions">
        <button class="btn btn-ghost btn-xs" data-action="edit" data-name="${escAttr(c.name)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>
        <button class="btn btn-danger btn-xs" data-action="delete" data-name="${escAttr(c.name)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Delete
        </button>
      </div>
    </div>

    <!-- Inline edit form -->
    <div class="cookie-edit-form">
      <div class="form-row">
        <div class="field">
          <label class="field-label">Name</label>
          <input class="form-input" id="edit-name-${escAttr(c.name)}" value="${escAttr(c.name)}" />
        </div>
        <div class="field">
          <label class="field-label">Value</label>
          <input class="form-input" id="edit-value-${escAttr(c.name)}" value="${escAttr(c.value)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">Path</label>
          <input class="form-input" id="edit-path-${escAttr(c.name)}" value="${escAttr(c.path)}" />
        </div>
        <div class="field">
          <label class="field-label">Expires (days, blank = session)</label>
          <input type="number" class="form-input" id="edit-expiry-${escAttr(c.name)}"
            value="${c.expirationDate ? Math.max(0, Math.round((c.expirationDate - Date.now()/1000) / 86400)) : ''}" />
        </div>
      </div>
      <div class="form-row flags-row">
        <label class="toggle-label">
          <input type="checkbox" id="edit-secure-${escAttr(c.name)}" ${c.secure ? 'checked' : ''} />
          <span class="toggle-pill"></span> Secure
        </label>
        <label class="toggle-label">
          <input type="checkbox" id="edit-httponly-${escAttr(c.name)}" ${c.httpOnly ? 'checked' : ''} />
          <span class="toggle-pill"></span> HttpOnly
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-xs" data-action="cancel-edit" data-name="${escAttr(c.name)}">Cancel</button>
        <button class="btn btn-primary btn-xs" data-action="save-edit" data-name="${escAttr(c.name)}">Save</button>
      </div>
    </div>
  </div>`;
}

function toggleCookieItem(item) {
  const isExpanded = item.classList.contains('expanded');
  // Collapse all others
  document.querySelectorAll('.cookie-item.expanded').forEach(el => {
    if (el !== item) el.classList.remove('expanded');
  });
  item.classList.toggle('expanded', !isExpanded);
}

function filterCookies(q) {
  renderCookies(q);
}

// ── Cookie CRUD ───────────────────────────
async function saveNewCookie() {
  const name    = document.getElementById('newName').value.trim();
  const value   = document.getElementById('newValue').value;
  const path    = document.getElementById('newPath').value.trim() || '/';
  const expDays = document.getElementById('newExpiry').value;
  const secure  = document.getElementById('newSecure').checked;
  const httpOnly= document.getElementById('newHttpOnly').checked;
  const sameSiteStrict = document.getElementById('newSameSite').checked;

  if (!name) { showToast('Cookie name is required', 'error'); return; }

  const cookieData = {
    url:      currentUrl,
    name,
    value,
    path,
    secure,
    httpOnly,
    sameSite: sameSiteStrict ? 'strict' : 'lax',
  };

  if (expDays !== '') {
    cookieData.expirationDate = Math.floor(Date.now() / 1000) + parseInt(expDays, 10) * 86400;
  }

  try {
    await chrome.cookies.set(cookieData);
    hideForm('addCookieForm');
    clearNewCookieForm();
    await loadCookies();
    showToast(`Cookie "${name}" saved`, 'success');
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}

function clearNewCookieForm() {
  ['newName','newValue','newPath','newExpiry'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['newSecure','newHttpOnly','newSameSite'].forEach(id => {
    document.getElementById(id).checked = false;
  });
}

async function deleteCookie(name) {
  try {
    await chrome.cookies.remove({ url: currentUrl, name });
    await loadCookies();
    showToast(`"${name}" deleted`, 'success');
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

function startEditCookie(name) {
  const item = document.querySelector(`.cookie-item[data-name="${CSS.escape(name)}"]`);
  if (!item) return;
  item.classList.add('expanded', 'editing');
}

function cancelEditCookie(name) {
  const item = document.querySelector(`.cookie-item[data-name="${CSS.escape(name)}"]`);
  if (!item) return;
  item.classList.remove('editing');
}

async function saveEditCookie(originalName) {
  const escape = CSS.escape(originalName);
  const name     = document.getElementById(`edit-name-${escape}`)?.value.trim();
  const value    = document.getElementById(`edit-value-${escape}`)?.value ?? '';
  const path     = document.getElementById(`edit-path-${escape}`)?.value.trim() || '/';
  const expDays  = document.getElementById(`edit-expiry-${escape}`)?.value;
  const secure   = document.getElementById(`edit-secure-${escape}`)?.checked;
  const httpOnly = document.getElementById(`edit-httponly-${escape}`)?.checked;

  if (!name) { showToast('Name cannot be empty', 'error'); return; }

  try {
    // Remove old if name changed
    if (name !== originalName) {
      await chrome.cookies.remove({ url: currentUrl, name: originalName });
    }

    const cookieData = { url: currentUrl, name, value, path, secure, httpOnly };
    if (expDays !== '') {
      cookieData.expirationDate = Math.floor(Date.now() / 1000) + parseInt(expDays, 10) * 86400;
    }

    await chrome.cookies.set(cookieData);
    await loadCookies();
    showToast(`Cookie updated`, 'success');
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

// ── Profiles ──────────────────────────────
async function saveProfile() {
  const name = document.getElementById('profileNameInput').value.trim();
  if (!name) { showToast('Profile name is required', 'error'); return; }

  const id = 'p_' + Date.now();
  profiles[id] = {
    id,
    name,
    domain: currentDomain,
    savedAt: new Date().toISOString(),
    cookies: JSON.parse(JSON.stringify(cookies)),
  };

  await chrome.storage.local.set({ profiles });
  hideForm('saveProfileForm');
  document.getElementById('profileNameInput').value = '';
  renderProfiles();
  updateBadge('profileCount', Object.keys(profiles).length);
  showToast(`Profile "${name}" saved`, 'success');
}

function renderProfiles() {
  const list  = document.getElementById('profileList');
  const empty = document.getElementById('profilesEmpty');
  const keys  = Object.keys(profiles);

  if (keys.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = keys.map(id => profileCardHTML(profiles[id])).join('');

  list.querySelectorAll('[data-action="load-profile"]').forEach(btn => {
    btn.addEventListener('click', () => loadProfile(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="delete-profile"]').forEach(btn => {
    btn.addEventListener('click', () => deleteProfile(btn.dataset.id));
  });
}

function profileCardHTML(p) {
  const date   = new Date(p.savedAt).toLocaleDateString();
  const count  = p.cookies.length;
  const initials = p.name.slice(0, 2).toUpperCase();

  return `
  <div class="profile-card">
    <div class="profile-avatar">${escHtml(initials)}</div>
    <div class="profile-info">
      <div class="profile-name">${escHtml(p.name)}</div>
      <div class="profile-meta">
        <span>${escHtml(p.domain)}</span>
        <span>·</span>
        <span>${count} cookie${count !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>${date}</span>
      </div>
    </div>
    <div class="profile-actions">
      <button class="btn btn-primary btn-xs" data-action="load-profile" data-id="${escAttr(p.id)}" title="Load into current tab">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="5 12 3 12 12 3 21 12 19 12"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>
        </svg>
        Load
      </button>
      <button class="btn btn-danger btn-xs" data-action="delete-profile" data-id="${escAttr(p.id)}" title="Delete profile">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  </div>`;
}

async function loadProfile(id) {
  const profile = profiles[id];
  if (!profile) return;

  let applied = 0, failed = 0;

  for (const c of profile.cookies) {
    try {
      const cookieData = {
        url:      currentUrl,
        name:     c.name,
        value:    c.value,
        path:     c.path || '/',
        secure:   c.secure || false,
        httpOnly: c.httpOnly || false,
      };
      if (c.sameSite && c.sameSite !== 'unspecified') {
        cookieData.sameSite = c.sameSite;
      }
      if (c.expirationDate && c.expirationDate > Date.now() / 1000) {
        cookieData.expirationDate = c.expirationDate;
      }
      await chrome.cookies.set(cookieData);
      applied++;
    } catch {
      failed++;
    }
  }

  await loadCookies();
  switchTab('cookies');
  const msg = failed > 0
    ? `Applied ${applied}, failed ${failed} cookies`
    : `Profile "${profile.name}" applied (${applied} cookies)`;
  showToast(msg, failed > 0 ? 'error' : 'success');
}

async function deleteProfile(id) {
  const name = profiles[id]?.name;
  delete profiles[id];
  await chrome.storage.local.set({ profiles });
  renderProfiles();
  updateBadge('profileCount', Object.keys(profiles).length);
  showToast(`Profile "${name}" deleted`, 'success');
}

// ── Export ────────────────────────────────
function exportCurrentCookies() {
  if (cookies.length === 0) {
    showToast('No cookies to export', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(cookies, null, 2)], { type: 'application/json' });
  const ts   = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `cookies_${currentDomain}_${ts}.json`);
  showToast(`Exported ${cookies.length} cookies`, 'success');
}

function exportProfiles() {
  const keys = Object.keys(profiles);
  if (keys.length === 0) {
    showToast('No profiles to export', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify({ __type: 'vok-profiles', profiles }, null, 2)], { type: 'application/json' });
  const ts   = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `profiles_${ts}.json`);
  showToast(`Exported ${keys.length} profile${keys.length !== 1 ? 's' : ''}`, 'success');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────
function handleImportFile(e, type) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (type === 'cookies') {
        if (!Array.isArray(data)) throw new Error('Expected an array of cookies');
        importPayload = { type: 'cookies', data };
        showImportPreview(data.map(c => ({ name: c.name, value: c.value })));
      } else {
        // profiles file
        const raw = data.__type === 'vok-profiles' ? data.profiles : data;
        if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid profiles file');
        importPayload = { type: 'profiles', data: raw };
        const items = Object.values(raw).map(p => ({ name: p.name, value: `${p.cookies.length} cookies · ${p.domain}` }));
        showImportPreview(items);
      }
    } catch (err) {
      showToast('Invalid file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function showImportPreview(items) {
  const preview = document.getElementById('importPreview');
  const list    = document.getElementById('previewList');

  list.innerHTML = items.slice(0, 50).map(item => `
    <div class="preview-item">
      <span class="preview-item-name">${escHtml(item.name)}</span>
      <span class="preview-item-val">${escHtml(item.value)}</span>
    </div>
  `).join('');

  if (items.length > 50) {
    list.innerHTML += `<div class="preview-item" style="color:var(--text-muted);font-size:10px;">…and ${items.length - 50} more</div>`;
  }

  preview.classList.remove('hidden');
  document.getElementById('confirmImportBtn').textContent =
    importPayload?.type === 'profiles' ? 'Import Profiles' : 'Apply Cookies';
}

function cancelImport() {
  importPayload = null;
  document.getElementById('importPreview').classList.add('hidden');
}

async function applyImport() {
  if (!importPayload) return;

  if (importPayload.type === 'cookies') {
    let applied = 0, failed = 0;
    for (const c of importPayload.data) {
      try {
        const cookieData = {
          url:      currentUrl,
          name:     c.name,
          value:    c.value,
          path:     c.path || '/',
          secure:   c.secure || false,
          httpOnly: c.httpOnly || false,
        };
        if (c.sameSite && c.sameSite !== 'unspecified') cookieData.sameSite = c.sameSite;
        if (c.expirationDate && c.expirationDate > Date.now() / 1000) cookieData.expirationDate = c.expirationDate;
        await chrome.cookies.set(cookieData);
        applied++;
      } catch { failed++; }
    }
    cancelImport();
    await loadCookies();
    switchTab('cookies');
    showToast(failed > 0 ? `Applied ${applied}, failed ${failed}` : `${applied} cookies imported`, failed > 0 ? 'error' : 'success');

  } else if (importPayload.type === 'profiles') {
    const incoming = importPayload.data;
    const merged   = { ...profiles };
    let count = 0;
    for (const [id, p] of Object.entries(incoming)) {
      // Avoid ID collision
      const newId = profiles[id] ? 'p_' + Date.now() + '_' + count : id;
      merged[newId] = { ...p, id: newId };
      count++;
    }
    profiles = merged;
    await chrome.storage.local.set({ profiles });
    cancelImport();
    renderProfiles();
    updateBadge('profileCount', Object.keys(profiles).length);
    switchTab('profiles');
    showToast(`${count} profile${count !== 1 ? 's' : ''} imported`, 'success');
  }
}

// ── UI helpers ────────────────────────────
function toggleForm(id) {
  const el = document.getElementById(id);
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    const first = el.querySelector('input[type="text"]');
    if (first) first.focus();
  }
}

function hideForm(id) {
  document.getElementById(id).classList.add('hidden');
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (el) el.textContent = count;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    ()  => showToast('Copied!', 'success'),
    ()  => showToast('Copy failed', 'error'),
  );
}

// ── Toast ──────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toastIcon');
  const msg   = document.getElementById('toastMessage');

  icon.textContent = type === 'success' ? '✓' : '✕';
  msg.textContent  = message;
  toast.className  = `toast ${type} show`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

// ── Escape helpers ────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
