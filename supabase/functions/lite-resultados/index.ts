const allowedOrigins = new Set([
  'https://proyectosccs.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765'
]);

const ALLOWED_RESOURCES: Record<string, string[]> = {
  entregas: ['envioId', 'confirmadoRecibido', 'desde', 'hasta'],
  envios: ['estado', 'ubicacionId', 'desde', 'hasta'],
  productos: []
};

function responseHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : 'https://proyectosccs.github.io';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}

function jsonResponse(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) return jsonResponse(origin, 403, { error: 'origin not allowed' });
    return new Response('ok', { headers: responseHeaders(origin) });
  }
  if (request.method !== 'POST') return jsonResponse(origin, 405, { error: 'method not allowed' });
  if (origin && !allowedOrigins.has(origin)) return jsonResponse(origin, 403, { error: 'origin not allowed' });

  const baseUrl = Deno.env.get('LITE_API_BASE_URL') || '';
  const token = Deno.env.get('LITE_API_EXTERNAL_TOKEN') || '';
  if (!baseUrl || !token) {
    return jsonResponse(origin, 503, { error: 'conektados Lite no está configurado todavía' });
  }

  try {
    const body = await request.json().catch(function () { return {}; });
    const resource = typeof body?.resource === 'string' ? body.resource : '';
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_RESOURCES, resource)) {
      return jsonResponse(origin, 400, { error: 'recurso no soportado' });
    }

    const allowedParams = ALLOWED_RESOURCES[resource];
    const search = new URLSearchParams();
    const rawParams = (body?.params && typeof body.params === 'object') ? body.params : {};
    allowedParams.forEach(function (key) {
      const value = rawParams[key];
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });

    const targetUrl = baseUrl.replace(/\/$/, '') + '/api/lite/' + resource + (search.toString() ? '?' + search.toString() : '');
    const upstream = await fetch(targetUrl, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const upstreamBody = await upstream.json().catch(function () { return null; });

    if (upstream.status === 429) {
      return jsonResponse(origin, 429, { error: 'demasiadas solicitudes a conektados Lite, intenta en un momento' });
    }
    if (!upstream.ok) {
      return jsonResponse(origin, upstream.status === 401 ? 401 : 502, { error: 'conektados Lite respondió con un error' });
    }

    return jsonResponse(origin, 200, { data: upstreamBody });
  } catch (_error) {
    return jsonResponse(origin, 500, { error: 'operation unavailable' });
  }
});
