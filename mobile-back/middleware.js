const jwt = require('jsonwebtoken');

const COOKIE = 'attendance_token';

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

function verifyAttendanceToken(req) {
  let raw = req.cookies?.[COOKIE];
  if (!raw) {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      raw = auth.slice(7).trim();
    }
  }
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, getJwtSecret());
    if (payload.typ !== 'attendance') return null;
    return payload;
  } catch {
    return null;
  }
}

const ROLES = {
  ADMIN: 'attendance_admin',
  ACCOUNTANT: 'attendance_accountant',
  PARENT: 'attendance_parent',
};

function requireAttendanceAuth(...allowedRoles) {
  return (req, res, next) => {
    const payload = verifyAttendanceToken(req);
    if (!payload) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (allowedRoles.length > 0) {
      const role = payload.role || ROLES.ADMIN;
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    req.attendanceUser = payload;
    return next();
  };
}

function requireAdmin() {
  return requireAttendanceAuth(ROLES.ADMIN);
}

function requireAccountant() {
  return requireAttendanceAuth(ROLES.ACCOUNTANT);
}

function requireAdminOrAccountant() {
  return requireAttendanceAuth(ROLES.ADMIN, ROLES.ACCOUNTANT);
}

function requireParent() {
  return requireAttendanceAuth(ROLES.PARENT);
}

module.exports = {
  COOKIE,
  ROLES,
  getJwtSecret,
  verifyAttendanceToken,
  requireAttendanceAuth,
  requireAdmin,
  requireAccountant,
  requireAdminOrAccountant,
  requireParent,
};
