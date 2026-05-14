// functions/api/serve/index.js
// GET: Serve images directly from R2 bucket through our API
// Usage: /api/serve?key=properties/123/1234_photo.jpg

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;

    if (!env.R2) {
      return new Response('R2 storage not configured', {
        status: 503,
        headers: corsHeaders,
      });
    }

    // Get the key from query parameter
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing file key parameter. Usage: /api/serve?key=path/to/file.jpg' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate key format (prevent path traversal)
    if (key.includes('..') || key.startsWith('/')) {
      return new Response('Invalid key format', {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Fetch the object from R2
    const object = await env.R2.get(key);

    if (!object) {
      return new Response('Image not found', {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Determine content type from metadata or key extension
    const contentType = object.httpMetadata?.contentType || getContentTypeFromKey(key);

    // Cache headers (1 week for images)
    const cacheHeaders = {
      'Cache-Control': 'public, max-age=604800, immutable',
      'ETag': object.etag || '',
      'Last-Modified': object.uploaded.toUTCString(),
    };

    return new Response(object.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        ...cacheHeaders,
      },
    });
  } catch (error) {
    console.error('Serve image error:', error);
    return new Response('Error serving image', {
      status: 500,
      headers: corsHeaders,
    });
  }
}

function getContentTypeFromKey(key) {
  const ext = key.split('.').pop().toLowerCase();
  const types = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    avif: 'image/avif',
  };
  return types[ext] || 'application/octet-stream';
}
