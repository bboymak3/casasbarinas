// functions/api/contacts/index.js
// POST: Send contact message for a property

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const { property_id, sender_name, sender_email, sender_phone, message } = body;

    // Validation
    if (!property_id || !sender_name || !sender_email || !message) {
      return new Response(JSON.stringify({ error: 'property_id, nombre, email y mensaje son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sender_email)) {
      return new Response(JSON.stringify({ error: 'Formato de email inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check property exists
    const property = await env.DB.prepare('SELECT id, title FROM properties WHERE id = ? AND status = ?').bind(property_id, 'approved').first();
    if (!property) {
      return new Response(JSON.stringify({ error: 'Propiedad no encontrada o no disponible' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert contact message
    const result = await env.DB.prepare(
      'INSERT INTO contacts (property_id, sender_name, sender_email, sender_phone, message) VALUES (?, ?, ?, ?, ?)'
    ).bind(property_id, sender_name, sender_email, sender_phone || null, message).run();

    const contactId = result.meta.last_row_id;

    return new Response(JSON.stringify({
      message: 'Mensaje enviado exitosamente',
      contact_id: contactId,
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
