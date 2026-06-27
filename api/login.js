const { signPayload, sendJson, parseBody } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' });
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return sendJson(res, 500, { message: 'ADMIN_PASSWORD is not configured on server.' });
  const body = await parseBody(req);
  const password = String(body.password || '');
  if (password !== adminPassword) return sendJson(res, 401, { message: 'Wrong admin password.' });
  const token = signPayload({ role: 'admin', iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  return sendJson(res, 200, { token });
};
