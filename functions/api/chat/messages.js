// functions/api/chat/messages.js
// GET: Get messages for a conversation
// POST: Send a message in a conversation
// PUT: Mark messages as read

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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

// GET: Messages in a conversation
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

    const conversationId = parseInt(context.params.id);
    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'ID de conversación requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify user is part of this conversation
    const conv = await env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)'
    ).bind(conversationId, user.id, user.id).first();

    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get messages
    const url = new URL(request.url);
    const afterId = parseInt(url.searchParams.get('after_id') || '0');

    let query = 'SELECT m.id, m.sender_id, m.content, m.is_read, m.created_at, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ?';
    if (afterId > 0) query += ' AND m.id > ?';
    query += ' ORDER BY m.created_at ASC LIMIT 100';

    const params = afterId > 0 ? [conversationId, afterId] : [conversationId];
    const messages = await env.DB.prepare(query).bind(...params).all();

    // Mark messages as read (sent by the OTHER user)
    const otherUserId = conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id;
    const isBuyer = conv.buyer_id === user.id;
    const unreadField = isBuyer ? 'buyer_unread' : 'seller_unread';

    await env.DB.prepare(
      `UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id = ? AND is_read = 0`
    ).bind(conversationId, otherUserId).run();

    await env.DB.prepare(
      `UPDATE conversations SET ${unreadField} = 0 WHERE id = ?`
    ).bind(conversationId).run();

    return new Response(JSON.stringify({
      messages: messages.results.map(m => ({
        id: m.id,
        sender_id: m.sender_id,
        sender_name: m.sender_name,
        content: m.content,
        is_read: m.is_read,
        is_mine: m.sender_id === user.id,
        created_at: m.created_at,
      })),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// POST: Send a message
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

    const conversationId = parseInt(context.params.id);
    const body = await request.json();
    const content = (body.content || '').trim();

    if (!conversationId || !content) {
      return new Response(JSON.stringify({ error: 'Conversación y mensaje son requeridos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (content.length > 2000) {
      return new Response(JSON.stringify({ error: 'El mensaje no puede exceder 2000 caracteres' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify user is part of conversation
    const conv = await env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)'
    ).bind(conversationId, user.id, user.id).first();

    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert message
    const result = await env.DB.prepare(
      'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'
    ).bind(conversationId, user.id, content).run();

    // Update conversation last message and unread count
    const isBuyer = conv.buyer_id === user.id;
    const unreadField = isBuyer ? 'seller_unread' : 'buyer_unread';
    await env.DB.prepare(
      `UPDATE conversations SET last_message = ?, last_message_at = datetime('now'), ${unreadField} = ${unreadField} + 1 WHERE id = ?`
    ).bind(content, conversationId).run();

    return new Response(JSON.stringify({
      message: {
        id: result.meta.last_row_id,
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        is_mine: true,
        created_at: new Date().toISOString(),
      },
    }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error al enviar mensaje' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
