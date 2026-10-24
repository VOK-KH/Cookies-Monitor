'use strict';

export async function getTabCookies(url) {
  try {
    return await chrome.cookies.getAll({ url });
  } catch {
    return [];
  }
}

export async function setCookieOnUrl(url, c) {
  const cookieData = {
    url,
    name: c.name,
    value: c.value ?? '',
    path: c.path || '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
  };
  if (c.sameSite && c.sameSite !== 'unspecified') {
    cookieData.sameSite = c.sameSite;
  }
  if (c.expirationDate && c.expirationDate > Date.now() / 1000) {
    cookieData.expirationDate = c.expirationDate;
  }
  return chrome.cookies.set(cookieData);
}

export async function removeCookieOnUrl(url, name) {
  return chrome.cookies.remove({ url, name });
}

export async function applyCookies(url, list, { skipNames = new Set() } = {}) {
  let applied = 0;
  let failed = 0;
  for (const c of list) {
    if (skipNames.has(c.name)) continue;
    try {
      await setCookieOnUrl(url, c);
      applied++;
    } catch {
      failed++;
    }
  }
  return { applied, failed };
}

export async function removeCookies(url, list) {
  let removed = 0;
  for (const c of list) {
    try {
      await removeCookieOnUrl(url, c.name);
      removed++;
    } catch {
      /* ignore */
    }
  }
  return removed;
}
