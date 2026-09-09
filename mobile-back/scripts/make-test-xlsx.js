const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow([]);
  ws.addRow([
    'Full Name',
    'Sex',
    'Date of Birth',
    'Place of Birth',
    "Guardian's Name",
    'Contact',
    'Class',
    'ID Card Photo',
  ]);
  ws.addRow([
    'Test Student',
    'Male',
    '2010-01-15',
    'Douala',
    'John Doe',
    '677123456',
    'Form 1',
    '',
  ]);
  const out = path.join(__dirname, '..', 'test-upload.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('Created', out);
})();
