/**
 * Cloudflare Worker Proxy per YACA
 * 
 * Questo script fa da scudo per il tuo server Hugging Face, eseguendo le richieste
 * verso gli addon (es. Torrentio, Il Corsaro Viola) nascondendo l'IP originale
 * e aggirando i Rate Limit.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
  // Support either query param or custom header
  const targetUrl = request.headers.get('x-target-url') || url.searchParams.get('url');

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const init = {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    // Inoltra gli header necessari per richieste API (es. GraphQL)
    const headersToForward = ['content-type', 'accept', 'authorization'];
    headersToForward.forEach(h => {
      const val = request.headers.get(h);
      if (val) init.headers[h] = val;
    });

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(targetUrl, init);
    
    // Mantieni gli header originali della risposta e aggiungi i CORS
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // Restituisci direttamente il corpo della risposta (streaming) senza bufferizzarlo in memoria
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
};
