/**
 * Zero-Click Real-Time Content Script for LLM Quota Tracker (v4.0.0 — Zero-Storage Edition)
 *
 * Security & Privacy Guarantee:
 * - Never reads cookies, tokens, API keys, or chat messages.
 * - Syncs extracted usage text directly into open Dashboard tabs (Vercel or localhost:3456)
 *   via in-browser `chrome.runtime` + `window.postMessage` — zero external server storage.
 */
(function () {
  const EXT_VERSION = '4.0.0';
  const host = window.location.hostname || '';
  const port = window.location.port || '';
  let debounceTimer = null;

  function isDashboardPage() {
    if ((host === 'localhost' || host === '127.0.0.1') && port === '3456') return true;
    if (document.documentElement?.getAttribute('data-quota-dashboard') === 'true') return true;
    return false;
  }

  // 1. If running on the LLM Quota Tracker Dashboard (Vercel or localhost:3456)
  if (isDashboardPage()) {
    document.documentElement.setAttribute('data-quota-ext', EXT_VERSION);
    window.postMessage({ type: 'QUOTA_TRACKER_EXT_READY', version: EXT_VERSION }, window.location.origin);

    // Receive direct in-browser usage payloads from background.js and forward to Dashboard window
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'QUOTA_DIRECT_USAGE_PUSH') {
        document.documentElement.setAttribute('data-quota-ext', EXT_VERSION);
        window.postMessage({
          type: 'QUOTA_TRACKER_DIRECT_USAGE',
          version: EXT_VERSION,
          payload: msg.payload
        }, window.location.origin);
        sendResponse({ ok: true });
      }
      if (msg?.type === 'QUOTA_DIRECT_BULK_PUSH' && Array.isArray(msg.items)) {
        document.documentElement.setAttribute('data-quota-ext', EXT_VERSION);
        for (const item of msg.items) {
          window.postMessage({
            type: 'QUOTA_TRACKER_DIRECT_USAGE',
            version: EXT_VERSION,
            payload: item
          }, window.location.origin);
        }
        sendResponse({ ok: true });
      }
    });

    // Wake up the MV3 Service Worker immediately when the Dashboard loads or extension reloads
    try {
      chrome.runtime.sendMessage({
        type: 'REGISTER_DASHBOARD_ORIGIN',
        dashboardUrl: window.location.origin
      }, () => { void chrome.runtime.lastError; });

      chrome.runtime.sendMessage({ type: 'POLL_ALL_TABS_NOW' }, (resp) => {
        void chrome.runtime.lastError;
        if (resp?.items && Array.isArray(resp.items)) {
          for (const item of resp.items) {
            window.postMessage({
              type: 'QUOTA_TRACKER_DIRECT_USAGE',
              version: EXT_VERSION,
              payload: item
            }, window.location.origin);
          }
        }
        if (resp?.ok) {
          window.postMessage({ type: 'QUOTA_TRACKER_SYNC_DONE', syncedCount: resp.syncedCount || 0 }, window.location.origin);
        }
      });
    } catch {
      // Ignore if context is reloading
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data) return;

      if (event.data.type === 'QUOTA_TRACKER_SYNC_NOW') {
        document.documentElement.setAttribute('data-quota-sync-request', String(Date.now()));
        try {
          chrome.runtime.sendMessage({ type: 'POLL_ALL_TABS_NOW' }, (resp) => {
            if (!chrome.runtime.lastError) {
              document.documentElement.setAttribute('data-quota-ext', EXT_VERSION);
              if (resp?.items && Array.isArray(resp.items)) {
                for (const item of resp.items) {
                  window.postMessage({
                    type: 'QUOTA_TRACKER_DIRECT_USAGE',
                    version: EXT_VERSION,
                    payload: item
                  }, window.location.origin);
                }
              }
              window.postMessage({ type: 'QUOTA_TRACKER_SYNC_DONE', syncedCount: resp?.syncedCount || 0 }, window.location.origin);
            }
          });
        } catch {
          // If extension was reloaded, background.js re-injects content-script.js
        }
      }

      if (event.data.type === 'QUOTA_TRACKER_OPEN_PROVIDER') {
        const providerId = event.data.providerId || 'all';
        document.documentElement.setAttribute('data-quota-open-provider', providerId);
        try {
          chrome.runtime.sendMessage({ type: 'OPEN_AND_SYNC_PROVIDER', providerId }, (resp) => {
            if (!chrome.runtime.lastError && resp?.ok) {
              document.documentElement.removeAttribute('data-quota-open-provider');
              window.postMessage({
                type: 'QUOTA_TRACKER_OPEN_PROVIDER_ACK',
                providerId,
                foundAntigravityTab: Boolean(resp.foundAntigravityTab),
                syncedAntigravity: Boolean(resp.syncedAntigravity)
              }, window.location.origin);
            }
          });
        } catch {
          // Handled by background.js
        }
      }
    });
    return;
  }

  function collectAllElements(root, out = []) {
    if (!root) return out;
    const children = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      out.push(el);
      if (el.shadowRoot) {
        collectAllElements(el.shadowRoot, out);
      }
    }
    return out;
  }

  function isInsideCodeOrChatBubble(el) {
    if (!el || !el.closest) return false;
    return Boolean(
      el.closest('pre, code, textarea, script, style, [data-message-author-role], .markdown-body, .prose')
    );
  }

  // 2. On provider tabs (Claude, ChatGPT/Codex, Kimi, Antigravity in any frame):
  function extractDirectUsageFromCurrentPage() {
    const path = window.location.pathname || '';
    const hash = window.location.hash || '';

    if (host.includes('claude.ai')) {
      const dialogEl = document.querySelector('[role="dialog"], [data-state="open"]');
      const modalText = (dialogEl?.innerText || '').trim();
      const bodyText = (document.body?.innerText || '').trim();
      const candidate = (/\d{1,3}%\s*used/i.test(modalText) ? modalText : bodyText);
      if (
        (path.includes('/settings') || hash.includes('settings') || hash.includes('usage') || /Current session/i.test(candidate)) &&
        /\d{1,3}%\s*used/i.test(candidate)
      ) {
        return { providerId: 'claude', rawText: candidate, accountLabel: 'Claude.ai Web Session' };
      }
      return null;
    }

    if (host.includes('chatgpt.com') || host.includes('openai.com')) {
      const bodyText = (document.body?.innerText || '').trim();
      if (/\d{1,3}%\s*left/i.test(bodyText) && (/5-hour limit/i.test(bodyText) || /Weekly limit/i.test(bodyText))) {
        return { providerId: 'codex', rawText: bodyText, accountLabel: 'ChatGPT / Codex Session' };
      }
      return null;
    }

    if (host.includes('kimi.com') || host.includes('kimi.ai') || host.includes('moonshot.cn')) {
      const bodyText = (document.body?.innerText || '').trim();
      if (/\d{1,3}%\s*(?:left|used)/i.test(bodyText)) {
        return { providerId: 'kimi', rawText: bodyText, accountLabel: 'Kimi.ai Web Session' };
      }
      return null;
    }

    // Antigravity Web (antigravity.google.com/remote?settingsOpen=true&settingsScreen=Models) & Popover
    const allEls = collectAllElements(document);
    let bestPopoverText = '';
    let bestPopoverLen = Infinity;

    for (const el of allEls) {
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'PRE' || tag === 'CODE' || tag === 'TEXTAREA' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HTML') {
        continue;
      }
      if (isInsideCodeOrChatBubble(el)) continue;
      const t = (el.innerText || '').trim();
      if (t.length < 55 || t.length > 2600) continue;
      if (
        t.includes('Gemini Models') &&
        t.includes('Claude and GPT models') &&
        t.includes('Gemini 4 Argon') &&
        /\d{1,3}\s*%/i.test(t) &&
        !/\d{1,3}%\s*used/i.test(t) &&
        !t.includes('|') &&
        !t.includes('Resets in <1m')
      ) {
        if (t.length <= bestPopoverLen) {
          bestPopoverLen = t.length;
          bestPopoverText = t;
        }
      }
    }

    if (!bestPopoverText && host.includes('antigravity.google.com')) {
      const bodyText = (document.body?.innerText || '').trim();
      const idx = bodyText.lastIndexOf('Models & Usage');
      const scope = idx >= 0 ? bodyText.slice(idx, idx + 2200) : bodyText;
      if (
        scope.includes('Gemini Models') &&
        scope.includes('Claude and GPT models') &&
        scope.includes('Gemini 4 Argon') &&
        /\d{1,3}\s*%/i.test(scope)
      ) {
        bestPopoverText = scope;
      } else if (window.location.search.includes('settingsOpen=true') || bodyText.includes('Appearance')) {
        const now = Date.now();
        if (!window.__quotaLastModelsClick || now - window.__quotaLastModelsClick > 3500) {
          for (const el of allEls) {
            const tag = (el.tagName || '').toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'PRE' || tag === 'CODE') continue;
            if (isInsideCodeOrChatBubble(el)) continue;
            const txt = (el.innerText || el.textContent || '').trim();
            if (/^Models$/i.test(txt) && el.children.length <= 3) {
              window.__quotaLastModelsClick = now;
              try { el.click(); } catch {}
              setTimeout(() => notifyBackgroundScan(true), 450);
              break;
            }
          }
        }
      }
    }

    if (bestPopoverText) {
      return {
        providerId: 'antigravity',
        rawText: bestPopoverText,
        accountLabel: host.includes('antigravity.google.com')
          ? 'Antigravity Web (Models & Usage)'
          : 'Antigravity Usage Popover'
      };
    }

    return null;
  }

  function notifyBackgroundScan(force = false) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const direct = extractDirectUsageFromCurrentPage();
        if (direct && direct.rawText) {
          chrome.runtime.sendMessage({
            type: 'AUTO_SYNC_USAGE',
            providerId: direct.providerId,
            rawText: direct.rawText,
            internalApi: { accountLabel: direct.accountLabel },
            pageUrl: window.location.href,
            force
          }, () => { void chrome.runtime.lastError; });
        } else {
          chrome.runtime.sendMessage({ type: 'POLL_ALL_TABS_NOW' }, () => {
            void chrome.runtime.lastError;
          });
        }
      } catch {
        // Ignore if extension context was reloaded
      }
    }, 350);
  }

  setTimeout(() => notifyBackgroundScan(true), 600);
  setTimeout(() => notifyBackgroundScan(true), 2000);

  const observer = new MutationObserver(() => {
    notifyBackgroundScan(false);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  window.addEventListener('click', () => {
    setTimeout(() => notifyBackgroundScan(true), 350);
    setTimeout(() => notifyBackgroundScan(true), 1100);
  }, true);

  window.addEventListener('hashchange', () => {
    setTimeout(() => notifyBackgroundScan(true), 400);
    setTimeout(() => notifyBackgroundScan(true), 1200);
  });
})();
