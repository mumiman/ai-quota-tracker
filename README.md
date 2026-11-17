# AI Quota Tracker & Smart Switcher (Zero-Storage Edition)

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Privacy: Zero Server Storage](https://img.shields.io/badge/Privacy-100%25_Client--Side_localStorage-blue.svg)](SECURITY.md)
[![Extension: Manifest V3 v4.0](https://img.shields.io/badge/Extension-MV3_v4.0-purple.svg)](browser-extension/manifest.json)

A **privacy-first, zero-server-storage** Web Dashboard & Browser Extension for tracking real-time usage limits (`% used`) across **Antigravity (Google Gemini / Claude / Argon)**, **Claude (Anthropic)**, **Codex (OpenAI / ChatGPT)**, and **Kimi (`kimi.ai` / Moonshot)** — with smart model routing and context handoff generation.

---

## 🔒 Security & Privacy Guarantee ("ไม่เก็บข้อมูลไว้เอง")

Unlike cloud dashboards that store your usage data or API keys in a backend database:
1. **Zero Server-Side Data Retention:** When deployed on **Vercel**, the app runs as a **100% client-side Static Web App**. Your quota numbers, usage history, and settings are stored exclusively in your own browser's `localStorage` (`ai_quota_tracker_state_v1`).
2. **In-Browser Extension Bridge (Zero Cloud Upload):** The included Chrome/Brave Extension (`v4.0.0`) reads only the visible `% used` / `% left` numbers from your open AI usage tabs and passes them directly to your open Dashboard tab **inside your browser** via `window.postMessage` — never sending your data to an external server.
3. **Scoped Permissions & XSS Hardened:** The extension requests access *only* to the 4 supported AI domains (`claude.ai`, `chatgpt.com`, `antigravity.google.com`, `kimi.com`) + your dashboard URL.

---

## 🚀 Deploy to Vercel (Zero-Storage Cloud Mode)

You can deploy your own instance to Vercel in 1 click, or connect this GitHub repository directly in the Vercel Dashboard:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmumiman%2Fai-quota-tracker)

- **Framework Preset:** `Other` (Static / `vercel.json` pre-configured)
- **Build Command:** *(None required — zero external runtime dependencies)*
- **Output Directory:** `public` (automatically routed with strict `Content-Security-Policy` and `Referrer-Policy: no-referrer` via [`vercel.json`](vercel.json))

---

## 🧩 Install the Browser Extension (Chrome / Brave / Edge)

To enable **1-click & real-time auto-sync** from your signed-in browser tabs:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/mumiman/ai-quota-tracker.git
   ```
2. Open your browser's Extensions page:
   - **Brave:** `brave://extensions`
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (top-left) and select the **`browser-extension`** folder inside this repository.
5. Open your Dashboard (on Vercel or `http://localhost:3456`) and click **🚀 Open All & Auto-Sync** (or open individual usage tabs:
   - **Antigravity:** `https://antigravity.google.com/remote?settingsOpen=true&settingsScreen=Models`
   - **Claude:** `https://claude.ai/settings/usage`
   - **Codex / ChatGPT:** `https://chatgpt.com/settings/usage?tab=overview`
   - **Kimi:** `https://www.kimi.com/`

---

## 💻 Optional: Run Local Companion Mode (`localhost:3456`)

If you also want local CLI log scanning (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.kimi`) or a local OpenAI-compatible 429 auto-failover proxy on your own machine:

```bash
git clone https://github.com/mumiman/ai-quota-tracker.git
cd ai-quota-tracker
npm start
# Dashboard listening locally on http://127.0.0.1:3456
```

### Run Automated Tests

```bash
npm test
```

---

## Architecture Comparison: Vercel Cloud vs. Local Companion

| Feature | Vercel Cloud Deployment (`*.vercel.app`) | Local Companion (`npm start` on `127.0.0.1:3456`) |
| :--- | :--- | :--- |
| **Where is quota data stored?** | `window.localStorage` in user's browser only | `localStorage` + local `data/quota-state.json` (gitignored) |
| **Server-side database / logging?** | **None (0 bytes stored on Vercel)** | Local loopback (`127.0.0.1`) only |
| **Browser Extension Auto-Sync (v4.0)** | ✅ Direct in-browser `postMessage` sync | ✅ Direct in-browser + localhost sync |
| **Manual Copy-Paste Usage Sync** | ✅ 100% client-side (`QuotaCore`) | ✅ Client-side + local state |
| **Smart Auto-Router & Handoff Prompt** | ✅ 100% client-side (`QuotaCore`) | ✅ Client-side + `/api/handoff` |
| **Local CLI Log Watcher & Proxy** | Disabled for cloud security | ✅ Enabled locally on `127.0.0.1:3456` |

---

## License

Released under the [MIT License](LICENSE). See [SECURITY.md](SECURITY.md) for full details on our zero-retention security model.
