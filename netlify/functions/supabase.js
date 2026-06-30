const { verifyToken, readBearer, json, parseBody } = require('./_auth');

function cleanPath(path) {
  const p = String(path || '').trim();
  if (!p.startsWith('/rest/v1/')) throw new Error('Only Supabase REST paths are allowed.');
  if (p.includes('..')) throw new Error('Invalid path.');
  return p;
}

function safeHeaders(headers = {}) {
  const allowed = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const k = key.toLowerCase();
    if (k === 'prefer' || k === 'range' || k === 'range-unit') allowed[key] = String(value);
  }
  return allowed;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  const token = readBearer(event);
  if (!verifyToken(token)) return json(401, { message: 'Unauthorized. Login again.' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    return json(500, { message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on server.' });
  }

  const body = parseBody(event);
  let path;
  try { path = cleanPath(body.path); }
  catch (err) { return json(400, { message: err.message }); }

  const method = String(body.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    return json(400, { message: 'Unsupported method.' });
  }

  const upstreamHeaders = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    ...safeHeaders(body.headers)
  };

  const init = { method, headers: upstreamHeaders };
  if (method !== 'GET' && method !== 'DELETE' && body.body !== null && body.body !== undefined) {
    init.body = typeof body.body === 'string' ? body.body : JSON.stringify(body.body);
  }

  try {
    const upstream = await fetch(`${supabaseUrl}${path}`, init);
    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store'
      },
      body: text || (upstream.status === 204 ? '' : '{}')
    };
  } catch (err) {
    return json(500, { message: err.message || 'Supabase request failed.' });
  }
};
