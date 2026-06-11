// functions/api/properties/[id].js
// GET: Get property by ID
// PUT: Update property (owner or admin only)
// DELETE: Delete property (owner or admin only)

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

async function getUserFromRequest(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  return verifyJWT(token, env.JWT_SECRET);
}

// ─── GET: Get property by ID ────────────────────────────────────
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const { id } = params;

    const property = await env.DB.prepare(`
      SELECT p.*, u.name as owner_name, u.phone as owner_phone, u.whatsapp as owner_whatsapp, u.email as owner_email, u.avatar as owner_avatar, u.bio as owner_bio
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).bind(id).first();

    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all images for this property
    const images = await env.DB.prepare(
      'SELECT * FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, order_index ASC'
    ).bind(id).all();

    // Increment views
    await env.DB.prepare('UPDATE properties SET views = views + 1 WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({
      ...property,
      images: images.results,
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

// ─── PUT: Update property ───────────────────────────────────────
export async function onRequestPut(context) {
  try {
    const { request, env, params } = context;
    const { id } = params;

    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token de autorización requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check property exists
    const property = await env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(id).first();
    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check authorization: owner or admin
    if (user.role !== 'admin' && user.id !== property.user_id) {
      return new Response(JSON.stringify({ error: 'No tienes permiso para editar esta propiedad' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();

    // Build dynamic UPDATE query
    const allowedFields = [
      'title', 'description', 'property_type', 'operation_type', 'price',
      'currency', 'address', 'city', 'state', 'country', 'lat', 'lng',
      'bedrooms', 'bathrooms', 'parking_spaces', 'area', 'area_unit',
      'year_built', 'floors', 'has_pool', 'has_garden', 'has_ac',
      'has_kitchen', 'has_furniture', 'has_security', 'has_elevator',
      'featured',
    ];

    const setClauses = [];
    const bindings = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        let value = body[field];
        // Convert boolean fields to integers
        if (field.startsWith('has_') || field === 'featured') {
          value = value ? 1 : 0;
        }
        bindings.push(value);
      }
    }

    if (setClauses.length === 0) {
      return new Response(JSON.stringify({ error: 'No se proporcionaron campos para actualizar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    setClauses.push("updated_at = datetime('now')");
    bindings.push(id);

    await env.DB.prepare(
      `UPDATE properties SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    return new Response(JSON.stringify({ message: 'Propiedad actualizada exitosamente' }), {
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

// ─── DELETE: Delete property ────────────────────────────────────
export async function onRequestDelete(context) {
  try {
    const { request, env, params } = context;
    const { id } = params;

    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token de autorización requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const property = await env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(id).first();
    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (user.role !== 'admin' && user.id !== property.user_id) {
      return new Response(JSON.stringify({ error: 'No tienes permiso para eliminar esta propiedad' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete images from R2 bucket (best effort)
    try {
      const images = await env.DB.prepare('SELECT url FROM property_images WHERE property_id = ?').bind(id).all();
      for (const img of images.results) {
        try {
          // Extract key from URL
          const urlObj = new URL(img.url);
          const key = urlObj.pathname.substring(1); // remove leading slash
          await env.R2.delete(key);
        } catch (e) {
          // Ignore R2 deletion errors
        }
      }
    } catch (e) {
      // Ignore errors
    }

    // Delete related records that lack ON DELETE CASCADE
    // (contacts, favorites, conversations reference properties without cascade)
    try { await env.DB.prepare('DELETE FROM property_contacts WHERE property_id = ?').bind(id).run(); } catch (e) {}
    try { await env.DB.prepare('DELETE FROM property_favorites WHERE property_id = ?').bind(id).run(); } catch (e) {}
    try { await env.DB.prepare('DELETE FROM conversations WHERE property_id = ?').bind(id).run(); } catch (e) {}

    // Now safe to delete property (property_images cascade automatically due to FK)
    await env.DB.prepare('DELETE FROM properties WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ message: 'Propiedad eliminada exitosamente' }), {
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
