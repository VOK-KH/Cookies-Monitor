<p align="center">
  <img src="resources/logo.png" alt="VOK Cookies" width="128"/>
</p>

<h1 align="center">VOK Cookies</h1>

<p align="center">
  <a href="https://github.com/k10978311-ai/VOK"><img src="https://img.shields.io/github/stars/k10978311-ai/VOK?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/k10978311-ai/VOK/releases/latest"><img src="https://img.shields.io/github/release/k10978311-ai/VOK.svg" alt="Latest release"></a>
  <a style="text-decoration:none"><img src="https://img.shields.io/badge/version-2.0.0-6B5CF0" alt="v2.0.0"/></a>
  <a style="text-decoration:none"><img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome"/></a>
  <a style="text-decoration:none"><img src="https://img.shields.io/badge/Manifest-V3-00B16A" alt="Manifest V3"/></a>
</p>

<p align="center">
  <strong>Manage, profile, export, and protect cookies — with security insights and multi-format transfer.</strong>
</p>

---

## Features (v2)

| Area | What you get |
|---|---|
| **Cookies** | Search, filters (All / Session / Secure / Tracking), expand, edit, protect, delete |
| **Security** | Live grade + report (HTTPS, Secure, HttpOnly, trackers, expired) |
| **Profiles** | Save the current tab; one-tap switch (protected cookies stay) |
| **Tools** | Export JSON / Netscape / Header / CSV · import with merge/replace · cleanup · protected list |
| **i18n** | English + Khmer |
| **Badge** | Live cookie count on the toolbar icon |

---

## Project layout

```
manifest.json
background/background.js     # badge service worker
popup/                       # UI shell (HTML / CSS / app)
src/                         # shared modules
  cookies-api.js
  formats.js                 # serialize / parse (JSON, Netscape, header, CSV)
  i18n.js
  security.js
  storage.js
  trackers.js
  utils.js
icons/
resources/
```

---

## Load in Chrome / Edge

1. Open **chrome://extensions** (or **edge://extensions**)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Pin **VOK Cookies** in the toolbar

---

## Permissions

| Permission | Reason |
|---|---|
| `cookies` | Read / write cookies |
| `activeTab` | Current tab URL |
| `tabs` | Query / reload tabs |
| `storage` | Profiles, protected names, language |
| `<all_urls>` | Work on any site |

---

## Export formats

- **JSON** — re-import in VOK Cookies  
- **Netscape** — `cookies.txt` for curl / wget  
- **Header string** — `name=value; …` for requests  
- **CSV** — open in a spreadsheet  

Profiles JSON still uses `{ "__type": "vok-profiles", "profiles": { … } }`.

---

## Changelog

See [CHANGE.log](./CHANGE.log) for v2.0.0 details.
