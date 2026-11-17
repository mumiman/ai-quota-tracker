const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadState, saveState, resetDemoState, appendHistorySnapshot, recordUsage, applyReset } = require('../src/store');
const { evaluateRoutes, generateHandoffPrompt } = require('../src/router');
const { scanLocalEnvironments } = require('../src/scanner');
const { getMaskedAccounts, updateAccountConfig, updateGlobalSettings, autoDetectLocalLogins, loadAccounts, saveAccounts } = require('../src/accounts');
const { syncAllAccounts, parseUsagePageText, applyParsedUsageToState } = require('../src/connectors');
const { handleProxyChatCompletion } = require('../src/proxy');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function getAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  if (
    !origin ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('chrome-extension://')
  ) {
    return origin || 'http://localhost:3456';
  }
  return 'http://localhost:3456';
}

function sendJson(req, res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': getAllowedOrigin(req),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-quota-provider'
      });
      return res.end();
    }

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(req, res, 200, { ok: true, service: 'ai-quota-tracker', mode: 'local_companion', timestamp: new Date().toISOString() });
      }

      if (req.method === 'GET' && pathname === '/api/state') {
        const state = loadState();
        const taskType = url.searchParams.get('taskType') || state.taskType || 'deep';
        const routing = evaluateRoutes(state, taskType);
        const accounts = getMaskedAccounts();
        return sendJson(req, res, 200, { state, routing, accounts });
      }

      if (req.method === 'GET' && pathname === '/api/accounts') {
        return sendJson(req, res, 200, { accounts: getMaskedAccounts() });
      }

      if (req.method === 'POST' && pathname === '/api/accounts') {
        const body = await readBody(req);
        if (body.providerId) {
          updateAccountConfig(body.providerId, body);
        }
        if (body.autoSyncSeconds || body.autoFallbackThreshold) {
          updateGlobalSettings(body);
        }
        return sendJson(req, res, 200, { ok: true, accounts: getMaskedAccounts() });
      }

      if (req.method === 'POST' && pathname === '/api/accounts/auto-detect') {
        const { detected } = autoDetectLocalLogins();
        const syncResult = await syncAllAccounts({ applyLocalEstimates: true });
        const routing = evaluateRoutes(syncResult.state, syncResult.state.taskType || 'deep');
        return sendJson(req, res, 200, {
          ok: true,
          detected,
          accounts: getMaskedAccounts(),
          state: syncResult.state,
          routing,
          localScan: syncResult.localScan
        });
      }

      if (req.method === 'POST' && pathname === '/api/accounts/session-sync') {
        const body = await readBody(req);
        const { providerId, sessionUsedPct, weeklyUsedPct, sessionResetText, weeklyResetText, accountLabel, antigravityMetrics } = body;
        if (!providerId) {
          return sendJson(req, res, 400, { error: 'providerId is required' });
        }

        const acc = loadAccounts();
        const state = loadState();

        if (providerId === 'antigravity' && antigravityMetrics && typeof antigravityMetrics === 'object') {
          applyParsedUsageToState(
            'antigravity',
            antigravityMetrics,
            { accountLabel: accountLabel || 'Antigravity Usage Popover' },
            state,
            acc
          );
          saveAccounts(acc);
          appendHistorySnapshot(state);
          saveState(state);
          const routing = evaluateRoutes(state, state.taskType || 'deep');
          return sendJson(req, res, 200, { ok: true, state, routing, accounts: getMaskedAccounts() });
        }

        if (acc.providers[providerId]) {
          acc.providers[providerId].connected = true;
          acc.providers[providerId].mode = 'browser_oauth';
          acc.providers[providerId].lastSyncAt = new Date().toISOString();
          acc.providers[providerId].lastStatus = `Signed in via Web Session (${accountLabel || 'Browser OAuth'})`;
          saveAccounts(acc);
        }

        if (providerId === 'claude') {
          if (typeof sessionUsedPct === 'number') state.providers.claude.metrics[0].usedPct = Math.min(100, Math.max(0, sessionUsedPct));
          if (typeof weeklyUsedPct === 'number') {
            state.providers.claude.metrics[1].usedPct = Math.min(100, Math.max(0, weeklyUsedPct));
            state.providers.claude.summary = `Fresh week. ${state.providers.claude.metrics[1].usedPct}% of your weekly limit used.`;
          }
          if (sessionResetText) state.providers.claude.metrics[0].resetText = sessionResetText;
          if (weeklyResetText) state.providers.claude.metrics[1].resetText = weeklyResetText;
        } else if (providerId === 'codex') {
          if (typeof sessionUsedPct === 'number') state.providers.codex.limits[0].usedPct = Math.min(100, Math.max(0, sessionUsedPct));
          if (typeof weeklyUsedPct === 'number') state.providers.codex.limits[1].usedPct = Math.min(100, Math.max(0, weeklyUsedPct));
          if (sessionResetText) state.providers.codex.limits[0].resetText = sessionResetText;
          if (weeklyResetText) state.providers.codex.limits[1].resetText = weeklyResetText;
        } else if (providerId === 'antigravity') {
          if (typeof sessionUsedPct === 'number') state.providers.antigravity.groups[0].items[0].usedPct = Math.min(100, Math.max(0, sessionUsedPct));
          if (typeof weeklyUsedPct === 'number') state.providers.antigravity.groups[1].items[1].usedPct = Math.min(100, Math.max(0, weeklyUsedPct));
        } else if (providerId === 'kimi' && state.providers.kimi) {
          if (typeof sessionUsedPct === 'number') state.providers.kimi.limits[0].usedPct = Math.min(100, Math.max(0, sessionUsedPct));
          if (typeof weeklyUsedPct === 'number') state.providers.kimi.limits[1].usedPct = Math.min(100, Math.max(0, weeklyUsedPct));
          if (sessionResetText) state.providers.kimi.limits[0].resetText = sessionResetText;
          if (weeklyResetText) state.providers.kimi.limits[1].resetText = weeklyResetText;
        }

        appendHistorySnapshot(state);
        saveState(state);
        const routing = evaluateRoutes(state, state.taskType || 'deep');
        return sendJson(req, res, 200, { ok: true, state, routing, accounts: getMaskedAccounts() });
      }

      if (req.method === 'POST' && pathname === '/api/accounts/open-app') {
        const body = await readBody(req);
        const { providerId } = body;
        const acc = loadAccounts();
        const webUrl = acc.providers?.[providerId]?.webUrl || null;
        const extensionPath = path.join(__dirname, '..', 'browser-extension');
        if (process.platform === 'darwin' && !process.env.VERCEL) {
          const { execFile } = require('child_process');
          if (providerId === 'antigravity') {
            execFile('open', ['-a', 'Antigravity'], () => {});
          } else if (providerId === 'extension_folder') {
            execFile('open', ['-R', extensionPath], () => {});
          }
        }
        return sendJson(req, res, 200, { ok: true, providerId, platform: process.platform, webUrl, extensionPath });
      }

      if (req.method === 'POST' && pathname === '/api/accounts/parse-usage') {
        const body = await readBody(req);
        const { providerId, rawText } = body;
        if (!providerId || !rawText) {
          return sendJson(req, res, 400, { error: 'providerId and rawText are required' });
        }
        const parsed = parseUsagePageText(providerId, rawText);
        if (!parsed.ok) {
          return sendJson(req, res, 422, { error: 'Could not find usage percentages (% used / % left) in pasted text' });
        }

        const acc = loadAccounts();
        const state = loadState();
        applyParsedUsageToState(providerId, parsed, body, state, acc);
        saveAccounts(acc);
        appendHistorySnapshot(state);
        saveState(state);
        const routing = evaluateRoutes(state, state.taskType || 'deep');
        return sendJson(req, res, 200, { ok: true, parsed, state, routing, accounts: getMaskedAccounts() });
      }

      if (req.method === 'POST' && pathname === '/api/sync') {
        const body = await readBody(req);
        const syncResult = await syncAllAccounts({
          applyLocalEstimates: body.applyLocalEstimates !== false
        });
        const routing = evaluateRoutes(syncResult.state, syncResult.state.taskType || 'deep');
        return sendJson(req, res, 200, {
          ...syncResult,
          routing,
          accounts: getMaskedAccounts()
        });
      }

      if (req.method === 'POST' && pathname === '/proxy/v1/chat/completions') {
        const body = await readBody(req);
        const forcedProvider = req.headers['x-quota-provider'] || null;
        const result = await handleProxyChatCompletion(body, forcedProvider);
        return sendJson(req, res, result.status, result.body, result.headers);
      }

      if (req.method === 'POST' && pathname === '/api/usage') {
        const body = await readBody(req);
        const state = loadState();
        const updated = recordUsage(state, {
          providerId: body.providerId,
          groupId: body.groupId,
          amount: typeof body.amount === 'number' ? body.amount : 10
        });
        if (body.taskType) {
          updated.taskType = body.taskType;
          saveState(updated);
        }
        const routing = evaluateRoutes(updated, updated.taskType);
        return sendJson(req, res, 200, { state: updated, routing });
      }

      if (req.method === 'POST' && pathname === '/api/reset') {
        const body = await readBody(req);
        const state = loadState();
        const result = applyReset(state, {
          providerId: body.providerId,
          groupId: body.groupId,
          ticketId: body.ticketId
        });
        if (result.error) {
          return sendJson(req, res, 400, { error: result.error });
        }
        const routing = evaluateRoutes(result.state, result.state.taskType);
        return sendJson(req, res, 200, { ...result, routing });
      }

      if (req.method === 'POST' && pathname === '/api/demo/reset') {
        const state = resetDemoState();
        const routing = evaluateRoutes(state, state.taskType);
        return sendJson(req, res, 200, { state, routing });
      }

      if (req.method === 'GET' && pathname === '/api/scan') {
        const report = scanLocalEnvironments();
        return sendJson(req, res, 200, report);
      }

      if (req.method === 'POST' && pathname === '/api/handoff') {
        const body = await readBody(req);
        const prompt = generateHandoffPrompt(body);
        return sendJson(req, res, 200, { prompt });
      }

      if (req.method === 'GET' && pathname === '/js/quota-core.js') {
        const jsPath = path.join(PUBLIC_DIR, 'js', 'quota-core.js');
        const content = fs.readFileSync(jsPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(content);
      }

      if (req.method === 'GET' && (pathname === '/favicon.svg' || pathname === '/favicon.ico')) {
        const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
        if (fs.existsSync(svgPath)) {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
          return res.end(fs.readFileSync(svgPath));
        }
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        const html = fs.readFileSync(indexPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer'
        });
        return res.end(html);
      }

      sendJson(req, res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(req, res, 500, { error: err.message || 'Internal Server Error' });
    }
  });
}

if (require.main === module) {
  const PORT = process.env.PORT || 3456;
  const HOST = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`AI Quota Tracker (Local Companion Mode) listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { createServer };
