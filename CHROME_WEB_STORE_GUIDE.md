# Publishing "LLM Quota Tracker Real-Time Auto-Sync" to the Chrome Web Store

Everything in `browser-extension/` and `public/privacy.html` has been prepared to pass **Chrome Web Store Manifest V3 review**.

## 1. Prerequisites
1. **Google Developer Account:** Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time \$5 USD registration fee).
2. **Extension Package:** Download the ready-to-upload zip directly from:
   - `https://ai-quota-tracker-ten.vercel.app/ai-quota-tracker-extension-v4.0.zip`
   - Or use `public/ai-quota-tracker-extension-v4.0.zip` from this repository (includes `manifest.json` v4.0.2, `icons/icon16.png`, `icon48.png`, `icon128.png`).

---

## 2. Store Listing Details (Copy-Paste Ready)

- **Category:** Productivity / Developer Tools
- **Homepage URL:** `https://ai-quota-tracker-ten.vercel.app/`
- **Privacy Policy URL (Required):** `https://ai-quota-tracker-ten.vercel.app/privacy.html`
- **Support / Source URL:** `https://github.com/mumiman/ai-quota-tracker/issues`
- **Store Icon:** Upload `browser-extension/icons/icon128.png` (128×128 PNG)
- **Screenshots (1280×800 or 640×400 PNG):** Capture 1–2 screenshots of the Vercel Dashboard and Extension Popup.

### Single Purpose Statement (Copy-Paste)
> Automatically reads visible quota usage percentages from open AI provider usage tabs (Claude, ChatGPT/Codex, Antigravity, Kimi.ai) and syncs them directly in-browser to the user's AI Quota Tracker Dashboard without sending any data to external servers.

---

## 3. Privacy & Permission Justifications (Copy-Paste in Developer Console)

Google reviewers ask for a justification for each declared permission:

- **`tabs`**:
  > Used to detect whether a supported AI provider usage tab (Claude, ChatGPT/Codex, Antigravity, Kimi.ai) or the Dashboard tab is already open before creating new tabs, and to deliver extracted quota text to the open Dashboard tab.

- **`activeTab`**:
  > Used when the user interacts with the extension popup to scan or focus the active supported tab.

- **`scripting`**:
  > Used strictly on allowlisted AI provider host_permissions to read visible quota percentages (e.g., `% used` / `% left` and reset countdowns) from the DOM without reading cookies, credentials, or chat history.

- **`storage`**:
  > Stores non-sensitive latest extracted quota text and last sync timestamps locally in `chrome.storage.local` so the Dashboard updates reliably when the Manifest V3 service worker wakes up.

- **`alarms`**:
  > Schedules periodic background checks (every ~30 seconds) to refresh visible quota percentages from open AI usage tabs.

- **`host_permissions` (`claude.ai`, `chatgpt.com`, `*.openai.com`, `antigravity.google.com`, `*.kimi.com`, `*.kimi.ai`, `*.moonshot.cn`, `ai-quota-tracker-ten.vercel.app`, `localhost:3456`)**:
  > Strictly scoped to the supported AI provider usage pages (read-only quota text extraction) and the user's open AI Quota Tracker Dashboard (`ai-quota-tracker-ten.vercel.app` or local companion on port `3456`) to bridge data locally inside the browser.

- **Remote Code Usage:** Select **"No, I am not using remote code"** (all JS is bundled in the extension zip).
- **Data Usage Disclosures:** Select **No user data collected / transmitted to developer servers** — check the certification confirming zero external data collection.

---

## 4. After Approval
Once Google approves (usually 1–3 business days), you will receive a Chrome Web Store link (`https://chromewebstore.google.com/detail/<extension-id>`).
Replace or supplement the `.zip` download button in `public/index.html` and `README.md` with that Chrome Web Store URL — users on **Google Chrome**, **Brave**, **Edge**, and **Arc** can all install directly in 1 click from the Chrome Web Store!
