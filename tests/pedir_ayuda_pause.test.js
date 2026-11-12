const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  CODE_CHECK_CHAT_SESSION,
  CODE_SET_CHAT_MANUAL,
  CODE_REGISTRAR_SOLICITUD_AYUDA,
  patchMainWorkflow,
  patchReenviarWorkflow,
} = require('../scripts/patch_pedir_ayuda_pause');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function runN8nCode(jsCode, { axiosMock, payload, env = {} }) {
  const fullEnv = {
    SUPABASE_URL: 'https://sb.test',
    SUPABASE_ANON_KEY: 'anon',
    WAHA_INTERNAL_URL: 'http://waha:3000',
    WAHA_API_KEY: 'waha-secret',
    ...env,
  };
  const fn = new AsyncFunction(
    'require',
    '$env',
    '$',
    '$json',
    `const process = { env: ${JSON.stringify(fullEnv)} };\n` + jsCode
  );
  const dollar = () => ({
    first: () => ({ json: { body: { payload } } }),
  });
  return fn((name) => {
    if (name === 'axios') return axiosMock;
    throw new Error('Unexpected require: ' + name);
  }, fullEnv, dollar, { output: '[PEDIR_AYUDA]' });
}

test('Registrar Solicitud Ayuda + Check Chat Session pauses both @c.us and @lid on [PEDIR_AYUDA] until resolved', async () => {
  const upserts = [];
  const solicitudes = [];
  const axiosMock = {
    get: async (url) => {
      if (url.includes('/api/default/lids/pn/584126898555%40c.us')) {
        return { data: { lid: '160112354263211@lid', pn: '584126898555@c.us' } };
      }
      if (url.includes('/api/default/lids/160112354263211%40lid')) {
        return { data: { lid: '160112354263211@lid', pn: '584126898555@c.us' } };
      }
      if (url.includes('/rest/v1/chat_sessions')) {
        return {
          data: upserts.filter((u) => u.telefono === '584126898555@c.us' || u.telefono === '160112354263211@lid'),
        };
      }
      if (url.includes('/rest/v1/solicitudes_ayuda')) {
        return { data: solicitudes };
      }
      return { data: [] };
    },
    post: async (url, body) => {
      if (url.includes('/rest/v1/chat_sessions')) {
        const idx = upserts.findIndex((u) => u.telefono === body.telefono);
        if (idx >= 0) upserts[idx] = { ...upserts[idx], ...body };
        else upserts.push(body);
      } else if (url.includes('/rest/v1/solicitudes_ayuda')) {
        solicitudes.push({ id: 158, creado_en: new Date().toISOString(), ...body });
      }
      return { data: [body] };
    },
  };

  // Step 1: Customer asks on @c.us -> [PEDIR_AYUDA] triggers Registrar Solicitud Ayuda
  await runN8nCode(CODE_REGISTRAR_SOLICITUD_AYUDA, {
    axiosMock,
    payload: { id: 'msg1', from: '584126898555@c.us', body: 'Tiene cable trifacico #6' },
  });

  assert.equal(solicitudes.length, 1);
  assert.equal(upserts.find((u) => u.telefono === '584126898555@c.us')?.estado, 'manual');
  assert.equal(upserts.find((u) => u.telefono === '160112354263211@lid')?.estado, 'manual');

  // Step 2: 27s later, customer replies "Ok gracias" from @lid -> Check Chat Session MUST return manual
  const checkRes = await runN8nCode(CODE_CHECK_CHAT_SESSION, {
    axiosMock,
    payload: { id: 'msg2', from: '160112354263211@lid', body: 'Ok gracias' },
  });
  assert.equal(checkRes[0].json.estado, 'manual');
});

test('Check Chat Session falls back to manual if pending solicitud_ayuda exists even when chat_sessions says automatico', async () => {
  const axiosMock = {
    get: async (url) => {
      if (url.includes('/api/default/lids/160112354263211%40lid')) {
        return { data: { lid: '160112354263211@lid', pn: '584126898555@c.us' } };
      }
      if (url.includes('/rest/v1/chat_sessions')) {
        return { data: [{ telefono: '160112354263211@lid', estado: 'automatico', msg_count: 1, window_start: new Date().toISOString() }] };
      }
      if (url.includes('/rest/v1/solicitudes_ayuda')) {
        return { data: [{ id: 158, creado_en: new Date().toISOString() }] };
      }
      return { data: [] };
    },
    post: async (_url, body) => ({ data: [body] }),
  };

  const res = await runN8nCode(CODE_CHECK_CHAT_SESSION, {
    axiosMock,
    payload: { id: 'msg2', from: '160112354263211@lid', body: 'Ok gracias' },
  });
  assert.equal(res[0].json.estado, 'manual');
});

test('Set Chat Manual marks both @c.us and @lid aliases as manual', async () => {
  const posted = [];
  const axiosMock = {
    get: async (url) => {
      if (url.includes('/api/default/lids/pn/584126898555%40c.us')) {
        return { data: { lid: '160112354263211@lid', pn: '584126898555@c.us' } };
      }
      return { data: [] };
    },
    post: async (_url, body) => {
      posted.push(body);
      return { data: [body] };
    },
  };

  await runN8nCode(CODE_SET_CHAT_MANUAL, {
    axiosMock,
    payload: { id: 'msg1', from: '584126898555@c.us', body: 'Quiero hablar con alguien' },
  });
  assert.deepEqual(
    posted.map((p) => p.telefono).sort(),
    ['160112354263211@lid', '584126898555@c.us']
  );
  assert.ok(posted.every((p) => p.estado === 'manual'));
});

test('workflow files accept pedir-ayuda pause + alias patches cleanly and idempotently', () => {
  for (const rel of ['workflows/production-baseline.json', 'n8n_workflow.json']) {
    const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'));
    assert.equal(patchMainWorkflow(wf), false, `${rel} should be patched cleanly`);
  }
  const reenviar = JSON.parse(fs.readFileSync(path.join(__dirname, '../workflows/workflow_reenviar_ayuda.json'), 'utf8'));
  assert.equal(patchReenviarWorkflow(reenviar), false, 'workflow_reenviar_ayuda.json should be patched cleanly');
});
