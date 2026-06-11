// functions/api/auth/login.js
// POST: Login user

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Error de configuración: Base de datos no disponible.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtSecret = env.JWT_SECRET || 'aunclick_default_secret_2024';

    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: 'Los datos enviados no son válidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email y contraseña son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find user
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Credenciales inválidas' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return new Response(JSON.stringify({ error: 'Tu cuenta ha sido desactivada. Contacta al administrador.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify password
    const passwordHash = await sha256(password);
    if (passwordHash !== user.password_hash) {
      return new Response(JSON.stringify({ error: 'Credenciales inválidas' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create JWT token
    const token = await createJWT(
      { id: user.id, name: user.name, email: user.email, role: user.role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 },
      jwtSecret
    );

    return new Response(JSON.stringify({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Login error:', error);
    let errorMsg = 'Error interno del servidor';
    if (error.message && error.message.includes('no such table')) {
      errorMsg = 'Error: La tabla de usuarios no existe. Ejecuta el schema.sql en tu base de datos D1.';
    } else if (error.message) {
      errorMsg = `Error: ${error.message}`;
    }
    return new Response(JSON.stringify({ error: errorMsg, debug: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
