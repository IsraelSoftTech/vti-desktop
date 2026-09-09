const BOOLEAN_COLUMNS = new Set([
  'is_active',
  'notify_sms_enabled',
  'notify_whatsapp_enabled',
  'notify_app_enabled',
  'notify_sms_normal',
  'allow_checkout_before_end_time',
  'broken',
]);

function rewriteFunctions(sql) {
  let s = String(sql);
  s = s.replace(
    /NOW\(\)\s*-\s*INTERVAL\s+'(\d+)\s+seconds'/gi,
    "datetime('now', '-$1 seconds')"
  );
  s = s.replace(/\bNOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  s = s.replace(/\bCURRENT_DATE\b/gi, "date('now')");
  s = s.replace(/::[a-zA-Z_][\w\[\]]*/g, '');
  s = s.replace(/\bTRUE\b/g, '1');
  s = s.replace(/\bFALSE\b/g, '0');
  s = s.replace(
    /\bILIKE\s+(\$[0-9]+|\?|'[^']*')/gi,
    'LIKE $1 COLLATE NOCASE'
  );
  return s;
}

function convertPlaceholders(sql, params) {
  const src = params || [];
  const outParams = [];
  const converted = sql.replace(
    /ANY\(\s*\$(\d+)\s*(?:::[a-z0-9\[\]]+)?\s*\)|\$(\d+)/gi,
    (whole, anyN, plainN) => {
      if (anyN) {
        const arr = Array.isArray(src[Number(anyN) - 1])
          ? src[Number(anyN) - 1]
          : [];
        if (!arr.length) return '(NULL)';
        arr.forEach((v) => outParams.push(v));
        return `IN (${arr.map(() => '?').join(', ')})`;
      }
      outParams.push(src[Number(plainN) - 1]);
      return '?';
    }
  );
  return { sql: converted, params: outParams };
}

function bindValue(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

function convertPgToSqlite(sql, params) {
  const rewritten = rewriteFunctions(sql);
  const { sql: withPlaceholders, params: expanded } = convertPlaceholders(
    rewritten,
    params
  );
  return {
    sql: withPlaceholders,
    params: expanded.map(bindValue),
  };
}

function coerceRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (BOOLEAN_COLUMNS.has(key)) {
      out[key] = value == null ? value : Boolean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mapSqliteError(err) {
  const e = err;
  const msg = String(err.message || '');
  const code = String(err.code || '');
  if (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    /UNIQUE constraint failed/i.test(msg)
  ) {
    e.code = '23505';
  } else if (
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    /FOREIGN KEY constraint failed/i.test(msg)
  ) {
    e.code = '23503';
  }
  return e;
}

module.exports = {
  BOOLEAN_COLUMNS,
  convertPgToSqlite,
  coerceRow,
  mapSqliteError,
  rewriteFunctions,
};
