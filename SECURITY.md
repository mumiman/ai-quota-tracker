# Security & Privacy Policy (Zero Server-Side Data Retention)

**AI Quota Tracker** is architected from the ground up with **User Security & Privacy** as its primary design constraint.

## 1. Zero Server-Side Data Retention ("ไม่เก็บข้อมูลไว้เอง")

When deployed on **Vercel** (or any static hosting provider):
- **No Database, No Backend Logs, No Analytics:** The hosted application serves static HTML/JS (`public/index.html` and `public/js/quota-core.js`). No user quota numbers, session history, chat content, or credentials are ever transmitted to or stored on the server.
- **100% Browser-Local Persistence (`localStorage`):** Your quota metrics, usage trend history, and preferences live exclusively inside your own browser's `window.localStorage` (`ai_quota_tracker_state_v1` and `ai_quota_tracker_accounts_v1`).
- **1-Click Wipe & Export:** You can wipe all stored browser data at any time using the **Clear Local Data** button on the dashboard, or export your snapshot to a local JSON file.

## 2. Browser Extension Security Model (v4.0)

The accompanying Manifest V3 Browser Extension (`browser-extension/`) adheres to strict least-privilege principles:
- **Scoped Host Permissions:** Unlike generic extensions that request `<all_urls>`, `manifest.json` restricts access strictly to the 4 supported AI usage domains (`claude.ai`, `chatgpt.com`/`openai.com`, `antigravity.google.com`, `kimi.com`/`kimi.ai`) and the dashboard origin (`*.vercel.app` / `localhost:3456`).
- **DOM-Text Only (Zero Cookie / Token Access):** The extension only reads visible usage percentage strings (e.g. `13% used`, `96% left`, `Resets in 6 days`) from the usage settings DOM. It **never** reads cookies, `localStorage` tokens, session headers, or chat prompts.
- **Direct In-Browser Sync:** Extracted usage percentages are passed directly inside your browser from the background service worker to your open Dashboard tab via `chrome.tabs.sendMessage` → `window.postMessage` (origin-locked). No cloud relay server is used.

## 3. HTTP Security Headers & XSS Hardening

- **XSS Protection:** All strings parsed from external DOMs (`resetText`, `summary`, `lastStatus`) are sanitized via `escapeHtml()` before rendering.
- **Strict Headers (`vercel.json`):**
  - `Content-Security-Policy` restricting script/connect origins
  - `Referrer-Policy: no-referrer` so clicking external links never leaks your dashboard URL
  - `X-Frame-Options: DENY` (`frame-ancestors 'none'`) to prevent clickjacking
  - `X-Content-Type-Options: nosniff`

## 4. Optional Local Companion Mode (`node server.js`)

If you choose to run the optional Local Companion server on your own machine:
- The server binds exclusively to `127.0.0.1` (loopback) by default so other devices on your local network cannot access port `3456`.
- Local configuration files (`data/accounts.json`, `data/quota-state.json`) are excluded via `.gitignore` and written with `0600` (owner-only read/write) permissions.

## Reporting a Vulnerability

If you discover a security or privacy issue, please open a GitHub Security Advisory on [mumiman/ai-quota-tracker](https://github.com/mumiman/ai-quota-tracker/security) rather than posting a public issue containing exploit details.
