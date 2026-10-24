'use strict';

import { t, setLangState, applyDomTranslations } from '../src/i18n.js';
import {
  escHtml,
  escAttr,
  plural,
  downloadText,
  domainInitial,
  isSessionCookie,
  isExpiredCookie,
  expLabel,
  expLong,
  relativeTime,
} from '../src/utils.js';
import { annotateTracking, isTrackingCookie } from '../src/trackers.js';
import { computeSecurityScore, buildSecurityRows } from '../src/security.js';
import {
  EXPORT_FORMATS,
  serializeCookies,
  filterExportList,
  parseImport,
  fileMeta,
} from '../src/formats.js';
import {
  getProfiles,
  setProfiles,
  getProtectedNames,
  setProtectedNames,
  getLang as loadLang,
  setLang as saveLang,
  getActiveProfileId,
  setActiveProfileId,
} from '../src/storage.js';
import {
  getTabCookies,
  setCookieOnUrl,
  removeCookieOnUrl,
  applyCookies,
  removeCookies,
} from '../src/cookies-api.js';

/* ── State ──────────────────────────────── */
const state = {
  tab: 'cookies',
  filter: 'all',
  query: '',
  expandedKey: null,
  cookies: [],
  profiles: {},
  protected: new Set(),
  activeProfileId: null,
  modal: null, // export | clear | import | security | protected | edit | saveProfile
  exportFormat: 'json',
  exportScope: 'site',
  optHttpOnly: true,
  optExpired: false,
  backup: true,
  importMode: 'merge',
  importPayload: null,
  clearMode: 'all', // all | one
  targetName: null,
  editCookie: null,
  drag: null, // valid | invalid | null
  dropErrorName: '',
};

let currentTab = null;
let currentUrl = '';
let currentDomain = '';
let isHttps = true;
let toastTimer = null;

/* ── Boot ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => init());

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    currentUrl = tab?.url || '';
    try {
      const parsed = new URL(currentUrl);
      currentDomain = parsed.hostname;
      isHttps = parsed.protocol === 'https:';
    } catch {
      currentDomain = 'unknown';
      isHttps = false;
    }

    setLangState(await loadLang());
    applyDomTranslations();

    state.profiles = await getProfiles();
    state.protected = await getProtectedNames(currentDomain);
    state.activeProfileId = await getActiveProfileId();

    document.getElementById('currentDomain').textContent = currentDomain;
    setSiteFavicon(tab);

    await refreshCookies();
    bindGlobal();
    render();
  } catch (err) {
    showToast(t('initFailed', { s: err.message }), 'error');
  }
}

async function refreshCookies() {
  const raw = await getTabCookies(currentUrl);
  state.cookies = annotateTracking(raw).map((c) => ({
    ...c,
    protected: state.protected.has(c.name),
    tracking: isTrackingCookie(c),
  }));
}

/* ── Favicon ────────────────────────────── */
function faviconCandidates(tab) {
  const urls = [];
  if (tab?.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    urls.push(tab.favIconUrl);
  }
  try {
    const origin = new URL(currentUrl).origin;
    urls.push(`${origin}/favicon.ico`);
    urls.push(`${origin}/favicon.png`);
  } catch {
    /* ignore */
  }
  if (currentDomain && currentDomain !== 'unknown') {
    const host = currentDomain.replace(/^www\./, '');
    urls.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    urls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`);
  }
  return [...new Set(urls)];
}

function showFaviconFallback() {
  const avatar = document.getElementById('siteAvatar');
  const img = document.getElementById('siteFavicon');
  const letter = document.getElementById('siteAvatarLetter');
  if (!avatar || !img || !letter) return;
  avatar.classList.remove('has-favicon');
  img.classList.add('hidden');
  img.removeAttribute('src');
  letter.textContent = domainInitial(currentDomain);
  avatar.title = currentDomain || '';
}

function setSiteFavicon(tab) {
  const avatar = document.getElementById('siteAvatar');
  const img = document.getElementById('siteFavicon');
  const letter = document.getElementById('siteAvatarLetter');
  if (!avatar || !img || !letter) return;

  letter.textContent = domainInitial(currentDomain);
  avatar.title = currentDomain || '';
  avatar.classList.remove('has-favicon');
  img.classList.add('hidden');

  const candidates = faviconCandidates(tab);
  if (!candidates.length) return;

  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) {
      showFaviconFallback();
      return;
    }
    const url = candidates[i++];
    img.onload = () => {
      // Reject tiny/blank placeholders (1x1)
      if (img.naturalWidth < 2 || img.naturalHeight < 2) {
        tryNext();
        return;
      }
      avatar.classList.add('has-favicon');
      img.classList.remove('hidden');
      avatar.title = currentDomain || '';
    };
    img.onerror = () => tryNext();
    img.src = url;
  };
  tryNext();
}

/* ── Events ─────────────────────────────── */
function bindGlobal() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      state.expandedKey = null;
      closeModal();
      render();
    });
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset.lang === 'km' ? 'km' : 'en';
      setLangState(lang);
      await saveLang(lang);
      applyDomTranslations();
      render();
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTab = tab;
      setSiteFavicon(tab);
    }
    await refreshCookies();
    render();
    showToast(t('cookiesRefreshed'), 'success');
  });

  document.getElementById('siteAvatar')?.addEventListener('click', () => {
    if (!currentDomain || currentDomain === 'unknown') return;
    const href = (currentUrl && /^https?:/i.test(currentUrl))
      ? new URL(currentUrl).origin
      : `https://${currentDomain}`;
    chrome.tabs.create({ url: href });
  });

  document.getElementById('cookieSearch').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderCookiesOnly();
  });

  document.getElementById('openExportBtn').addEventListener('click', () => openModal('export'));
  document.getElementById('toolsExportBtn').addEventListener('click', () => openModal('export'));
  document.getElementById('scorePill').addEventListener('click', () => openModal('security'));
  document.getElementById('openSaveProfileBtn').addEventListener('click', () => openModal('saveProfile'));
  document.getElementById('openProtectedBtn').addEventListener('click', () => openModal('protected'));
  const openClearAll = () => {
    state.clearMode = 'all';
    state.targetName = null;
    openModal('clear');
  };
  document.getElementById('clearAllBtn')?.addEventListener('click', openClearAll);
  document.getElementById('clearAllQuickBtn')?.addEventListener('click', openClearAll);
  document.getElementById('cleanExpiredBtn').addEventListener('click', cleanExpired);
  document.getElementById('cleanTrackersBtn').addEventListener('click', cleanTrackers);
  document.getElementById('copyAllBtn').addEventListener('click', copyAll);

  document.getElementById('importFileQuick').addEventListener('change', onPickFile);
  document.getElementById('importFileTools').addEventListener('change', onPickFile);
  document.getElementById('scrim').addEventListener('click', closeModal);

  setupDragDrop();
}

let dropErrorTimer = null;

function setupDragDrop() {
  const app = document.getElementById('app');
  let dragDepth = 0;

  const setDragState = (mode, fileName = '') => {
    clearTimeout(dropErrorTimer);
    state.drag = mode;
    state.dropErrorName = fileName || '';
    renderDrag();
  };

  app.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    const ok = isDragTypeOk(e.dataTransfer);
    setDragState(ok ? 'valid' : 'invalid');
  });
  app.addEventListener('dragover', (e) => {
    e.preventDefault();
    const ok = isDragTypeOk(e.dataTransfer);
    e.dataTransfer.dropEffect = ok ? 'copy' : 'none';
    if (state.drag !== (ok ? 'valid' : 'invalid')) {
      setDragState(ok ? 'valid' : 'invalid');
    }
  });
  app.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragState(null);
  });
  app.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    const file = e.dataTransfer.files?.[0];
    if (!file) {
      setDragState(null);
      return;
    }
    if (!isImportableName(file.name)) {
      setDragState('invalid', file.name);
      showToast(t('dropJsonFile'), 'error');
      dropErrorTimer = setTimeout(() => setDragState(null), 1800);
      return;
    }
    setDragState(null);
    readImportFile(file);
  });
}

/** Best-effort type check while dragging (filename often unavailable until drop). */
function isDragTypeOk(dt) {
  if (!dt) return true;
  const items = dt.items ? [...dt.items] : [];
  const fileItems = items.filter((i) => i.kind === 'file');
  if (fileItems.length) {
    return fileItems.some((item) => {
      const type = String(item.type || '').toLowerCase();
      if (!type) return true; // browser withheld MIME — show valid until drop
      return (
        type.includes('json') ||
        type === 'text/plain' ||
        type === 'text/csv' ||
        type.startsWith('text/')
      );
    });
  }
  const types = dt.types ? [...dt.types] : [];
  return types.includes('Files') || types.includes('application/json') || types.includes('text/plain');
}

function isImportableName(name) {
  const n = String(name || '').toLowerCase();
  return n.endsWith('.json') || n.endsWith('.txt');
}

function onPickFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) readImportFile(file);
}

function sizeText(bytes) {
  if (bytes == null) return '';
  return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB';
}

function readImportFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast(t('fileTooLarge'), 'error');
    return;
  }
  if (!isImportableName(file.name)) {
    showToast(t('dropJsonFile'), 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseImport(reader.result);
    if (!parsed) {
      showToast(t('invalidFile', { s: t('fileNotCookieExport') }), 'error');
      return;
    }
    state.importPayload = {
      ...parsed,
      name: file.name,
      size: file.size,
    };
    state.importMode = 'merge';
    openModal('import');
  };
  reader.onerror = () => showToast(t('invalidFile', { s: 'read error' }), 'error');
  reader.readAsText(file);
}

/* ── Modal helpers ──────────────────────── */
function openModal(name) {
  state.modal = name;
  render();
}

function closeModal() {
  state.modal = null;
  state.importPayload = null;
  state.editCookie = null;
  render();
}

/* ── Render ─────────────────────────────── */
function render() {
  applyDomTranslations();
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === 'tab-' + state.tab);
  });

  const stats = computeSecurityScore(state.cookies, { isHttps });
  updateSiteCard(stats);
  updateToolsMeta(stats);
  renderFilters(stats);
  renderCookiesOnly();
  renderProfiles();
  renderSheet(stats);
  renderDrag();
}

function renderCookiesOnly() {
  const list = document.getElementById('cookieList');
  const empty = document.getElementById('cookiesEmpty');
  const q = state.query.trim().toLowerCase();
  const visible = state.cookies.filter((c) => {
    const matchF =
      state.filter === 'all'
        ? true
        : state.filter === 'session'
          ? isSessionCookie(c)
          : state.filter === 'secure'
            ? c.secure
            : c.tracking;
    const matchQ =
      !q ||
      c.name.toLowerCase().includes(q) ||
      String(c.value || '').toLowerCase().includes(q);
    return matchF && matchQ;
  });

  if (!visible.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = visible.map((c) => cookieRowHTML(c)).join('');

  list.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      state.expandedKey = state.expandedKey === key ? null : key;
      renderCookiesOnly();
    });
  });
  list.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCookieAction(btn.dataset.act, btn.dataset.name, btn);
    });
  });
}

function cookieRowHTML(c) {
  const key = c.name;
  const open = state.expandedKey === key;
  const expired = isExpiredCookie(c);
  const preview =
    String(c.value || '').length > 38
      ? String(c.value).slice(0, 38) + '…'
      : c.value || '(empty)';

  return `
  <div class="cookie-row${open ? ' expanded' : ''}">
    <button type="button" class="cookie-header" data-toggle="${escAttr(key)}" aria-expanded="${open}">
      <div class="cookie-main">
        <div class="cookie-name-row">
          <span class="cookie-name">${escHtml(c.name)}</span>
          ${c.protected ? `<svg style="color:var(--ok)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Protected"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>` : ''}
        </div>
        <div class="cookie-preview">${escHtml(preview)}</div>
      </div>
      ${c.tracking ? `<span class="badge-track">Tracking</span>` : ''}
      <span class="cookie-meta${expired ? ' expired' : ''}">${escHtml(expLabel(c))}</span>
      <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
    </button>
    ${
      open
        ? `<div class="cookie-detail">
      <div style="display:flex;align-items:center;gap:8px;padding:0 2px">
        <span class="detail-expires">${escHtml(expLong(c))}</span>
      </div>
      <div class="flag-pills">
        <span class="flag-pill${c.secure ? ' on' : ''}">Secure</span>
        <span class="flag-pill${c.httpOnly ? ' on' : ''}">HttpOnly</span>
        <span class="flag-pill">${escHtml(c.sameSite || 'unspecified')}</span>
        <span class="flag-pill">${escHtml(c.path || '/')}</span>
      </div>
      <div class="value-box">${escHtml(c.value || '(empty)')}</div>
      <div class="detail-actions">
        <button type="button" class="detail-act copy-btn" data-act="copy" data-name="${escAttr(c.name)}">
          <span class="copy-btn-icon" aria-hidden="true">
            <svg class="icon-copy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
            <svg class="icon-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
          </span>
          ${t('copy')}
        </button>
        <button type="button" class="detail-act" data-act="edit" data-name="${escAttr(c.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          ${t('edit')}
        </button>
        <button type="button" class="detail-act" data-act="protect" data-name="${escAttr(c.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>
          ${c.protected ? t('unprotect') : t('protect')}
        </button>
        <button type="button" class="detail-act danger" data-act="delete" data-name="${escAttr(c.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          ${t('delete')}
        </button>
      </div>
    </div>`
        : ''
    }
  </div>`;
}

async function onCookieAction(act, name, btn) {
  const cookie = state.cookies.find((c) => c.name === name);
  if (!cookie && act !== 'delete') return;

  if (act === 'copy') {
    await copyText(cookie.name + '=' + cookie.value, t('copiedName', { name: cookie.name }), btn);
    return;
  }
  if (act === 'edit') {
    state.editCookie = { ...cookie };
    openModal('edit');
    return;
  }
  if (act === 'protect') {
    if (state.protected.has(name)) {
      state.protected.delete(name);
      showToast(t('unprotectedToast', { name }), 'success');
    } else {
      state.protected.add(name);
      showToast(t('protectedToast', { name }), 'success');
    }
    await setProtectedNames(currentDomain, state.protected);
    await refreshCookies();
    render();
    return;
  }
  if (act === 'delete') {
    state.clearMode = 'one';
    state.targetName = name;
    openModal('clear');
  }
}

function renderFilters(stats) {
  const defs = [
    ['all', t('filterAll'), stats.total],
    ['session', t('filterSession'), stats.sessionN],
    ['secure', t('filterSecure'), stats.secureN],
    ['tracking', t('filterTracking'), stats.trackN],
  ];
  const el = document.getElementById('filters');
  el.innerHTML = defs
    .map(
      ([id, label, count]) => `
    <button type="button" class="filter-btn${state.filter === id ? ' active' : ''}" data-filter="${id}">
      ${escHtml(label)} <span class="count">${count}</span>
    </button>`,
    )
    .join('');
  el.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      render();
    });
  });
}

function updateSiteCard(stats) {
  const domainEl = document.getElementById('currentDomain');
  if (domainEl && currentDomain) domainEl.textContent = currentDomain;
  document.getElementById('siteCount').textContent = plural(
    stats.total,
    t('cookie'),
    t('cookies'),
  );
  const pill = document.getElementById('scorePill');
  pill.className = 'score-pill ' + stats.tone;
  document.getElementById('scoreLabel').textContent = stats.grade;
  const bar = document.getElementById('scoreBar');
  bar.className = 'score-bar ' + stats.tone;
  document.getElementById('scoreFill').style.width = stats.score + '%';
  const conn = document.getElementById('statConn');
  conn.textContent = isHttps ? 'HTTPS' : 'HTTP';
  conn.className = 'stat-value ' + (isHttps ? 'ok' : 'danger');

  document.getElementById('statSecure').textContent =
    stats.total ? `${stats.secureN}/${stats.total}` : '0';
  document.getElementById('statHttp').textContent = String(stats.httpN);

  const track = document.getElementById('statTrack');
  track.textContent = String(stats.trackN);
  track.className = 'stat-value' + (stats.trackN > 0 ? ' warn' : '');
}

function updateToolsMeta(stats) {
  document.getElementById('expiredMeta').textContent = String(stats.expiredN);
  document.getElementById('trackerMeta').textContent = String(stats.trackN);
  document.getElementById('protectedMeta').textContent =
    state.protected.size + ' protected';
}

function renderProfiles() {
  const list = document.getElementById('profileList');
  const empty = document.getElementById('profilesEmpty');
  const keys = Object.keys(state.profiles);

  if (!keys.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const colors = ['', 'ok', 'warn'];
  list.innerHTML = keys
    .map((id, i) => {
      const p = state.profiles[id];
      const active = state.activeProfileId === id;
      const count = active ? state.cookies.length : (p.cookies || []).length;
      const sub = `${escHtml(p.domain || currentDomain)} · ${plural(count, t('cookie'), t('cookies'))} · ${active ? t('live') : relativeTime(p.savedAt)}`;
      return `
      <div class="profile-row${active ? ' active' : ''}">
        <div class="profile-avatar ${colors[i % colors.length]}">${escHtml((p.name || '?').charAt(0).toUpperCase())}</div>
        <div class="profile-info">
          <div class="profile-name">${escHtml(p.name)}</div>
          <div class="profile-sub">${sub}</div>
        </div>
        ${
          active
            ? `<span class="active-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>${t('active')}</span>`
            : `<button type="button" class="btn-surface" data-switch="${escAttr(id)}">${t('switch')}</button>`
        }
        <button type="button" class="btn-xs danger" data-del-profile="${escAttr(id)}" title="${escAttr(t('delete'))}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
    })
    .join('');

  list.querySelectorAll('[data-switch]').forEach((btn) => {
    btn.addEventListener('click', () => switchProfile(btn.dataset.switch));
  });
  list.querySelectorAll('[data-del-profile]').forEach((btn) => {
    btn.addEventListener('click', () => deleteProfile(btn.dataset.delProfile));
  });
}

function renderDrag() {
  const show = state.drag === 'valid' || state.drag === 'invalid';
  document.getElementById('dropScrim')?.classList.toggle('hidden', !show);
  document.getElementById('dropValid')?.classList.toggle('hidden', state.drag !== 'valid');
  document.getElementById('dropInvalid')?.classList.toggle('hidden', state.drag !== 'invalid');

  const domainEls = [document.getElementById('dropDomainValid')];
  domainEls.forEach((el) => {
    if (el && currentDomain) el.textContent = currentDomain;
  });

  const errName = document.getElementById('dropErrorName');
  if (errName) errName.textContent = state.dropErrorName || 'file';

  document.getElementById('app')?.classList.toggle('is-dragging', show);
}

/* ── Sheets ─────────────────────────────── */
function renderSheet(stats) {
  const host = document.getElementById('sheetHost');
  const scrim = document.getElementById('scrim');
  const m = state.modal;

  if (!m) {
    host.innerHTML = '';
    scrim.classList.add('hidden');
    return;
  }
  scrim.classList.remove('hidden');

  if (m === 'export') host.innerHTML = exportSheetHTML();
  else if (m === 'security') host.innerHTML = securitySheetHTML(stats);
  else if (m === 'clear') host.innerHTML = clearSheetHTML();
  else if (m === 'import') host.innerHTML = importSheetHTML();
  else if (m === 'protected') host.innerHTML = protectedSheetHTML();
  else if (m === 'saveProfile') host.innerHTML = saveProfileSheetHTML();
  else if (m === 'edit') host.innerHTML = editSheetHTML();
  else host.innerHTML = '';

  bindSheetEvents();
}

function sheetChrome(title, sub, body) {
  return `
  <div class="sheet" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <div style="flex:1;min-width:0">
        <div class="sheet-title">${escHtml(title)}</div>
        ${sub ? `<div class="sheet-sub">${sub}</div>` : ''}
      </div>
      <button type="button" class="sheet-close" data-close aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>
      </button>
    </div>
    ${body}
  </div>`;
}

function exportSheetHTML() {
  const list = getExportList();
  const meta = fileMeta(state.exportFormat);
  const text = serializeCookies(list, state.exportFormat, currentDomain);
  const preview = text
    .split('\n')
    .slice(0, 3)
    .map((l) => (l.length > 46 ? l.slice(0, 46) + '…' : l))
    .join('\n');
  const fileInfo = `${currentDomain}-cookies.${meta.ext} · ${list.length}`;

  const formats = EXPORT_FORMATS.map(
    (f) => `
    <button type="button" class="format-btn${state.exportFormat === f.id ? ' active' : ''}" data-fmt="${f.id}" role="radio" aria-checked="${state.exportFormat === f.id}">
      <span class="format-top">
        <span class="format-label">${escHtml(f.label)}</span>
        <span class="dot${state.exportFormat === f.id ? ' on' : ''}">${
          state.exportFormat === f.id
            ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>'
            : ''
        }</span>
      </span>
      <span class="format-desc">${escHtml(f.desc)}</span>
    </button>`,
  ).join('');

  return sheetChrome(
    t('exportCookies'),
    `${list.length} · ${meta.ext.toUpperCase()}`,
    `
    <div>
      <div class="field-label">${t('whatToExport')}</div>
      <div class="seg" role="radiogroup">
        <button type="button" class="seg-btn${state.exportScope === 'site' ? ' active' : ''}" data-scope="site">${t('thisSite')}</button>
        <button type="button" class="seg-btn${state.exportScope === 'all' ? ' active' : ''}" data-scope="all">${t('allProfiles')}</button>
      </div>
    </div>
    <div>
      <div class="field-label">${t('format')}</div>
      <div class="format-grid">${formats}</div>
    </div>
    <div class="toggle-card">
      <div class="toggle-row">
        <span class="toggle-label-text">${t('includeHttpOnly')}</span>
        <button type="button" class="switch" data-opt="http" role="switch" aria-checked="${state.optHttpOnly}">
          <span class="switch-track${state.optHttpOnly ? ' on' : ''}"><span class="switch-knob"></span></span>
        </button>
      </div>
      <div class="toggle-row">
        <span class="toggle-label-text">${t('includeExpired')}</span>
        <button type="button" class="switch" data-opt="expired" role="switch" aria-checked="${state.optExpired}">
          <span class="switch-track${state.optExpired ? ' on' : ''}"><span class="switch-knob"></span></span>
        </button>
      </div>
    </div>
    <div>
      <div class="preview-head">
        <span class="field-label">${t('preview')}</span>
        <span class="preview-meta">${escHtml(fileInfo)}</span>
      </div>
      <div class="preview-box">${escHtml(preview || '—')}</div>
    </div>
    <div class="export-actions">
      <button type="button" class="btn-copy-outline copy-btn" id="copyExportBtn">
        <span class="copy-btn-icon" aria-hidden="true">
          <svg class="icon-copy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
          <svg class="icon-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
        </span>
        ${t('copy')}
      </button>
      <button type="button" class="btn-block" id="doExportBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path><path d="M12 15V3"></path></svg>
        ${t('download')} .${meta.ext}
      </button>
    </div>
  `,
  );
}

function securitySheetHTML(stats) {
  const rows = buildSecurityRows(stats, currentDomain)
    .map(
      (r) => `
    <div class="sec-row">
      <span class="sec-badge ${r.good ? 'ok' : 'warn'}">${r.good ? '✓' : '!'}</span>
      <span style="flex:1;min-width:0">
        <span style="display:block;font-size:14px;font-weight:600">${escHtml(r.title)}</span>
        <span style="display:block;font-size:12px;color:var(--muted);line-height:1.4">${escHtml(r.detail)}</span>
      </span>
    </div>`,
    )
    .join('');

  return sheetChrome(
    t('securityReport'),
    `${escHtml(currentDomain)} · ${stats.grade}`,
    `
    <div class="sec-list">${rows}</div>
    ${stats.trackN ? `<button type="button" class="btn-danger-solid" id="fixTrackersBtn">${t('fixTrackers')}</button>` : ''}
    <button type="button" class="btn-block secondary" data-close>${t('done')}</button>
  `,
  );
}

function clearSheetHTML() {
  const target = state.cookies.find((c) => c.name === state.targetName);
  const clearAll = state.clearMode === 'all';
  const delAll = state.cookies.filter((c) => !c.protected);
  const sessionN = delAll.filter((c) => isSessionCookie(c)).length;
  const persistentN = delAll.length - sessionN;
  const keptN = state.cookies.filter((c) => c.protected).length;

  let title;
  let desc;
  let button;

  if (clearAll) {
    title = t('clearCookies');
    desc = delAll.length
      ? `This deletes ${plural(delAll.length, t('cookie'), t('cookies'))} for ${currentDomain} and may sign you out of the site. ${t('cantUndo')}`
      : t('nothingToDelete');
    button = delAll.length
      ? `${t('delete')} ${delAll.length}`
      : t('nothingToDelete');
  } else {
    const nm = target?.name || 'cookie';
    title = `Delete ${nm}?`;
    desc =
      target?.protected
        ? `${nm} is protected. Deleting it removes the protection too.`
        : `This removes ${nm} from ${currentDomain}. ${t('cantUndo')}`;
    button = t('delete');
  }

  return `
  <div class="clear-wrap">
    <div class="clear-card" role="alertdialog" aria-modal="true" aria-labelledby="vok-clear-title">
      <div class="clear-hero" aria-hidden="true">
        <div class="clear-orbit"></div>
        <div class="clear-ring"></div>
        <div class="clear-ring r2"></div>
        <div class="clear-ring r3"></div>
        <div class="clear-icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <g class="lid"><path d="M3 6h18"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></g>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M10 11v6"></path><path d="M14 11v6"></path>
          </svg>
        </div>
      </div>
      <div class="clear-copy">
        <div class="clear-title" id="vok-clear-title">${escHtml(title)}</div>
        <div class="clear-desc">${escHtml(desc)}</div>
      </div>
      ${
        clearAll
          ? `
      <div class="clear-stats">
        <div class="clear-stat"><div class="clear-stat-value">${sessionN}</div><div class="clear-stat-label">${t('clearSession')}</div></div>
        <div class="clear-stat"><div class="clear-stat-value">${persistentN}</div><div class="clear-stat-label">${t('clearPersistent')}</div></div>
        <div class="clear-stat kept"><div class="clear-stat-value">${keptN}</div><div class="clear-stat-label">${t('clearKept')}</div></div>
      </div>
      <div class="clear-backup">
        <span style="flex:1;font-size:13px;font-weight:500">${t('backupBeforeClear')}</span>
        <button type="button" class="switch" data-opt="backup" role="switch" aria-checked="${state.backup}">
          <span class="switch-track${state.backup ? ' on' : ''}"><span class="switch-knob"></span></span>
        </button>
      </div>`
          : ''
      }
      <div class="clear-actions">
        <button type="button" class="btn-cancel" data-close>${t('cancel')}</button>
        <button type="button" class="btn-delete" id="confirmClearBtn">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          ${escHtml(button)}
        </button>
      </div>
    </div>
  </div>`;
}

function importSheetHTML() {
  const payload = state.importPayload;
  if (!payload) return '';

  const fileName = payload.name || 'import.json';
  const fileSize = sizeText(payload.size);
  const favSrc = document.getElementById('siteFavicon')?.src;
  const hasFav = document.getElementById('siteAvatar')?.classList.contains('has-favicon') && favSrc;
  const avatar = hasFav
    ? `<img src="${escAttr(favSrc)}" alt="" />`
    : escHtml(domainInitial(currentDomain));

  const fileCard = `
    <div class="import-file">
      <div class="import-file-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path></svg>
      </div>
      <div class="import-file-meta">
        <div class="import-file-name">${escHtml(fileName)}</div>
        <div class="import-file-size">${escHtml(fileSize)}</div>
      </div>
      <span class="import-valid">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
        ${t('importValid')}
      </span>
    </div>`;

  const targetCard = `
    <div class="import-target">
      <div class="import-target-avatar">${avatar}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600">${escHtml(currentDomain)}</div>
        <div style="font-size:12px;color:var(--muted)">${t('importIntoTab')}</div>
      </div>
    </div>`;

  const modeRadios = `
    <div class="mode-stack" role="radiogroup" aria-label="Import mode">
      <button type="button" class="mode-btn${state.importMode === 'merge' ? ' active' : ''}" data-mode="merge">
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:14px;font-weight:600">${t('merge')}</span>
          <span style="display:block;font-size:12px;color:var(--text2)">${t('mergeDesc')}</span>
        </span>
        <span class="mode-dot">${state.importMode === 'merge' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : ''}</span>
      </button>
      <button type="button" class="mode-btn${state.importMode === 'replace' ? ' active' : ''}" data-mode="replace">
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:14px;font-weight:600">${t('replace')}</span>
          <span style="display:block;font-size:12px;color:var(--text2)">${t('replaceDesc')}</span>
        </span>
        <span class="mode-dot">${state.importMode === 'replace' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>' : ''}</span>
      </button>
    </div>`;

  const actions = `
    <div class="sheet-actions import-actions">
      <button type="button" class="btn-cancel-sheet" data-close>${t('cancel')}</button>
      <button type="button" class="btn-import" id="confirmImportBtn">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path></svg>
        ${t('importButton')}
      </button>
    </div>`;

  if (payload.kind === 'profiles') {
    const items = Object.values(payload.profiles || {});
    return sheetChrome(
      t('importCookies'),
      '',
      `
      ${fileCard}
      <div class="import-stats">
        <div class="import-stat"><div class="import-stat-value">${items.length}</div><div class="import-stat-label">${t('profilesFound')}</div></div>
      </div>
      ${actions}
    `,
    );
  }

  const all = payload.cookies || [];
  const toAdd = all.filter((c) => !isExpiredCookie(c));
  const expiredN = all.length - toAdd.length;

  return sheetChrome(
    t('importCookies'),
    '',
    `
    ${fileCard}
    <div class="import-stats">
      <div class="import-stat"><div class="import-stat-value">${all.length}</div><div class="import-stat-label">${t('cookiesFound')}</div></div>
      <div class="import-stat"><div class="import-stat-value">${toAdd.length}</div><div class="import-stat-label">${t('willImport')}</div></div>
      <div class="import-stat warn"><div class="import-stat-value">${expiredN}</div><div class="import-stat-label">${t('expiredSkipped')}</div></div>
    </div>
    ${targetCard}
    ${modeRadios}
    ${actions}
  `,
  );
}

function protectedSheetHTML() {
  const rows = state.cookies.filter((c) => c.protected);
  const body = rows.length
    ? `<div class="tool-card">${rows
        .map(
          (c) => `
      <div class="tool-row compact">
        <span class="tool-text"><span class="tool-title" style="font-family:'JetBrains Mono',monospace">${escHtml(c.name)}</span></span>
        <button type="button" class="btn-xs" data-unprotect="${escAttr(c.name)}">${t('unprotect')}</button>
      </div>`,
        )
        .join('')}</div>`
    : `<div class="empty-state" style="padding:24px"><p>${t('noneProtected')}</p></div>`;

  return sheetChrome(
    t('protectedSheetTitle'),
    t('protectedSheetDesc'),
    `${body}<button type="button" class="btn-block secondary" data-close>${t('done')}</button>`,
  );
}

function saveProfileSheetHTML() {
  return sheetChrome(
    t('saveProfile'),
    escHtml(currentDomain),
    `
    <div class="form-field">
      <label for="profileNameInput">${t('profileName')}</label>
      <input class="form-input" id="profileNameInput" data-i18n-placeholder="profileNamePlaceholder" placeholder="${escAttr(t('profileNamePlaceholder'))}" autocomplete="off" />
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn-block secondary" data-close>${t('cancel')}</button>
      <button type="button" class="btn-block" id="confirmSaveProfileBtn">${t('save')}</button>
    </div>
  `,
  );
}

function editSheetHTML() {
  const c = state.editCookie;
  if (!c) return '';
  const days =
    c.expirationDate != null
      ? Math.max(0, Math.round((c.expirationDate - Date.now() / 1000) / 86400))
      : '';
  return sheetChrome(
    t('editCookie'),
    escHtml(c.name),
    `
    <div class="form-field">
      <label>${t('value')}</label>
      <textarea class="form-textarea" id="editValue">${escHtml(c.value)}</textarea>
    </div>
    <div class="form-field">
      <label>${t('path')}</label>
      <input class="form-input" id="editPath" value="${escAttr(c.path || '/')}" />
    </div>
    <div class="form-field">
      <label>${t('expiresLabel')}</label>
      <input type="number" class="form-input" id="editExpiry" value="${escAttr(days)}" min="0" />
    </div>
    <div class="flags-row">
      <label class="check-label"><input type="checkbox" id="editSecure" ${c.secure ? 'checked' : ''}/> ${t('secure')}</label>
      <label class="check-label"><input type="checkbox" id="editHttpOnly" ${c.httpOnly ? 'checked' : ''}/> ${t('httpOnly')}</label>
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn-block secondary" data-close>${t('cancel')}</button>
      <button type="button" class="btn-block" id="confirmEditBtn">${t('save')}</button>
    </div>
  `,
  );
}

function bindSheetEvents() {
  const host = document.getElementById('sheetHost');
  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));

  host.querySelectorAll('[data-fmt]').forEach((b) => {
    b.addEventListener('click', () => {
      state.exportFormat = b.dataset.fmt;
      render();
    });
  });
  host.querySelectorAll('[data-scope]').forEach((b) => {
    b.addEventListener('click', () => {
      state.exportScope = b.dataset.scope;
      render();
    });
  });
  host.querySelectorAll('[data-opt]').forEach((b) => {
    b.addEventListener('click', () => {
      const o = b.dataset.opt;
      if (o === 'http') state.optHttpOnly = !state.optHttpOnly;
      if (o === 'expired') state.optExpired = !state.optExpired;
      if (o === 'backup') state.backup = !state.backup;
      render();
    });
  });
  host.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      state.importMode = b.dataset.mode;
      render();
    });
  });
  host.querySelectorAll('[data-unprotect]').forEach((b) => {
    b.addEventListener('click', async () => {
      state.protected.delete(b.dataset.unprotect);
      await setProtectedNames(currentDomain, state.protected);
      await refreshCookies();
      render();
    });
  });

  host.querySelector('#doExportBtn')?.addEventListener('click', doExport);
  host.querySelector('#copyExportBtn')?.addEventListener('click', (e) => {
    copyExport(e.currentTarget);
  });
  host.querySelector('#confirmClearBtn')?.addEventListener('click', confirmClear);
  host.querySelector('#confirmImportBtn')?.addEventListener('click', confirmImport);
  host.querySelector('#confirmSaveProfileBtn')?.addEventListener('click', confirmSaveProfile);
  host.querySelector('#confirmEditBtn')?.addEventListener('click', confirmEdit);
  host.querySelector('#fixTrackersBtn')?.addEventListener('click', cleanTrackers);
  host.querySelector('#profileNameInput')?.focus();
}

/* ── Actions ────────────────────────────── */
function getExportList() {
  let list;
  if (state.exportScope === 'all') {
    list = [];
    Object.values(state.profiles).forEach((p) => {
      (p.cookies || []).forEach((c) => list.push(c));
    });
    if (!list.length) list = state.cookies.slice();
  } else {
    list = state.cookies.slice();
  }
  return filterExportList(list, {
    includeHttpOnly: state.optHttpOnly,
    includeExpired: state.optExpired,
  });
}

function doExport() {
  const list = getExportList();
  if (!list.length) {
    showToast(t('noCookiesToExport'), 'error');
    return;
  }
  const meta = fileMeta(state.exportFormat);
  const text = serializeCookies(list, state.exportFormat, currentDomain);
  downloadText(`${currentDomain}-cookies.${meta.ext}`, text, meta.mime);
  closeModal();
  showToast(t('exportedCookies', { count: list.length }), 'success');
}

async function copyAll() {
  if (!state.cookies.length) {
    showToast(t('noCookiesToExport'), 'error');
    return;
  }
  const text = serializeCookies(state.cookies, 'header', currentDomain);
  const btn = document.getElementById('copyAllBtn');
  await copyText(text, t('copiedCookies', { count: state.cookies.length }), btn);
}

async function copyExport(btn) {
  const list = getExportList();
  if (!list.length) {
    showToast(t('noCookiesToExport'), 'error');
    return;
  }
  const text = serializeCookies(list, state.exportFormat, currentDomain);
  await copyText(text, t('copiedCookies', { count: list.length }), btn);
}

/* Copy helpers — icon swap + pill toast */
const copyFlashTimers = new WeakMap();

function flashCopyButton(btn) {
  if (!btn) return;
  btn.classList.add('copied');
  const prev = copyFlashTimers.get(btn);
  if (prev) clearTimeout(prev);
  const id = setTimeout(() => btn.classList.remove('copied'), 1400);
  copyFlashTimers.set(btn, id);
}

async function copyText(text, okMsg, btn) {
  try {
    await navigator.clipboard.writeText(text);
    flashCopyButton(btn);
    showToast(okMsg || t('toastCopied'), 'success');
  } catch {
    showToast(t('copyFailed'), 'error');
  }
}

async function cleanExpired() {
  const targets = state.cookies.filter((c) => isExpiredCookie(c) && !c.protected);
  if (!targets.length) {
    showToast(t('nothingToDelete'), 'success');
    return;
  }
  const n = await removeCookies(currentUrl, targets);
  await refreshCookies();
  closeModal();
  render();
  showToast(t('deletedExpired', { count: n }), 'success');
}

async function cleanTrackers() {
  const targets = state.cookies.filter((c) => c.tracking && !c.protected);
  if (!targets.length) {
    showToast(t('nothingToDelete'), 'success');
    return;
  }
  const n = await removeCookies(currentUrl, targets);
  await refreshCookies();
  closeModal();
  render();
  showToast(t('deletedTrackers', { count: n }), 'success');
}

async function confirmClear() {
  if (state.clearMode === 'all') {
    const delAll = state.cookies.filter((c) => !c.protected);
    if (!delAll.length) {
      closeModal();
      showToast(t('nothingToDelete'), 'success');
      return;
    }
    if (state.backup) {
      const text = serializeCookies(delAll, 'json', currentDomain);
      downloadText(`${currentDomain}-backup.json`, text, 'application/json');
    }
    const n = await removeCookies(currentUrl, delAll);
    await refreshCookies();
    closeModal();
    render();
    showToast(t('deletedCookies', { count: n }), 'success');
    return;
  }

  const name = state.targetName;
  try {
    await removeCookieOnUrl(currentUrl, name);
    if (state.protected.has(name)) {
      state.protected.delete(name);
      await setProtectedNames(currentDomain, state.protected);
    }
    await refreshCookies();
    closeModal();
    render();
    showToast(t('cookieDeleted', { name }), 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmImport() {
  const payload = state.importPayload;
  if (!payload) return;

  if (payload.kind === 'profiles') {
    const incoming = payload.profiles || {};
    const merged = { ...state.profiles };
    const existingNames = new Set(
      Object.values(merged).map((p) => (p.name || '').toLowerCase()),
    );
    let count = 0;
    for (const [id, p] of Object.entries(incoming)) {
      const nameLower = (p.name || '').toLowerCase();
      if (existingNames.has(nameLower)) continue;
      existingNames.add(nameLower);
      const newId = merged[id] ? 'p_' + Date.now() + '_' + count : id;
      merged[newId] = { ...p, id: newId };
      count++;
    }
    state.profiles = merged;
    await setProfiles(merged);
    closeModal();
    state.tab = 'profiles';
    render();
    showToast(t('profilesImported', { count }), 'success');
    return;
  }

  const incoming = (payload.cookies || []).filter((c) => !isExpiredCookie(c));
  if (state.importMode === 'replace') {
    const unprotected = state.cookies.filter((c) => !c.protected);
    await removeCookies(currentUrl, unprotected);
  }

  const skip = new Set(
    state.importMode === 'merge'
      ? [...state.protected]
      : [],
  );
  // When merging, overwrite matching names except protected
  if (state.importMode === 'merge') {
    for (const c of incoming) {
      if (state.protected.has(c.name)) continue;
      const existing = state.cookies.find((x) => x.name === c.name);
      if (existing) {
        try {
          await removeCookieOnUrl(currentUrl, c.name);
        } catch {
          /* ignore */
        }
      }
    }
  }

  const { applied, failed } = await applyCookies(currentUrl, incoming, { skipNames: skip });
  await refreshCookies();
  closeModal();
  state.tab = 'cookies';
  render();
  showToast(
    failed > 0 ? t('appliedFailed', { applied, failed }) : t('cookiesImported', { count: applied }),
    failed > 0 ? 'error' : 'success',
  );
  if (currentTab?.id) chrome.tabs.reload(currentTab.id);
}

async function confirmSaveProfile() {
  const name = document.getElementById('profileNameInput')?.value.trim();
  if (!name) {
    showToast(t('profileNameRequired'), 'error');
    return;
  }
  const nameLower = name.toLowerCase();
  if (Object.values(state.profiles).some((p) => (p.name || '').toLowerCase() === nameLower)) {
    showToast(t('profileNameDuplicate'), 'error');
    return;
  }
  const id = 'p_' + Date.now();
  state.profiles[id] = {
    id,
    name,
    domain: currentDomain,
    savedAt: new Date().toISOString(),
    cookies: JSON.parse(JSON.stringify(state.cookies)),
  };
  await setProfiles(state.profiles);
  state.activeProfileId = id;
  await setActiveProfileId(id);
  closeModal();
  state.tab = 'profiles';
  render();
  showToast(t('profileSaved', { name }), 'success');
}

async function confirmEdit() {
  const c = state.editCookie;
  if (!c) return;
  const value = document.getElementById('editValue')?.value ?? '';
  const path = document.getElementById('editPath')?.value.trim() || '/';
  const expDays = document.getElementById('editExpiry')?.value;
  const secure = document.getElementById('editSecure')?.checked;
  const httpOnly = document.getElementById('editHttpOnly')?.checked;

  const cookieData = {
    name: c.name,
    value,
    path,
    secure,
    httpOnly,
    sameSite: c.sameSite,
  };
  if (expDays !== '') {
    cookieData.expirationDate =
      Math.floor(Date.now() / 1000) + parseInt(expDays, 10) * 86400;
  }

  try {
    await setCookieOnUrl(currentUrl, cookieData);
    await refreshCookies();
    closeModal();
    render();
    showToast(t('cookieUpdated'), 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function switchProfile(id) {
  const profile = state.profiles[id];
  if (!profile) return;

  // Clear current unprotected cookies, then apply profile
  const unprotected = state.cookies.filter((c) => !c.protected);
  await removeCookies(currentUrl, unprotected);
  await applyCookies(currentUrl, profile.cookies || [], {
    skipNames: state.protected,
  });
  state.activeProfileId = id;
  await setActiveProfileId(id);
  await refreshCookies();
  state.tab = 'cookies';
  render();
  showToast(t('profileApplied', { name: profile.name }), 'success');
  if (currentTab?.id) chrome.tabs.reload(currentTab.id);
}

async function deleteProfile(id) {
  const name = state.profiles[id]?.name;
  delete state.profiles[id];
  if (state.activeProfileId === id) {
    state.activeProfileId = null;
    await setActiveProfileId(null);
  }
  await setProfiles(state.profiles);
  render();
  showToast(t('profileDeleted', { name }), 'success');
}

/* ── Toast ──────────────────────────────── */
function showToast(message, type = 'success') {
  const wrap = document.getElementById('toastWrap');
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMessage');
  if (!wrap || !toast || !msg) return;

  if (type === 'success') {
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
  } else {
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  }
  msg.textContent = message;
  toast.className = `toast ${type}`;
  wrap.classList.remove('show');
  // restart enter animation
  void wrap.offsetWidth;
  wrap.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => wrap.classList.remove('show'), 2400);
}
