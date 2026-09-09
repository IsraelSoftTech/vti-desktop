const SYNC_TABLES = [
  'attendance_users',
  'attendance_academic_years',
  'attendance_classes',
  'attendance_departments',
  'attendance_settings',
  'attendance_students',
  'attendance_fee_heads',
  'attendance_class_fees',
  'attendance_fee_discounts',
  'attendance_fee_payments',
  'attendance_records',
  'attendance_student_day_scans',
  'attendance_absence_days',
];

const UPSERT_ORDER = [...SYNC_TABLES];
const DELETE_ORDER = [...SYNC_TABLES].reverse();

const TABLE_FKS = {
  attendance_classes: [
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_departments: [
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_students: [
    { col: 'class_id', uuidCol: 'class_uuid', table: 'attendance_classes', required: false },
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_records: [
    { col: 'student_id', uuidCol: 'student_uuid', table: 'attendance_students' },
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_student_day_scans: [
    { col: 'student_id', uuidCol: 'student_uuid', table: 'attendance_students' },
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_absence_days: [
    { col: 'student_id', uuidCol: 'student_uuid', table: 'attendance_students' },
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_settings: [
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_fee_heads: [
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_class_fees: [
    { col: 'class_id', uuidCol: 'class_uuid', table: 'attendance_classes' },
    { col: 'fee_head_id', uuidCol: 'fee_head_uuid', table: 'attendance_fee_heads' },
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_fee_payments: [
    { col: 'student_id', uuidCol: 'student_uuid', table: 'attendance_students' },
    { col: 'fee_head_id', uuidCol: 'fee_head_uuid', table: 'attendance_fee_heads' },
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
  ],
  attendance_fee_discounts: [
    {
      col: 'academic_year_id',
      uuidCol: 'academic_year_uuid',
      table: 'attendance_academic_years',
    },
    { col: 'student_id', uuidCol: 'student_uuid', table: 'attendance_students', required: false },
    { col: 'class_id', uuidCol: 'class_uuid', table: 'attendance_classes', required: false },
  ],
};

const COMPOSITE_KEYS = {
  attendance_settings: ['academic_year_id'],
  attendance_student_day_scans: [
    'student_id',
    'academic_year_id',
    'attendance_date',
  ],
  attendance_absence_days: ['student_id', 'academic_year_id', 'attendance_date'],
};

const NATURAL_UNIQUE_KEYS = {
  attendance_users: [['username']],
  attendance_academic_years: [['name']],
  attendance_classes: [['name', 'academic_year_id']],
  attendance_departments: [['name', 'academic_year_id']],
  attendance_students: [['barcode']],
  attendance_fee_heads: [['name', 'academic_year_id']],
  attendance_class_fees: [['class_id', 'fee_head_id']],
  attendance_fee_discounts: [
    ['student_id', 'academic_year_id'],
    ['class_id', 'academic_year_id'],
  ],
};

function conflictKeySets(table) {
  const sets = [];
  const composite = COMPOSITE_KEYS[table];
  if (composite) sets.push(composite);
  for (const keys of NATURAL_UNIQUE_KEYS[table] || []) sets.push(keys);
  return sets;
}

const RECORD_NATURAL_KEY = [
  'student_id',
  'academic_year_id',
  'attendance_date',
  'check_type',
];

function assertSafeTable(name) {
  if (!SYNC_TABLES.includes(name)) {
    throw new Error(`Unsafe sync table: ${name}`);
  }
  return name;
}

module.exports = {
  SYNC_TABLES,
  UPSERT_ORDER,
  DELETE_ORDER,
  TABLE_FKS,
  COMPOSITE_KEYS,
  NATURAL_UNIQUE_KEYS,
  RECORD_NATURAL_KEY,
  conflictKeySets,
  assertSafeTable,
};
