// functions/api/users/me.js
// PUT: Update current user profile

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

export async function onRequestPut(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Base de datos no disponible.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtSecret = env.JWT_SECRET || 'aunclick_default_secret_2024';

    // Auth required
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorizacion requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const user = await verifyJWT(token, jwtSecret);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token invalido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();

    // Ensure new columns exist
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN whatsapp TEXT').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN bio TEXT').run(); } catch (e) {}

    // Build dynamic UPDATE
    const allowedFields = ['name', 'email', 'phone', 'whatsapp', 'avatar', 'bio'];
    const setClauses = [];
    const bindings = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        bindings.push(body[field]);
      }
    }

    if (setClauses.length === 0) {
      return new Response(JSON.stringify({ error: 'No se proporcionaron campos para actualizar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    setClauses.push("updated_at = datetime('now')");
    bindings.push(user.id);

    await env.DB.prepare(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    return new Response(JSON.stringify({ message: 'Perfil actualizado exitosamente' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
