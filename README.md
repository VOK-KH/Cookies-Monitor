<p align="center">
  <img src="resources/logo.png" alt="VOK Cookies" width="128"/>
</p>

<h1 align="center">VOK Cookies</h1>

<p align="center">
  <a href="https://github.com/k10978311-ai/VOK"><img src="https://img.shields.io/github/stars/k10978311-ai/VOK?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/k10978311-ai/VOK/releases/latest"><img src="https://img.shields.io/github/release/k10978311-ai/VOK.svg" alt="Latest release"></a>
  <a style="text-decoration:none"><img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome"/></a>
  <a style="text-decoration:none"><img src="https://img.shields.io/badge/Manifest-V3-00B16A" alt="Manifest V3"/></a>
  <a style="text-decoration:none"><img src="https://img.shields.io/badge/Edge-Compatible-0078D4?logo=microsoftedge" alt="Edge"/></a>
</p>

<p align="center">
  <strong>A browser extension to manage, export, import, and save cookies as reusable account profiles.</strong>
</p>

---

## Features

| Feature | Description |
|---|---|
| **Cookie Manager** | View, add, edit, and delete all cookies for the current tab |
| **Profiles** | Save cookie sets as named profiles and restore them with one click |
| **Export** | Download current cookies or all profiles as JSON files |
| **Import** | Load cookies or profiles from a JSON file |
| **Badge counter** | The extension icon shows the live cookie count for the active tab |

---

## Project Structure

```
VOK-Cookies/
├── manifest.json          # Chrome Extension Manifest V3
├── resources/
│   └── logo.png           # README / branding logo
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Dark-theme styles
│   └── popup.js           # All popup logic
├── background/
│   └── background.js      # Service worker (badge counter)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── tools/
    └── make-icons.js      # Icon generator (pure Node.js)
```

---

## Load in Chrome / Edge

1. Open **chrome://extensions** (or **edge://extensions**)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `VOK-Cookies` folder
5. The extension appears in your toolbar

---

## Regenerate Icons

If you want to regenerate the icons:

```bash
node tools/make-icons.js
```

Requires Node.js (no extra packages needed).

---

## Permissions Used

| Permission | Reason |
|---|---|
| `cookies` | Read / write cookies |
| `activeTab` | Get the current tab URL |
| `tabs` | Query open tabs |
| `storage` | Persist profiles in `chrome.storage.local` |
| `<all_urls>` | Work on any website |

---

## Export Format

**Cookies JSON** — array of Chrome cookie objects:
```json
[
  {
    "name": "session_id",
    "value": "abc123",
    "domain": "example.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "expirationDate": 1800000000
  }
]
```

**Profiles JSON** — object with a `__type` marker:
```json
{
  "__type": "vok-profiles",
  "profiles": {
    "p_1700000000000": {
      "id": "p_1700000000000",
      "name": "Work Account",
      "domain": "example.com",
      "savedAt": "2024-01-01T00:00:00.000Z",
      "cookies": [ ... ]
    }
  }
}
```
