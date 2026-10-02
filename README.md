# discord-bateio-bridge

Gateway Discord → webhook Cursor (rotina Discord → Bateio), com HTTP auxiliar para OAuth Tiny e (opcional) poll de pedidos legados.

## Env Discord

- `DISCORD_BRIDGE_BOT_TOKEN`
- `CURSOR_WEBHOOK_URL`
- `CURSOR_WEBHOOK_AUTHORIZATION` (Bearer ou `Authorization: Bearer …`)
- `DISCORD_GUILD_ID` (opcional)
- `DISCORD_CHANNEL_IDS` (csv, opcional)
- `PORT` (default `3000`)

Intents no Developer Portal: Message Content = ON.

## HTTP

- `GET /health` → `200 ok`
- `GET /api/v1/tiny/oauth/start` → redireciona para authorize Tiny (gera `state`)
- `GET /api/v1/tiny/oauth/callback` → troca `code` por tokens e grava em `TINY_TOKENS_PATH` (default `/data/tiny-tokens.json`)

### Tiny OAuth (API v3)

1. No app Tiny, cadastre **exatamente** a URL de redirect:
   `https://<SEU_DOMINIO>/api/v1/tiny/oauth/callback`
2. Defina `TINY_CLIENT_ID`, `TINY_CLIENT_SECRET`, `TINY_REDIRECT_URI` (igual ao passo 1).
3. Abra `https://<SEU_DOMINIO>/api/v1/tiny/oauth/start` e autorize.
4. Tokens ficam em `/data/tiny-tokens.json` (monte volume persistente no Dokploy).

## Poll legado (opcional)

Se `TINY_LEGACY_TOKEN` estiver setado, a cada `TINY_POLL_MS` (default 120000) chama `pedidos.pesquisa.php` do dia (America/Sao_Paulo) e posta novos números em `CURSOR_WEBHOOK_URL` com `type: tiny_pedido_novo`. Dedupe em memória/arquivo. O token **não** é logado.
