/**
 * Shared Pure Client & Server Core Engine (`quota-core.js`)
 *
 * Security & Privacy Guarantee:
 * - Zero network calls, zero filesystem I/O, zero telemetry.
 * - Runs 100% in the user's browser (via `window.QuotaCore`) or in Node.js (`require('./public/js/quota-core')`).
 * - Handles state initialization, usage parsing, smart routing, context handoff, and state mutations.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuotaCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getInitialState() {
    return {
      selectedProvider: 'antigravity',
      taskType: 'deep',
      providers: {
        antigravity: {
          id: 'antigravity',
          name: 'Antigravity',
          summary: 'Gemini 4%w • Claude & GPT 78%w • Argon 70%w',
          cliCommand: 'agy config set --model gemini-4-argon',
          groups: [
            {
              id: 'gemini_models',
              name: 'Gemini Models',
              strengths: ['agentic', 'fast', 'deep'],
              items: [
                { id: 'g_5h', label: 'Current session (5h limit)', usedPct: 0, resetText: '100% left (5h limit)', windowHours: 5 },
                { id: 'g_weekly', label: 'This week (Weekly limit)', usedPct: 4, resetText: 'Resets in 6 days', windowHours: 168 }
              ]
            },
            {
              id: 'claude_gpt_models',
              name: 'Claude and GPT models',
              strengths: ['deep', 'agentic'],
              items: [
                { id: 'cg_5h', label: 'Current session (5h limit)', usedPct: 0, resetText: '100% left (5h limit)', windowHours: 5 },
                { id: 'cg_weekly', label: 'This week (Weekly limit)', usedPct: 78, resetText: 'Resets in 16 hours, 58 minutes', windowHours: 168 }
              ]
            },
            {
              id: 'gemini_argon',
              name: 'Gemini 4 Argon',
              strengths: ['agentic', 'deep'],
              items: [
                { id: 'argon_weekly', label: 'This week (Weekly limit)', usedPct: 70, resetText: 'Resets in 6 days', windowHours: 168 }
              ]
            }
          ]
        },
        claude: {
          id: 'claude',
          name: 'Claude',
          summary: "On track. You should reach Friday's reset with room to spare.",
          cliCommand: 'export ANTHROPIC_MODEL="claude-3-7-sonnet-latest"',
          strengths: ['deep', 'agentic'],
          metrics: [
            { id: 'session', label: 'Current session', usedPct: 13, resetText: 'Resets at 1:10 PM', countdown: '5h 00m' },
            { id: 'week', label: 'This week', usedPct: 13, resetText: 'Resets Friday 11:00 PM', countdown: '5d 21h' },
            { id: 'fable', label: 'Fable', subtitle: 'Up to 50% of your weekly limit', usedPct: 14, resetText: 'Resets Friday 11:00 PM', countdown: '5d 21h' }
          ]
        },
        codex: {
          id: 'codex',
          name: 'Codex',
          summary: 'Shared across Codex, Work, Workspace Agents, and ChatGPT for Excel.',
          cliCommand: 'codex --model o3-mini',
          strengths: ['fast', 'deep'],
          limits: [
            { id: '5h', label: 'Current session (5-hour limit)', usedPct: 9, resetText: 'Resets in 1h 35m' },
            { id: 'weekly', label: 'This week (Weekly limit)', usedPct: 56, resetText: 'Resets in 3d 20h' }
          ],
          resetsAvailable: [
            { id: 'r1', title: 'Full reset (Weekly + 5 hr)', expires: 'Expires Dec 1, 2:22 AM GMT+7', expiresIso: '2026-12-01T02:22:00+07:00' },
            { id: 'r2', title: 'Full reset (Weekly + 5 hr)', expires: 'Expires Dec 2, 4:04 AM GMT+7', expiresIso: '2026-12-02T04:04:00+07:00' },
            { id: 'r3', title: 'Full reset (Weekly + 5 hr)', expires: 'Expires Dec 13, 3:51 AM GMT+7', expiresIso: '2026-12-13T03:51:00+07:00' }
          ],
          resetsHistory: [
            { id: 'h1', title: 'Full reset (Weekly + 5 hr)', usedAt: 'Used Nov 10, 9:15 PM GMT+7' }
          ]
        },
        kimi: {
          id: 'kimi',
          name: 'Kimi (kimi.ai)',
          summary: 'Kimi k2 / Thinking & Long-Context quota.',
          cliCommand: 'kimi --model kimi-k2-thinking',
          strengths: ['deep', 'agentic', 'fast'],
          limits: [
            { id: '5h', label: 'Current session (5h / Thinking)', usedPct: 12, resetText: 'Resets in 4h 20m', countdown: '4h 20m' },
            { id: 'weekly', label: 'This week (Weekly limit)', usedPct: 24, resetText: 'Resets in 5d 12h', countdown: '5d 12h' }
          ]
        }
      },
      history: [
        { ts: '09:00', antigravity: 65, claude: 10, codex: 40, kimi: 5 },
        { ts: '10:00', antigravity: 70, claude: 11, codex: 45, kimi: 10 },
        { ts: '11:00', antigravity: 74, claude: 13, codex: 52, kimi: 12 },
        { ts: '12:00', antigravity: 78, claude: 14, codex: 56, kimi: 24 }
      ]
    };
  }

  function getDefaultAccounts() {
    return {
      autoSyncSeconds: 60,
      autoFallbackThreshold: 85,
      providers: {
        antigravity: {
          mode: 'web_auto_sync',
          baseUrl: 'https://generativelanguage.googleapis.com',
          connected: false,
          lastSyncAt: null,
          lastStatus: 'Waiting for Browser Extension Auto-Sync',
          accountLabel: 'Google / Antigravity'
        },
        claude: {
          mode: 'web_auto_sync',
          baseUrl: 'https://api.anthropic.com',
          connected: false,
          lastSyncAt: null,
          lastStatus: 'Waiting for Browser Extension Auto-Sync',
          accountLabel: 'Anthropic / Claude'
        },
        codex: {
          mode: 'web_auto_sync',
          baseUrl: 'https://api.openai.com',
          connected: false,
          lastSyncAt: null,
          lastStatus: 'Waiting for Browser Extension Auto-Sync',
          accountLabel: 'OpenAI / Codex'
        },
        kimi: {
          mode: 'web_auto_sync',
          baseUrl: 'https://api.moonshot.ai',
          connected: false,
          lastSyncAt: null,
          lastStatus: 'Waiting for Browser Extension Auto-Sync',
          accountLabel: 'Moonshot / Kimi.ai'
        }
      }
    };
  }

  function appendHistorySnapshot(state) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const agyPeak = Math.max(
      ...state.providers.antigravity.groups.flatMap(g => g.items.map(i => i.usedPct))
    );
    const claudePeak = Math.max(...state.providers.claude.metrics.map(m => m.usedPct));
    const codexPeak = Math.max(...state.providers.codex.limits.map(l => l.usedPct));
    const kimiPeak = state.providers.kimi ? Math.max(...state.providers.kimi.limits.map(l => l.usedPct)) : 0;

    if (!Array.isArray(state.history)) state.history = [];
    state.history.push({
      ts: `${hh}:${mm}`,
      antigravity: agyPeak,
      claude: claudePeak,
      codex: codexPeak,
      kimi: kimiPeak
    });
    if (state.history.length > 16) state.history.shift();
    return state;
  }

  function mutateRecordUsage(state, { providerId, groupId, amount = 10 }) {
    if (providerId === 'antigravity') {
      const grp = state.providers.antigravity.groups.find(g => g.id === groupId) || state.providers.antigravity.groups[0];
      grp.items.forEach(item => {
        item.usedPct = Math.min(100, Math.max(0, item.usedPct + amount));
      });
    } else if (providerId === 'claude') {
      state.providers.claude.metrics[0].usedPct = Math.min(100, state.providers.claude.metrics[0].usedPct + amount);
      state.providers.claude.metrics[1].usedPct = Math.min(100, state.providers.claude.metrics[1].usedPct + Math.max(1, Math.round(amount * 0.35)));
      const fable = state.providers.claude.metrics.find(m => m.id === 'fable');
      if (fable) {
        fable.usedPct = Math.min(100, fable.usedPct + Math.max(1, Math.round(amount * 0.45)));
      }
      state.providers.claude.summary = `Fresh week. ${state.providers.claude.metrics[1].usedPct}% of your weekly limit used.`;
    } else if (providerId === 'codex') {
      state.providers.codex.limits[0].usedPct = Math.min(100, state.providers.codex.limits[0].usedPct + amount);
      state.providers.codex.limits[1].usedPct = Math.min(100, state.providers.codex.limits[1].usedPct + Math.max(1, Math.round(amount * 0.5)));
    } else if (providerId === 'kimi' && state.providers.kimi) {
      state.providers.kimi.limits[0].usedPct = Math.min(100, state.providers.kimi.limits[0].usedPct + amount);
      state.providers.kimi.limits[1].usedPct = Math.min(100, state.providers.kimi.limits[1].usedPct + Math.max(1, Math.round(amount * 0.4)));
    }
    appendHistorySnapshot(state);
    return state;
  }

  function mutateApplyReset(state, { providerId, groupId, ticketId }) {
    if (providerId === 'codex') {
      const codex = state.providers.codex;
      const idx = ticketId
        ? codex.resetsAvailable.findIndex(r => r.id === ticketId)
        : 0;
      if (idx === -1 || codex.resetsAvailable.length === 0) {
        return { error: 'No available Codex reset tickets remaining', state };
      }
      const [removed] = codex.resetsAvailable.splice(idx, 1);
      codex.resetsHistory.unshift({
        id: removed.id,
        title: removed.title,
        usedAt: `Used ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (Restored 5-hr & Weekly to 0% used)`
      });
      codex.limits.forEach(l => { l.usedPct = 0; });
      return { state, appliedTicket: removed };
    }

    if (providerId === 'antigravity') {
      const grp = state.providers.antigravity.groups.find(g => g.id === groupId);
      if (grp) {
        grp.items.forEach(it => { it.usedPct = 0; });
      } else {
        state.providers.antigravity.groups.forEach(g => g.items.forEach(it => { it.usedPct = 0; }));
      }
      return { state };
    }

    if (providerId === 'claude') {
      if (groupId === 'session') {
        state.providers.claude.metrics[0].usedPct = 0;
      } else if (groupId === 'week') {
        state.providers.claude.metrics[1].usedPct = 0;
        state.providers.claude.summary = 'Fresh week. 0% of your weekly limit used.';
      } else if (groupId === 'fable') {
        const fable = state.providers.claude.metrics.find(m => m.id === 'fable');
        if (fable) fable.usedPct = 0;
      } else {
        state.providers.claude.metrics.forEach(m => { m.usedPct = 0; });
        state.providers.claude.summary = 'Fresh week. 0% of your weekly limit used.';
      }
      return { state };
    }

    if (providerId === 'kimi' && state.providers.kimi) {
      if (groupId === '5h' || groupId === 'weekly') {
        const target = state.providers.kimi.limits.find(l => l.id === groupId);
        if (target) target.usedPct = 0;
      } else {
        state.providers.kimi.limits.forEach(l => { l.usedPct = 0; });
      }
      return { state };
    }

    return { error: 'Unknown provider', state };
  }

  function extractAntigravityPopoverBlock(text) {
    let searchEnd = text.length;
    let fallbackBlock = null;
    let preferredBlock = null;

    while (searchEnd > 0) {
      const idx = text.lastIndexOf('Gemini Models', searchEnd);
      if (idx === -1) break;
      const candidate = text.slice(idx, idx + 1200);
      const hasClaudeGpt = /Claude and GPT models/i.test(candidate);
      const hasArgon = /Gemini 4 Argon/i.test(candidate);
      if (hasClaudeGpt && hasArgon) {
        const argonMatch = candidate.match(/Gemini 4 Argon/i);
        const endOffset = argonMatch ? argonMatch.index + 280 : candidate.length;
        const block = candidate.slice(0, endOffset);
        if (!fallbackBlock) fallbackBlock = block;
        if (!/\d{1,3}%\s*used/i.test(block) && !block.includes('|')) {
          if (/Weekly Limit Remaining/i.test(block) || /Weekly limit/i.test(block)) {
            return block;
          }
          if (!preferredBlock) preferredBlock = block;
        }
      }
      searchEnd = idx - 1;
    }

    return preferredBlock || fallbackBlock || text;
  }

  function extractAntigravityResetDuration(part) {
    if (!part) return null;
    const m = part.match(/(?:refresh|resets?)\s+in\s+([^.\n|]+)/i);
    if (!m) return null;
    const cleaned = m[1]
      .replace(/,?\s*\(?\d{1,3}\s*%\s*(?:left|remaining)?\)?.*$/i, '')
      .replace(/,\s*$/, '')
      .trim();
    return cleaned ? `Resets in ${cleaned}` : null;
  }

  function parseTwoTierAntigravitySection(sec) {
    if (!sec) {
      return {
        weeklyUsedPct: null,
        fiveHourUsedPct: null,
        weeklyResetText: null,
        fiveHourResetText: null
      };
    }

    const pctMatches = [...sec.matchAll(/(\d{1,3})\s*%\s*(?:left)?/gi)];
    const weeklyLeft = pctMatches[0] ? Number(pctMatches[0][1]) : null;
    const fiveHourLeft = pctMatches[1] ? Number(pctMatches[1][1]) : null;

    const fiveHourHeaderIdx = sec.search(/Five Hour Limit/i);
    const weeklyPart = fiveHourHeaderIdx >= 0
      ? sec.slice(0, fiveHourHeaderIdx)
      : (pctMatches[1] ? sec.slice(0, pctMatches[1].index) : sec);
    const fiveHourPart = fiveHourHeaderIdx >= 0
      ? sec.slice(fiveHourHeaderIdx)
      : (pctMatches[1] ? sec.slice(pctMatches[1].index) : '');

    const weeklyUsedPct = weeklyLeft !== null ? Math.min(100, Math.max(0, 100 - weeklyLeft)) : null;
    const fiveHourUsedPct = fiveHourLeft !== null ? Math.min(100, Math.max(0, 100 - fiveHourLeft)) : null;

    const weeklyResetText =
      extractAntigravityResetDuration(weeklyPart) ||
      (weeklyUsedPct === 0 ? '100% left (Weekly limit)' : null);

    const fiveHourResetText =
      extractAntigravityResetDuration(fiveHourPart) ||
      (fiveHourUsedPct === 0 ? '100% left (5h limit)' : null);

    return {
      weeklyUsedPct,
      fiveHourUsedPct,
      weeklyResetText,
      fiveHourResetText
    };
  }

  function cleanResetLine(str) {
    if (!str) return null;
    return str
      .replace(/\s*\d{1,3}%\s*(?:used|left).*$/i, '')
      .replace(/\s*Use reset.*$/i, '')
      .replace(/\s*Reset for free.*$/i, '')
      .trim();
  }

  function parseUsagePageText(providerId, rawText) {
    const text = String(rawText || '');

    if (providerId === 'claude') {
      const yourUsageIdx = text.lastIndexOf('Your usage');
      const planIdx = text.lastIndexOf('Plan usage limits');
      const sessIdx = text.lastIndexOf('Current session');
      const startIdx = yourUsageIdx >= 0
        ? yourUsageIdx
        : (planIdx >= 0 ? planIdx : (sessIdx >= 0 ? Math.max(0, sessIdx - 80) : 0));
      const creditsIdx = text.indexOf('Usage credits', startIdx);
      const endIdx = creditsIdx > startIdx ? creditsIdx : startIdx + 1500;
      const scope = startIdx > 0 ? text.slice(startIdx, endIdx) : text;

      const usedMatches = [...scope.matchAll(/(\d{1,3})%\s*used/gi)].map(m => Number(m[1]));
      const summaryMatch = scope.match(/(On track\.[^\n]+|Fresh week\.[^\n]+)/i) || text.match(/(On track\.[^\n]+|Fresh week\.[^\n]+)/i);
      const sessionResetMatch = scope.match(/(Starts with your first message|Resets (?:in|at) [^\n]+)/i);
      const weekResetMatch = scope.match(/(Resets (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n]+)/i);

      return {
        ok: usedMatches.length > 0,
        summary: summaryMatch ? summaryMatch[1].trim() : null,
        sessionUsedPct: usedMatches[0] ?? null,
        weeklyUsedPct: usedMatches[1] ?? null,
        fableUsedPct: usedMatches[2] ?? null,
        sessionResetText: sessionResetMatch ? cleanResetLine(sessionResetMatch[1]) : null,
        weeklyResetText: weekResetMatch ? cleanResetLine(weekResetMatch[1]) : null
      };
    }

    if (providerId === 'codex') {
      const planLimitsIdx = text.lastIndexOf('Plan limits');
      const searchStart = planLimitsIdx >= 0 ? planLimitsIdx : 0;
      const resetsSectionIdx = text.indexOf('Usage limit resets', searchStart);
      const regionEnd = resetsSectionIdx > searchStart ? resetsSectionIdx : text.length;
      const planRegion = text.slice(searchStart, regionEnd);

      // Find the "5-hour limit" occurrence inside planRegion (ignoring "restore your 5-hour limit" under Usage limit resets)
      const fiveHourMatches = [...planRegion.matchAll(/5-hour limit/gi)];
      const anchorMatch = fiveHourMatches.length > 0 ? fiveHourMatches[fiveHourMatches.length - 1] : null;
      const scope = anchorMatch
        ? planRegion.slice(Math.max(0, anchorMatch.index - 40), anchorMatch.index + 1200)
        : planRegion;
      const weeklyIdx = scope.search(/Weekly limit/i);

      const ticketMatches = [...text.matchAll(/(Full reset[^\n]*)\s*\n+\s*(Expires [^\n]+)/gi)];
      const resetsAvailable = ticketMatches.length > 0
        ? ticketMatches.map((m, idx) => ({
            id: `r${idx + 1}`,
            title: cleanResetLine(m[1]),
            expires: cleanResetLine(m[2])
          }))
        : null;

      if (weeklyIdx >= 0 && anchorMatch) {
        const fiveHSec = scope.slice(0, weeklyIdx);
        const weekSec = scope.slice(weeklyIdx);
        const sLeft = fiveHSec.match(/(\d{1,3})%\s*left/i);
        const wLeft = weekSec.match(/(\d{1,3})%\s*left/i);
        const sReset = fiveHSec.match(/(Resets in [^\n]+)/i);
        const wReset = weekSec.match(/(Resets in [^\n]+)/i);
        const sessionUsedPct = sLeft ? Math.max(0, 100 - Number(sLeft[1])) : null;
        const weeklyUsedPct = wLeft ? Math.max(0, 100 - Number(wLeft[1])) : null;
        return {
          ok: sessionUsedPct !== null || weeklyUsedPct !== null,
          sessionUsedPct,
          weeklyUsedPct,
          sessionResetText: sReset ? cleanResetLine(sReset[1]) : (sessionUsedPct === 0 ? '100% left (5h limit)' : null),
          weeklyResetText: wReset ? cleanResetLine(wReset[1]) : null,
          resetsAvailable
        };
      }

      const leftMatches = [...scope.matchAll(/(\d{1,3})%\s*left/gi)].map(m => Number(m[1]));
      const resetMatches = [...scope.matchAll(/(Resets in [^\n]+)/gi)].map(m => cleanResetLine(m[1]));
      return {
        ok: leftMatches.length > 0,
        sessionUsedPct: leftMatches[0] !== undefined ? Math.max(0, 100 - leftMatches[0]) : null,
        weeklyUsedPct: leftMatches[1] !== undefined ? Math.max(0, 100 - leftMatches[1]) : null,
        sessionResetText: resetMatches[0] ?? null,
        weeklyResetText: resetMatches[1] ?? null,
        resetsAvailable
      };
    }

    if (providerId === 'antigravity') {
      const block = extractAntigravityPopoverBlock(text);
      const cgIdx = block.search(/Claude and GPT models/i);
      const argonIdx = block.search(/Gemini 4 Argon/i);

      if (cgIdx >= 0 && argonIdx > cgIdx) {
        const geminiSec = block.slice(0, cgIdx);
        const claudeGptSec = block.slice(cgIdx, argonIdx);
        const argonSec = block.slice(argonIdx, argonIdx + 280);

        const gemini = parseTwoTierAntigravitySection(geminiSec);
        const claudeGpt = parseTwoTierAntigravitySection(claudeGptSec);

        const argonLeftMatch = argonSec.match(/(\d{1,3})\s*%\s*(?:left)?/i);
        const argonWeeklyUsedPct = argonLeftMatch ? Math.min(100, Math.max(0, 100 - Number(argonLeftMatch[1]))) : null;
        const argonWeeklyResetText =
          extractAntigravityResetDuration(argonSec) ||
          (argonWeeklyUsedPct === 0 ? '100% left (Weekly limit)' : null);

        return {
          ok: gemini.weeklyUsedPct !== null || claudeGpt.weeklyUsedPct !== null || argonWeeklyUsedPct !== null,
          geminiWeeklyUsedPct: gemini.weeklyUsedPct,
          gemini5hUsedPct: gemini.fiveHourUsedPct,
          claudeGptWeeklyUsedPct: claudeGpt.weeklyUsedPct,
          claudeGpt5hUsedPct: claudeGpt.fiveHourUsedPct,
          argonWeeklyUsedPct,
          geminiWeeklyResetText: gemini.weeklyResetText,
          gemini5hResetText: gemini.fiveHourResetText,
          claudeGptWeeklyResetText: claudeGpt.weeklyResetText,
          claudeGpt5hResetText: claudeGpt.fiveHourResetText,
          argonWeeklyResetText
        };
      }

      const leftMatches = [...block.matchAll(/(\d{1,3})\s*%\s*(?:left)?/gi)].map(m => Number(m[1]));
      const resetMatches = [...block.matchAll(/(?:refresh|resets?)\s+in\s+([^.\n|]+)/gi)].map(m =>
        `Resets in ${m[1].replace(/,?\s*\(?\d{1,3}\s*%\s*(?:left|remaining)?\)?.*$/i, '').replace(/,\s*$/, '').trim()}`
      );
      return {
        ok: leftMatches.length > 0,
        geminiWeeklyUsedPct: leftMatches[0] !== undefined ? Math.max(0, 100 - leftMatches[0]) : null,
        gemini5hUsedPct: leftMatches[1] !== undefined ? Math.max(0, 100 - leftMatches[1]) : null,
        claudeGptWeeklyUsedPct: leftMatches[2] !== undefined ? Math.max(0, 100 - leftMatches[2]) : null,
        claudeGpt5hUsedPct: leftMatches[3] !== undefined ? Math.max(0, 100 - leftMatches[3]) : null,
        argonWeeklyUsedPct: leftMatches[4] !== undefined ? Math.max(0, 100 - leftMatches[4]) : null,
        geminiWeeklyResetText: resetMatches[0] ?? null,
        gemini5hResetText: resetMatches[1] ?? null,
        claudeGptWeeklyResetText: resetMatches[2] ?? null,
        claudeGpt5hResetText: leftMatches[3] === 100 ? '100% left (5h limit)' : null,
        argonWeeklyResetText: resetMatches[3] ?? null
      };
    }

    if (providerId === 'kimi') {
      const usedMatches = [...text.matchAll(/(\d{1,3})%\s*used/gi)].map(m => Number(m[1]));
      const leftMatches = [...text.matchAll(/(\d{1,3})%\s*left/gi)].map(m => Number(m[1]));
      const resetMatches = [...text.matchAll(/(Resets (?:in|at) [^\n]+)/gi)].map(m => cleanResetLine(m[1]));
      const sessionUsed = usedMatches[0] ?? (leftMatches[0] !== undefined ? Math.max(0, 100 - leftMatches[0]) : null);
      const weeklyUsed = usedMatches[1] ?? (leftMatches[1] !== undefined ? Math.max(0, 100 - leftMatches[1]) : null);
      return {
        ok: sessionUsed !== null || weeklyUsed !== null,
        sessionUsedPct: sessionUsed,
        weeklyUsedPct: weeklyUsed,
        sessionResetText: resetMatches[0] ?? null,
        weeklyResetText: resetMatches[1] ?? null
      };
    }

    return { ok: false };
  }

  function applyParsedUsageToState(providerId, parsed, meta, state, acc) {
    if (acc && acc.providers && acc.providers[providerId]) {
      acc.providers[providerId].connected = true;
      acc.providers[providerId].mode = 'web_auto_sync';
      acc.providers[providerId].lastSyncAt = new Date().toISOString();
      if (meta?.accountLabel) {
        acc.providers[providerId].accountLabel = meta.accountLabel;
      }
      if (meta?.pageUrl) {
        acc.providers[providerId].webUrl = meta.pageUrl;
      }
      const timeLabel = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      acc.providers[providerId].lastStatus = `Live Auto-Sync (${meta?.accountLabel || 'Browser Extension'} @ ${timeLabel})`;
    }

    if (providerId === 'claude') {
      if (parsed.summary) state.providers.claude.summary = parsed.summary;
      if (typeof parsed.sessionUsedPct === 'number') state.providers.claude.metrics[0].usedPct = parsed.sessionUsedPct;
      if (parsed.sessionResetText) state.providers.claude.metrics[0].resetText = parsed.sessionResetText;
      if (typeof parsed.weeklyUsedPct === 'number') state.providers.claude.metrics[1].usedPct = parsed.weeklyUsedPct;
      if (parsed.weeklyResetText) state.providers.claude.metrics[1].resetText = parsed.weeklyResetText;
      if (typeof parsed.fableUsedPct === 'number') {
        const fableIdx = state.providers.claude.metrics.findIndex(m => m.id === 'fable');
        const fableMetric = {
          id: 'fable',
          label: 'Fable',
          subtitle: 'Up to 50% of your weekly limit',
          usedPct: parsed.fableUsedPct,
          resetText: parsed.weeklyResetText || 'Resets Friday 11:00 PM',
          countdown: '5d 21h'
        };
        if (fableIdx >= 0) state.providers.claude.metrics[fableIdx] = fableMetric;
        else state.providers.claude.metrics.push(fableMetric);
      }
    } else if (providerId === 'codex') {
      if (typeof parsed.sessionUsedPct === 'number') state.providers.codex.limits[0].usedPct = parsed.sessionUsedPct;
      if (parsed.sessionResetText) state.providers.codex.limits[0].resetText = parsed.sessionResetText;
      if (typeof parsed.weeklyUsedPct === 'number') state.providers.codex.limits[1].usedPct = parsed.weeklyUsedPct;
      if (parsed.weeklyResetText) state.providers.codex.limits[1].resetText = parsed.weeklyResetText;
      if (Array.isArray(parsed.resetsAvailable)) state.providers.codex.resetsAvailable = parsed.resetsAvailable;
    } else if (providerId === 'antigravity') {
      if (typeof parsed.geminiWeeklyUsedPct === 'number') state.providers.antigravity.groups[0].items[1].usedPct = parsed.geminiWeeklyUsedPct;
      if (parsed.geminiWeeklyResetText) state.providers.antigravity.groups[0].items[1].resetText = parsed.geminiWeeklyResetText;
      if (typeof parsed.gemini5hUsedPct === 'number') state.providers.antigravity.groups[0].items[0].usedPct = parsed.gemini5hUsedPct;
      if (parsed.gemini5hResetText) state.providers.antigravity.groups[0].items[0].resetText = parsed.gemini5hResetText;
      if (typeof parsed.claudeGptWeeklyUsedPct === 'number') state.providers.antigravity.groups[1].items[1].usedPct = parsed.claudeGptWeeklyUsedPct;
      if (parsed.claudeGptWeeklyResetText) state.providers.antigravity.groups[1].items[1].resetText = parsed.claudeGptWeeklyResetText;
      if (typeof parsed.claudeGpt5hUsedPct === 'number') state.providers.antigravity.groups[1].items[0].usedPct = parsed.claudeGpt5hUsedPct;
      if (parsed.claudeGpt5hResetText) state.providers.antigravity.groups[1].items[0].resetText = parsed.claudeGpt5hResetText;
      if (typeof parsed.argonWeeklyUsedPct === 'number') state.providers.antigravity.groups[2].items[0].usedPct = parsed.argonWeeklyUsedPct;
      if (parsed.argonWeeklyResetText) state.providers.antigravity.groups[2].items[0].resetText = parsed.argonWeeklyResetText;

      const gW = state.providers.antigravity.groups[0].items[1].usedPct;
      const cgW = state.providers.antigravity.groups[1].items[1].usedPct;
      const argW = state.providers.antigravity.groups[2].items[0].usedPct;
      state.providers.antigravity.summary = `Gemini ${gW}%w • Claude & GPT ${cgW}%w • Argon ${argW}%w`;
    } else if (providerId === 'kimi' && state.providers.kimi) {
      if (typeof parsed.sessionUsedPct === 'number') state.providers.kimi.limits[0].usedPct = parsed.sessionUsedPct;
      if (parsed.sessionResetText) state.providers.kimi.limits[0].resetText = parsed.sessionResetText;
      if (typeof parsed.weeklyUsedPct === 'number') state.providers.kimi.limits[1].usedPct = parsed.weeklyUsedPct;
      if (parsed.weeklyResetText) state.providers.kimi.limits[1].resetText = parsed.weeklyResetText;
    }
  }

  function evaluateRoutes(state, taskType = 'deep') {
    const candidates = [];

    const agy = state.providers.antigravity;
    for (const grp of agy.groups) {
      const peakUsed = Math.max(...grp.items.map(i => i.usedPct));
      const headroom = 100 - peakUsed;
      let score = headroom;
      if (grp.strengths[0] === taskType) score += 20;
      else if (grp.strengths.includes(taskType)) score += 10;
      if (peakUsed >= 75) score -= 45;

      const cmd = grp.id === 'gemini_argon'
        ? 'agy config set --model gemini-4-argon'
        : grp.id === 'gemini_models'
          ? 'agy config set --model gemini-2.5-pro'
          : 'agy config set --model claude-sonnet-4';

      candidates.push({
        providerId: 'antigravity',
        subId: grp.id,
        label: `Antigravity → ${grp.name}`,
        usedPct: peakUsed,
        headroom,
        score,
        command: cmd,
        resetHint: grp.items[grp.items.length - 1].resetText
      });
    }

    const claude = state.providers.claude;
    const claudePeak = Math.max(...claude.metrics.map(m => m.usedPct));
    const claudeHeadroom = 100 - claudePeak;
    let claudeScore = claudeHeadroom;
    if (claude.strengths[0] === taskType) claudeScore += 20;
    else if (claude.strengths.includes(taskType)) claudeScore += 10;
    if (claudePeak >= 75) claudeScore -= 50;

    candidates.push({
      providerId: 'claude',
      subId: 'claude_default',
      label: 'Claude (Current Session)',
      usedPct: claudePeak,
      headroom: claudeHeadroom,
      score: claudeScore,
      command: claude.cliCommand,
      resetHint: claude.metrics[0].resetText
    });

    const codex = state.providers.codex;
    const codexPeak = Math.max(...codex.limits.map(l => l.usedPct));
    const codexHeadroom = 100 - codexPeak;
    let codexScore = codexHeadroom;
    if (codex.strengths[0] === taskType) codexScore += 20;
    else if (codex.strengths.includes(taskType)) codexScore += 10;
    if (codexPeak >= 75) codexScore -= 45;

    candidates.push({
      providerId: 'codex',
      subId: 'codex_default',
      label: 'Codex (CLI / Agent)',
      usedPct: codexPeak,
      headroom: codexHeadroom,
      score: codexScore,
      command: codex.cliCommand,
      resetHint: codex.limits[1].resetText
    });

    const kimi = state.providers.kimi;
    let kimiPeak = 0;
    if (kimi) {
      kimiPeak = Math.max(...kimi.limits.map(l => l.usedPct));
      const kimiHeadroom = 100 - kimiPeak;
      let kimiScore = kimiHeadroom;
      if (kimi.strengths[0] === taskType) kimiScore += 20;
      else if (kimi.strengths.includes(taskType)) kimiScore += 10;
      if (kimiPeak >= 75) kimiScore -= 45;

      candidates.push({
        providerId: 'kimi',
        subId: 'kimi_default',
        label: 'Kimi (kimi.ai)',
        usedPct: kimiPeak,
        headroom: kimiHeadroom,
        score: kimiScore,
        command: kimi.cliCommand,
        resetHint: kimi.limits[0].resetText
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    const alerts = [];
    if (kimi && kimiPeak >= 75) {
      alerts.push({
        severity: 'critical',
        provider: 'kimi',
        message: `Kimi (kimi.ai) is at ${kimiPeak}% used (${kimi.limits[0].resetText}) — switch to ${best.label}.`
      });
    }
    if (agy.groups[1].items[1].usedPct >= 75) {
      alerts.push({
        severity: 'critical',
        provider: 'antigravity',
        message: `Antigravity (Claude & GPT models) is at ${agy.groups[1].items[1].usedPct}% used — switch to ${best.label} to avoid lockout.`
      });
    }
    if (claudePeak >= 75) {
      alerts.push({
        severity: 'critical',
        provider: 'claude',
        message: `Claude quota is at ${claudePeak}% used (${claude.metrics[0].resetText}). Pause Claude and route to ${best.label}.`
      });
    }
    const fableMetric = claude.metrics.find(m => m.id === 'fable');
    if (fableMetric && fableMetric.usedPct >= 75) {
      alerts.push({
        severity: 'warning',
        provider: 'claude',
        message: `Claude Fable limit is at ${fableMetric.usedPct}% used (${fableMetric.subtitle || 'Up to 50% of weekly limit'}). Consider switching to ${best.label}.`
      });
    }
    if (codexPeak >= 75 && codex.resetsAvailable.length > 0) {
      const healthyAlternative = candidates.find(c => c.providerId !== 'codex' && c.usedPct < 50);
      if (healthyAlternative) {
        alerts.push({
          severity: 'advice',
          provider: 'codex',
          message: `Codex is at ${codexPeak}% used, but save your ${codex.resetsAvailable.length} Full Reset ticket(s)! Switch to ${healthyAlternative.label} (${healthyAlternative.usedPct}% used) first.`
        });
      } else {
        alerts.push({
          severity: 'warning',
          provider: 'codex',
          message: `All providers are running hot. Consider using 1 of ${codex.resetsAvailable.length} Codex Full Reset tickets (${codex.resetsAvailable[0].expires}).`
        });
      }
    }

    return {
      recommended: best,
      ranked: candidates,
      alerts,
      reason: `Selected ${best.label} (${best.usedPct}% used / ${best.headroom}% headroom) as the optimal route for "${taskType}" tasks.`
    };
  }

  function generateHandoffPrompt({ fromProvider, toProvider, taskSummary, currentFiles }) {
    const filesList = currentFiles && currentFiles.trim()
      ? currentFiles.split(',').map(f => `- \`${f.trim()}\``).join('\n')
      : '- (No specific files listed)';

    return `# Context Handoff: ${fromProvider} → ${toProvider}

## Why Switching
Quota on **${fromProvider}** is approaching its limit. Continuing the task seamlessly on **${toProvider}**.

## Current Task & Goal
${taskSummary || 'Continue implementing and verifying the current feature without losing context.'}

## Active Files
${filesList}

## Instructions for ${toProvider}
1. Review the active files listed above before making edits.
2. Continue directly from the current state — do not re-scaffold already completed parts.
3. Run tests/verification after applying the next changes.`;
  }

  return {
    getInitialState,
    getDefaultAccounts,
    appendHistorySnapshot,
    mutateRecordUsage,
    mutateApplyReset,
    parseUsagePageText,
    applyParsedUsageToState,
    evaluateRoutes,
    generateHandoffPrompt
  };
});
