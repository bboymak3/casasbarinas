// functions/api/facebook/history.js
// GET: View import history (admin only)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // Ensure table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS fb_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fb_post_id TEXT NOT NULL UNIQUE,
        property_id INTEGER,
        post_message TEXT,
        post_url TEXT,
        raw_data TEXT,
        imported_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (property_id) REFERENCES properties(id)
      )
    `).run();

    const rows = await env.DB.prepare(`
      SELECT fi.id, fi.fb_post_id, fi.property_id, fi.post_message, fi.post_url, fi.imported_at,
             p.title as property_title, p.status as property_status
      FROM fb_imports fi
      LEFT JOIN properties p ON fi.property_id = p.id
      ORDER BY fi.imported_at DESC
      LIMIT ?
    `).bind(limit).all();

    const total = await env.DB.prepare('SELECT COUNT(*) as total FROM fb_imports').first();
    const imported = await env.DB.prepare('SELECT COUNT(*) as total FROM fb_imports WHERE property_id IS NOT NULL').first();
    const skipped = await env.DB.prepare('SELECT COUNT(*) as total FROM fb_imports WHERE property_id IS NULL').first();

    return new Response(JSON.stringify({
      total: total.total,
      imported: imported.total,
      skipped: skipped.total,
      history: rows.results,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
