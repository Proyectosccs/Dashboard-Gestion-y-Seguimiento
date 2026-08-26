const allowedOrigins = new Set([
  'https://proyectosccs.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765'
]);

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
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin)
  });
}

function getSecretKey() {
  const modernKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (modernKeys) {
    const parsed = JSON.parse(modernKeys);
    if (parsed.default) return parsed.default as string;
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

async function callRpc(functionName: string, payload: Record<string, unknown>) {
  const projectUrl = Deno.env.get('SUPABASE_URL') || '';
  const secretKey = getSecretKey();
  if (!projectUrl || !secretKey) throw new Error('server configuration unavailable');

  const response = await fetch(`${projectUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error('database operation failed');
    error.name = response.status === 401 || data?.code === '28000' ? 'InvalidKey' : 'DatabaseError';
    throw error;
  }
  return data;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) return jsonResponse(origin, 403, { error: 'origin not allowed' });
    return new Response('ok', { headers: responseHeaders(origin) });
  }
  if (request.method !== 'POST') return jsonResponse(origin, 405, { error: 'method not allowed' });
  if (origin && !allowedOrigins.has(origin)) return jsonResponse(origin, 403, { error: 'origin not allowed' });

  try {
    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action : '';
    const key = typeof body?.key === 'string' ? body.key : '';
    if (key.length < 12) return jsonResponse(origin, 401, { error: 'invalid editor key' });

    if (action === 'verify') {
      const valid = await callRpc('coalicion_verify_editor_key', { p_key: key });
      return valid === true
        ? jsonResponse(origin, 200, { data: true })
        : jsonResponse(origin, 401, { error: 'invalid editor key' });
    }

    if (action === 'contacts') {
      const contacts = await callRpc('coalicion_get_contacts', { p_key: key });
      return jsonResponse(origin, 200, { data: contacts });
    }

    if (action === 'save') {
      if (!['contact', 'event', 'inventory', 'batch'].includes(body?.entity)) {
        return jsonResponse(origin, 400, { error: 'unsupported entity' });
      }
      if (!body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
        return jsonResponse(origin, 400, { error: 'invalid payload' });
      }
      const saved = await callRpc('coalicion_save_record', {
        p_key: key,
        p_entity: body.entity,
        p_payload: body.payload,
        p_id: body.id || null
      });
      return jsonResponse(origin, 200, { data: saved });
    }

    return jsonResponse(origin, 400, { error: 'unsupported action' });
  } catch (error) {
    if (error instanceof Error && error.name === 'InvalidKey') {
      return jsonResponse(origin, 401, { error: 'invalid editor key' });
    }
    return jsonResponse(origin, 500, { error: 'operation unavailable' });
  }
});
