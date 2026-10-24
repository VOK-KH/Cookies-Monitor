'use strict';

import { isExpiredCookie } from './utils.js';
import { isTrackingCookie } from './trackers.js';

export const EXPORT_FORMATS = [
  { id: 'json', label: 'JSON', desc: 'Re-import in VOK Cookies', ext: 'json', mime: 'application/json' },
  { id: 'netscape', label: 'Netscape', desc: 'cookies.txt for curl, wget', ext: 'txt', mime: 'text/plain' },
  { id: 'header', label: 'Header string', desc: 'name=value; for requests', ext: 'txt', mime: 'text/plain' },
  { id: 'csv', label: 'CSV', desc: 'Open in a spreadsheet', ext: 'csv', mime: 'text/csv' },
];

function domainFor(c, fallback) {
  return c.domain || fallback || '';
}

export function serializeCookies(list, fmt, domain) {
  const d = domain || 'localhost';
  if (fmt === 'json') {
    return JSON.stringify(
      list.map((c) => ({
        name: c.name,
        value: c.value,
        domain: domainFor(c, d),
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite,
        session: !c.expirationDate,
        expirationDate: c.expirationDate || undefined,
      })),
      null,
      2,
    );
  }
  if (fmt === 'netscape') {
    return (
      '# Netscape HTTP Cookie File\n' +
      list
        .map((c) =>
          [
            domainFor(c, d).startsWith('.') ? domainFor(c, d) : '.' + domainFor(c, d).replace(/^\./, ''),
            'TRUE',
            c.path || '/',
            c.secure ? 'TRUE' : 'FALSE',
            c.expirationDate ? Math.round(c.expirationDate) : 0,
            c.name,
            c.value,
          ].join('\t'),
        )
        .join('\n') +
      '\n'
    );
  }
  if (fmt === 'header') {
    return list.map((c) => c.name + '=' + c.value).join('; ');
  }
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  return (
    'name,value,domain,path,secure,httpOnly,expires\n' +
    list
      .map((c) =>
        [
          q(c.name),
          q(c.value),
          q(domainFor(c, d)),
          q(c.path || '/'),
          c.secure,
          c.httpOnly,
          c.expirationDate ? Math.round(c.expirationDate) : 'session',
        ].join(','),
      )
      .join('\n')
  );
}

export function filterExportList(list, { includeHttpOnly = true, includeExpired = false } = {}) {
  let out = list.slice();
  if (!includeHttpOnly) out = out.filter((c) => !c.httpOnly);
  if (!includeExpired) out = out.filter((c) => !isExpiredCookie(c));
  return out;
}

export function normalizeImportedCookie(c) {
  const exp =
    typeof c.expirationDate === 'number'
      ? c.expirationDate
      : typeof c.expires === 'number' && c.expires > 0
        ? c.expires
        : null;
  const session = c.session === true || exp === null;
  return {
    name: String(c.name),
    value: String(c.value ?? ''),
    domain: c.domain,
    path: c.path || '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: session ? undefined : exp,
    tracking: isTrackingCookie(c.name),
  };
}

/**
 * Parse JSON array, vok profiles, or Netscape cookies.txt.
 * Returns { cookies, profiles? } or null.
 */
export function parseImport(text) {
  const t = String(text).trim();
  if (!t) return null;

  if (t.charAt(0) === '[' || t.charAt(0) === '{') {
    let data;
    try {
      data = JSON.parse(t);
    } catch {
      return null;
    }

    if (Array.isArray(data)) {
      return { cookies: data.map(normalizeImportedCookie), kind: 'cookies' };
    }

    if (data && data.__type === 'vok-profiles' && data.profiles) {
      return { profiles: data.profiles, kind: 'profiles' };
    }

    if (data && Array.isArray(data.cookies)) {
      return { cookies: data.cookies.map(normalizeImportedCookie), kind: 'cookies' };
    }

    if (data && Array.isArray(data.profiles)) {
      const cookies = [];
      data.profiles.forEach((p) => {
        (p.cookies || []).forEach((c) => cookies.push(normalizeImportedCookie(c)));
      });
      return { cookies, kind: 'cookies' };
    }

    // Plain profiles object without marker
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const values = Object.values(data);
      if (values.length && values.every((p) => p && Array.isArray(p.cookies))) {
        return { profiles: data, kind: 'profiles' };
      }
    }

    return null;
  }

  if (t.includes('\t')) {
    const raw = [];
    t.split(/\r?\n/).forEach((line) => {
      if (!line || line.charAt(0) === '#') return;
      const f = line.split('\t');
      if (f.length >= 7) {
        raw.push(
          normalizeImportedCookie({
            name: f[5],
            value: f[6],
            domain: f[0],
            path: f[2] || '/',
            secure: f[3] === 'TRUE',
            expirationDate: Number(f[4]) > 0 ? Number(f[4]) : null,
          }),
        );
      }
    });
    return raw.length ? { cookies: raw, kind: 'cookies' } : null;
  }

  return null;
}

export function fileMeta(fmt) {
  return EXPORT_FORMATS.find((f) => f.id === fmt) || EXPORT_FORMATS[0];
}
