const ExcelJS = require('exceljs');
const { pool } = require('./db');
const {
  toDateISO,
  validateStudentRegistration,
  generateBarcode,
  saveImageBuffer,
  deletePhotoIfLocal,
} = require('./helpers');

const EXPECTED_HEADERS = [
  'full name',
  'sex',
  'date of birth',
  'place of birth',
  "guardian's name",
  'guardians name',
  'contact',
  'class',
  'id card photo',
];

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['’`]/g, "'");
}

function excelSerialToISO(serial) {
  if (!Number.isFinite(serial)) return '';
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  return toDateISO(new Date(utcMs));
}

function readCellValue(cell) {
  if (!cell || cell.value == null || cell.value === '') return '';

  const value = cell.value;

  if (value instanceof Date) {
    return toDateISO(value);
  }

  if (typeof value === 'object') {
    if (value.result != null) {
      return readCellValue({ value: value.result });
    }
    if (value.text != null) {
      return String(value.text).trim();
    }
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text || '')
        .join('')
        .trim();
    }
    if (value.hyperlink) {
      return String(value.text || value.hyperlink || '').trim();
    }
  }

  if (typeof value === 'number') {
    if (cell.numFmt && /[dy]/i.test(String(cell.numFmt))) {
      return excelSerialToISO(value);
    }
    return String(value);
  }

  return String(value).trim();
}

function readDobCell(cell) {
  if (!cell || cell.value == null || cell.value === '') return '';
  if (cell.value instanceof Date) return toDateISO(cell.value);
  if (typeof cell.value === 'number' && cell.value > 1000) {
    return excelSerialToISO(cell.value);
  }
  return readCellValue(cell);
}

function findHeaderRow(worksheet) {
  for (let rowNum = 1; rowNum <= Math.min(worksheet.rowCount, 20); rowNum += 1) {
    const row = worksheet.getRow(rowNum);
    const first = normalizeHeader(readCellValue(row.getCell(1)));
    if (first === 'full name') {
      return rowNum;
    }
  }
  return null;
}

function buildColumnMap(worksheet, headerRowNum) {
  const headerRow = worksheet.getRow(headerRowNum);
  const map = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizeHeader(readCellValue(cell));
    if (!key) return;
    if (key === 'full name') map.fullName = colNumber;
    else if (key === 'sex') map.sex = colNumber;
    else if (key === 'date of birth') map.dob = colNumber;
    else if (key === 'place of birth') map.placeOfBirth = colNumber;
    else if (key === "guardian's name" || key === 'guardians name') map.guardianName = colNumber;
    else if (key === 'contact') map.contact = colNumber;
    else if (key === 'class') map.className = colNumber;
    else if (key === 'id card photo') map.photo = colNumber;
  });
  return map;
}

function buildImagesByRow(workbook, worksheet) {
  const byRow = new Map();

  for (const image of worksheet.getImages()) {
    const meta = workbook.getImage(image.imageId);
    if (!meta?.buffer?.length) continue;

    const tl = image.range?.tl;
    const row =
      tl?.nativeRow ??
      (tl?.row != null ? Math.floor(tl.row) + 1 : null);
    if (!row) continue;

    const existing = byRow.get(row);
    const col = tl?.nativeCol ?? (tl?.col != null ? Math.floor(tl.col) + 1 : null);
    if (!existing || (col != null && col >= 8)) {
      byRow.set(row, meta);
    }
  }

  return byRow;
}

function isRowEmpty(worksheet, rowNum, columns) {
  const required = ['fullName', 'sex', 'dob', 'placeOfBirth', 'guardianName', 'contact', 'className'];
  return required.every((key) => {
    const col = columns[key];
    if (!col) return true;
    return !readCellValue(worksheet.getRow(rowNum).getCell(col));
  });
}

async function parseStudentBulkWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('The Excel file has no worksheets.');
  }

  const headerRowNum = findHeaderRow(worksheet);
  if (!headerRowNum) {
    throw new Error(
      'Could not find the header row. Use the template with columns: Full Name, Sex, Date of Birth, Place of Birth, Guardian\'s Name, Contact, Class, ID Card Photo.'
    );
  }

  const columns = buildColumnMap(worksheet, headerRowNum);
  const requiredKeys = ['fullName', 'sex', 'dob', 'placeOfBirth', 'guardianName', 'contact', 'className'];
  const missing = requiredKeys.filter((key) => !columns[key]);
  if (missing.length) {
    throw new Error(
      'The Excel template is missing required columns. Expected: Full Name, Sex, Date of Birth, Place of Birth, Guardian\'s Name, Contact, Class.'
    );
  }

  const imagesByRow = buildImagesByRow(workbook, worksheet);
  const rows = [];

  for (let rowNum = headerRowNum + 1; rowNum <= worksheet.rowCount; rowNum += 1) {
    if (isRowEmpty(worksheet, rowNum, columns)) continue;

    const row = worksheet.getRow(rowNum);
    const imageMeta = imagesByRow.get(rowNum) || null;

    rows.push({
      rowNum,
      fullName: readCellValue(row.getCell(columns.fullName)),
      sex: readCellValue(row.getCell(columns.sex)),
      dob: readDobCell(row.getCell(columns.dob)),
      placeOfBirth: readCellValue(row.getCell(columns.placeOfBirth)),
      guardianName: readCellValue(row.getCell(columns.guardianName)),
      contact: readCellValue(row.getCell(columns.contact)),
      className: readCellValue(row.getCell(columns.className)),
      imageMeta,
    });
  }

  if (!rows.length) {
    throw new Error('No student rows found below the header row.');
  }

  return rows;
}

function normalizeSex(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'Male';
  if (v === 'female' || v === 'f') return 'Female';
  return String(value || '').trim();
}

async function processBulkStudentUpload(buffer, year) {
  const parsedRows = await parseStudentBulkWorkbook(buffer);

  const { rows: classRows } = await pool.query(
    'SELECT id, name FROM attendance_classes WHERE academic_year_id = $1',
    [year.id]
  );
  const classByName = new Map(
    classRows.map((row) => [String(row.name).trim(), row])
  );

  const results = [];
  let registered = 0;
  let failed = 0;

  for (const row of parsedRows) {
    const className = String(row.className || '').trim();
    const classMatch = classByName.get(className);

    if (!classMatch) {
      failed += 1;
      results.push({
        row: row.rowNum,
        fullName: row.fullName || '',
        ok: false,
        error: className
          ? `Class "${className}" was not found. Class name must match exactly.`
          : 'Class is required.',
      });
      continue;
    }

    const sex = normalizeSex(row.sex);
    if (sex !== 'Male' && sex !== 'Female') {
      failed += 1;
      results.push({
        row: row.rowNum,
        fullName: row.fullName || '',
        ok: false,
        error: 'Sex must be Male or Female.',
      });
      continue;
    }

    let photoUrl = null;
    if (row.imageMeta?.buffer?.length) {
      photoUrl = await saveImageBuffer(
        row.imageMeta.buffer,
        row.imageMeta.extension || 'png',
        'student'
      );
    }

    const studentPayload = {
      fullName: row.fullName,
      sex,
      dob: row.dob,
      placeOfBirth: row.placeOfBirth,
      guardianName: row.guardianName,
      contact: row.contact,
      classId: classMatch.id,
      photoUrl,
    };

    const validationError = validateStudentRegistration(studentPayload, {
      requirePhoto: false,
    });
    if (validationError) {
      if (photoUrl) await deletePhotoIfLocal(photoUrl);
      failed += 1;
      results.push({
        row: row.rowNum,
        fullName: row.fullName || '',
        ok: false,
        error: validationError,
      });
      continue;
    }

    try {
      const barcode = generateBarcode(year.id);
      const { rows: inserted } = await pool.query(
        `INSERT INTO attendance_students
          (full_name, sex, dob, place_of_birth, guardian_name, contact, photo_url, barcode, class_id, academic_year_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, full_name`,
        [
          String(studentPayload.fullName).trim(),
          studentPayload.sex,
          studentPayload.dob || null,
          studentPayload.placeOfBirth || null,
          String(studentPayload.guardianName).trim(),
          studentPayload.contact || null,
          photoUrl,
          barcode,
          classMatch.id,
          year.id,
        ]
      );
      registered += 1;
      results.push({
        row: row.rowNum,
        fullName: inserted[0].full_name,
        ok: true,
        studentId: inserted[0].id,
      });
    } catch (err) {
      if (photoUrl) await deletePhotoIfLocal(photoUrl);
      failed += 1;
      results.push({
        row: row.rowNum,
        fullName: row.fullName || '',
        ok: false,
        error:
          err.code === '23505'
            ? 'Student barcode conflict — try again'
            : 'Failed to register row',
      });
    }
  }

  return {
    total: parsedRows.length,
    registered,
    failed,
    results,
  };
}

module.exports = {
  EXPECTED_HEADERS,
  parseStudentBulkWorkbook,
  normalizeSex,
  processBulkStudentUpload,
  validateStudentRegistration,
};
