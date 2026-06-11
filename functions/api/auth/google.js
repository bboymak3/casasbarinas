// functions/api/auth/google.js
// POST: Login/Register with Google OAuth (Google Identity Services)
// Verifies Google ID token, finds or creates user, issues JWT

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

function base64url(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const data = `${headerB64}.${payloadB64}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  return `${data}.${signatureB64}`;
}

// Auto-migrate: Add google_id and auth_provider columns if they don't exist
async function ensureSchema(env) {
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN google_id TEXT`).run();
    console.log('[Google Auth] Added google_id column');
  } catch (e) {
    // Column already exists — ignore
    if (!e.message || !e.message.includes('duplicate column')) {
      console.warn('[Google Auth] google_id column issue:', e.message);
    }
  }

  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email'`).run();
    console.log('[Google Auth] Added auth_provider column');
  } catch (e) {
    if (!e.message || !e.message.includes('duplicate column')) {
      console.warn('[Google Auth] auth_provider column issue:', e.message);
    }
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Error de configuracion: Base de datos no disponible.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtSecret = env.JWT_SECRET || 'aunclick_default_secret_2024';

    // Auto-migrate schema
    await ensureSchema(env);

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: 'Datos invalidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { credential } = body;

    if (!credential) {
      return new Response(JSON.stringify({ error: 'Token de Google requerido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify Google ID token using Google's tokeninfo endpoint
    let googleUser;
    try {
      const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const verifyResponse = await fetch(verifyUrl);

      if (!verifyResponse.ok) {
        const errData = await verifyResponse.text();
        console.error('[Google Auth] Token verification failed:', errData);
        return new Response(JSON.stringify({ error: 'Token de Google invalido o expirado.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      googleUser = await verifyResponse.json();

      // Validate required fields
      if (!googleUser.email || !googleUser.sub) {
        return new Response(JSON.stringify({ error: 'Datos de Google incompletos.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify audience if GOOGLE_CLIENT_ID is configured
      if (env.GOOGLE_CLIENT_ID && googleUser.aud !== env.GOOGLE_CLIENT_ID) {
        console.error('[Google Auth] Audience mismatch:', googleUser.aud, '!=', env.GOOGLE_CLIENT_ID);
        return new Response(JSON.stringify({ error: 'Token de Google no corresponde a esta aplicacion.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (verifyErr) {
      console.error('[Google Auth] Verification error:', verifyErr);
      return new Response(JSON.stringify({ error: 'Error al verificar token de Google.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const googleId = googleUser.sub;
    const googleEmail = googleUser.email.toLowerCase();
    const googleName = googleUser.name || googleUser.given_name || 'Usuario Google';
    const googlePicture = googleUser.picture || null;
    const emailVerified = googleUser.email_verified === 'true' || googleUser.email_verified === true;

    // Check if user already exists with this google_id
    let existingUser = await env.DB.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first();

    // If not found by google_id, check by email (user might have registered with email before)
    if (!existingUser) {
      existingUser = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(googleEmail).first();
    }

    let userId;
    let userName;
    let userRole;
    let userPhone;
    let userAvatar;

    if (existingUser) {
      // Existing user — link Google account if not already linked
      if (!existingUser.google_id) {
        await env.DB.prepare('UPDATE users SET google_id = ?, auth_provider = ?, avatar = COALESCE(NULLIF(avatar, \'\'), ?) WHERE id = ?')
          .bind(googleId, 'google', googlePicture, existingUser.id)
          .run();
      }

      // Check if user is active
      if (!existingUser.is_active) {
        return new Response(JSON.stringify({ error: 'Tu cuenta ha sido desactivada. Contacta al administrador.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = existingUser.id;
      userName = existingUser.name;
      userRole = existingUser.role;
      userPhone = existingUser.phone;
      userAvatar = existingUser.avatar || googlePicture;
    } else {
      // New user — create account with Google data
      // Use a placeholder password_hash since NOT NULL constraint exists
      const placeholderHash = 'GOOGLE_OAUTH_' + googleId;

      try {
        const result = await env.DB.prepare(
          'INSERT INTO users (name, email, phone, password_hash, role, avatar, google_id, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(googleName, googleEmail, null, placeholderHash, 'user', googlePicture, googleId, 'google').run();

        userId = result.meta.last_row_id;
        userName = googleName;
        userRole = 'user';
        userPhone = null;
        userAvatar = googlePicture;
      } catch (insertErr) {
        console.error('[Google Auth] Insert error:', insertErr);

        // If unique constraint failed on email, user was created between our checks
        if (insertErr.message && insertErr.message.includes('UNIQUE constraint failed')) {
          existingUser = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(googleEmail).first();
          if (existingUser) {
            userId = existingUser.id;
            userName = existingUser.name;
            userRole = existingUser.role;
            userPhone = existingUser.phone;
            userAvatar = existingUser.avatar || googlePicture;

            // Link Google account
            if (!existingUser.google_id) {
              await env.DB.prepare('UPDATE users SET google_id = ?, auth_provider = ? WHERE id = ?')
                .bind(googleId, 'google', existingUser.id)
                .run();
            }
          } else {
            throw insertErr;
          }
        } else {
          throw insertErr;
        }
      }
    }

    // Create JWT token
    const token = await createJWT(
      {
        id: userId,
        name: userName,
        email: googleEmail,
        role: userRole,
        provider: 'google',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 7,
      },
      jwtSecret
    );

    return new Response(JSON.stringify({
      message: 'Login con Google exitoso',
      token,
      user: {
        id: userId,
        name: userName,
        email: googleEmail,
        role: userRole,
        phone: userPhone,
        avatar: userAvatar,
        provider: 'google',
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Google Auth] Error:', error);
    return new Response(JSON.stringify({
      error: 'Error interno del servidor',
      debug: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
