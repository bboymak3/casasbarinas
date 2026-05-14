// functions/api/auth/google-config.js
// GET: Returns Google OAuth client ID for frontend initialization
// The client_id is stored as a Cloudflare environment variable (GOOGLE_CLIENT_ID)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const clientId = env.GOOGLE_CLIENT_ID || '';

    return new Response(JSON.stringify({
      client_id: clientId,
      configured: !!clientId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      client_id: '',
      configured: false,
      error: 'Error al cargar configuracion de Google.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
