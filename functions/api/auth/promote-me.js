// functions/api/auth/promote-me.js
// POST: Auto-promote first user to admin (one-time setup)
// If NO admin users exist, promote the authenticated user to admin.
// If admin exists but has DEFAULT credentials (password = sha256("admin123")),
// allow takeover by any authenticated user.

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

function base64url(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const data = `${headerB64}.${payloadB64}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  return `${data}.${signatureB64}`;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Base de datos no disponible' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtSecret = env.JWT_SECRET || 'aunclick_default_secret_2024';

    // Auth required
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const user = await verifyJWT(token, jwtSecret);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check existing admins
    const existingAdmins = await env.DB.prepare('SELECT id, name, email, password_hash FROM users WHERE role = ?').bind('admin').all();
    const admins = existingAdmins.results || [];

    if (admins.length === 0) {
      // No admins - promote this user
      return await promoteUser(env, user, jwtSecret);
    }

    // Check if current user is already admin
    if (admins.some(a => a.id === user.id)) {
      return new Response(JSON.stringify({ message: 'Ya eres administrador', role: 'admin' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if ALL existing admins have default/placeholder credentials
    // (password = sha256("admin123") or sha256("Admin123"))
    const defaultHash1 = await sha256('admin123');
    const defaultHash2 = await sha256('Admin123');
    const allDefault = admins.every(a => a.password_hash === defaultHash1 || a.password_hash === defaultHash2);

    if (allDefault) {
      // Demote default admins to 'user' and promote the requesting user
      for (const admin of admins) {
        await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind('user', admin.id).run();
      }
      return await promoteUser(env, user, jwtSecret);
    }

    // Admins with real passwords exist - deny
    return new Response(JSON.stringify({
      error: 'Ya existe un administrador activo en el sistema.',
      admin_email: admins[0].email,
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Promote error:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor', debug: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function promoteUser(env, user, jwtSecret) {
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind('admin', user.id).run();

  // Generate new JWT with admin role
  const newToken = await createJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  }, jwtSecret);

  return new Response(JSON.stringify({
    message: 'Has sido promovido a administrador. Recarga la página.',
    role: 'admin',
    token: newToken,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
