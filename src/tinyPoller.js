import {
  loadSeenPedidos,
  saveSeenPedidos,
} from "./tinyStore.js";

const TINY_PEDIDOS_URL = "https://api.tiny.com.br/api2/pedidos.pesquisa.php";

function todaySaoPauloDdMmYyyy() {
  // en-GB + America/Sao_Paulo → dd/mm/yyyy
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function normalizeAuth(raw) {
  let v = (raw || "").trim();
  if (!v) return "";
  v = v.replace(/^authorization\s*:\s*/i, "").trim();
  if (!/^bearer\s+/i.test(v)) v = `Bearer ${v}`;
  return v;
}

async function forwardPedido(pedido, webhookUrl, webhookAuth) {
  const headers = { "Content-Type": "application/json" };
  if (webhookAuth) headers.Authorization = webhookAuth;
  const payload = {
    source: "discord-bateio-bridge",
    type: "tiny_pedido_novo",
    receivedAt: new Date().toISOString(),
    pedido: {
      id: pedido.id ?? null,
      numero: String(pedido.numero ?? ""),
      data_pedido: pedido.data_pedido ?? null,
      data_criacao: pedido.data_criacao ?? null,
      nome: pedido.nome ?? null,
      valor: pedido.valor ?? null,
      situacao: pedido.situacao ?? null,
      id_vendedor: pedido.id_vendedor ?? null,
      nome_vendedor: pedido.nome_vendedor ?? null,
    },
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function pollOnce(token, webhookUrl, webhookAuth, seen) {
  const today = todaySaoPauloDdMmYyyy();
  const body = new URLSearchParams({
    token,
    formato: "json",
    dataInicial: today,
    dataFinal: today,
    sort: "ASC",
  });
  // Do not log token
  const res = await fetch(TINY_PEDIDOS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`pedidos.pesquisa non-JSON (${res.status})`);
  }
  const retorno = json?.retorno;
  if (!retorno || retorno.status === "Erro") {
    const errs = retorno?.erros || retorno?.codigo_erro || text.slice(0, 200);
    throw new Error(`pedidos.pesquisa error: ${JSON.stringify(errs)}`);
  }
  const list = Array.isArray(retorno.pedidos) ? retorno.pedidos : [];
  let newCount = 0;
  for (const item of list) {
    const p = item?.pedido || item;
    const numero = String(p?.numero ?? "");
    if (!numero || seen.has(numero)) continue;
    await forwardPedido(p, webhookUrl, webhookAuth);
    seen.add(numero);
    newCount += 1;
    console.log(`Tiny poll: forwarded pedido ${numero}`);
  }
  if (newCount) saveSeenPedidos(seen);
  else if (list.length === 0) {
    // quiet
  }
  return { today, total: list.length, newCount };
}

export function startTinyLegacyPoller() {
  const token = (process.env.TINY_LEGACY_TOKEN || "").trim();
  if (!token) {
    console.log("Tiny legacy poller off (no TINY_LEGACY_TOKEN)");
    return null;
  }
  const webhookUrl = process.env.CURSOR_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("Tiny legacy poller: missing CURSOR_WEBHOOK_URL");
    return null;
  }
  const webhookAuth = normalizeAuth(
    process.env.CURSOR_WEBHOOK_AUTHORIZATION || ""
  );
  const intervalMs = Number(process.env.TINY_POLL_MS || 120000);
  const seen = loadSeenPedidos();
  console.log(
    `Tiny legacy poller on every ${intervalMs}ms (seen=${seen.size})`
  );

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(token, webhookUrl, webhookAuth, seen);
    } catch (err) {
      console.error("Tiny poll failed:", err?.message || err);
    } finally {
      running = false;
    }
  };

  // slight delay so Discord/HTTP boot first
  setTimeout(tick, 5000);
  const handle = setInterval(tick, intervalMs);
  return handle;
}
