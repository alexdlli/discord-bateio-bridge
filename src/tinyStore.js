import fs from "node:fs";
import path from "node:path";

const TOKENS_PATH =
  process.env.TINY_TOKENS_PATH || "/data/tiny-tokens.json";
const SEEN_PATH =
  process.env.TINY_SEEN_PEDIDOS_PATH || "/data/tiny-seen-pedidos.json";
const STATE_PATH =
  process.env.TINY_OAUTH_STATE_PATH || "/data/tiny-oauth-state.json";

const oauthStates = new Map(); // state -> { createdAt }

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function saveTokens(tokens) {
  ensureDir(TOKENS_PATH);
  const payload = {
    ...tokens,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(payload, null, 2), {
    mode: 0o600,
  });
  return TOKENS_PATH;
}

export function loadTokens() {
  try {
    const raw = fs.readFileSync(TOKENS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function rememberOauthState(state) {
  const entry = { createdAt: Date.now() };
  oauthStates.set(state, entry);
  try {
    ensureDir(STATE_PATH);
    let disk = {};
    try {
      disk = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    } catch {
      disk = {};
    }
    disk[state] = entry;
    // prune > 1h
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of Object.entries(disk)) {
      if (!v?.createdAt || v.createdAt < cutoff) delete disk[k];
    }
    fs.writeFileSync(STATE_PATH, JSON.stringify(disk), { mode: 0o600 });
  } catch (err) {
    console.warn("oauth state file write failed:", err?.message || err);
  }
}

export function consumeOauthState(state) {
  if (!state) return false;
  if (oauthStates.has(state)) {
    oauthStates.delete(state);
    try {
      const disk = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
      delete disk[state];
      fs.writeFileSync(STATE_PATH, JSON.stringify(disk), { mode: 0o600 });
    } catch {
      /* ignore */
    }
    return true;
  }
  try {
    const disk = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (disk[state]) {
      const age = Date.now() - (disk[state].createdAt || 0);
      delete disk[state];
      fs.writeFileSync(STATE_PATH, JSON.stringify(disk), { mode: 0o600 });
      return age < 60 * 60 * 1000;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function loadSeenPedidos() {
  try {
    const raw = fs.readFileSync(SEEN_PATH, "utf8");
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveSeenPedidos(seen) {
  ensureDir(SEEN_PATH);
  // keep last 2000
  const arr = [...seen].slice(-2000);
  fs.writeFileSync(SEEN_PATH, JSON.stringify(arr), { mode: 0o600 });
}

export { TOKENS_PATH, SEEN_PATH };
