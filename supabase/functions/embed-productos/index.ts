// Drains public.embedding_cola: for each queued product it makes sure there is a Luna
// description, builds the enriched text, embeds it and upserts productos_embedding.
//
// Called every minute by pg_cron (only when the queue is non-empty) with the
// service_role key. The enriched text and its hash MUST stay identical to textoDe/hashDe
// in scripts/generar_embeddings.js, otherwise the manual script sees these rows as
// changed and re-embeds them.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createHash } from "node:crypto";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OAI = (Deno.env.get("OPENAI_API_KEY") || "").trim();
const OR = (Deno.env.get("OPENROUTER_API_KEY") || "").trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const MODELO_EMB = "text-embedding-3-small";
const DIMS = 1536;
const MODELO_DESC = "openai/gpt-5.6-luna";
const LOTE = 40;           // products per invocation; keeps writes under the HNSW timeout
const LOTE_LUNA = 20;
const MAX_INTENTOS = 5;

// Same as norm() in lib/catalog-search.js. Do not change one without the other.
function norm(t: string): string {
  return String(t).toLowerCase()
    .replace(/(\d)\s*,\s*(\d)/g, "$1.$2")
    .replace(/[×✕✖]/g, "x")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b([cp])\/([a-z])/g, "$1/ $2")
    .replace(/[^a-z0-9 .\/-]/g, " ")
    .replace(/\s+/g, " ").trim();
}
const md5 = (t: string) => createHash("md5").update(t).digest("hex");

function textoDe(desc: string, ia: string | undefined, sinonimos: string[]): string {
  const d = desc.trim();
  const cat = norm(d).split(" ")[0];
  const sinon = sinonimos.slice(0, 12);
  let t = d;
  if (ia) t += " | " + ia;
  if (cat) t += " | categoria: " + cat;
  if (sinon.length) t += " | como lo pide el cliente: " + sinon.join(", ");
  return t;
}

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path.split("?")[0]} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  const txt = await r.text();   // return=minimal and DELETE come back with an empty body
  return txt ? JSON.parse(txt) : null;
}
const inList = (xs: string[]) => `in.(${xs.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(",")})`;

const SISTEMA = `Eres un ferretero veterano venezolano. Te doy productos del catálogo con su código y su nombre tal como está escrito en el sistema (cadenas cortas, con abreviaturas).

Por cada uno escribe UNA O DOS FRASES diciendo QUÉ ES y PARA QUÉ SIRVE, en español natural de Venezuela.

REGLAS:
- Empieza por el tipo de producto. Ej: "Disco de corte fino para amoladora, se usa para cortar metal y cabilla."
- Menciona el OFICIO o la tarea en que se usa (albañilería, herrería, plomería, electricidad, carpintería).
- Si el nombre trae una abreviatura, desarróllala ("C/METAL" = para metal, "P/EMP" = de empotrar).
- NO inventes marcas, medidas ni materiales que no estén en el nombre.
- NO repitas el nombre tal cual: aporta el significado que el nombre NO dice.
- Sin precios, sin disponibilidad, sin adornos comerciales.
- Devuelve el MISMO código que te doy, sin cambiarlo.`;

const ESQUEMA = {
  type: "object",
  properties: {
    productos: {
      type: "array",
      items: {
        type: "object",
        properties: { codigo: { type: "string" }, descripcion: { type: "string" } },
        required: ["codigo", "descripcion"],
        additionalProperties: false,
      },
    },
  },
  required: ["productos"],
  additionalProperties: false,
};

// Luna description for products that have none or whose name changed since it was written.
// A failure here is not fatal: the product is embedded without it, as the manual script does.
async function describir(lote: { codigo_interno: string; descripcion: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!OR || !lote.length) return out;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OR}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO_DESC, temperature: 0.3,
      messages: [
        { role: "system", content: SISTEMA },
        { role: "user", content: lote.map((p) => `${p.codigo_interno} | ${p.descripcion}`).join("\n") },
      ],
      response_format: { type: "json_schema", json_schema: { name: "descripciones", strict: true, schema: ESQUEMA } },
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error("Luna: " + JSON.stringify(j.error).slice(0, 200));
  const porCodigo = new Map(lote.map((p) => [p.codigo_interno, p.descripcion]));
  const filas = [];
  for (const d of JSON.parse(j.choices[0].message.content).productos || []) {
    const orig = porCodigo.get(d.codigo);
    if (!orig || !d.descripcion || out.has(d.codigo)) continue;   // invented or repeated code
    const ia = d.descripcion.trim().slice(0, 500);
    out.set(d.codigo, ia);
    filas.push({ codigo_interno: d.codigo, descripcion_ia: ia, hash_origen: md5(orig.trim()), modelo: MODELO_DESC });
  }
  if (filas.length) {
    await sb("producto_descripcion?on_conflict=codigo_interno", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(filas),
    });
  }
  return out;
}

async function embeber(textos: string[]): Promise<number[][]> {
  const pedir = (url: string, key: string) => fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO_EMB, input: textos, dimensions: DIMS }),
  });
  let error = "no embeddings provider (set OPENAI_API_KEY or OPENROUTER_API_KEY)";
  for (const [url, key] of [["https://api.openai.com/v1/embeddings", OAI], ["https://openrouter.ai/api/v1/embeddings", OR]]) {
    if (!key) continue;
    try {
      const r = await pedir(url, key);
      const j = await r.json();
      if (r.ok && !j.error) return j.data.map((d: { embedding: number[] }) => d.embedding);
      error = `${url} ${r.status}: ${JSON.stringify(j.error || j).slice(0, 200)}`;
    } catch (e) {
      error = `${url}: ${(e as Error).message}`;
    }
  }
  throw new Error(error);
}

// The caller must be service_role (pg_cron). The gateway already verified the JWT.
function esServiceRole(req: Request): boolean {
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!esServiceRole(req)) return new Response("forbidden", { status: 403 });

  const cola: { codigo_interno: string; encolado_en: string; intentos: number }[] = await sb(
    `embedding_cola?select=codigo_interno,encolado_en,intentos&intentos=lt.${MAX_INTENTOS}&order=encolado_en.asc&limit=${LOTE}`,
  );
  if (!cola.length) return Response.json({ procesados: 0 });

  // Dequeue only if it was not re-queued while we worked (encolado_en unchanged).
  const sacar = (c: typeof cola[number]) =>
    sb(`embedding_cola?codigo_interno=eq.${encodeURIComponent(c.codigo_interno)}&encolado_en=eq.${encodeURIComponent(c.encolado_en)}`, { method: "DELETE" });

  try {
    const codigos = cola.map((c) => c.codigo_interno);
    const productos: { codigo_interno: string; descripcion: string }[] = (await sb(
      `productos?select=codigo_interno,descripcion&codigo_interno=${inList(codigos)}`,
    )).filter((p: { descripcion: string | null }) => p.descripcion && p.descripcion.trim());

    // Deleted products or empty descriptions: nothing to embed.
    const vivos = new Set(productos.map((p) => p.codigo_interno));
    await Promise.all(cola.filter((c) => !vivos.has(c.codigo_interno)).map(sacar));
    if (!productos.length) return Response.json({ procesados: 0, descartados: cola.length });

    // Existing Luna descriptions; regenerate the missing or stale ones.
    const desc = new Map<string, string>();
    const previas: { codigo_interno: string; descripcion_ia: string; hash_origen: string }[] = await sb(
      `producto_descripcion?select=codigo_interno,descripcion_ia,hash_origen&codigo_interno=${inList(codigos)}`,
    );
    for (const d of previas) desc.set(d.codigo_interno, d.descripcion_ia);
    const hashPrevio = new Map(previas.map((d) => [d.codigo_interno, d.hash_origen]));
    const sinDesc = productos.filter((p) => hashPrevio.get(p.codigo_interno) !== md5(p.descripcion.trim()));
    let errorLuna: string | null = null;
    for (let i = 0; i < sinDesc.length; i += LOTE_LUNA) {
      try {
        for (const [k, v] of await describir(sinDesc.slice(i, i + LOTE_LUNA))) desc.set(k, v);
      } catch (e) {
        errorLuna = (e as Error).message;
      }
    }

    // Colloquial vocabulary for the categories involved. Same order as the manual script.
    const cats = [...new Set(productos.map((p) => norm(p.descripcion.trim()).split(" ")[0]).filter(Boolean))];
    const vocab: { termino: string; categoria: string }[] = cats.length
      ? await sb(`catalogo_vocabulario?select=termino,categoria&activo=eq.true&categoria=${inList(cats)}&order=categoria.asc&limit=10000`)
      : [];
    const porCat = new Map<string, string[]>();
    for (const v of vocab) {
      if (!porCat.has(v.categoria)) porCat.set(v.categoria, []);
      porCat.get(v.categoria)!.push(v.termino);
    }

    const textos = productos.map((p) =>
      textoDe(p.descripcion, desc.get(p.codigo_interno), porCat.get(norm(p.descripcion.trim()).split(" ")[0]) || [])
    );
    const vectores = await embeber(textos);
    const ahora = new Date().toISOString();
    await sb("productos_embedding?on_conflict=codigo_interno", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(productos.map((p, k) => ({
        codigo_interno: p.codigo_interno,
        descripcion: p.descripcion,
        hash_desc: md5(textos[k]),
        embedding: JSON.stringify(vectores[k]),
        modelo: MODELO_EMB,
        actualizado_en: ahora,
      }))),
    });

    await Promise.all(cola.filter((c) => vivos.has(c.codigo_interno)).map(sacar));
    return Response.json({ procesados: productos.length, descripciones_nuevas: sinDesc.length, error_luna: errorLuna });
  } catch (e) {
    // Leave everything queued and count the attempt; after MAX_INTENTOS it stops retrying.
    const msg = (e as Error).message.slice(0, 500);
    await Promise.all(cola.map((c) =>
      sb(`embedding_cola?codigo_interno=eq.${encodeURIComponent(c.codigo_interno)}`, {
        method: "PATCH", body: JSON.stringify({ intentos: c.intentos + 1, ultimo_error: msg }),
      }).catch(() => null)
    ));
    console.error("embed-productos:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
});
