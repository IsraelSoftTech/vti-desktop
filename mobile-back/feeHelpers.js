const { pool } = require('./db');

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function mapFeeHead(row) {
  return {
    id: row.id,
    name: row.name,
    trashedAt: row.trashed_at ? row.trashed_at.toISOString() : null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

function mapClassFee(row) {
  return {
    id: row.id,
    classId: row.class_id,
    feeHeadId: row.fee_head_id,
    feeHeadName: row.fee_head_name,
    amount: roundMoney(row.amount),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function mapPayment(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    feeHeadId: row.fee_head_id,
    feeHeadName: row.fee_head_name,
    amount: roundMoney(row.amount),
    paidAt: row.paid_at?.toISOString?.() ?? row.paid_at,
    note: row.note || null,
    channel: String(row.channel || '').toLowerCase() === 'bank' ? 'bank' : 'cash',
  };
}

function parsePaymentChannel(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'cash' || v === 'bank') return v;
  return null;
}

function parsePaymentTender(body, { required = true } = {}) {
  const hasChannel = Object.prototype.hasOwnProperty.call(body || {}, 'channel');
  if (!hasChannel || body?.channel == null || body.channel === '') {
    if (!required) return { ok: true, channel: null, note: undefined };
    return { ok: false, error: 'Select Cash or Bank.' };
  }
  const channel = parsePaymentChannel(body.channel);
  if (!channel) return { ok: false, error: 'Select Cash or Bank.' };

  if (channel === 'cash') {
    return { ok: true, channel: 'cash', note: null };
  }

  const rawRef =
    body.reference !== undefined && body.reference !== null
      ? body.reference
      : body.note;
  const note = rawRef != null ? String(rawRef).trim() : '';
  if (!note) return { ok: false, error: 'Enter the bank reference number.' };
  return { ok: true, channel: 'bank', note };
}

function paymentDateText(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

async function buildTenderReport({
  channel,
  academicYearId,
  academicYearName,
  startDate,
  endDate,
  from,
  to,
  classId,
  schoolName,
}) {
  const params = [academicYearId, channel, from, to];
  let classFilter = '';
  if (classId) {
    params.push(classId);
    classFilter = ` AND s.class_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.amount, p.paid_at, p.note, p.channel,
            s.full_name AS student_name, s.barcode,
            c.name AS class_name, fh.name AS fee_head_name
     FROM attendance_fee_payments p
     JOIN attendance_students s ON s.id = p.student_id
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     JOIN attendance_fee_heads fh ON fh.id = p.fee_head_id
     WHERE p.academic_year_id = $1
       AND p.channel = $2
       AND substr(CAST(p.paid_at AS TEXT), 1, 10) >= $3
       AND substr(CAST(p.paid_at AS TEXT), 1, 10) <= $4
       ${classFilter}
     ORDER BY p.paid_at ASC, p.id ASC`,
    params
  );

  let className = null;
  if (classId) {
    const { rows: classRows } = await pool.query(
      'SELECT name FROM attendance_classes WHERE id = $1 AND academic_year_id = $2',
      [classId, academicYearId]
    );
    if (!classRows[0]) return null;
    className = classRows[0].name;
  }

  const mapped = rows.map((row) => ({
    id: row.id,
    paidAt: row.paid_at?.toISOString?.() ?? row.paid_at,
    studentName: row.student_name,
    barcode: row.barcode,
    className: row.class_name || null,
    feeHeadName: row.fee_head_name,
    amount: roundMoney(row.amount),
    note: row.note || null,
    channel: channel,
  }));
  const total = roundMoney(mapped.reduce((sum, row) => sum + row.amount, 0));

  return {
    channel,
    from,
    to,
    schoolName,
    academicYearName,
    academicYearStart: paymentDateText(startDate),
    academicYearEnd: paymentDateText(endDate),
    filters: { classId: classId || null, className },
    rows: mapped,
    totals: { count: mapped.length, amount: total },
  };
}

function mapFeeDiscount(row) {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    studentId: row.student_id ?? null,
    classId: row.class_id ?? null,
    studentName: row.student_name ?? null,
    className: row.class_name ?? null,
    amount: roundMoney(row.amount),
    note: row.note || null,
    source: row.student_id ? 'student' : 'class',
    classStudentCount:
      row.class_student_count != null ? Number(row.class_student_count) : null,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

async function getEffectiveDiscountAmount(studentId, classId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT amount FROM attendance_fee_discounts
     WHERE student_id = $1 AND academic_year_id = $2
     LIMIT 1`,
    [studentId, academicYearId]
  );
  if (rows[0]) return roundMoney(rows[0].amount);

  if (!classId) return 0;

  const { rows: classRows } = await pool.query(
    `SELECT amount FROM attendance_fee_discounts
     WHERE class_id = $1 AND academic_year_id = $2
     LIMIT 1`,
    [classId, academicYearId]
  );
  return roundMoney(classRows[0]?.amount || 0);
}

async function getEffectiveDiscountDetails(studentId, classId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT d.*, NULL::varchar AS student_name, NULL::varchar AS class_name
     FROM attendance_fee_discounts d
     WHERE d.student_id = $1 AND d.academic_year_id = $2
     LIMIT 1`,
    [studentId, academicYearId]
  );
  if (rows[0]) {
    return {
      amount: roundMoney(rows[0].amount),
      source: 'student',
      discountId: rows[0].id,
      note: rows[0].note || null,
    };
  }

  if (!classId) {
    return { amount: 0, source: null, discountId: null, note: null };
  }

  const { rows: classRows } = await pool.query(
    `SELECT d.*, c.name AS class_name
     FROM attendance_fee_discounts d
     JOIN attendance_classes c ON c.id = d.class_id
     WHERE d.class_id = $1 AND d.academic_year_id = $2
     LIMIT 1`,
    [classId, academicYearId]
  );
  if (classRows[0]) {
    return {
      amount: roundMoney(classRows[0].amount),
      source: 'class',
      discountId: classRows[0].id,
      note: classRows[0].note || null,
      className: classRows[0].class_name || null,
    };
  }

  return { amount: 0, source: null, discountId: null, note: null };
}

async function listFeeDiscounts(academicYearId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.academic_year_id, d.student_id, d.class_id, d.amount, d.note,
            d.created_at, d.updated_at,
            s.full_name AS student_name, s.class_id AS student_class_id,
            sc.name AS student_class_name,
            c.name AS class_name,
            (SELECT COUNT(*)::int FROM attendance_students st
             WHERE st.class_id = d.class_id AND st.academic_year_id = d.academic_year_id) AS class_student_count
     FROM attendance_fee_discounts d
     LEFT JOIN attendance_students s ON s.id = d.student_id
     LEFT JOIN attendance_classes sc ON sc.id = s.class_id
     LEFT JOIN attendance_classes c ON c.id = d.class_id
     WHERE d.academic_year_id = $1
     ORDER BY d.updated_at DESC, d.id DESC`,
    [academicYearId]
  );
  return rows.map((row) =>
    mapFeeDiscount({
      ...row,
      class_name: row.student_id ? row.student_class_name : row.class_name,
    })
  );
}

function feeStatus(expected, paid) {
  const balance = roundMoney(expected - paid);
  if (expected <= 0) return 'not_set';
  if (balance <= 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

async function getStudentRow(studentId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS class_name
     FROM attendance_students s
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.academic_year_id = $2`,
    [studentId, academicYearId]
  );
  return rows[0] || null;
}

async function getActiveFeeHeads(academicYearId) {
  const { rows } = await pool.query(
    `SELECT id, name FROM attendance_fee_heads
     WHERE academic_year_id = $1 AND trashed_at IS NULL
     ORDER BY name ASC`,
    [academicYearId]
  );
  return rows;
}

async function getClassFeeAmountMap(classId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT cf.id, cf.fee_head_id, cf.amount
     FROM attendance_class_fees cf
     JOIN attendance_fee_heads fh ON fh.id = cf.fee_head_id
     WHERE cf.class_id = $1 AND cf.academic_year_id = $2 AND fh.trashed_at IS NULL`,
    [classId, academicYearId]
  );
  const map = {};
  for (const row of rows) {
    map[row.fee_head_id] = {
      classFeeId: row.id,
      amount: roundMoney(row.amount),
    };
  }
  return map;
}

async function buildStudentFeeRecord(studentRow, academicYearId) {
  if (!studentRow) return null;

  const classId = studentRow.class_id;
  const allHeads = await getActiveFeeHeads(academicYearId);
  const feeAmountMap = classId
    ? await getClassFeeAmountMap(classId, academicYearId)
    : {};

  const { rows: paymentRows } = await pool.query(
    `SELECT p.id, p.student_id, p.fee_head_id, p.amount, p.paid_at, p.note, p.channel,
            fh.name AS fee_head_name
     FROM attendance_fee_payments p
     JOIN attendance_fee_heads fh ON fh.id = p.fee_head_id
     WHERE p.student_id = $1 AND p.academic_year_id = $2
     ORDER BY p.paid_at ASC, p.id ASC`,
    [studentRow.id, academicYearId]
  );

  const paidByHead = {};
  for (const p of paymentRows) {
    paidByHead[p.fee_head_id] = roundMoney((paidByHead[p.fee_head_id] || 0) + Number(p.amount));
  }

  const feeHeads = allHeads.map((head) => {
    const configured = feeAmountMap[head.id];
    const expected = roundMoney(configured?.amount ?? 0);
    const totalPaid = roundMoney(paidByHead[head.id] || 0);
    const balance = roundMoney(Math.max(0, expected - totalPaid));
    return {
      feeHeadId: head.id,
      name: head.name,
      expectedAmount: expected,
      discountAmount: 0,
      netExpected: expected,
      totalPaid,
      balance,
      status: feeStatus(expected, totalPaid),
      classFeeId: configured?.classFeeId ?? null,
    };
  });

  const configuredHeads = feeHeads.filter((f) => f.expectedAmount > 0);
  const totalExpected = roundMoney(configuredHeads.reduce((s, f) => s + f.expectedAmount, 0));
  const totalPaid = roundMoney(configuredHeads.reduce((s, f) => s + f.totalPaid, 0));
  const grossBalance = roundMoney(configuredHeads.reduce((s, f) => s + f.balance, 0));

  const discountDetails = await getEffectiveDiscountDetails(
    studentRow.id,
    classId,
    academicYearId
  );
  const rawDiscount = roundMoney(discountDetails.amount || 0);
  const discountAmount = roundMoney(Math.min(rawDiscount, totalExpected));
  const totalBalance = roundMoney(Math.max(0, totalExpected - discountAmount - totalPaid));

  let summaryStatus = 'no_fees';
  if (totalExpected > 0) {
    summaryStatus = totalBalance <= 0 ? 'completed' : 'owing';
  }

  return {
    student: {
      id: studentRow.id,
      fullName: studentRow.full_name ?? studentRow.fullName ?? '',
      barcode: studentRow.barcode,
      classId: studentRow.class_id ?? studentRow.classId ?? null,
      className: studentRow.class_name ?? studentRow.className ?? null,
    },
    feeHeads,
    payments: paymentRows.map(mapPayment),
    summary: {
      totalExpected,
      totalPaid,
      grossBalance,
      discountAmount,
      discountSource: discountDetails.source,
      discountNote: discountDetails.note,
      totalBalance,
      status: summaryStatus,
    },
  };
}

async function getPaymentRow(paymentId, academicYearId) {
  const { rows } = await pool.query(
    `SELECT p.*, fh.name AS fee_head_name
     FROM attendance_fee_payments p
     JOIN attendance_fee_heads fh ON fh.id = p.fee_head_id
     WHERE p.id = $1 AND p.academic_year_id = $2`,
    [paymentId, academicYearId]
  );
  return rows[0] || null;
}

async function computeMaxPaymentAmount(studentId, feeHeadId, academicYearId, excludePaymentId = null) {
  const student = await getStudentRow(studentId, academicYearId);
  if (!student) return null;

  const record = await buildStudentFeeRecord(student, academicYearId);
  const head = record.feeHeads.find((f) => f.feeHeadId === feeHeadId);
  if (!head || head.expectedAmount <= 0) return null;

  let oldAmount = 0;
  if (excludePaymentId) {
    const { rows } = await pool.query(
      `SELECT amount FROM attendance_fee_payments
       WHERE id = $1 AND academic_year_id = $2`,
      [excludePaymentId, academicYearId]
    );
    oldAmount = roundMoney(rows[0]?.amount || 0);
  }

  const headBalance = roundMoney(head.balance + oldAmount);
  const summaryBalance = roundMoney(record.summary.totalBalance + oldAmount);
  return roundMoney(Math.min(headBalance, summaryBalance));
}

async function assertValidPaymentAmount(
  studentId,
  feeHeadId,
  academicYearId,
  amount,
  excludePaymentId = null
) {
  if (!amount || amount <= 0) {
    return { ok: false, status: 400, error: 'Payment amount must be greater than zero' };
  }

  const student = await getStudentRow(studentId, academicYearId);
  if (!student) return { ok: false, status: 404, error: 'Student not found' };
  if (!student.class_id) {
    return { ok: false, status: 400, error: 'Student has no class assigned' };
  }

  const feeAmountMap = await getClassFeeAmountMap(student.class_id, academicYearId);
  if (!feeAmountMap[feeHeadId]) {
    return {
      ok: false,
      status: 400,
      error: 'This fee type is not configured for the student\'s class',
    };
  }

  const maxAmount = await computeMaxPaymentAmount(
    studentId,
    feeHeadId,
    academicYearId,
    excludePaymentId
  );
  if (maxAmount == null) {
    return { ok: false, status: 400, error: 'No fee amount set for this fee type' };
  }
  if (amount > maxAmount) {
    return {
      ok: false,
      status: 400,
      error: `Payment exceeds balance. Maximum payable: ${maxAmount}`,
      balance: maxAmount,
    };
  }

  return { ok: true, student };
}

async function applyClassFeeEntries(client, classId, academicYearId, entries) {
  for (const entry of entries) {
    const feeHeadId = Number(entry.feeHeadId);
    const amount = roundMoney(entry.amount);
    if (!feeHeadId || amount < 0 || Number.isNaN(amount)) {
      throw new Error('Each fee entry needs feeHeadId and a valid amount');
    }
    const { rows: headRows } = await client.query(
      `SELECT id FROM attendance_fee_heads
       WHERE id = $1 AND academic_year_id = $2 AND trashed_at IS NULL`,
      [feeHeadId, academicYearId]
    );
    if (!headRows[0]) {
      throw new Error(`Fee head ${feeHeadId} not found`);
    }
    if (amount === 0) {
      await client.query(
        `DELETE FROM attendance_class_fees
         WHERE class_id = $1 AND fee_head_id = $2 AND academic_year_id = $3`,
        [classId, feeHeadId, academicYearId]
      );
    } else {
      await client.query(
        `INSERT INTO attendance_class_fees (class_id, fee_head_id, academic_year_id, amount, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (class_id, fee_head_id) DO UPDATE SET
           amount = EXCLUDED.amount,
           updated_at = NOW()`,
        [classId, feeHeadId, academicYearId, amount]
      );
    }
  }
}

async function getFeeDashboardStats(academicYearId) {
  const [studentsRes, expectedRes, paidRes, studentsWithFees] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS c FROM attendance_students WHERE academic_year_id = $1`,
      [academicYearId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(cf.amount), 0)::numeric AS total
       FROM attendance_students s
       INNER JOIN attendance_class_fees cf
         ON cf.class_id = s.class_id AND cf.academic_year_id = s.academic_year_id
       INNER JOIN attendance_fee_heads fh
         ON fh.id = cf.fee_head_id AND fh.trashed_at IS NULL
       WHERE s.academic_year_id = $1 AND s.class_id IS NOT NULL`,
      [academicYearId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(p.amount), 0)::numeric AS total
       FROM attendance_fee_payments p
       JOIN attendance_students s
         ON s.id = p.student_id AND s.academic_year_id = p.academic_year_id
       JOIN attendance_class_fees cf
         ON cf.class_id = s.class_id
         AND cf.fee_head_id = p.fee_head_id
         AND cf.academic_year_id = p.academic_year_id
       JOIN attendance_fee_heads fh
         ON fh.id = p.fee_head_id AND fh.trashed_at IS NULL
       WHERE p.academic_year_id = $1`,
      [academicYearId]
    ),
    pool.query(
      `SELECT s.id, s.class_id,
              COALESCE(SUM(cf.amount), 0)::numeric AS expected
       FROM attendance_students s
       LEFT JOIN attendance_class_fees cf
         ON cf.class_id = s.class_id AND cf.academic_year_id = s.academic_year_id
       LEFT JOIN attendance_fee_heads fh
         ON fh.id = cf.fee_head_id AND fh.trashed_at IS NULL
       WHERE s.academic_year_id = $1 AND s.class_id IS NOT NULL
       GROUP BY s.id, s.class_id`,
      [academicYearId]
    ),
  ]);

  let totalDiscountApplied = 0;
  for (const row of studentsWithFees.rows) {
    const expected = roundMoney(row.expected || 0);
    if (expected <= 0) continue;
    const discount = await getEffectiveDiscountAmount(row.id, row.class_id, academicYearId);
    totalDiscountApplied += roundMoney(Math.min(discount, expected));
  }

  const totalStudents = studentsRes.rows[0]?.c ?? 0;
  const totalFeeExpected = roundMoney(expectedRes.rows[0]?.total || 0);
  const totalFeePaid = roundMoney(paidRes.rows[0]?.total || 0);
  const totalFeeOwed = roundMoney(
    Math.max(0, totalFeeExpected - totalDiscountApplied - totalFeePaid)
  );

  return {
    totalStudents,
    totalFeeExpected,
    totalFeePaid,
    totalFeeDiscount: roundMoney(totalDiscountApplied),
    totalFeeOwed,
  };
}

async function getClassFeeSummary(classId, academicYearId) {
  const allHeads = await getActiveFeeHeads(academicYearId);
  const feeAmountMap = await getClassFeeAmountMap(classId, academicYearId);

  const items = allHeads.map((head) => {
    const configured = feeAmountMap[head.id];
    return {
      feeHeadId: head.id,
      feeHeadName: head.name,
      classFeeId: configured?.classFeeId ?? null,
      amount: configured ? configured.amount : null,
    };
  });

  const total = roundMoney(
    items.reduce((s, i) => s + (i.amount != null && i.amount > 0 ? i.amount : 0), 0)
  );

  return { items, total };
}

async function buildClassFeeListReport(classId, academicYearId, academicYearName, schoolName) {
  const { rows: classRows } = await pool.query(
    `SELECT id, name FROM attendance_classes WHERE id = $1 AND academic_year_id = $2`,
    [classId, academicYearId]
  );
  if (!classRows[0]) return null;

  const { rows: students } = await pool.query(
    `SELECT s.*, c.name AS class_name
     FROM attendance_students s
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     WHERE s.class_id = $1 AND s.academic_year_id = $2
     ORDER BY s.full_name ASC`,
    [classId, academicYearId]
  );

  const rows = [];
  const totals = {
    expectedFee: 0,
    discount: 0,
    realAmount: 0,
    amountPaid: 0,
    balance: 0,
  };

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const record = await buildStudentFeeRecord(student, academicYearId);
    const expectedFee = roundMoney(record.summary.totalExpected);
    const discount = roundMoney(record.summary.discountAmount || 0);
    const realAmount = roundMoney(Math.max(0, expectedFee - discount));
    const amountPaid = roundMoney(record.summary.totalPaid);
    const balance = roundMoney(record.summary.totalBalance);
    const remark =
      realAmount > 0 && balance <= 0 ? 'Complete' : 'Incomplete';

    rows.push({
      sn: i + 1,
      studentId: student.id,
      fullName: student.full_name ?? student.fullName ?? '',
      expectedFee,
      discount,
      realAmount,
      amountPaid,
      balance,
      remark,
    });

    totals.expectedFee += expectedFee;
    totals.discount += discount;
    totals.realAmount += realAmount;
    totals.amountPaid += amountPaid;
    totals.balance += balance;
  }

  return {
    schoolName: schoolName || 'Izzy Tech Team School',
    className: classRows[0].name,
    academicYearName,
    classId: classRows[0].id,
    studentCount: rows.length,
    rows,
    totals: {
      expectedFee: roundMoney(totals.expectedFee),
      discount: roundMoney(totals.discount),
      realAmount: roundMoney(totals.realAmount),
      amountPaid: roundMoney(totals.amountPaid),
      balance: roundMoney(totals.balance),
    },
  };
}

module.exports = {
  roundMoney,
  mapFeeHead,
  mapClassFee,
  mapPayment,
  mapFeeDiscount,
  feeStatus,
  buildClassFeeListReport,
  getStudentRow,
  buildStudentFeeRecord,
  getClassFeeSummary,
  getFeeDashboardStats,
  getActiveFeeHeads,
  getClassFeeAmountMap,
  getEffectiveDiscountAmount,
  getEffectiveDiscountDetails,
  listFeeDiscounts,
  getPaymentRow,
  assertValidPaymentAmount,
  applyClassFeeEntries,
  parsePaymentChannel,
  parsePaymentTender,
  paymentDateText,
  buildTenderReport,
};
