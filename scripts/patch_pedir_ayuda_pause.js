// Fixes premature goodbye/replies while an employee confirmation request
// ([PEDIR_AYUDA]) is pending, and reconciles @lid <-> @c.us aliases across
// chat_sessions, solicitudes_ayuda, and mensajes_bot.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN_WF_ID = 'ugHOTQv3Vb6cuTct';
const REENVIAR_WF_ID = 'I29v5i9CxGgN6VKR';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';

const RESOLVE_ALIASES_SNIPPET = `const WAHA = (typeof $env !== 'undefined' && $env.WAHA_INTERNAL_URL) || process.env.WAHA_INTERNAL_URL || 'http://waha:3000';
const WAHA_KEY = (typeof $env !== 'undefined' && $env.WAHA_API_KEY) || process.env.WAHA_API_KEY || '';
async function resolveAliases(jid) {
  const out = new Set();
  if (!jid || typeof jid !== 'string') return [];
  out.add(jid);
  if (WAHA_KEY) {
    try {
      const wh = { 'X-Api-Key': WAHA_KEY };
      const url = jid.endsWith('@lid')
        ? WAHA + '/api/default/lids/' + encodeURIComponent(jid)
        : (jid.endsWith('@c.us') ? WAHA + '/api/default/lids/pn/' + encodeURIComponent(jid) : null);
      if (url) {
        const r = await axios.get(url, { headers: wh, timeout: 1200 });
        if (r.data && r.data.pn) out.add(r.data.pn);
        if (r.data && r.data.lid) out.add(r.data.lid);
      }
    } catch (e) {}
  }
  return Array.from(out);
}
const inList = (arr) => arr.map(encodeURIComponent).join(',');`;

const CODE_CHECK_CHAT_SESSION = `// Check Chat Session via Supabase REST (reemplaza el nodo Postgres roto).
// Upsert por telefono con rate-limit por ventana de 60s. Devuelve {estado, msg_count, telefono}.
// Reactivación automática: si un humano tomó el chat o quedó una ayuda pendiente >30 min
// sin respuesta al cliente, el bot vuelve a responder solo.
const axios = require('axios');
const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';
const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
const REACTIVAR_MS = 30 * 60 * 1000; // 30 min sin respuesta al cliente -> el bot retoma
${RESOLVE_ALIASES_SNIPPET}
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
let estado = 'automatico', msg_count = 1;
let no_atender = false;
try {
  if (telefono) {
    const aliases = await resolveAliases(telefono);
    const r = await axios.get(SB + '/rest/v1/chat_sessions?telefono=in.(' + inList(aliases) + ')&select=telefono,estado,msg_count,window_start,manual_since,no_atender', { headers: H });
    const rows = Array.isArray(r.data) ? r.data : [];
    const ownRow = rows.find((x) => x.telefono === telefono) || rows[0] || null;
    const now = Date.now();
    let window_start;
    let reactivar = false;
    let activeManualSince = null;

    for (const row of rows) {
      if (row.no_atender === true) no_atender = true;
      if (row.estado === 'manual') {
        const ms = row.manual_since ? new Date(row.manual_since).getTime() : 0;
        if (ms && (now - ms <= REACTIVAR_MS)) {
          estado = 'manual';
          activeManualSince = row.manual_since;
        } else {
          reactivar = true;
        }
      }
    }

    // Defensa adicional: si existe una solicitud de ayuda pendiente reciente (<30m),
    // pausar al bot para evitar respuestas o despedidas prematuras antes del compañero.
    if (estado !== 'manual' && !no_atender) {
      try {
        const helpSince = new Date(now - REACTIVAR_MS).toISOString();
        const hr = await axios.get(SB + '/rest/v1/solicitudes_ayuda?status=eq.pendiente&telefono=in.(' + inList(aliases) + ')&creado_en=gte.' + encodeURIComponent(helpSince) + '&select=id,creado_en&limit=1', { headers: H, timeout: 3000 });
        if (Array.isArray(hr.data) && hr.data.length > 0) {
          estado = 'manual';
          activeManualSince = hr.data[0].creado_en || new Date(now).toISOString();
        }
      } catch (e) {}
    }

    if (ownRow) {
      const ws = ownRow.window_start ? new Date(ownRow.window_start).getTime() : 0;
      if (now - ws > 60000) { msg_count = 1; window_start = new Date().toISOString(); }
      else { msg_count = (Number(ownRow.msg_count) || 0) + 1; window_start = ownRow.window_start; }
    } else {
      msg_count = 1; window_start = new Date().toISOString();
    }

    const up = { telefono, estado, msg_count, window_start, updated_at: new Date().toISOString() };
    if (estado === 'manual' && activeManualSince) up.manual_since = activeManualSince;
    else if (reactivar && estado === 'automatico') up.manual_since = null;
    await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', up, { headers: H });

    if (reactivar && estado === 'automatico') {
      for (const a of aliases) {
        if (a !== telefono) {
          try {
            await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: a, estado: 'automatico', manual_since: null, updated_at: new Date().toISOString() }, { headers: H });
          } catch (e) {}
        }
      }
    }
  }
} catch (e) {}
return [{ json: { estado, msg_count, telefono, no_atender } }];`;

const CODE_SET_CHAT_MANUAL = `// Set Chat Manual via Supabase REST (reemplaza el nodo Postgres roto).
// Marca la sesion del cliente (y su alias @lid/@c.us) como 'manual' para que el bot
// deje de responder (lo atiende un humano). Reactivacion automatica tras 30 min de silencio.
const axios = require('axios');
const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';
const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
${RESOLVE_ALIASES_SNIPPET}
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
try {
  if (telefono) {
    const aliases = await resolveAliases(telefono);
    const nowIso = new Date().toISOString();
    for (const a of aliases) {
      await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: a, estado: 'manual', manual_since: nowIso, updated_at: nowIso }, { headers: H });
    }
  }
} catch (e) {}
return [{ json: $json }];`;

const CODE_REGISTRAR_SOLICITUD_AYUDA = `// Registra una solicitud de ayuda (el bot no encontro algo o el cliente refuto el resultado)
// y pausa temporalmente al bot (chat_sessions -> manual) en todos los alias (@lid/@c.us) hasta
// que el empleado responda por Reenviar Ayuda o WhatsApp (con reactivacion automatica a los 30m).
const axios = require('axios');
const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';
const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const H_UPSERT = { ...H, Prefer: 'resolution=merge-duplicates' };
const DEDUP_HORAS = 3;
const MARCADORES = ['[pedir_ayuda]', '[escalar_humano]'];
const limpiar = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
${RESOLVE_ALIASES_SNIPPET}

let telefono = null, consulta = null, pushName = null, msgId = '';
try {
  const p = $('Transcribir Nota de Voz').first().json.body.payload;
  telefono = p && p.from;
  msgId = String((p && p.id) || '');
  consulta = limpiar(p && p.body).slice(0, 300) || null;
  pushName = (p && p._data && p._data.pushName) || (p && p.notifyName) || (p && p.pushName) || null;
} catch (e) {}

const aliases = telefono ? await resolveAliases(telefono) : [];

// Contexto: sin esto el empleado recibe "De este" y no puede hacer nada.
let contexto = '';
try {
  if (aliases.length > 0) {
    const r = await axios.get(SB + '/rest/v1/mensajes_procesados?chat_id=in.(' + inList(aliases) + ')&select=message_id,texto,procesado_at&order=procesado_at.desc&limit=8', { headers: H, timeout: 4000 });
    const previos = (r.data || [])
      .filter(f => String(f.message_id) !== msgId && f.texto)
      .slice(0, 3)
      .reverse()
      .map(f => limpiar(f.texto).slice(0, 90))
      .filter(Boolean);
    if (previos.length) contexto = 'antes dijo: ' + previos.map(t => '"' + t + '"').join(' · ');

    const b = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=in.(' + inList(aliases) + ')&select=texto_norm&order=created_at.desc&limit=5', { headers: H, timeout: 4000 });
    const ultima = (b.data || [])
      .map(x => limpiar(x.texto_norm))
      .find(t => t && MARCADORES.indexOf(t) === -1);
    if (ultima) contexto += (contexto ? ' | ' : '') + 'Perucho respondio: ' + ultima.slice(0, 150);
  }
} catch (e) {}

try {
  if (telefono && aliases.length > 0) {
    const desde = new Date(Date.now() - DEDUP_HORAS * 3600000).toISOString();
    const ex = await axios.get(SB + '/rest/v1/solicitudes_ayuda?status=eq.pendiente&select=id&telefono=in.(' + inList(aliases) + ')&creado_en=gte.' + encodeURIComponent(desde), { headers: H });
    if (!ex.data || ex.data.length === 0) {
      let nombre = null;
      try {
        const c = await axios.get(SB + '/rest/v1/clientes_chat?select=nombre&telefono=in.(' + inList(aliases) + ')&limit=1', { headers: H });
        nombre = (c.data && c.data[0] && c.data[0].nombre) || null;
      } catch (e) {}
      if (!nombre && pushName) nombre = String(pushName).slice(0, 80);
      const consultaConContexto = contexto
        ? (consulta || '(sin texto)') + '\\n— ' + contexto.slice(0, 260)
        : consulta;
      await axios.post(SB + '/rest/v1/solicitudes_ayuda', {
        telefono, nombre,
        consulta: consultaConContexto,
        consulta_limpia: consulta,
        motivo: 'no_encontrado', status: 'pendiente',
      }, { headers: H });
    }

    // Pausar al bot mientras se confirma con el compañero; evita despedidas falsas si el cliente dice "Ok gracias".
    const nowIso = new Date().toISOString();
    for (const a of aliases) {
      try {
        await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', {
          telefono: a, estado: 'manual', manual_since: nowIso, updated_at: nowIso
        }, { headers: H_UPSERT, timeout: 4000 });
      } catch (e) {}
    }
  }
} catch (e) {}
return [{ json: $json }];`;

function patchDetectarHandoffCode(code) {
  let updated = code;
  if (!updated.includes('resolveAliases')) {
    updated = updated.replace(
      "const norm = (t) => String(t || '').toLowerCase()",
      RESOLVE_ALIASES_SNIPPET + "\nconst norm = (t) => String(t || '').toLowerCase()"
    );
  }
  updated = updated.replace(
    "const r = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=eq.' + encodeURIComponent(cliente)",
    "const aliases = await resolveAliases(cliente);\n      const r = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=in.(' + inList(aliases) + ')'"
  );
  // Repair prior missing closing quote around inList(aliases)
  updated = updated.replace(
    "chat_id=in.(' + inList(aliases) + ') + '&created_at=gte.'",
    "chat_id=in.(' + inList(aliases) + ')&created_at=gte.'"
  );
  updated = updated.replace(
    "try {\n  await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: cliente, estado: 'manual', manual_since: new Date().toISOString(), updated_at: new Date().toISOString() }, { headers: H });\n  console.log('[Handoff] EMPLEADO tomó el chat ' + cliente + ' -> manual');\n} catch (e) {}",
    "try {\n  const aliasesOut = await resolveAliases(cliente);\n  const nowIso = new Date().toISOString();\n  for (const a of aliasesOut) {\n    await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: a, estado: 'manual', manual_since: nowIso, updated_at: nowIso }, { headers: H });\n  }\n  console.log('[Handoff] EMPLEADO tomó el chat ' + aliasesOut.join(',') + ' -> manual');\n} catch (e) {}"
  );
  return updated;
}

function patchReenviarCode(code) {
  let updated = code;
  if (!updated.includes('resolveAliases')) {
    updated = updated.replace(
      "const RECARGO = 1.40;",
      "const RECARGO = 1.40;\n" + RESOLVE_ALIASES_SNIPPET
    );
  }
  updated = updated.replace(
    "await axios.post(SB + '/rest/v1/mensajes_bot', { chat_id: sol.telefono, texto_norm: _norm(text) }, { headers: H });\n        await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: sol.telefono, estado: 'automatico', manual_since: null, updated_at: new Date().toISOString() }, { headers: H });",
    "await axios.post(SB + '/rest/v1/mensajes_bot', { chat_id: sol.telefono, texto_norm: _norm(text) }, { headers: H });\n        const aliases = await resolveAliases(sol.telefono);\n        const nowIso = new Date().toISOString();\n        for (const a of aliases) {\n          await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: a, estado: 'automatico', manual_since: null, updated_at: nowIso }, { headers: H });\n        }"
  );
  updated = updated.replace(
    "await axios.post(SB + '/rest/v1/mensajes_bot', { chat_id: sol.telefono, texto_norm: _norm(text) }, { headers: H });\n          await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: sol.telefono, estado: 'automatico', manual_since: null, updated_at: new Date().toISOString() }, { headers: H });",
    "await axios.post(SB + '/rest/v1/mensajes_bot', { chat_id: sol.telefono, texto_norm: _norm(text) }, { headers: H });\n          const aliases = await resolveAliases(sol.telefono);\n          const nowIso = new Date().toISOString();\n          for (const a of aliases) {\n            await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: a, estado: 'automatico', manual_since: null, updated_at: nowIso }, { headers: H });\n          }"
  );
  return updated;
}

function patchMainWorkflow(wf) {
  let changed = false;
  const replacements = {
    'Check Chat Session': CODE_CHECK_CHAT_SESSION,
    'Set Chat Manual': CODE_SET_CHAT_MANUAL,
    'Registrar Solicitud Ayuda': CODE_REGISTRAR_SOLICITUD_AYUDA,
  };
  for (const node of (wf.nodes || [])) {
    if (replacements[node.name] && node.parameters?.jsCode !== replacements[node.name]) {
      node.parameters.jsCode = replacements[node.name];
      changed = true;
    } else if (node.name === 'Detectar Handoff Empleado' && node.parameters?.jsCode) {
      const nextCode = patchDetectarHandoffCode(node.parameters.jsCode);
      if (nextCode !== node.parameters.jsCode) {
        node.parameters.jsCode = nextCode;
        changed = true;
      }
    }
  }
  return changed;
}

function patchReenviarWorkflow(wf) {
  let changed = false;
  const node = (wf.nodes || []).find((n) => n.name === 'Componer y Marcar');
  if (!node) throw new Error('Node "Componer y Marcar" not found');
  const nextCode = patchReenviarCode(node.parameters.jsCode);
  if (nextCode !== node.parameters.jsCode) {
    node.parameters.jsCode = nextCode;
    changed = true;
  }
  return changed;
}

function patchJsonFile(relPath, patchFn) {
  const full = path.join(ROOT, relPath);
  const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
  const changed = patchFn(wf);
  if (changed) {
    fs.writeFileSync(full, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  }
  console.log(`${relPath}: ${changed ? 'updated' : 'already up to date'}`);
}

async function patchLiveWorkflow(id, patchFn) {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const key = ((env.match(/^N8N_API_KEY=(.+)$/m) || [])[1] || '').trim();
  if (!key) throw new Error('N8N_API_KEY missing in .env');
  const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

  const wf = await (await fetch(`${BASE}/workflows/${id}`, { headers: H })).json();
  const changed = patchFn(wf);
  if (!changed) {
    console.log(`n8n live (${id}): already up to date`);
    return;
  }

  const ALLOWED = [
    'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
    'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder',
  ];
  const cs = {};
  for (const k of ALLOWED) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const put = await fetch(`${BASE}/workflows/${id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }),
  });
  if (!put.ok) throw new Error(`PUT ${id} failed: ${put.status} ${await put.text()}`);
  console.log(`n8n live (${id}): updated (HTTP ${put.status})`);
}

module.exports = {
  CODE_CHECK_CHAT_SESSION,
  CODE_SET_CHAT_MANUAL,
  CODE_REGISTRAR_SOLICITUD_AYUDA,
  patchDetectarHandoffCode,
  patchReenviarCode,
  patchMainWorkflow,
  patchReenviarWorkflow,
};

if (require.main === module) {
  (async () => {
    patchJsonFile('workflows/production-baseline.json', patchMainWorkflow);
    patchJsonFile('n8n_workflow.json', patchMainWorkflow);
    patchJsonFile('workflows/workflow_reenviar_ayuda.json', patchReenviarWorkflow);
    if (!process.argv.includes('--files-only')) {
      await patchLiveWorkflow(MAIN_WF_ID, patchMainWorkflow);
      await patchLiveWorkflow(REENVIAR_WF_ID, patchReenviarWorkflow);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
