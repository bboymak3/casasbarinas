// functions/api/properties/index.js
// GET: List properties (with filters)
// POST: Create property (requires auth)

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
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
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

// ─── GET: List properties ───────────────────────────────────────
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const params = url.searchParams;

    const propertyType = params.get('property_type');
    const operationType = params.get('operation_type');
    const city = params.get('city');
    const minPrice = params.get('min_price');
    const maxPrice = params.get('max_price');
    const bedrooms = params.get('bedrooms');
    const bathrooms = params.get('bathrooms');
    const status = params.get('status') || 'approved';
    const page = parseInt(params.get('page')) || 1;
    const limit = parseInt(params.get('limit')) || 12;
    const offset = (page - 1) * limit;
    const search = params.get('search');

    // Build WHERE clause dynamically
    const conditions = [];
    const bindings = [];

    conditions.push('p.status = ?');
    bindings.push(status);

    if (propertyType) {
      conditions.push('p.property_type = ?');
      bindings.push(propertyType);
    }
    if (operationType) {
      conditions.push('p.operation_type = ?');
      bindings.push(operationType);
    }
    if (city) {
      conditions.push('p.city LIKE ?');
      bindings.push(`%${city}%`);
    }
    if (minPrice) {
      conditions.push('p.price >= ?');
      bindings.push(parseFloat(minPrice));
    }
    if (maxPrice) {
      conditions.push('p.price <= ?');
      bindings.push(parseFloat(maxPrice));
    }
    if (bedrooms) {
      conditions.push('p.bedrooms >= ?');
      bindings.push(parseInt(bedrooms));
    }
    if (bathrooms) {
      conditions.push('p.bathrooms >= ?');
      bindings.push(parseInt(bathrooms));
    }
    if (search) {
      conditions.push('(p.title LIKE ? OR p.description LIKE ? OR p.address LIKE ?)');
      bindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    // Count total matching properties
    const countQuery = `SELECT COUNT(*) as total FROM properties p WHERE ${whereClause}`;
    const countResult = await env.DB.prepare(countQuery).bind(...bindings).first();
    const total = countResult.total;

    // Fetch properties with cover image and owner info
    const query = `
      SELECT 
        p.*,
        u.name as owner_name,
        u.phone as owner_phone,
        u.avatar as owner_avatar,
        (SELECT url FROM images WHERE property_id = p.id AND is_cover = 1 LIMIT 1) as cover_image,
        (SELECT COUNT(*) FROM images WHERE property_id = p.id) as image_count
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const properties = await env.DB.prepare(query).bind(...bindings, limit, offset).all();

    return new Response(JSON.stringify({
      properties: properties.results,
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

// ─── POST: Create property ──────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // Auth required
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorización requerido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();

    // Required fields
    const { title, property_type, operation_type, price } = body;
    if (!title || !property_type || !operation_type || !price) {
      return new Response(JSON.stringify({ error: 'Título, tipo de propiedad, tipo de operación y precio son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate property_type
    const validPropertyTypes = ['casa', 'apartamento', 'terreno', 'local_comercial', 'oficina', 'hotel', 'finca', 'galpon', 'estacionamiento', 'otro'];
    if (!validPropertyTypes.includes(property_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de propiedad inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate operation_type
    const validOperationTypes = ['venta', 'alquiler', 'venta_alquiler'];
    if (!validOperationTypes.includes(operation_type)) {
      return new Response(JSON.stringify({ error: 'Tipo de operación inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await env.DB.prepare(`
      INSERT INTO properties (
        user_id, title, description, property_type, operation_type, price,
        currency, address, city, state, country, lat, lng, bedrooms, bathrooms,
        parking_spaces, area, area_unit, year_built, floors,
        has_pool, has_garden, has_ac, has_kitchen, has_furniture, has_security, has_elevator,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      payload.id,
      title,
      body.description || null,
      property_type,
      operation_type,
      parseFloat(price),
      body.currency || 'USD',
      body.address || null,
      body.city || 'Barinas',
      body.state || 'Barinas',
      body.country || 'Venezuela',
      body.lat || null,
      body.lng || null,
      body.bedrooms || null,
      body.bathrooms || null,
      body.parking_spaces || null,
      body.area || null,
      body.area_unit || 'm2',
      body.year_built || null,
      body.floors || null,
      body.has_pool ? 1 : 0,
      body.has_garden ? 1 : 0,
      body.has_ac ? 1 : 0,
      body.has_kitchen ? 1 : 0,
      body.has_furniture ? 1 : 0,
      body.has_security ? 1 : 0,
      body.has_elevator ? 1 : 0,
      'pending'
    ).run();

    const propertyId = result.meta.last_row_id;

    return new Response(JSON.stringify({
      message: 'Propiedad creada exitosamente. Está pendiente de aprobación.',
      property_id: propertyId,
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
