/**
 * Background Service Worker for LLM Quota Tracker Real-Time Auto-Sync (v4.0.2 — Zero-Storage Edition)
 *
 * Security & Privacy Guarantee:
 * 1. Direct In-Browser Bridge: Extracted usage text is broadcast directly to open Dashboard tabs
 *    (on Vercel or localhost:3456) via `chrome.tabs.sendMessage` + `chrome.storage.local` cache.
 *    Zero user data is ever sent to any external cloud backend.
 * 2. Optional Local Companion Sync: Only sends to `http://localhost:3456` if a local companion
 *    tab or server is active on the user's own machine.
 * 3. Least-Privilege Scope: Only inspects AI provider usage pages and the Dashboard tab.
 */

const LOCAL_TRACKER_BASE = 'http://localhost:3456';
const PROVIDER_USAGE_URLS = {
  antigravity: 'https://antigravity.google.com/remote?settingsOpen=true&settingsScreen=Models',
  claude: 'https://claude.ai/settings/usage',
  codex: 'https://chatgpt.com/settings/usage?tab=overview',
  kimi: 'https://www.kimi.com/'
};

let lastPushedSignatures = {};
let latestExtractedPayloads = {};
let isScanning = false;
let openTabsInFlight = null;
const lastOpenedAtByProvider = {};

function isDashboardTabUrl(urlLower) {
  if (!urlLower) return false;
  return (
    urlLower.includes('localhost:3456') ||
    urlLower.includes('127.0.0.1:3456') ||
    urlLower.includes('.vercel.app')
  );
}

function classifyOpenUsageTabs(tabs, extractedByTabId = {}) {
  const existing = {
    antigravity: null,
    claude: null,
    codex: null,
    kimi: null
  };

  for (const tab of tabs || []) {
    if (!tab || !tab.id) continue;
    const rawUrl = tab.url || tab.pendingUrl || '';
    const urlLower = rawUrl.toLowerCase();
    if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) continue;
    if (isDashboardTabUrl(urlLower)) continue;

    const extracted = extractedByTabId[tab.id] || {};
    let host = '';
    try {
      host = new URL(rawUrl).hostname.toLowerCase();
    } catch {
      host = '';
    }

    if (
      !existing.antigravity &&
      (host.includes('antigravity.google.com') ||
        extracted.providerId === 'antigravity' ||
        extracted.isAntigravityTab)
    ) {
      existing.antigravity = tab;
    }

    if (
      !existing.claude &&
      (extracted.providerId === 'claude' ||
        (host.includes('claude.ai') &&
          (urlLower.includes('usage') || urlLower.includes('/settings'))))
    ) {
      existing.claude = tab;
    }

    if (
      !existing.codex &&
      (extracted.providerId === 'codex' ||
        ((host.includes('chatgpt.com') || host.includes('openai.com')) &&
          (urlLower.includes('usage') || urlLower.includes('/settings'))))
    ) {
      existing.codex = tab;
    }

    if (
      !existing.kimi &&
      (extracted.providerId === 'kimi' ||
        host.includes('kimi.com') ||
        host.includes('kimi.ai') ||
        host.includes('moonshot.cn'))
    ) {
      existing.kimi = tab;
    }
  }

  return existing;
}

function findMissingUsageProviders(requestedProviderId, existingMap) {
  const targets = requestedProviderId === 'all'
    ? ['antigravity', 'claude', 'codex', 'kimi']
    : (PROVIDER_USAGE_URLS[requestedProviderId] ? [requestedProviderId] : []);

  const alreadyOpen = [];
  const missing = [];
  for (const id of targets) {
    if (existingMap && existingMap[id]) {
      alreadyOpen.push(id);
    } else {
      missing.push(id);
    }
  }
  return { targets, alreadyOpen, missing };
}

/**
 * Fast, synchronous DOM extractor injected into open browser tabs via chrome.scripting.executeScript.
 */
async function extractIsolatedUsageFromTab(tryOpenAntigravityPopover = false) {
  try {
    const host = window.location.hostname || '';
    const port = window.location.port || '';
    const path = window.location.pathname || '';
    const hash = window.location.hash || '';
    const isMarkedDashboard = document.documentElement?.getAttribute('data-quota-dashboard') === 'true';

    // 1. If this tab is the LLM Quota Tracker Dashboard (Vercel or localhost:3456)
    if (isMarkedDashboard || ((host === 'localhost' || host === '127.0.0.1') && port === '3456')) {
      document.documentElement.setAttribute('data-quota-ext', '4.0.2');
      const syncReq = document.documentElement.getAttribute('data-quota-sync-request');
      const openReq = document.documentElement.getAttribute('data-quota-open-provider');
      if (syncReq) document.documentElement.removeAttribute('data-quota-sync-request');
      if (openReq) document.documentElement.removeAttribute('data-quota-open-provider');
      return {
        isDashboard: true,
        dashboardOrigin: window.location.origin,
        syncRequested: Boolean(syncReq),
        openProviderRequested: openReq || null
      };
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

    // 2. Claude (claude.ai — supports both /settings/usage and /new#settings/usage modal)
    if (host.includes('claude.ai')) {
      const dialogEl = document.querySelector('[role="dialog"], [data-state="open"]');
      const modalText = (dialogEl?.innerText || '').trim();
      const bodyText = (document.body?.innerText || '').trim();
      let bestText = '';

      if (/\d{1,3}%\s*used/i.test(modalText) && /Current session/i.test(modalText)) {
        bestText = modalText;
      } else if (
        (path.includes('/settings') || hash.includes('settings') || hash.includes('usage') || /Your usage/i.test(bodyText)) &&
        /\d{1,3}%\s*used/i.test(bodyText)
      ) {
        bestText = bodyText;
      } else {
        const allEls = collectAllElements(document);
        let bestLen = Infinity;
        for (const el of allEls) {
          if (isInsideCodeOrChatBubble(el)) continue;
          const t = (el.innerText || '').trim();
          if (t.length < 40 || t.length > 3500) continue;
          if (/Current session/i.test(t) && /This week/i.test(t) && /\d{1,3}%\s*used/i.test(t)) {
            if (t.length < bestLen) {
              bestLen = t.length;
              bestText = t;
            }
          }
        }
      }

      if (bestText) {
        return {
          providerId: 'claude',
          rawText: bestText,
          internalApi: { accountLabel: 'Claude.ai Web Session' },
          pageUrl: window.location.href
        };
      }
      return null;
    }

    // 3. Codex / ChatGPT (chatgpt.com / openai.com — supports /settings/usage?tab=overview & /codex/settings/usage)
    if (host.includes('chatgpt.com') || host.includes('openai.com')) {
      const bodyText = (document.body?.innerText || '').trim();
      let bestText = '';

      if (
        (path.includes('/usage') || path.includes('/settings') || /Plan limits/i.test(bodyText) || /5-hour limit/i.test(bodyText)) &&
        /\d{1,3}%\s*left/i.test(bodyText)
      ) {
        bestText = bodyText;
      } else {
        const allEls = collectAllElements(document);
        let bestLen = Infinity;
        for (const el of allEls) {
          if (isInsideCodeOrChatBubble(el)) continue;
          const t = (el.innerText || '').trim();
          if (t.length < 30 || t.length > 3500) continue;
          if (/5-hour limit/i.test(t) && /Weekly limit/i.test(t) && /\d{1,3}%\s*left/i.test(t)) {
            if (t.length < bestLen) {
              bestLen = t.length;
              bestText = t;
            }
          }
        }
      }

      if (bestText) {
        return {
          providerId: 'codex',
          rawText: bestText,
          internalApi: { accountLabel: 'ChatGPT / Codex Session' },
          pageUrl: window.location.href
        };
      }
      return null;
    }

    // 4. Kimi (kimi.com / kimi.ai / moonshot.cn)
    if (host.includes('kimi.com') || host.includes('kimi.ai') || host.includes('moonshot.cn')) {
      const allEls = collectAllElements(document);
      let bestText = '';
      let bestLen = Infinity;
      for (const el of allEls) {
        if (isInsideCodeOrChatBubble(el)) continue;
        const t = (el.innerText || '').trim();
        if (t.length < 20 || t.length > 2500) continue;
        if (/\d{1,3}%\s*(?:left|used)/i.test(t)) {
          if (t.length < bestLen) {
            bestLen = t.length;
            bestText = t;
          }
        }
      }
      return {
        providerId: 'kimi',
        rawText: bestText,
        internalApi: { accountLabel: 'Kimi.ai Web Session' },
        pageUrl: window.location.href
      };
    }

    // 5. Antigravity Workspace Detection & Usage Popover / Models & Usage Extraction
    function findAntigravityPopoverText() {
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
        if (t.length < 55 || t.length > 2200) continue;

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
        const bTxt = (document.body?.innerText || '').trim();
        const mIdx = bTxt.lastIndexOf('Models & Usage');
        const scope = mIdx >= 0 ? bTxt.slice(mIdx, mIdx + 2200) : bTxt;
        if (
          scope.includes('Gemini Models') &&
          scope.includes('Claude and GPT models') &&
          scope.includes('Gemini 4 Argon') &&
          /\d{1,3}\s*%/i.test(scope)
        ) {
          bestPopoverText = scope;
        }
      }
      return bestPopoverText;
    }

    function findElementByExactText(regex) {
      const allEls = collectAllElements(document);
      for (let i = allEls.length - 1; i >= 0; i--) {
        const el = allEls[i];
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'PRE' || tag === 'CODE') continue;
        if (isInsideCodeOrChatBubble(el)) continue;
        const txt = (el.innerText || el.textContent || '').trim();
        const aria = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '';
        if ((regex.test(txt) || regex.test(aria.trim())) && el.children.length <= 4) {
          return el;
        }
      }
      return null;
    }

    function findAntigravityUsageButton() {
      return findElementByExactText(/^Models$/i) || findElementByExactText(/^Usage$/i);
    }

    function triggerFullClick(el) {
      if (!el) return;
      const targets = [el, el.closest && el.closest('button, [role="button"], [aria-haspopup], a, li, div[tabindex]')].filter(Boolean);
      for (const t of targets) {
        try {
          t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
          t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
          t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          t.click();
        } catch {
          // ignore
        }
      }
    }

    let bestPopoverText = findAntigravityPopoverText();
    const bodyTextSample = (document.body?.innerText || '').slice(0, 4000);
    const titleOrUrlIsAgy = /antigravity|jetski|workstations/i.test(`${document.title} ${window.location.href}`);
    const domLooksLikeAgy = Boolean(
      bestPopoverText ||
        titleOrUrlIsAgy ||
        Boolean(findAntigravityUsageButton()) ||
        (bodyTextSample.includes('Antigravity') && bodyTextSample.includes('Gemini'))
    );

    const isSettingsOpenOnGeneral =
      host.includes('antigravity.google.com') &&
      (window.location.search.includes('settingsOpen=true') || bodyTextSample.includes('Appearance'));

    if (!bestPopoverText && domLooksLikeAgy && (tryOpenAntigravityPopover || isSettingsOpenOnGeneral)) {
      let modelsOrUsageBtn = findAntigravityUsageButton();
      if (!modelsOrUsageBtn && tryOpenAntigravityPopover) {
        const settingsBtn = findElementByExactText(/^Settings$/i);
        if (settingsBtn) {
          triggerFullClick(settingsBtn);
          await new Promise((r) => setTimeout(r, 320));
          modelsOrUsageBtn = findAntigravityUsageButton();
        }
      }
      if (modelsOrUsageBtn) {
        triggerFullClick(modelsOrUsageBtn);
        await new Promise((r) => setTimeout(r, 420));
        bestPopoverText = findAntigravityPopoverText();
      }
    }

    if (bestPopoverText) {
      return {
        providerId: 'antigravity',
        rawText: bestPopoverText,
        internalApi: {
          accountLabel: host.includes('antigravity.google.com')
            ? 'Antigravity Web (Models & Usage)'
            : 'Antigravity Usage Popover'
        },
        pageUrl: window.location.href,
        isAntigravityTab: true
      };
    }

    if (domLooksLikeAgy) {
      return {
        providerId: null,
        isAntigravityTab: true,
        pageUrl: window.location.href
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function recordSyncStatus(providerId, ok, message) {
  const store = await chrome.storage.local.get(['lastSyncMap']);
  const map = store.lastSyncMap || {};
  map[providerId] = {
    ok,
    message,
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ lastSyncMap: map });
}

/**
 * Broadcasts extracted usage payload directly to all open Dashboard tabs in the browser
 * (both Vercel-hosted and localhost:3456) and optionally syncs with localhost:3456 if running.
 */
async function broadcastUsageToDashboardsAndLocal({ providerId, rawText, internalApi, pageUrl, force = false }) {
  if (!providerId || !rawText || !rawText.trim()) return { ok: false };

  const sig = `${providerId}|${rawText.replace(/\s+/g, ' ').trim()}|${internalApi?.accountLabel || ''}`;
  const payload = {
    providerId,
    rawText,
    accountLabel: internalApi?.accountLabel || 'Browser Extension Auto-Sync',
    pageUrl,
    syncedAt: new Date().toISOString()
  };
  latestExtractedPayloads[providerId] = payload;

  // Persist latest payload in chrome.storage.local so Dashboard tabs can always hydrate even after SW sleep
  try {
    const store = await chrome.storage.local.get(['latestPayloadsMap']);
    const map = store.latestPayloadsMap || {};
    map[providerId] = payload;
    await chrome.storage.local.set({ latestPayloadsMap: map });
  } catch {
    // ignore storage quota errors
  }

  if (!force && lastPushedSignatures[providerId] === sig) {
    return { ok: true, cached: true, payload };
  }

  let hostLabel = 'browser tab';
  try { hostLabel = new URL(pageUrl).hostname; } catch {}

  // 1. Send directly to any open Dashboard tab in the browser (Zero-Server-Storage path for Vercel!)
  let deliveredToBrowserTab = false;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (
        tab.url.includes('localhost:3456') ||
        tab.url.includes('127.0.0.1:3456') ||
        tab.url.includes('.vercel.app')
      ) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'QUOTA_DIRECT_USAGE_PUSH',
            payload
          });
          deliveredToBrowserTab = true;
        } catch {
          // Tab might not be a dashboard tab
        }
      }
    }
  } catch {
    // ignore
  }

  // Only cache signature after delivery succeeded (or local server accepted) so a sleeping tab doesn't drop updates
  let deliveredToLocalServer = false;
  try {
    const res = await fetch(`${LOCAL_TRACKER_BASE}/api/accounts/parse-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId,
        rawText,
        accountLabel: payload.accountLabel,
        pageUrl
      }),
      signal: AbortSignal.timeout(1500)
    });
    if (res.ok) {
      deliveredToLocalServer = true;
    }
  } catch {
    // Normal when using Vercel Cloud Dashboard without local server running
  }

  if (deliveredToBrowserTab || deliveredToLocalServer) {
    lastPushedSignatures[providerId] = sig;
  }

  await recordSyncStatus(
    providerId,
    true,
    `Live synced from ${hostLabel}${deliveredToBrowserTab ? ' (Direct Browser Sync)' : ''}`
  );

  return {
    ok: true,
    deliveredToBrowserTab,
    deliveredToLocalServer,
    payload
  };
}

async function reinjectContentScriptsIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || !tab.url) return;
        if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content-script.js']
          });
        } catch {
          // ignore tabs outside host_permissions
        }
      })
    );
  } catch {
    // ignore
  }
}

async function _openAndSyncProviderTabsImpl(providerId) {
  const allTabs = await chrome.tabs.query({});
  const extractedByTabId = {};
  const syncedSet = new Set();

  const candidateTabs = allTabs.filter((tab) => {
    if (!tab.id) return false;
    const rawUrl = (tab.url || tab.pendingUrl || '').toLowerCase();
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) return false;
    return !isDashboardTabUrl(rawUrl);
  });

  // Scan all non-dashboard open tabs in parallel first (and try opening Antigravity Models popover if needed)
  await Promise.all(
    candidateTabs.map(async (tab) => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: extractIsolatedUsageFromTab,
          args: [true]
        });
        for (const frameRes of (results || [])) {
          const r = frameRes?.result;
          if (!r) continue;
          if (r.isAntigravityTab || r.providerId) {
            const prev = extractedByTabId[tab.id] || {};
            extractedByTabId[tab.id] = {
              providerId: r.providerId || prev.providerId || null,
              isAntigravityTab: Boolean(r.isAntigravityTab || prev.isAntigravityTab)
            };
          }
          if (r.providerId && r.rawText) {
            const pushRes = await broadcastUsageToDashboardsAndLocal({
              providerId: r.providerId,
              rawText: r.rawText,
              internalApi: r.internalApi,
              pageUrl: r.pageUrl,
              force: true
            });
            if (pushRes?.ok) {
              syncedSet.add(r.providerId);
            }
          }
        }
      } catch {
        // ignore restricted tab or tab still loading
      }
    })
  );

  const existingMap = classifyOpenUsageTabs(allTabs, extractedByTabId);
  const { alreadyOpen, missing } = findMissingUsageProviders(providerId, existingMap);
  const opened = [];

  for (const id of missing) {
    const url = PROVIDER_USAGE_URLS[id];
    if (!url) continue;
    const now = Date.now();
    if (now - (lastOpenedAtByProvider[id] || 0) < 3000) continue;
    lastOpenedAtByProvider[id] = now;
    try {
      await chrome.tabs.create({
        url,
        active: providerId !== 'all'
      });
      opened.push(id);
    } catch {
      // ignore tab creation error
    }
  }

  // If clicking a single provider button and its tab already exists, focus it without opening a duplicate
  if (providerId !== 'all' && existingMap[providerId]?.id) {
    const targetTab = existingMap[providerId];
    await chrome.tabs.update(targetTab.id, { active: true }).catch(() => {});
    if (targetTab.windowId) {
      await chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
    }
  }

  setTimeout(() => scanAllOpenTabs(true), 1000);
  setTimeout(() => scanAllOpenTabs(true), 2500);
  setTimeout(() => scanAllOpenTabs(true), 4500);
  setTimeout(() => scanAllOpenTabs(true), 7000);

  return {
    smartTabOpenHandled: true,
    alreadyOpen,
    opened,
    syncedProviders: [...syncedSet],
    foundAntigravityTab: Boolean(existingMap.antigravity),
    syncedAntigravity: syncedSet.has('antigravity')
  };
}

async function openAndSyncProviderTabs(providerId) {
  if (openTabsInFlight) {
    return await openTabsInFlight;
  }
  openTabsInFlight = _openAndSyncProviderTabsImpl(providerId || 'all').finally(() => {
    openTabsInFlight = null;
  });
  return await openTabsInFlight;
}

async function scanAllOpenTabs(force = false) {
  if (isScanning && !force) return 0;
  isScanning = true;
  let dashboardRequestedForce = false;
  let requestedOpenProvider = null;
  let syncedCount = 0;

  try {
    const tabs = await chrome.tabs.query({});
    const validTabs = tabs.filter(
      (tab) => tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
    );

    const perTabResults = await Promise.all(
      validTabs.map(async (tab) => {
        try {
          return await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: extractIsolatedUsageFromTab,
            args: [Boolean(force)]
          });
        } catch {
          return [];
        }
      })
    );

    const pushPromises = [];
    for (const injectionResults of perTabResults) {
      for (const frameRes of (injectionResults || [])) {
        const r = frameRes?.result;
        if (!r) continue;
        if (r.isDashboard) {
          if (r.dashboardOrigin) {
            chrome.storage.local.set({ lastDashboardOrigin: r.dashboardOrigin });
          }
          if (r.syncRequested) dashboardRequestedForce = true;
          if (r.openProviderRequested) requestedOpenProvider = r.openProviderRequested;
          continue;
        }
        if (r.providerId && r.rawText) {
          pushPromises.push(
            broadcastUsageToDashboardsAndLocal({
              providerId: r.providerId,
              rawText: r.rawText,
              internalApi: r.internalApi,
              pageUrl: r.pageUrl,
              force: force || dashboardRequestedForce
            }).then((res) => {
              if (res?.ok) syncedCount++;
            })
          );
        }
      }
    }

    await Promise.all(pushPromises);

    if (requestedOpenProvider) {
      await openAndSyncProviderTabs(requestedOpenProvider);
    } else if (dashboardRequestedForce && !force) {
      isScanning = false;
      return await scanAllOpenTabs(true);
    }
  } catch {
    // ignore query error
  } finally {
    isScanning = false;
  }
  return syncedCount;
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.tabs) {
  reinjectContentScriptsIntoOpenTabs().then(() => scanAllOpenTabs(true));

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('quota_auto_sync', { periodInMinutes: 0.5 });
    chrome.storage.local.set({ autoSyncEnabled: true });
    reinjectContentScriptsIntoOpenTabs().then(() => scanAllOpenTabs(true));
  });

  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('quota_auto_sync', { periodInMinutes: 0.5 });
    reinjectContentScriptsIntoOpenTabs().then(() => scanAllOpenTabs(true));
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      scanAllOpenTabs(false);
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    scanAllOpenTabs(false);
  });

  setInterval(() => {
    scanAllOpenTabs(false);
  }, 2000);

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'quota_auto_sync') return;
    await scanAllOpenTabs(false);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'REGISTER_DASHBOARD_ORIGIN' && msg.dashboardUrl) {
      chrome.storage.local.set({ lastDashboardOrigin: msg.dashboardUrl }).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    if (msg.type === 'AUTO_SYNC_USAGE' || msg.type === 'SYNC_USAGE') {
      broadcastUsageToDashboardsAndLocal({
        providerId: msg.providerId,
        rawText: msg.rawText,
        internalApi: msg.internalApi,
        pageUrl: msg.pageUrl,
        force: Boolean(msg.force)
      }).then(sendResponse);
      return true;
    }

    if (msg.type === 'POLL_ALL_TABS_NOW') {
      scanAllOpenTabs(true).then((syncedCount) => {
        const items = Object.values(latestExtractedPayloads);
        sendResponse({ ok: true, syncedCount, items });
      });
      return true;
    }

    if (msg.type === 'OPEN_AND_SYNC_PROVIDER') {
      openAndSyncProviderTabs(msg.providerId || 'all').then((res) =>
        sendResponse({
          ok: true,
          handled: true,
          smartTabOpenHandled: Boolean(res?.smartTabOpenHandled),
          alreadyOpen: Array.isArray(res?.alreadyOpen) ? res.alreadyOpen : [],
          opened: Array.isArray(res?.opened) ? res.opened : [],
          syncedProviders: Array.isArray(res?.syncedProviders) ? res.syncedProviders : [],
          foundAntigravityTab: Boolean(res?.foundAntigravityTab),
          syncedAntigravity: Boolean(res?.syncedAntigravity)
        })
      );
      return true;
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROVIDER_USAGE_URLS,
    isDashboardTabUrl,
    classifyOpenUsageTabs,
    findMissingUsageProviders
  };
}
