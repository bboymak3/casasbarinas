// functions/api/facebook/config.js
// GET: Retrieve Facebook config (admin only)
// POST: Save Facebook config (admin only)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

function base64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  return JSON.parse(atob(base64));
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  let sigBase64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  const sigPad = sigBase64.length % 4;
  if (sigPad) sigBase64 += '='.repeat(4 - sigPad);
  const sigBytes = Uint8Array.from(atob(sigBase64), (c) => c.charCodeAt(0));
  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
  if (!isValid) return null;
  const payload = base64urlDecode(payloadB64);
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS fb_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token requerido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Solo administradores' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    await ensureTable(env.DB);

    const rows = await env.DB.prepare('SELECT key, value FROM fb_config').all();
    const config = {};
    for (const row of rows.results) {
      config[row.key] = row.value;
    }

    // Mask the token for display
    if (config.page_access_token) {
      config.page_access_token_masked = config.page_access_token.substring(0, 10) + '...' + config.page_access_token.substring(config.page_access_token.length - 6);
    }

    return new Response(JSON.stringify({ config }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token requerido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Solo administradores' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { page_id, page_access_token, auto_approve, default_city } = body;

    if (!page_id || !page_access_token) {
      return new Response(JSON.stringify({ error: 'Page ID y Page Access Token son requeridos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await ensureTable(env.DB);

    const upsert = env.DB.prepare('INSERT INTO fb_config (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
    await env.DB.batch([
      upsert.bind('page_id', page_id),
      upsert.bind('page_access_token', page_access_token),
      upsert.bind('auto_approve', auto_approve === true ? '1' : '0'),
      upsert.bind('default_city', default_city || 'Barinas'),
    ]);

    // Verify the token by making a test call to Facebook
    try {
      const testResp = await fetch(`https://graph.facebook.com/v18.0/${page_id}?fields=name&access_token=${page_access_token}`);
      const testData = await testResp.json();
      if (testData.error) {
        return new Response(JSON.stringify({ error: 'Token inválido: ' + testData.error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const pageName = testData.name || 'Página';
      return new Response(JSON.stringify({ success: true, message: `Configuración guardada. Página verificada: ${pageName}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (fbError) {
      return new Response(JSON.stringify({ success: true, message: 'Configuración guardada. No se pudo verificar la conexión con Facebook.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
