const crypto = require('crypto');

function getSecret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'change-this-secret';
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch (_) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp && Date.now() < payload.exp;
  } catch (_) {
    return false;
  }
}

function readBearer(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(data)
  };
}

function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch (_) {
    return {};
  }
}

module.exports = { signPayload, verifyToken, readBearer, json, parseBody };
