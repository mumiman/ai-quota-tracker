const fs = require('fs');
const path = require('path');
const {
  getInitialState,
  appendHistorySnapshot,
  mutateRecordUsage,
  mutateApplyReset
} = require('../public/js/quota-core');

const DATA_DIR = process.env.QUOTA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'quota-state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    const init = getInitialState();
    saveState(init);
    return init;
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const g0 = parsed?.providers?.antigravity?.groups?.[0]?.items?.[0];
    if (g0 && g0.resetText === 'Resets in <1m' && g0.usedPct === 13) {
      const freshAgy = getInitialState().providers.antigravity;
      parsed.providers.antigravity = freshAgy;
      saveState(parsed);
    }
    const kimi0 = parsed?.providers?.kimi?.limits?.[0];
    if (!process.env.QUOTA_DATA_DIR && kimi0 && kimi0.usedPct === 28 && kimi0.resetText === 'Resets in 3h 10m') {
      const fresh = getInitialState();
      saveState(fresh);
      return fresh;
    }
    return parsed;
  } catch {
    const init = getInitialState();
    saveState(init);
    return init;
  }
}

function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function resetDemoState() {
  const init = getInitialState();
  return saveState(init);
}

function recordUsage(state, opts) {
  mutateRecordUsage(state, opts);
  return saveState(state);
}

function applyReset(state, opts) {
  const res = mutateApplyReset(state, opts);
  if (res.error) return res;
  return { ...res, state: saveState(res.state) };
}

module.exports = {
  getInitialState,
  loadState,
  saveState,
  resetDemoState,
  appendHistorySnapshot,
  recordUsage,
  applyReset
};
