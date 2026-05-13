// functions/api/users/[id].js
// GET: Get user by ID
// PUT: Update user (admin only)
// DELETE: Delete user (admin only)

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

async function getAdminUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const user = await verifyJWT(token, env.JWT_SECRET);
  if (!user || user.role !== 'admin') return null;
  return user;
}

// ─── GET: Get user by ID ────────────────────────────────────────
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const { id } = params;

    const user = await env.DB.prepare(
      'SELECT id, name, email, phone, role, avatar, is_active, created_at, updated_at FROM users WHERE id = ?'
    ).bind(id).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get property count for this user
    const propCount = await env.DB.prepare('SELECT COUNT(*) as total FROM properties WHERE user_id = ?').bind(id).first();

    return new Response(JSON.stringify({
      ...user,
      property_count: propCount.total,
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

// ─── PUT: Update user ───────────────────────────────────────────
export async function onRequestPut(context) {
  try {
    const { request, env, params } = context;
    const { id } = params;

    const adminUser = await getAdminUser(request, env);
    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Acceso denegado. Solo administradores pueden editar usuarios.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();

    const allowedFields = ['name', 'email', 'phone', 'role', 'is_active', 'avatar'];
    const setClauses = [];
    const bindings = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        let value = body[field];
        if (field === 'is_active') {
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

    // Validate role if changing
    if (body.role !== undefined) {
      const validRoles = ['admin', 'user', 'agent'];
      if (!validRoles.includes(body.role)) {
        return new Response(JSON.stringify({ error: 'Rol inválido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check email uniqueness if changing
    if (body.email !== undefined && body.email !== targetUser.email) {
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(body.email, id).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'Ya existe un usuario con este email' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    setClauses.push("updated_at = datetime('now')");
    bindings.push(id);

    await env.DB.prepare(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    // Return updated user
    const updatedUser = await env.DB.prepare(
      'SELECT id, name, email, phone, role, avatar, is_active, created_at, updated_at FROM users WHERE id = ?'
    ).bind(id).first();

    return new Response(JSON.stringify({
      message: 'Usuario actualizado exitosamente',
      user: updatedUser,
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

// ─── DELETE: Delete user ────────────────────────────────────────
export async function onRequestDelete(context) {
  try {
    const { request, env, params } = context;
    const { id } = params;

    const adminUser = await getAdminUser(request, env);
    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Acceso denegado. Solo administradores pueden eliminar usuarios.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-deletion
    if (adminUser.id === parseInt(id)) {
      return new Response(JSON.stringify({ error: 'No puedes eliminar tu propia cuenta de administrador' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ message: 'Usuario eliminado exitosamente' }), {
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
