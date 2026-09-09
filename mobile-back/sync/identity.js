const {
  TABLE_FKS,
  COMPOSITE_KEYS,
  RECORD_NATURAL_KEY,
  assertSafeTable,
} = require('./tables');

function lookupIdByUuid(queryFn, table, uuid) {
  if (!uuid) return null;
  assertSafeTable(table);
  return queryFn(
    `SELECT id FROM ${table} WHERE uuid = $1 LIMIT 1`,
    [uuid]
  ).then((r) => r.rows[0]?.id ?? null);
}

function lookupUuidById(queryFn, table, id) {
  if (id == null) return Promise.resolve(null);
  assertSafeTable(table);
  return queryFn(`SELECT uuid FROM ${table} WHERE id = $1 LIMIT 1`, [id]).then(
    (r) => r.rows[0]?.uuid ?? null
  );
}

function isRequiredFk(fk) {
  return fk.required !== false;
}

function missingFkError(uuidCol) {
  const err = new Error(`missing_fk:${uuidCol}`);
  err.code = 'missing_fk';
  err.fk = uuidCol;
  return err;
}

async function toWirePayload(queryFn, table, row) {
  if (!row) return null;
  const payload = { ...row };
  delete payload.id;
  const fks = TABLE_FKS[table] || [];
  for (const fk of fks) {
    payload[fk.uuidCol] = await lookupUuidById(queryFn, fk.table, row[fk.col]);
    delete payload[fk.col];
  }
  return payload;
}

/** True when a required parent UUID is missing, or a discount has neither side. */
function shouldOmitWiredRow(table, payload) {
  if (!payload) return true;
  const fks = TABLE_FKS[table] || [];
  for (const fk of fks) {
    if (isRequiredFk(fk) && !payload[fk.uuidCol]) return true;
  }
  if (table === 'attendance_fee_discounts' && !payload.student_uuid && !payload.class_uuid) {
    return true;
  }
  return false;
}

async function fromWirePayload(queryFn, table, payload) {
  const row = { ...payload };
  const fks = TABLE_FKS[table] || [];
  for (const fk of fks) {
    const uuid = row[fk.uuidCol];
    delete row[fk.uuidCol];
    delete row[fk.col];
    const required = isRequiredFk(fk);
    if (!uuid) {
      if (required) throw missingFkError(fk.uuidCol);
      row[fk.col] = null;
      continue;
    }
    const id = await lookupIdByUuid(queryFn, fk.table, uuid);
    if (id == null) throw missingFkError(fk.uuidCol);
    row[fk.col] = id;
  }
  delete row.id;
  return row;
}

function compositeKey(table) {
  return COMPOSITE_KEYS[table] || null;
}

module.exports = {
  lookupIdByUuid,
  lookupUuidById,
  toWirePayload,
  fromWirePayload,
  shouldOmitWiredRow,
  compositeKey,
  RECORD_NATURAL_KEY,
};
