const PROJECT = "https://syyealdlapxmpeccaary.supabase.co";
const AUTH_KEY = "sb_publishable_t_BJFV9l8tQvcPhZlTnLlg_5fYZJCwB";
const ORIGIN = "https://fravier3.github.io", OWNER = "fjvs1993@gmail.com";
const enc = new TextEncoder(), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const key = crypto.subtle.digest("SHA-256", enc.encode(service + "|plex-fran-v1")).then((x) => crypto.subtle.importKey("raw", x, "AES-GCM", false, ["encrypt", "decrypt"]));
class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
  status;
}
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
async function hash(x) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(x.toLowerCase().trim()))), (x2) => x2.toString(16).padStart(2, "0")).join("");
}
async function db(table, method = "GET", body, query = "") {
  const r = await fetch(PROJECT + "/rest/v1/" + table + query, { method, headers: { apikey: service, Authorization: "Bearer " + service, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === void 0 ? void 0 : JSON.stringify(body) });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    if (err.code === "23505") throw new AppError("Ese n\xFAmero, correo o usuario ya existe.", 409);
    if (err.message?.includes("stale_revision")) throw new AppError("El registro cambi\xF3 en otro dispositivo. Actualiza antes de guardar.", 409);
    throw new AppError("No se pudo guardar el registro. Int\xE9ntalo otra vez.");
  }
  return r.status === 204 ? [] : await r.json();
}
function clean(x, kind) {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new AppError("Datos inv\xE1lidos.");
  const out = {};
  const fields = kind === "accounts" ? ["number", "username", "email", "password", "assigned", "notes"] : kind === "people" ? ["name", "email", "phone", "notes"] : ["title", "category", "content"];
  for (const f of fields) {
    out[f] = f === "password" || f === "content" ? String(x[f] ?? "") : String(x[f] ?? "").trim();
    if (out[f].length > (f === "content" ? 2e4 : f === "notes" ? 2e3 : 300)) throw new AppError("El contenido es demasiado largo.");
  }
  if (kind === "accounts") {
    if (!/^\d+$/.test(out.number) || Number(out.number) < 1 || Number(out.number) > 2147483647 || !out.username || !out.email || !out.password) throw new AppError("Completa el n\xFAmero, usuario Plex, correo y contrase\xF1a.");
    out.number = String(Number(out.number));
    if (out.assigned.toLowerCase() === "libre") out.assigned = "";
  } else if (kind === "people") {
    if (!out.name || out.name.toLowerCase() === "libre") throw new AppError("Escribe un nombre de usuario (Full Name).");
  } else if (!out.title || !out.content.trim()) throw new AppError("Escribe un t\xEDtulo y el contenido de la nota.");
  return out;
}
async function indexes(value, kind) {
  return kind === "accounts" ? { account_number: Number(value.number), email_hash: await hash(value.email) } : kind === "people" ? { name_hash: await hash(value.name) } : {};
}
async function linked(name) {
  const rows = await db("plex_fran_accounts");
  for (const row of rows) if ((await open(row.payload)).assigned?.toLowerCase() === name.toLowerCase()) return true;
  return false;
}
async function saveAccount(data, id, revision) {
  let personPayload = null, personHash = null;
  if (data.assigned) {
    personHash = await hash(data.assigned);
    const match = await db("plex_fran_people", "GET", void 0, "?name_hash=eq." + personHash + "&limit=1");
    if (match.length) data.assigned = (await open(match[0].payload)).name;
    else personPayload = await seal({ name: data.assigned, email: "", phone: "", notes: "" });
  }
  const index = await indexes(data, "accounts");
  const savedId = await db("rpc/plex_fran_save_account", "POST", { p_id: id, p_revision: revision, p_payload: await seal(data), p_number: index.account_number, p_email_hash: index.email_hash, p_person_payload: personPayload, p_person_hash: personHash });
  return { id: savedId, saved: true };
}
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store", "Content-Type": "application/json" };
  const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && origin !== ORIGIN) return answer({ error: "Acceso no permitido" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return answer({ error: "M\xE9todo no permitido" }, 405);
  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return answer({ error: "Vuelve a iniciar sesi\xF3n" }, 401);
    const u = await fetch(PROJECT + "/auth/v1/user", { headers: { apikey: AUTH_KEY, Authorization: authorization } });
    if (!u.ok) return answer({ error: "Vuelve a iniciar sesi\xF3n" }, 401);
    const user = await u.json();
    if (user.email?.toLowerCase() !== OWNER || !user.email_confirmed_at) return answer({ error: "Acceso reservado al administrador" }, 403);
    const text = await req.text();
    if (text.length > 1e5) return answer({ error: "Archivo demasiado grande" }, 413);
    const body = JSON.parse(text);
    const kind = body.kind ?? "accounts";
    if (!["accounts", "people", "notes"].includes(kind)) return answer({ error: "Secci\xF3n inv\xE1lida" }, 400);
    const table = "plex_fran_" + kind;
    if (body.action === "list") {
      const rows = await db(table, "GET", void 0, "?select=id,payload,revision,updated_at&order=updated_at.desc");
      return answer({ rows: await Promise.all(rows.map(async (x) => ({ id: x.id, revision: x.revision, updated_at: x.updated_at, ...await open(x.payload) }))) });
    }
    if (body.action === "create") {
      const data = clean(body.data, kind);
      if (kind === "accounts") return answer(await saveAccount(data, null, null));
      const rows = await db(table, "POST", { payload: await seal(data), ...await indexes(data, kind) });
      return answer({ id: rows[0].id });
    }
    if (!/^[0-9a-f-]{36}$/.test(body.id)) return answer({ error: "Registro inv\xE1lido" }, 400);
    if (body.action === "update") {
      const data = clean(body.data, kind);
      if (!Number.isInteger(body.revision)) return answer({ error: "Versi\xF3n inv\xE1lida" }, 400);
      if (kind === "accounts") return answer(await saveAccount(data, body.id, body.revision));
      if (kind === "people") {
        const old = await db(table, "GET", void 0, "?id=eq." + body.id);
        if (!old.length) throw new AppError("El usuario ya no existe.", 409);
        const name = (await open(old[0].payload)).name;
        const changes = [];
        if (name !== data.name) {
          for (const row of await db("plex_fran_accounts")) {
            const account = await open(row.payload);
            if (account.assigned?.toLowerCase() === name.toLowerCase()) changes.push({ id: row.id, revision: row.revision, payload: await seal({ ...account, assigned: data.name }) });
          }
        }
        await db("rpc/plex_fran_save_person", "POST", { p_id: body.id, p_revision: body.revision, p_payload: await seal(data), p_name_hash: await hash(data.name), p_accounts: changes });
        return answer({ saved: true });
      }
      const rows = await db(table, "PATCH", { payload: await seal(data), ...await indexes(data, kind), revision: body.revision + 1, updated_at: (/* @__PURE__ */ new Date()).toISOString() }, "?id=eq." + body.id + "&revision=eq." + body.revision);
      return rows.length ? answer({ saved: true }) : answer({ error: "El registro cambi\xF3. Actualiza e int\xE9ntalo de nuevo." }, 409);
    }
    if (body.action === "delete") {
      if (kind === "people") {
        const old = await db(table, "GET", void 0, "?id=eq." + body.id);
        if (old.length && await linked((await open(old[0].payload)).name)) throw new AppError("Libera primero las cuentas de este usuario.");
      }
      await db(table, "DELETE", void 0, "?id=eq." + body.id);
      return answer({ deleted: true });
    }
    return answer({ error: "Acci\xF3n desconocida" }, 400);
  } catch (e) {
    return e instanceof AppError ? answer({ error: e.message }, e.status) : answer({ error: "No se pudo completar la operaci\xF3n. Int\xE9ntalo otra vez." }, 400);
  }
});
