'use strict';

const KEYS = {
  profiles: 'profiles',
  protected: 'protectedCookies',
  lang: 'lang',
  activeProfile: 'activeProfileId',
};

export async function getProfiles() {
  const { profiles } = await chrome.storage.local.get(KEYS.profiles);
  return profiles || {};
}

export async function setProfiles(profiles) {
  await chrome.storage.local.set({ [KEYS.profiles]: profiles });
}

export async function getProtectedMap() {
  const { protectedCookies } = await chrome.storage.local.get(KEYS.protected);
  return protectedCookies || {};
}

export async function setProtectedMap(map) {
  await chrome.storage.local.set({ [KEYS.protected]: map });
}

export async function getProtectedNames(domain) {
  const map = await getProtectedMap();
  return new Set(map[domain] || []);
}

export async function setProtectedNames(domain, namesSet) {
  const map = await getProtectedMap();
  map[domain] = [...namesSet];
  await setProtectedMap(map);
}

export async function getLang() {
  const { lang } = await chrome.storage.local.get(KEYS.lang);
  return lang === 'km' ? 'km' : 'en';
}

export async function setLang(lang) {
  await chrome.storage.local.set({ [KEYS.lang]: lang === 'km' ? 'km' : 'en' });
}

export async function getActiveProfileId() {
  const { activeProfileId } = await chrome.storage.local.get(KEYS.activeProfile);
  return activeProfileId || null;
}

export async function setActiveProfileId(id) {
  await chrome.storage.local.set({ [KEYS.activeProfile]: id || null });
}
