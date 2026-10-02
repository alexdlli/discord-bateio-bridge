import http from "node:http";
import crypto from "node:crypto";
import {
  rememberOauthState,
  consumeOauthState,
  saveTokens,
} from "./tinyStore.js";

const TINY_AUTH =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth";
const TINY_TOKEN =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

function html(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}
.ok{color:#0a0}.err{color:#a00}</style></head><body>${body}</body></html>`;
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function exchangeCode(code) {
  const clientId = process.env.TINY_CLIENT_ID;
  const clientSecret = process.env.TINY_CLIENT_SECRET;
  const redirectUri = process.env.TINY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing TINY_CLIENT_ID, TINY_CLIENT_SECRET or TINY_REDIRECT_URI"
    );
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(TINY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Token response not JSON (${res.status})`);
  }
  if (!res.ok) {
    const desc = json.error_description || json.error || text.slice(0, 200);
    throw new Error(`Token exchange failed (${res.status}): ${desc}`);
  }
  return json;
}

function handleStart(req, res) {
  const clientId = process.env.TINY_CLIENT_ID;
  const redirectUri = process.env.TINY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    send(
      res,
      500,
      html(
        "OAuth misconfigured",
        `<p class="err">Set TINY_CLIENT_ID and TINY_REDIRECT_URI.</p>`
      ),
      "text/html; charset=utf-8"
    );
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  rememberOauthState(state);
  const url = new URL(TINY_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  res.writeHead(302, { Location: url.toString() });
  res.end();
}

async function handleCallback(req, res, url) {
  const err = url.searchParams.get("error");
  if (err) {
    const desc = url.searchParams.get("error_description") || err;
    send(
      res,
      400,
      html("OAuth error", `<p class="err">${escapeHtml(desc)}</p>`),
      "text/html; charset=utf-8"
    );
    return;
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) {
    send(
      res,
      400,
      html("OAuth error", `<p class="err">Missing code.</p>`),
      "text/html; charset=utf-8"
    );
    return;
  }
  if (!consumeOauthState(state)) {
    send(
      res,
      400,
      html(
        "OAuth error",
        `<p class="err">Invalid or expired state. Start again via /api/v1/tiny/oauth/start</p>`
      ),
      "text/html; charset=utf-8"
    );
    return;
  }
  try {
    const tokens = await exchangeCode(code);
    const pathSaved = saveTokens(tokens);
    console.log(`Tiny OAuth tokens saved to ${pathSaved}`);
    send(
      res,
      200,
      html(
        "Tiny OAuth OK",
        `<h1 class="ok">Autorizado</h1>
<p>Tokens salvos. Pode fechar esta janela.</p>`
      ),
      "text/html; charset=utf-8"
    );
  } catch (e) {
    console.error("Tiny OAuth callback failed:", e?.message || e);
    send(
      res,
      500,
      html(
        "OAuth error",
        `<p class="err">${escapeHtml(e?.message || String(e))}</p>`
      ),
      "text/html; charset=utf-8"
    );
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function startHttpServer() {
  const port = Number(process.env.PORT || 3000);
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, "ok");
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/v1/tiny/oauth/start") {
        handleStart(req, res);
        return;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/v1/tiny/oauth/callback"
      ) {
        await handleCallback(req, res, url);
        return;
      }
      send(res, 404, "not found");
    } catch (err) {
      console.error("HTTP error:", err?.message || err);
      send(res, 500, "internal error");
    }
  });
  server.listen(port, () => {
    console.log(`HTTP listening on :${port}`);
  });
  return server;
}
