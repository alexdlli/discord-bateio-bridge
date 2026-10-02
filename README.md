# discord-bateio-bridge

Gateway Discord → webhook Cursor (rotina Discord → Bateio).

Env:
- DISCORD_BRIDGE_BOT_TOKEN
- CURSOR_WEBHOOK_URL
- CURSOR_WEBHOOK_AUTHORIZATION (Bearer ou `Authorization: Bearer …`)
- DISCORD_GUILD_ID (opcional)
- DISCORD_CHANNEL_IDS (csv, opcional)

Intents no Developer Portal: Server Members (não), Message Content = ON, Presence não.
