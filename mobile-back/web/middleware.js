const jwt = require('jsonwebtoken');

const COOKIE = 'web_token';

function getWebJwtSecret() {
  const secret =
    process.env.JWT_SECRET ||
    process.env.WEB_JWT_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'vti-web-dev-jwt-secret' : '');
  if (!secret) {
    throw new Error('JWT_SECRET or WEB_JWT_SECRET is not set');
  }
  return secret;
}

function verifyWebToken(req) {
  let raw = req.cookies?.[COOKIE];
  if (!raw) {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      raw = auth.slice(7).trim();
    }
  }
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, getWebJwtSecret());
    if (payload.typ !== 'web_admin') return null;
    return payload;
  } catch {
    return null;
  }
}

function requireWebAdmin() {
  return (req, res, next) => {
    const payload = verifyWebToken(req);
    if (!payload) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.webUser = payload;
    return next();
  };
}

module.exports = {
  COOKIE,
  getWebJwtSecret,
  verifyWebToken,
  requireWebAdmin,
};
