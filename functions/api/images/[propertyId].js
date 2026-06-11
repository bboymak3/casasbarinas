// functions/api/images/[propertyId].js
// POST: Add image record to DB
// DELETE: Remove image record and file from R2

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

// ─── POST: Add image record to DB ───────────────────────────────
export async function onRequestPost(context) {
  try {
    const { request, env, params } = context;
    const { propertyId } = params;

    // Auth required
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

    // Check property exists and user owns it
    const property = await env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(propertyId).first();
    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (user.role !== 'admin' && user.id !== property.user_id) {
      return new Response(JSON.stringify({ error: 'No tienes permiso para agregar imágenes a esta propiedad' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { url, is_cover, order_index, thumbnail_url } = body;

    if (!url) {
      return new Response(JSON.stringify({ error: 'La URL de la imagen es requerida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If setting as cover, unset previous cover
    if (is_cover) {
      await env.DB.prepare('UPDATE property_images SET is_cover = 0 WHERE property_id = ?').bind(propertyId).run();
    }

    // Get current max order
    const maxOrder = await env.DB.prepare('SELECT COALESCE(MAX(order_index), 0) as max_order FROM property_images WHERE property_id = ?').bind(propertyId).first();

    const result = await env.DB.prepare(
      'INSERT INTO property_images (property_id, url, thumbnail_url, is_cover, order_index) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      propertyId,
      url,
      thumbnail_url || null,
      is_cover ? 1 : 0,
      order_index !== undefined ? order_index : maxOrder.max_order + 1
    ).run();

    const imageId = result.meta.last_row_id;

    // If this is the first image, set it as cover
    const imageCount = await env.DB.prepare('SELECT COUNT(*) as total FROM property_images WHERE property_id = ?').bind(propertyId).first();
    if (imageCount.total === 1) {
      await env.DB.prepare('UPDATE property_images SET is_cover = 1 WHERE id = ?').bind(imageId).run();
    }

    return new Response(JSON.stringify({
      message: 'Imagen registrada exitosamente',
      image_id: imageId,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ─── DELETE: Remove image record ────────────────────────────────
export async function onRequestDelete(context) {
  try {
    const { request, env, params } = context;
    const { propertyId } = params;

    // Auth required
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

    // Get image_id from query params
    const url = new URL(request.url);
    const imageId = url.searchParams.get('image_id');

    if (!imageId) {
      return new Response(JSON.stringify({ error: 'image_id es requerido como query parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check image exists
    const image = await env.DB.prepare('SELECT * FROM property_images WHERE id = ? AND property_id = ?').bind(imageId, propertyId).first();
    if (!image) {
      return new Response(JSON.stringify({ error: 'Imagen no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check property ownership
    const property = await env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(propertyId).first();
    if (user.role !== 'admin' && user.id !== property.user_id) {
      return new Response(JSON.stringify({ error: 'No tienes permiso para eliminar imágenes de esta propiedad' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wasCover = image.is_cover;

    // Delete file from R2
    try {
      const urlObj = new URL(image.url);
      const key = urlObj.pathname.substring(1);
      await env.R2.delete(key);
    } catch (e) {
      // Ignore R2 deletion errors
    }

    // Delete from DB
    await env.DB.prepare('DELETE FROM property_images WHERE id = ?').bind(imageId).run();

    // If deleted image was cover, set another image as cover
    if (wasCover) {
      const nextImage = await env.DB.prepare(
        'SELECT id FROM property_images WHERE property_id = ? ORDER BY order_index ASC LIMIT 1'
      ).bind(propertyId).first();
      if (nextImage) {
        await env.DB.prepare('UPDATE property_images SET is_cover = 1 WHERE id = ?').bind(nextImage.id).run();
      }
    }

    return new Response(JSON.stringify({ message: 'Imagen eliminada exitosamente' }), {
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
