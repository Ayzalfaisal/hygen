const { signPayload, json, parseBody } = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return json(500, { message: 'ADMIN_PASSWORD is not configured on server.' });

  const body = parseBody(event);
  const password = String(body.password || '');
  if (password !== adminPassword) return json(401, { message: 'Wrong admin password.' });

  const token = signPayload({
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  });

  return json(200, { token });
};
