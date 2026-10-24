'use strict';

import { isExpiredCookie, isSessionCookie } from './utils.js';
import { isTrackingCookie } from './trackers.js';

/**
 * Score site cookie hygiene (0–100) using the prototype formula.
 */
export function computeSecurityScore(cookies, { isHttps = true } = {}) {
  const total = cookies.length;
  const secureN = cookies.filter((c) => c.secure).length;
  const httpN = cookies.filter((c) => c.httpOnly).length;
  const trackN = cookies.filter((c) => c.tracking ?? isTrackingCookie(c)).length;
  const expiredN = cookies.filter((c) => isExpiredCookie(c)).length;
  const sessionN = cookies.filter((c) => isSessionCookie(c)).length;

  let score = 100;
  if (total) {
    score -= Math.round(((total - secureN) / total) * 30);
    score -= Math.round(((total - httpN) / total) * 10);
    score -= trackN * 4;
    score -= expiredN * 2;
    if (!isHttps) score -= 25;
  }
  score = Math.max(0, Math.min(100, score));

  const grade = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';
  const tone = score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'danger';

  return {
    score,
    grade,
    tone,
    total,
    secureN,
    httpN,
    trackN,
    expiredN,
    sessionN,
    isHttps,
  };
}

export function buildSecurityRows(stats, domain) {
  const { total, secureN, httpN, trackN, expiredN, isHttps } = stats;
  const mk = (good, title, detail) => ({ good, title, detail });

  return [
    mk(
      isHttps,
      'Encrypted connection',
      isHttps
        ? `${domain} uses HTTPS.`
        : `${domain} is not using HTTPS — cookies may be exposed.`,
    ),
    mk(
      total === 0 || secureN === total,
      'Secure flag',
      total === 0
        ? 'No cookies to check.'
        : secureN === total
          ? 'Every cookie is sent over HTTPS only.'
          : `${total - secureN} of ${total} cookies can also be sent over plain HTTP.`,
    ),
    mk(
      total === 0 || httpN / Math.max(total, 1) >= 0.5,
      'HttpOnly flag',
      total === 0
        ? 'No cookies to check.'
        : `${httpN} of ${total} cookies are hidden from page scripts.`,
    ),
    mk(
      trackN === 0,
      'Tracking cookies',
      trackN === 0
        ? 'No known trackers found.'
        : `${trackN} known tracking ${trackN === 1 ? 'cookie was' : 'cookies were'} found.`,
    ),
    mk(
      expiredN === 0,
      'Expired cookies',
      expiredN === 0
        ? 'Nothing left over.'
        : `${expiredN} expired ${expiredN === 1 ? 'cookie is' : 'cookies are'} still stored.`,
    ),
  ];
}
