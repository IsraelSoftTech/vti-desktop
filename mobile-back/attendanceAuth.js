const bcrypt = require('./bcryptCompat');
const { pool } = require('./db');
const { normalizeCameroonPhone } = require('./cameroonPhone');
const { isDesktop } = require('./runtime');

const PARENT_ROLE = 'attendance_parent';
const BOOTSTRAP_ACCOUNTANT_USERNAME =
  process.env.ATTENDANCE_BOOTSTRAP_ACCOUNTANT_USERNAME || 'accountant@!';
const BOOTSTRAP_ACCOUNTANT_PASSWORD =
  process.env.ATTENDANCE_BOOTSTRAP_ACCOUNTANT_PASSWORD || 'accountant!';

function isBootstrapAccountantUsername(username) {
  return (
    String(username || '').trim().toLowerCase() ===
    String(BOOTSTRAP_ACCOUNTANT_USERNAME).trim().toLowerCase()
  );
}

async function usernameTaken(username, exceptUserId) {
  const raw = String(username || '').trim();
  if (!raw) return false;
  const { rows } = await pool.query(
    'SELECT id FROM attendance_users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [raw]
  );
  const found = rows[0];
  if (!found) return false;
  if (exceptUserId != null && Number(found.id) === Number(exceptUserId)) return false;
  return true;
}

async function findUserByLogin(username) {
  const raw = String(username || '').trim();
  if (!raw) return null;

  const { rows } = await pool.query(
    'SELECT * FROM attendance_users WHERE username = $1',
    [raw]
  );
  if (rows[0]) return rows[0];

  const phone = normalizeCameroonPhone(raw);
  if (phone && phone !== raw) {
    const again = await pool.query(
      'SELECT * FROM attendance_users WHERE username = $1',
      [phone]
    );
    return again.rows[0] || null;
  }
  return null;
}

function publicUserFields(user) {
  const role = user.role || 'attendance_admin';
  const isParent = role === PARENT_ROLE;
  return {
    username: user.username,
    fullName: user.full_name || null,
    role,
    firstRunCompleted: isParent ? Boolean(user.first_run_completed) : true,
  };
}

async function registerParentUser({ fullName, phone, password }) {
  if (isDesktop()) {
    const err = new Error('Parent accounts register on the school server, not on desktop.');
    err.status = 400;
    throw err;
  }
  const name = String(fullName || '').trim();
  if (!name) {
    const err = new Error('Full name is required');
    err.status = 400;
    throw err;
  }
  if (name.length > 255) {
    const err = new Error('Full name is too long');
    err.status = 400;
    throw err;
  }

  const username = normalizeCameroonPhone(phone);
  if (!username) {
    const err = new Error(
      'Enter a valid Cameroon mobile number (e.g. 6XX XX XX XX or +237…).'
    );
    err.status = 400;
    throw err;
  }

  const pwd = String(password || '');
  if (pwd.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }

  const existing = await findUserByLogin(username);
  if (existing) {
    const err = new Error('This phone number is already registered.');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(pwd, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO attendance_users
         (username, password_hash, full_name, role, first_run_completed)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING *`,
      [username, passwordHash, name, PARENT_ROLE]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('This phone number is already registered.');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

async function ensureBootstrapAccountant() {
  const hash = await bcrypt.hash(BOOTSTRAP_ACCOUNTANT_PASSWORD, 12);
  const existing = await findUserByLogin(BOOTSTRAP_ACCOUNTANT_USERNAME);
  if (existing) {
    await pool.query(
      `UPDATE attendance_users
       SET password_hash = $1,
           role = 'attendance_accountant',
           updated_at = NOW()
       WHERE id = $2`,
      [hash, existing.id]
    );
    return existing;
  }
  const { rows } = await pool.query(
    `INSERT INTO attendance_users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [BOOTSTRAP_ACCOUNTANT_USERNAME, hash, 'Accountant', 'attendance_accountant']
  );
  return rows[0];
}

async function changeOwnPassword(userId, body) {
  const current = String(body?.currentPassword ?? '');
  const next = String(body?.newPassword ?? '');
  const confirm = String(body?.confirmPassword ?? '');
  const requestedUsername = String(body?.username ?? '').trim();

  if (!current || !next || !confirm) {
    const err = new Error(
      'Current password, new password, and confirm password are required.'
    );
    err.status = 400;
    throw err;
  }
  if (next.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }
  if (next !== confirm) {
    const err = new Error('New password and confirm password do not match.');
    err.status = 400;
    throw err;
  }

  const id = Number(userId);
  if (!Number.isFinite(id)) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const { rows } = await pool.query(
    'SELECT * FROM attendance_users WHERE id = $1',
    [id]
  );
  const user = rows[0];
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const matches = await bcrypt.compare(current, user.password_hash);
  if (!matches) {
    const err = new Error('Current password is incorrect.');
    err.status = 400;
    throw err;
  }
  if (next === current && (!requestedUsername || requestedUsername === user.username)) {
    const err = new Error('New password must be different.');
    err.status = 400;
    throw err;
  }

  const isAccountant = user.role === 'attendance_accountant';
  const keepBootstrap = isAccountant && isBootstrapAccountantUsername(user.username);
  const passwordHash = await bcrypt.hash(next, 12);

  if (keepBootstrap) {
    const newUsername = requestedUsername;
    if (!newUsername || isBootstrapAccountantUsername(newUsername)) {
      const err = new Error('Choose a new username.');
      err.status = 400;
      throw err;
    }
    const taken = await usernameTaken(newUsername);
    if (taken) {
      const err = new Error('That username is already in use.');
      err.status = 409;
      throw err;
    }
    try {
      const inserted = await pool.query(
        `INSERT INTO attendance_users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [newUsername, passwordHash, user.full_name || 'Accountant', 'attendance_accountant']
      );
      await ensureBootstrapAccountant();
      return { user: inserted.rows[0], switched: true };
    } catch (e) {
      if (e.code === '23505' || /UNIQUE constraint failed/i.test(String(e.message || ''))) {
        const err = new Error('That username is already in use.');
        err.status = 409;
        throw err;
      }
      throw e;
    }
  }

  let nextUsername = user.username;
  if (isAccountant && requestedUsername && requestedUsername !== user.username) {
    if (isBootstrapAccountantUsername(requestedUsername)) {
      const err = new Error('That username is already in use.');
      err.status = 400;
      throw err;
    }
    const taken = await usernameTaken(requestedUsername, id);
    if (taken) {
      const err = new Error('That username is already in use.');
      err.status = 409;
      throw err;
    }
    nextUsername = requestedUsername;
  }

  try {
    await pool.query(
      `UPDATE attendance_users
       SET password_hash = $1,
           username = $2,
           updated_at = NOW(),
           row_version = COALESCE(row_version, 1) + 1
       WHERE id = $3`,
      [passwordHash, nextUsername, id]
    );
  } catch (e) {
    if (e.code === '23505' || /UNIQUE constraint failed/i.test(String(e.message || ''))) {
      const err = new Error('That username is already in use.');
      err.status = 409;
      throw err;
    }
    throw e;
  }

  const updated = await pool.query('SELECT * FROM attendance_users WHERE id = $1', [id]);
  if (isAccountant) await ensureBootstrapAccountant();
  return { user: updated.rows[0], switched: nextUsername !== user.username };
}

module.exports = {
  PARENT_ROLE,
  BOOTSTRAP_ACCOUNTANT_USERNAME,
  isBootstrapAccountantUsername,
  findUserByLogin,
  publicUserFields,
  registerParentUser,
  changeOwnPassword,
  ensureBootstrapAccountant,
};
