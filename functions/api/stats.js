// functions/api/stats.js
// GET: Dashboard stats (admin only)

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

export async function onRequestGet(context) {
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
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin only
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acceso denegado. Solo administradores.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Run all stats queries in parallel
    const [totalUsers, totalProperties, pendingProperties, approvedProperties, totalContacts, recentContacts, propertyTypeStats, recentProperties] = await Promise.all([
      // Total users
      env.DB.prepare('SELECT COUNT(*) as total FROM users').first(),

      // Total properties
      env.DB.prepare('SELECT COUNT(*) as total FROM properties').first(),

      // Pending properties
      env.DB.prepare("SELECT COUNT(*) as total FROM properties WHERE status = 'pending'").first(),

      // Approved properties
      env.DB.prepare("SELECT COUNT(*) as total FROM properties WHERE status = 'approved'").first(),

      // Total contact messages
      env.DB.prepare('SELECT COUNT(*) as total FROM contacts').first(),

      // Recent unread contacts
      env.DB.prepare('SELECT COUNT(*) as total FROM contacts WHERE is_read = 0').first(),

      // Property type breakdown
      env.DB.prepare(`
        SELECT property_type, COUNT(*) as count 
        FROM properties 
        WHERE status = 'approved' 
        GROUP BY property_type 
        ORDER BY count DESC
      `).all(),

      // Recent properties (last 5)
      env.DB.prepare(`
        SELECT p.id, p.title, p.status, p.created_at, u.name as owner_name
        FROM properties p
        LEFT JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 5
      `).all(),
    ]);

    return new Response(JSON.stringify({
      stats: {
        total_users: totalUsers.total,
        total_properties: totalProperties.total,
        pending_properties: pendingProperties.total,
        approved_properties: approvedProperties.total,
        total_contacts: totalContacts.total,
        unread_contacts: recentContacts.total,
      },
      property_type_breakdown: propertyTypeStats.results,
      recent_properties: recentProperties.results,
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
