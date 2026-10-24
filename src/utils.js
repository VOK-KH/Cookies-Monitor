'use strict';

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function domainInitial(domain) {
  const d = String(domain || '?').replace(/^www\./, '');
  return (d.charAt(0) || '?').toUpperCase();
}

export function isSessionCookie(c) {
  return !c.expirationDate;
}

export function isExpiredCookie(c) {
  return typeof c.expirationDate === 'number' && c.expirationDate * 1000 < Date.now();
}

export function expLabel(c) {
  if (!c.expirationDate) return 'Session';
  const d = Math.round((c.expirationDate * 1000 - Date.now()) / 86400000);
  if (d < 0) return 'Expired';
  if (d === 0) return 'Today';
  if (d >= 365) {
    const y = Math.round(d / 365);
    return y + (y === 1 ? ' year' : ' years');
  }
  return d + (d === 1 ? ' day' : ' days');
}

export function expLong(c) {
  if (!c.expirationDate) return 'Deleted when the browser closes';
  const d = Math.round((c.expirationDate * 1000 - Date.now()) / 86400000);
  if (d < 0) {
    const abs = Math.abs(d);
    return 'Expired ' + abs + (abs === 1 ? ' day ago' : ' days ago');
  }
  return new Date(c.expirationDate * 1000).toLocaleString();
}

export function cookieKey(c) {
  return `${c.name}|${c.domain}|${c.path || '/'}`;
}

export function relativeTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  return new Date(iso).toLocaleDateString();
}
