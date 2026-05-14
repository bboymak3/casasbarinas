// functions/api/chat/conversations.js
// GET: List conversations for current user
// POST: Create or find conversation between buyer and seller about a property

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      buyer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      last_message TEXT,
      last_message_at TEXT,
      buyer_unread INTEGER DEFAULT 0,
      seller_unread INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (buyer_id) REFERENCES users(id),
      FOREIGN KEY (seller_id) REFERENCES users(id),
      UNIQUE(buyer_id, seller_id, property_id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_conv_buyer ON conversations(buyer_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_conv_seller ON conversations(seller_id)').run();
}

// GET: List conversations
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

    await ensureTables(env.DB);

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === '1';

    // Get conversations where user is buyer or seller (LEFT JOIN in case property was deleted)
    const conversations = await env.DB.prepare(`
      SELECT c.id, c.property_id, c.buyer_id, c.seller_id, c.last_message, c.last_message_at,
             c.buyer_unread, c.seller_unread, c.created_at,
             p.title as property_title,
             p.cover_image as property_image,
             p.status as property_status,
             p.price, p.currency,
             u_buyer.name as buyer_name,
             u_seller.name as seller_name
      FROM conversations c
      LEFT JOIN properties p ON c.property_id = p.id
      LEFT JOIN users u_buyer ON c.buyer_id = u_buyer.id
      LEFT JOIN users u_seller ON c.seller_id = u_seller.id
      WHERE (c.buyer_id = ? OR c.seller_id = ?)
      ${unreadOnly ? 'AND ((c.buyer_id = ? AND c.buyer_unread > 0) OR (c.seller_id = ? AND c.seller_unread > 0))' : ''}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    `).bind(user.id, user.id, user.id, user.id).all();

    // Get unread count
    const unreadResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN buyer_id = ? THEN buyer_unread ELSE seller_unread END), 0) as total
      FROM conversations
      WHERE (buyer_id = ? OR seller_id = ?)
    `).bind(user.id, user.id, user.id).first();

    const items = conversations.results.map(c => ({
      id: c.id,
      property: {
        id: c.property_id,
        title: c.property_title,
        image: c.property_image,
        status: c.property_status,
        price: c.price,
        currency: c.currency,
      },
      other_user: c.buyer_id === user.id
        ? { id: c.seller_id, name: c.seller_name, role: 'seller' }
        : { id: c.buyer_id, name: c.buyer_name, role: 'buyer' },
      last_message: c.last_message,
      last_message_at: c.last_message_at,
      unread: c.buyer_id === user.id ? c.buyer_unread : c.seller_unread,
      created_at: c.created_at,
    }));

    return new Response(JSON.stringify({
      conversations: items,
      total_unread: unreadResult.total || 0,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// POST: Create conversation or return existing one
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token requerido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { property_id, initial_message } = body;

    if (!property_id) {
      return new Response(JSON.stringify({ error: 'ID de propiedad requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await ensureTables(env.DB);

    // Get property and seller
    const property = await env.DB.prepare('SELECT id, user_id, title, status FROM properties WHERE id = ?').bind(property_id).first();
    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Don't allow chatting with yourself
    if (property.user_id === user.id) {
      return new Response(JSON.stringify({ error: 'No puedes enviar un mensaje sobre tu propia propiedad' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const buyerId = user.id;
    const sellerId = property.user_id;

    // Check if conversation already exists
    let conversation = await env.DB.prepare(
      'SELECT * FROM conversations WHERE buyer_id = ? AND seller_id = ? AND property_id = ?'
    ).bind(buyerId, sellerId, property_id).first();

    if (!conversation) {
      // Create new conversation
      const result = await env.DB.prepare(
        'INSERT INTO conversations (property_id, buyer_id, seller_id, last_message_at) VALUES (?, ?, ?, datetime(\'now\'))'
      ).bind(property_id, buyerId, sellerId).run();
      conversation = {
        id: result.meta.last_row_id,
        property_id,
        buyer_id: buyerId,
        seller_id: sellerId,
        buyer_unread: 0,
        seller_unread: 0,
      };
    }

    // Send initial message if provided
    if (initial_message && initial_message.trim()) {
      const message = initial_message.trim().substring(0, 2000);
      await env.DB.prepare(
        'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'
      ).bind(conversation.id, user.id, message).run();

      // Update conversation - the buyer is the one sending, so increment seller_unread
      await env.DB.prepare(
        'UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), seller_unread = seller_unread + 1 WHERE id = ?'
      ).bind(message, conversation.id).run();

      conversation.last_message = message;
    }

    // Get other user info
    const otherUser = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(
      conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id
    ).first();

    return new Response(JSON.stringify({
      conversation: {
        id: conversation.id,
        property_id: property.id,
        property_title: property.title,
        property_status: property.status,
        other_user: otherUser ? { id: otherUser.id, name: otherUser.name } : null,
        last_message: conversation.last_message,
        created_at: conversation.created_at,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
