// functions/api/favorites/index.js
// GET: List user favorites
// POST: Add favorite
// DELETE: Remove favorite

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

// ─── GET: List user favorites ───────────────────────────────────
export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorización requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const offset = (page - 1) * limit;

    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?'
    ).bind(user.id).first();
    const total = countResult.total;

    const favorites = await env.DB.prepare(`
      SELECT 
        f.id as favorite_id,
        f.created_at as favorited_at,
        p.*,
        (SELECT url FROM images WHERE property_id = p.id AND is_cover = 1 LIMIT 1) as cover_image
      FROM favorites f
      JOIN properties p ON f.property_id = p.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all();

    return new Response(JSON.stringify({
      favorites: favorites.results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ─── POST: Add favorite ─────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorización requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { property_id } = body;

    if (!property_id) {
      return new Response(JSON.stringify({ error: 'property_id es requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check property exists
    const property = await env.DB.prepare('SELECT id FROM properties WHERE id = ?').bind(property_id).first();
    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already favorited
    const existing = await env.DB.prepare(
      'SELECT id FROM favorites WHERE user_id = ? AND property_id = ?'
    ).bind(user.id, property_id).first();
    if (existing) {
      return new Response(JSON.stringify({ error: 'La propiedad ya está en tus favoritos' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add favorite
    await env.DB.prepare(
      'INSERT INTO favorites (user_id, property_id) VALUES (?, ?)'
    ).bind(user.id, property_id).run();

    return new Response(JSON.stringify({ message: 'Propiedad agregada a favoritos' }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Handle UNIQUE constraint violation
    if (error.message && error.message.includes('UNIQUE')) {
      return new Response(JSON.stringify({ error: 'La propiedad ya está en tus favoritos' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Error interno del servidor', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ─── DELETE: Remove favorite ────────────────────────────────────
export async function onRequestDelete(context) {
  try {
    const { request, env } = context;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorización requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const propertyId = url.searchParams.get('property_id');

    if (!propertyId) {
      return new Response(JSON.stringify({ error: 'property_id es requerido como query parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await env.DB.prepare(
      'DELETE FROM favorites WHERE user_id = ? AND property_id = ?'
    ).bind(user.id, propertyId).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: 'La propiedad no estaba en tus favoritos' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Propiedad removida de favoritos' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
