const statusEl = document.getElementById('status');

function showStatus(msg, isError = false) {
  statusEl.style.display = 'block';
  statusEl.style.color = isError ? '#ef4444' : '#10b981';
  statusEl.textContent = msg;
}

const DEFAULT_DASHBOARD_URL = 'https://ai-quota-tracker-ten.vercel.app/';

async function renderSyncHistory() {
  const { lastSyncMap, lastDashboardOrigin } = await chrome.storage.local.get(['lastSyncMap', 'lastDashboardOrigin']);
  const map = lastSyncMap || {};
  const dashBtn = document.getElementById('openDashboardBtn');
  if (dashBtn) {
    try {
      const host = new URL(lastDashboardOrigin || DEFAULT_DASHBOARD_URL).host;
      dashBtn.textContent = `🚀 Open Dashboard (${host}) ↗`;
    } catch {}
  }

  for (const id of ['claude', 'codex', 'antigravity', 'kimi']) {
    const el = document.getElementById(`st_${id}`);
    if (!el || !map[id]) continue;
    const item = map[id];
    const timeStr = new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.style.color = item.ok ? '#10b981' : '#f59e0b';
    el.textContent = item.ok ? `✓ ${timeStr}` : `⚠ ${timeStr}`;
    el.title = item.message;
  }
}

document.getElementById('openDashboardBtn').addEventListener('click', async () => {
  const { lastDashboardOrigin } = await chrome.storage.local.get(['lastDashboardOrigin']);
  const targetUrl = lastDashboardOrigin || DEFAULT_DASHBOARD_URL;
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(
    (t) =>
      t.url &&
      (t.url.startsWith(targetUrl) ||
        t.url.includes('ai-quota-tracker-ten.vercel.app') ||
        t.url.includes('localhost:3456') ||
        t.url.includes('127.0.0.1:3456'))
  );
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: targetUrl });
  }
});

document.getElementById('openAntigravityBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://antigravity.google.com/remote?settingsOpen=true&settingsScreen=Models' });
});

document.getElementById('openClaudeBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

document.getElementById('openCodexBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://chatgpt.com/settings/usage?tab=overview' });
});

document.getElementById('openKimiBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.kimi.com/' });
});

document.getElementById('syncAllBtn').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ type: 'POLL_ALL_TABS_NOW' }, () => {
    showStatus('✓ Triggered real-time scan across all open tabs!');
    setTimeout(renderSyncHistory, 1000);
  });
});

renderSyncHistory();
setInterval(renderSyncHistory, 2000);
