const PROJECT = "https://syyealdlapxmpeccaary.supabase.co";
const AUTH = PROJECT;
const AUTH_KEY = "sb_publishable_t_BJFV9l8tQvcPhZlTnLlg_5fYZJCwB";
const ORIGIN = "https://fravier3.github.io";
const enc = new TextEncoder();
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const key = crypto.subtle.digest("SHA-256", enc.encode(service + "|plex-fran-v1")).then((x) => crypto.subtle.importKey("raw", x, "AES-GCM", false, ["encrypt", "decrypt"]));
const b64 = (x) => btoa(String.fromCharCode(...x));
async function seal(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, enc.encode(JSON.stringify(value)));
  return b64(iv) + "." + b64(new Uint8Array(bytes));
}
async function open(payload) {
  const [iv, data] = payload.split(".").map((x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key, data)));
}
async function db(table, method = "GET", body, query = "") {
  const r = await fetch(PROJECT + "/rest/v1/" + table + query, { method, headers: { apikey: service, Authorization: "Bearer " + service, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === void 0 ? void 0 : JSON.stringify(body) });
  if (!r.ok) throw Error("database");
  return r.status === 204 ? [] : await r.json();
}
function clean(x, kind) {
  if (!x || typeof x !== "object") throw Error("invalid");
  const out = {};
  for (const f of kind === "accounts" ? ["number", "username", "email", "password", "assigned", "notes"] : ["name", "email", "phone", "notes"]) {
    out[f] = f === "password" ? String(x[f] ?? "") : String(x[f] ?? "").trim();
    if (out[f].length > (f === "notes" ? 2e3 : 300)) throw Error("invalid");
  }
  if (kind === "accounts") {
    if (!/^\d+$/.test(out.number) || !out.username || !out.email || !out.password) throw Error("invalid");
    if (out.assigned.toLowerCase() === "libre") out.assigned = "";
  } else if (!out.name) throw Error("invalid");
  return out;
}
async function indexes(value, kind) {
  const hash = async (x) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(x.toLowerCase().trim()))), (x2) => x2.toString(16).padStart(2, "0")).join("");
  return kind === "accounts" ? { account_number: Number(value.number), email_hash: await hash(value.email) } : { name_hash: await hash(value.name) };
}
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store", "Content-Type": "application/json" };
  const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && origin !== ORIGIN) return answer({ error: "Acceso no permitido" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return answer({ error: "M\xE9todo no permitido" }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 2e5) return answer({ error: "Archivo demasiado grande" }, 413);
    const body = await req.json();
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return answer({ error: "Vuelve a iniciar sesi\xF3n" }, 401);
    const u = await fetch(AUTH + "/auth/v1/user", { headers: { apikey: AUTH_KEY, Authorization: authorization } });
    if (!u.ok) return answer({ error: "Vuelve a iniciar sesi\xF3n" }, 401);
    const user = await u.json();
    if (user.email?.toLowerCase() !== "fjvs1993@gmail.com" || !user.email_confirmed_at) return answer({ error: "Acceso reservado al administrador" }, 403);
    const kind = body.kind === "people" ? "people" : "accounts";
    const table = "plex_fran_" + kind;
    if (body.action === "list") {
      const rows = await db(table, "GET", void 0, "?select=id,payload,revision,updated_at&order=updated_at.desc");
      return answer({ rows: await Promise.all(rows.map(async (x) => ({ id: x.id, revision: x.revision, updated_at: x.updated_at, ...await open(x.payload) }))) });
    }
    if (body.action === "create") {
      const data = clean(body.data, kind);
      const rows = await db(table, "POST", { payload: await seal(data), ...await indexes(data, kind) });
      return answer({ id: rows[0].id });
    }
    if (!/^[0-9a-f-]{36}$/.test(body.id)) return answer({ error: "Registro inv\xE1lido" }, 400);
    if (body.action === "update") {
      const data = clean(body.data, kind);
      if (!Number.isInteger(body.revision)) return answer({ error: "Versi\xF3n inv\xE1lida" }, 400);
      const rows = await db(table, "PATCH", { payload: await seal(data), ...await indexes(data, kind), revision: body.revision + 1, updated_at: (/* @__PURE__ */ new Date()).toISOString() }, "?id=eq." + body.id + "&revision=eq." + body.revision);
      return rows.length ? answer({ saved: true }) : answer({ error: "Este registro cambi\xF3 en otro dispositivo. Actualiza e int\xE9ntalo otra vez." }, 409);
    }
    if (body.action === "delete") {
      await db(table, "DELETE", void 0, "?id=eq." + body.id);
      return answer({ deleted: true });
    }
    return answer({ error: "Acci\xF3n desconocida" }, 400);
  } catch {
    return answer({ error: "No se pudo completar la operaci\xF3n. Int\xE9ntalo otra vez." }, 400);
  }
});
