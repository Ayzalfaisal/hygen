const { verifyToken, readBearer, sendJson, parseBody } = require('./_auth');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' });
  const token = readBearer(req);
  if (!verifyToken(token)) return sendJson(res, 401, { message: 'Unauthorized. Login again.' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    return sendJson(res, 500, { message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on server.' });
  }

  let body;
  try { body = await parseBody(req); }
  catch (_) { return sendJson(res, 400, { message: 'Invalid JSON body.' }); }

  let path;
  try { path = cleanPath(body.path); }
  catch (err) { return sendJson(res, 400, { message: err.message }); }

  const method = String(body.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    return sendJson(res, 400, { message: 'Unsupported method.' });
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
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(text || (upstream.status === 204 ? '' : '{}'));
  } catch (err) {
    return sendJson(res, 500, { message: err.message || 'Supabase request failed.' });
  }
};
