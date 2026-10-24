'use strict';

/** Known tracking / analytics cookie name patterns (prototype parity). */
const TRACKER_RE = /^(_ga|_gid|_gat|_fbp|_octo|_clck|_uet|_gcl|_hj|_tt_|AMP_TOKEN|__utm)/i;

export function isTrackingCookie(cookieOrName) {
  const name = typeof cookieOrName === 'string' ? cookieOrName : cookieOrName?.name;
  return TRACKER_RE.test(String(name || ''));
}

export function annotateTracking(cookies) {
  return cookies.map((c) => ({ ...c, tracking: isTrackingCookie(c) }));
}
