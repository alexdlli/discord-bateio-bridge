import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { startHttpServer } from "./httpServer.js";
import { startTinyLegacyPoller } from "./tinyPoller.js";

const TOKEN = process.env.DISCORD_BRIDGE_BOT_TOKEN;
const WEBHOOK_URL = process.env.CURSOR_WEBHOOK_URL;
const WEBHOOK_AUTH_RAW = process.env.CURSOR_WEBHOOK_AUTHORIZATION || "";
const CHANNEL_ALLOWLIST = (process.env.DISCORD_CHANNEL_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";

function normalizeAuth(raw) {
  let v = (raw || "").trim();
  if (!v) return "";
  // User may paste "Authorization: Bearer …" or just "Bearer …" or bare token
  v = v.replace(/^authorization\s*:\s*/i, "").trim();
  if (!/^bearer\s+/i.test(v)) v = `Bearer ${v}`;
  return v;
}

const WEBHOOK_AUTH = normalizeAuth(WEBHOOK_AUTH_RAW);

if (!TOKEN) {
  console.error("Missing DISCORD_BRIDGE_BOT_TOKEN");
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.error("Missing CURSOR_WEBHOOK_URL");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

async function forward(payload) {
  const headers = { "Content-Type": "application/json" };
  if (WEBHOOK_AUTH) headers.Authorization = WEBHOOK_AUTH;
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Bateio bridge online as ${c.user.tag}`);
  if (CHANNEL_ALLOWLIST.length) {
    console.log(`Listening channels: ${CHANNEL_ALLOWLIST.join(", ")}`);
  } else {
    console.log("Listening all guild channels (no DISCORD_CHANNEL_IDS filter)");
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author?.bot) return;
    if (GUILD_ID && message.guildId !== GUILD_ID) return;
    if (
      CHANNEL_ALLOWLIST.length &&
      !CHANNEL_ALLOWLIST.includes(message.channelId)
    ) {
      return;
    }

    const payload = {
      source: "discord-bateio-bridge",
      type: "message_create",
      receivedAt: new Date().toISOString(),
      guildId: message.guildId,
      channelId: message.channelId,
      channelName: message.channel?.name || null,
      messageId: message.id,
      content: message.content || "",
      author: {
        id: message.author.id,
        username: message.author.username,
        globalName: message.author.globalName || null,
      },
      attachments: [...message.attachments.values()].map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        contentType: a.contentType,
      })),
    };

    await forward(payload);
    console.log(
      `Forwarded ${message.id} #${payload.channelName || message.channelId}`
    );
  } catch (err) {
    console.error("Forward failed:", err?.message || err);
  }
});

startHttpServer();
startTinyLegacyPoller();
client.login(TOKEN);
