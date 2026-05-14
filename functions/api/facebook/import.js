// functions/api/facebook/import.js
// POST: Trigger manual import from Facebook (admin only)
// GET: Run import (can be called by cron service with a secret header)

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

// ─── Property text parser ───────────────────────────────────────
function parsePropertyFromText(text) {
  if (!text) return {};

  const lower = text.toLowerCase();
  const result = {
    property_type: 'otro',
    operation_type: 'venta',
    bedrooms: null,
    bathrooms: null,
    area: null,
    area_unit: 'm2',
    price: null,
    currency: 'USD',
  };

  // Detect property type
  if (/\bcasa\b/i.test(text)) result.property_type = 'casa';
  else if (/\bapartamento\b|\bapto\b|\bapt\b|\bapartamento\b/i.test(text)) result.property_type = 'apartamento';
  else if (/\bterreno\b|\blote\b/i.test(text)) result.property_type = 'terreno';
  else if (/\blocal\b|\bcomercial\b|\bff\b|\btienda\b/i.test(text)) result.property_type = 'local_comercial';
  else if (/\boficina\b/i.test(text)) result.property_type = 'oficina';
  else if (/\bfinca\b|\bquinta\b|\bhacienda\b/i.test(text)) result.property_type = 'finca';
  else if (/\bhotel\b|\bposada\b/i.test(text)) result.property_type = 'hotel';
  else if (/\bgalpon\b|\bgalpón\b|\bdepósito\b/i.test(text)) result.property_type = 'galpon';
  else if (/\bestacionamiento\b/i.test(text)) result.property_type = 'estacionamiento';

  // Detect operation type
  if (/\balquil(?:e|ar|o|ill)\b|\brenta\b|\balquiler\b/i.test(text)) result.operation_type = 'alquiler';
  else if (/\bventa\b|\bven(?:d|do|e)\b|\bvendo\b/i.test(text)) result.operation_type = 'venta';
  else if (/(?:venta.*alquiler|alquiler.*venta)/i.test(text)) result.operation_type = 'venta_alquiler';

  // Detect price - multiple patterns
  // Pattern: $ 25.000 / $25,000 / $25.000,00 / USD 25,000 / Bs 50.000
  const pricePatterns = [
    /(?:USD|usd|\$)\s*([\d.,]+)/,
    /Bs\.?\s*([\d.,]+)/,
    /\$\s*([\d.,]+)/,
    /precio[:\s]*(?:USD|usd|\$|Bs\.?)\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:USD|usd|dolares|dólares|dols)/i,
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      const rawPrice = match[1].replace(/\./g, '').replace(',', '.');
      const numPrice = parseFloat(rawPrice);
      if (!isNaN(numPrice) && numPrice > 0) {
        result.price = numPrice;
        if (pattern.source.includes('Bs') || text.match(/Bs\.?\s*[\d.,]+/)) {
          result.currency = 'Bs';
        } else {
          result.currency = 'USD';
        }
        break;
      }
    }
  }

  // Detect bedrooms
  const bedMatch = text.match(/(\d+)\s*(?:hab|habitacion(?:es)?|dormitorios?|cuartos?|piezas?|recamaras?)/i);
  if (bedMatch) result.bedrooms = parseInt(bedMatch[1]);

  // Detect bathrooms
  const bathMatch = text.match(/(\d+)\s*(?:baño|banos?|bathroom)/i);
  if (bathMatch) result.bathrooms = parseInt(bathMatch[1]);

  // Detect area
  const areaMatch = text.match(/([\d.,]+)\s*(?:m2|m²|metros|mtr|mt2)/i);
  if (areaMatch) {
    result.area = parseFloat(areaMatch[1].replace(/\./g, '').replace(',', '.'));
    result.area_unit = 'm2';
  }
  const haMatch = text.match(/([\d.,]+)\s*(?:ha|hectareas?|hectáreas?)/i);
  if (haMatch) {
    result.area = parseFloat(haMatch[1].replace(/\./g, '').replace(',', '.'));
    result.area_unit = 'ha';
  }

  return result;
}

// ─── Extract image URL from Facebook post ────────────────────────
function extractImages(post) {
  const images = [];

  // Single photo post
  if (post.full_picture) {
    images.push(post.full_picture);
  }

  // Multiple photos / album post
  if (post.attachments && post.attachments.data) {
    for (const att of post.attachments.data) {
      if (att.type === 'photo' && att.media && att.media.image) {
        const url = att.media.image.src;
        if (!images.includes(url)) images.push(url);
      }
      if (att.subattachments && att.subattachments.data) {
        for (const sub of att.subattachments.data) {
          if (sub.type === 'photo' && sub.media && sub.media.image) {
            const url = sub.media.image.src;
            if (!images.includes(url)) images.push(url);
          }
        }
      }
    }
  }

  return images;
}

// ─── Ensure DB tables ───────────────────────────────────────────
async function ensureTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS fb_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS fb_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fb_post_id TEXT NOT NULL UNIQUE,
      property_id INTEGER,
      post_message TEXT,
      post_url TEXT,
      raw_data TEXT,
      imported_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties(id)
    )
  `).run();
}

// ─── Main import logic ──────────────────────────────────────────
async function runImport(env) {
  await ensureTables(env.DB);

  // Get config
  const configRows = await env.DB.prepare('SELECT key, value FROM fb_config').all();
  const config = {};
  for (const row of configRows.results) config[row.key] = row.value;

  const pageId = config.page_id;
  const pageAccessToken = config.page_access_token;
  const autoApprove = config.auto_approve === '1';
  const defaultCity = config.default_city || 'Barinas';

  if (!pageId || !pageAccessToken) {
    return { success: false, error: 'Facebook no está configurado. Ve a Configuración > Facebook para conectar tu página.' };
  }

  // Fetch posts from Facebook Graph API
  const fbUrl = `https://graph.facebook.com/v18.0/${pageId}/feed?fields=id,message,full_picture,created_time,permalink_url,attachments{type,media,subattachments}&limit=25&access_token=${pageAccessToken}`;

  let fbResponse;
  try {
    fbResponse = await fetch(fbUrl);
    const fbData = await fbResponse.json();

    if (fbData.error) {
      return { success: false, error: 'Error de Facebook API: ' + fbData.error.message + ' (Código: ' + fbData.error.code + ')' };
    }

    const posts = fbData.data || [];
    if (posts.length === 0) {
      return { success: true, message: 'No se encontraron posts en la página.', imported: 0, skipped: 0 };
    }

    // Get admin user for property ownership
    let adminUser = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
    const adminUserId = adminUser ? adminUser.id : 1;

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const results = [];

    for (const post of posts) {
      const fbPostId = post.id; // Format: PAGEID_POSTID

      // Skip if already imported
      const existing = await env.DB.prepare('SELECT id, property_id FROM fb_imports WHERE fb_post_id = ?').bind(fbPostId).first();
      if (existing) {
        skipped++;
        continue;
      }

      // Extract images
      const images = extractImages(post);
      if (images.length === 0) {
        // Skip posts without images (not property posts)
        await env.DB.prepare('INSERT INTO fb_imports (fb_post_id, post_message, post_url, raw_data) VALUES (?, ?, ?, ?)').bind(
          fbPostId, post.message || '', post.permalink_url || '', JSON.stringify(post)
        ).run();
        skipped++;
        continue;
      }

      // Parse text
      const parsed = parsePropertyFromText(post.message);
      const message = post.message || '';

      // Build title from first line or parsed type
      let title = '';
      const lines = message.split('\n').filter(l => l.trim());
      if (lines.length > 0 && lines[0].length <= 120) {
        title = lines[0].trim();
      } else {
        const typeLabels = {
          'casa': 'Casa', 'apartamento': 'Apartamento', 'terreno': 'Terreno',
          'local_comercial': 'Local Comercial', 'oficina': 'Oficina', 'finca': 'Finca',
          'hotel': 'Hotel', 'galpon': 'Galpón', 'estacionamiento': 'Estacionamiento', 'otro': 'Propiedad',
        };
        title = `${typeLabels[parsed.property_type] || 'Propiedad'} en ${defaultCity}`;
      }

      // Clean title - remove emojis and excessive symbols
      title = title.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
      if (!title) title = `Propiedad en ${defaultCity}`;

      // If no price detected, try to find ANY number that looks like a price
      if (!parsed.price) {
        const anyPrice = message.match(/([\d.,]+)\s*(?:dolares?|dólares?|dols|usd|us\$)/i) ||
                          message.match(/\$\s*([\d.,]+)/) ||
                          message.match(/([\d]{3,}[.,][\d]{2,})/);
        if (anyPrice) {
          const rawP = anyPrice[1] || anyPrice[anyPrice.length - 1];
          parsed.price = parseFloat(rawP.replace(/\./g, '').replace(',', '.'));
          parsed.currency = 'USD';
        }
      }

      // Default price if none found
      if (!parsed.price) parsed.price = 0;
      if (!parsed.area) parsed.area = 0;

      // Get the post date
      const createdAt = post.created_time || new Date().toISOString();

      // Insert property
      try {
        const insertResult = await env.DB.prepare(`
          INSERT INTO properties (
            user_id, title, description, property_type, operation_type,
            price, currency, address, city, state,
            bedrooms, bathrooms, area, area_unit, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          adminUserId,
          title,
          message.substring(0, 3000),
          parsed.property_type,
          parsed.operation_type,
          parsed.price,
          parsed.currency,
          defaultCity,
          defaultCity,
          'Barinas',
          parsed.bedrooms || null,
          parsed.bathrooms || null,
          parsed.area || null,
          parsed.area_unit,
          autoApprove ? 'approved' : 'pending',
          createdAt,
          new Date().toISOString()
        ).run();

        const propertyId = insertResult.meta.last_row_id;

        // Insert cover image
        if (images.length > 0) {
          await env.DB.prepare('INSERT INTO images (property_id, url, is_cover, order_index) VALUES (?, ?, 1, 0)').bind(
            propertyId, images[0], 1, 0
          ).run();

          // Insert additional images
          for (let i = 1; i < images.length; i++) {
            await env.DB.prepare('INSERT INTO images (property_id, url, is_cover, order_index) VALUES (?, ?, 0, ?)').bind(
              propertyId, images[i], 0, i
            ).run();
          }
        }

        // Track the import
        await env.DB.prepare('INSERT INTO fb_imports (fb_post_id, property_id, post_message, post_url, raw_data) VALUES (?, ?, ?, ?, ?)').bind(
          fbPostId, propertyId, post.message || '', post.permalink_url || '', JSON.stringify(post)
        ).run();

        imported++;
        results.push({ fb_post_id: fbPostId, property_id: propertyId, title, images: images.length });
      } catch (insertError) {
        errors++;
        console.error('Error importing post:', fbPostId, insertError.message);
      }
    }

    return {
      success: true,
      message: `Importación completada: ${imported} importadas, ${skipped} omitidas, ${errors} errores`,
      imported,
      skipped,
      errors,
      results,
    };
  } catch (error) {
    return { success: false, error: 'Error de conexión con Facebook: ' + error.message };
  }
}

// POST: Manual import (admin auth required)
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
    if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Solo administradores' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const result = await runImport(env);
    const status = result.success ? 200 : 400;
    return new Response(JSON.stringify(result), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// GET: Cron import (called by external cron service with secret header)
export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    // For cron: check for X-Cron-Secret header
    const cronSecret = request.headers.get('X-Cron-Secret');
    if (cronSecret === env.CRON_SECRET) {
      const result = await runImport(env);
      return new Response(JSON.stringify(result), { status: result.success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // For normal GET: require admin auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token requerido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Solo administradores' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const result = await runImport(env);
    const status = result.success ? 200 : 400;
    return new Response(JSON.stringify(result), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error del servidor', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
