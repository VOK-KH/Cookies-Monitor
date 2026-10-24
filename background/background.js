/* ─────────────────────────────────────────
   VOK Cookies v2 – Background Service Worker
───────────────────────────────────────── */

'use strict';

const BADGE_COLOR = '#6B5CF0';

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await updateBadge(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await updateBadge(tabId);
  }
});

chrome.cookies.onChanged.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await updateBadge(tab.id);
});

async function updateBadge(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const cookies = await chrome.cookies.getAll({ url: tab.url });
    const count = cookies.length;

    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : '',
      tabId,
    });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
  } catch {
    // Tab may have been closed or navigated away
  }
}
