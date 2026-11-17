const { execFile } = require('child_process');
const { loadAccounts, saveAccounts } = require('./accounts');
const { loadState, saveState, appendHistorySnapshot } = require('./store');
const { scanLocalEnvironments } = require('./scanner');
const { parseUsagePageText, applyParsedUsageToState } = require('../public/js/quota-core');

function parseRateLimitHeaders(headers, provider) {
  const get = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === lower) return headers[k];
    }
    return null;
  };

  if (provider === 'claude') {
    const reqLimit = Number(get('anthropic-ratelimit-requests-limit'));
    const reqRem = Number(get('anthropic-ratelimit-requests-remaining'));
    const tokLimit = Number(get('anthropic-ratelimit-tokens-limit'));
    const tokRem = Number(get('anthropic-ratelimit-tokens-remaining'));
    const resetIso = get('anthropic-ratelimit-requests-reset') || get('anthropic-ratelimit-tokens-reset');

    let usedPct = null;
    if (reqLimit > 0 && !Number.isNaN(reqRem)) {
      usedPct = Math.round(((reqLimit - reqRem) / reqLimit) * 100);
    }
    if (tokLimit > 0 && !Number.isNaN(tokRem)) {
      const tokUsedPct = Math.round(((tokLimit - tokRem) / tokLimit) * 100);
      usedPct = usedPct === null ? tokUsedPct : Math.max(usedPct, tokUsedPct);
    }

    let resetText = null;
    if (resetIso) {
      const dt = new Date(resetIso);
      if (!Number.isNaN(dt.getTime())) {
        resetText = `Resets at ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      }
    }

    return {
      hasHeaders: usedPct !== null,
      usedPct: usedPct !== null ? Math.min(100, Math.max(0, usedPct)) : null,
      resetText,
      raw: { reqLimit, reqRem, tokLimit, tokRem }
    };
  }

  if (provider === 'codex' || provider === 'kimi') {
    const reqLimit = Number(get('x-ratelimit-limit-requests'));
    const reqRem = Number(get('x-ratelimit-remaining-requests'));
    const tokLimit = Number(get('x-ratelimit-limit-tokens'));
    const tokRem = Number(get('x-ratelimit-remaining-tokens'));
    const resetReq = get('x-ratelimit-reset-requests') || get('x-ratelimit-reset-tokens');

    let usedPct = null;
    if (reqLimit > 0 && !Number.isNaN(reqRem)) {
      usedPct = Math.round(((reqLimit - reqRem) / reqLimit) * 100);
    }
    if (tokLimit > 0 && !Number.isNaN(tokRem)) {
      const tokUsedPct = Math.round(((tokLimit - tokRem) / tokLimit) * 100);
      usedPct = usedPct === null ? tokUsedPct : Math.max(usedPct, tokUsedPct);
    }

    return {
      hasHeaders: usedPct !== null,
      usedPct: usedPct !== null ? Math.min(100, Math.max(0, usedPct)) : null,
      resetText: resetReq ? `Resets in ${resetReq}` : null,
      raw: { reqLimit, reqRem, tokLimit, tokRem }
    };
  }

  return { hasHeaders: false, usedPct: null, resetText: null, raw: {} };
}

async function syncClaudeAccount(accConfig) {
  if (!accConfig.apiKey) {
    return { ok: false, connected: false, status: 'No API key configured (using local ~/.claude watcher)' };
  }
  const url = `${accConfig.baseUrl}/v1/models`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': accConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      signal: AbortSignal.timeout(8000)
    });
    const parsed = parseRateLimitHeaders(res.headers, 'claude');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, connected: false, status: `Invalid API key (HTTP ${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, connected: false, status: `API returned HTTP ${res.status}`, rateLimit: parsed };
    }
    const body = await res.json().catch(() => ({}));
    const modelCount = Array.isArray(body.data) ? body.data.length : 0;
    return {
      ok: true,
      connected: true,
      status: `Connected (${modelCount} models accessible)`,
      rateLimit: parsed
    };
  } catch (err) {
    return { ok: false, connected: false, status: `Connection failed: ${err.message}` };
  }
}

async function syncCodexAccount(accConfig) {
  if (!accConfig.apiKey) {
    return { ok: false, connected: false, status: 'No API key configured (using local ~/.codex watcher)' };
  }
  const url = `${accConfig.baseUrl}/v1/models`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accConfig.apiKey}`
      },
      signal: AbortSignal.timeout(8000)
    });
    const parsed = parseRateLimitHeaders(res.headers, 'codex');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, connected: false, status: `Invalid API key (HTTP ${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, connected: false, status: `API returned HTTP ${res.status}`, rateLimit: parsed };
    }
    const body = await res.json().catch(() => ({}));
    const modelCount = Array.isArray(body.data) ? body.data.length : 0;
    return {
      ok: true,
      connected: true,
      status: `Connected (${modelCount} OpenAI/Codex models accessible)`,
      rateLimit: parsed
    };
  } catch (err) {
    return { ok: false, connected: false, status: `Connection failed: ${err.message}` };
  }
}

async function syncAntigravityAccount(accConfig) {
  if (!accConfig.apiKey) {
    return { ok: false, connected: false, status: 'No Gemini API key configured (using local ~/.gemini watcher)' };
  }
  const url = `${accConfig.baseUrl}/v1beta/models?key=${encodeURIComponent(accConfig.apiKey)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, connected: false, status: `Invalid Gemini API key (HTTP ${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, connected: false, status: `API returned HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    const modelCount = Array.isArray(body.models) ? body.models.length : 0;
    return {
      ok: true,
      connected: true,
      status: `Connected (${modelCount} Gemini models accessible)`,
      rateLimit: { hasHeaders: false }
    };
  } catch (err) {
    return { ok: false, connected: false, status: `Connection failed: ${err.message}` };
  }
}

async function syncKimiAccount(accConfig) {
  if (!accConfig || !accConfig.apiKey) {
    return { ok: false, connected: false, status: 'No API key configured (using local ~/.kimi watcher)' };
  }
  const url = `${accConfig.baseUrl}/v1/models`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accConfig.apiKey}`
      },
      signal: AbortSignal.timeout(8000)
    });
    const parsed = parseRateLimitHeaders(res.headers, 'kimi');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, connected: false, status: `Invalid Kimi API key (HTTP ${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, connected: false, status: `API returned HTTP ${res.status}`, rateLimit: parsed };
    }
    const body = await res.json().catch(() => ({}));
    const modelCount = Array.isArray(body.data) ? body.data.length : 0;
    return {
      ok: true,
      connected: true,
      status: `Connected (${modelCount} Kimi/Moonshot models accessible)`,
      rateLimit: parsed
    };
  } catch (err) {
    return { ok: false, connected: false, status: `Connection failed: ${err.message}` };
  }
}

async function syncOpenMacBrowserTabs(state, accounts) {
  if (process.platform !== 'darwin' || process.env.VERCEL) {
    return { syncedProviders: [], foundTabs: [], appleEventsDisabled: false };
  }

  const syncedProviders = [];
  const foundTabs = [];
  let appleEventsDisabled = false;

  await new Promise((resolve) => {
    execFile('pbpaste', [], { timeout: 1500, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (!err && stdout) {
        const clip = String(stdout).trim();
        if (
          clip.length >= 45 &&
          clip.length <= 3000 &&
          /Gemini Models/i.test(clip) &&
          /Claude and GPT models/i.test(clip) &&
          /Gemini 4 Argon/i.test(clip) &&
          /\d{1,3}\s*%/i.test(clip) &&
          !/\d{1,3}%\s*used/i.test(clip) &&
          !clip.includes('|')
        ) {
          const parsed = parseUsagePageText('antigravity', clip);
          if (parsed && parsed.ok) {
            applyParsedUsageToState(
              'antigravity',
              parsed,
              { accountLabel: 'Antigravity Clipboard Auto-Sync' },
              state,
              accounts
            );
            syncedProviders.push('antigravity');
          }
        }
      }
      resolve();
    });
  });

  const script = `
set outList to ""
repeat with appName in {"Brave Browser", "Google Chrome"}
  if application appName is running then
    try
      tell application appName
        repeat with w in windows
          repeat with t in tabs of w
            set u to URL of t
            set ttl to title of t
            if u contains "claude.ai" or u contains "chatgpt.com" or u contains "kimi.com" or u contains "kimi.ai" or u contains "antigravity" or u contains "jetski" or u contains "workstations" or ttl contains "Antigravity" then
              try
                set bodyTxt to execute t javascript "(function(){ var dlg = document.querySelector('[role=\\"dialog\\"]'); if (dlg && dlg.innerText && dlg.innerText.indexOf('Gemini Models') >= 0) return dlg.innerText; var mIdx = document.body && document.body.innerText ? document.body.innerText.lastIndexOf('Models & Usage') : -1; if (mIdx >= 0) return document.body.innerText.slice(mIdx); return (dlg ? dlg.innerText + '\\\\n' : '') + (document.body ? document.body.innerText : ''); })()"
                set outList to outList & "<<<TAB_START>>>" & u & "<<<URL_END>>>" & bodyTxt & "<<<TAB_END>>>"
              on error errMsg
                set outList to outList & "<<<TAB_START>>>" & u & "<<<URL_END>>>APPLE_EVENTS_ERR:" & errMsg & "<<<TAB_END>>>"
              end try
            end if
          end repeat
        end repeat
      end tell
    end try
  end if
end repeat
return outList
`;

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 3500, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ syncedProviders, foundTabs, appleEventsDisabled });
      }

      const blocks = String(stdout).split('<<<TAB_START>>>').slice(1);
      for (const blk of blocks) {
        const endIdx = blk.indexOf('<<<TAB_END>>>');
        const content = endIdx >= 0 ? blk.slice(0, endIdx) : blk;
        const sepIdx = content.indexOf('<<<URL_END>>>');
        if (sepIdx === -1) continue;
        const tabUrl = content.slice(0, sepIdx).trim();
        const bodyText = content.slice(sepIdx + '<<<URL_END>>>'.length).trim();

        let providerId = null;
        if (tabUrl.includes('claude.ai')) providerId = 'claude';
        else if (tabUrl.includes('chatgpt.com') || tabUrl.includes('openai.com')) providerId = 'codex';
        else if (tabUrl.includes('kimi.com') || tabUrl.includes('kimi.ai')) providerId = 'kimi';
        else if (
          (/Gemini Models/i.test(bodyText) && /Claude and GPT models/i.test(bodyText)) ||
          tabUrl.includes('antigravity') ||
          tabUrl.includes('jetski')
        ) {
          providerId = 'antigravity';
        }

        if (!providerId) continue;
        if (!foundTabs.includes(providerId)) foundTabs.push(providerId);

        if (bodyText.startsWith('APPLE_EVENTS_ERR:')) {
          appleEventsDisabled = true;
          continue;
        }

        const parsed = parseUsagePageText(providerId, bodyText);
        if (parsed && parsed.ok) {
          applyParsedUsageToState(
            providerId,
            parsed,
            { accountLabel: 'macOS Browser Tab Sync', pageUrl: tabUrl },
            state,
            accounts
          );
          if (!syncedProviders.includes(providerId)) {
            syncedProviders.push(providerId);
          }
        }
      }

      resolve({ syncedProviders, foundTabs, appleEventsDisabled });
    });
  });
}

async function syncAllAccounts({ applyLocalEstimates = true } = {}) {
  const accounts = loadAccounts();
  const state = loadState();
  const localScan = scanLocalEnvironments();

  const [agyRes, claudeRes, codexRes, kimiRes, macTabSync] = await Promise.all([
    syncAntigravityAccount(accounts.providers.antigravity),
    syncClaudeAccount(accounts.providers.claude),
    syncCodexAccount(accounts.providers.codex),
    syncKimiAccount(accounts.providers.kimi),
    syncOpenMacBrowserTabs(state, accounts)
  ]);

  const nowIso = new Date().toISOString();

  function updateProviderSyncMeta(provId, apiRes, scanSource) {
    const p = accounts.providers[provId];
    if (!p) return;
    if (macTabSync.syncedProviders.includes(provId)) {
      return;
    }
    const isWebSynced = (p.mode === 'web_auto_sync' || p.mode === 'browser_oauth') && p.connected;
    if (apiRes.ok) {
      p.connected = true;
      p.lastSyncAt = nowIso;
      p.lastStatus = apiRes.status;
    } else if (isWebSynced) {
      p.connected = true;
    } else {
      p.connected = false;
      p.lastSyncAt = nowIso;
      p.lastStatus = scanSource?.detected
        ? `Local CLI detected (${scanSource.recent5hEvents} events/5h) — waiting for Browser Extension Auto-Sync`
        : apiRes.status;
    }
  }

  updateProviderSyncMeta('antigravity', agyRes, localScan.sources.antigravity);
  updateProviderSyncMeta('claude', claudeRes, localScan.sources.claude);
  updateProviderSyncMeta('codex', codexRes, localScan.sources.codex);
  updateProviderSyncMeta('kimi', kimiRes, localScan.sources.kimi);

  saveAccounts(accounts);

  if (claudeRes.ok && claudeRes.rateLimit?.hasHeaders) {
    state.providers.claude.metrics[0].usedPct = claudeRes.rateLimit.usedPct;
    if (claudeRes.rateLimit.resetText) {
      state.providers.claude.metrics[0].resetText = claudeRes.rateLimit.resetText;
    }
  }

  if (codexRes.ok && codexRes.rateLimit?.hasHeaders) {
    state.providers.codex.limits[0].usedPct = codexRes.rateLimit.usedPct;
    if (codexRes.rateLimit.resetText) {
      state.providers.codex.limits[0].resetText = codexRes.rateLimit.resetText;
    }
  }

  if (kimiRes.ok && kimiRes.rateLimit?.hasHeaders && state.providers.kimi) {
    state.providers.kimi.limits[0].usedPct = kimiRes.rateLimit.usedPct;
    if (kimiRes.rateLimit.resetText) {
      state.providers.kimi.limits[0].resetText = kimiRes.rateLimit.resetText;
    }
  }

  if (macTabSync.syncedProviders.length > 0) {
    appendHistorySnapshot(state);
  }
  saveState(state);

  return {
    syncedAt: nowIso,
    results: {
      antigravity: agyRes,
      claude: claudeRes,
      codex: codexRes,
      kimi: kimiRes
    },
    macTabSync,
    localScan,
    state
  };
}

module.exports = {
  parseRateLimitHeaders,
  parseUsagePageText,
  applyParsedUsageToState,
  syncClaudeAccount,
  syncCodexAccount,
  syncAntigravityAccount,
  syncKimiAccount,
  syncAllAccounts
};
