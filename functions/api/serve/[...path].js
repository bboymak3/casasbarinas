// functions/api/serve/[...path].js
// GET: Serve images directly from R2 bucket through our API
// Usage: /api/serve/properties/123/1234_photo.jpg

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

    // Get the path from the URL (everything after /api/serve/)
    const url = new URL(request.url);
    const pathname = url.pathname;
    const prefix = '/api/serve/';
    let key = '';

    if (pathname.startsWith(prefix)) {
      key = pathname.substring(prefix.length);
    }

    if (!key) {
      return new Response('Missing file key', {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Decode URI components (handle %2F -> /)
    key = decodeURIComponent(key);

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

    // Set cache headers for browser caching (1 week)
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
