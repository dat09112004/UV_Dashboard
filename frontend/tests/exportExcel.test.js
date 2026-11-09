import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportExcel } from '../src/utils/exportExcel.js';

test('export produces a readable XLSX with numeric values and localized text and filters', async () => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let exportedBlob;
  let clicked = false;
  let filename;
  URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:export-test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    createElement: () => ({ click() { clicked = true; filename = this.download; }, remove() {} }),
    body: { appendChild() {} },
  };
  try {
    await exportExcel({ Phai_thu: [{ docNo: 'INV-A', remaining: 50000000, customerName: 'Khách hàng mẫu' }], Trong: [] }, { 'Ngày công nợ': '05/11/2026' });
    assert.ok(clicked);
    assert.equal(exportedBlob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await exportedBlob.arrayBuffer());
    assert.equal(book.getWorksheet('Phai_thu').getRow(2).getCell(2).value, 50000000);
    assert.equal(book.getWorksheet('Phai_thu').getRow(2).getCell(3).value, 'Khách hàng mẫu');
    assert.equal(book.getWorksheet('Bo loc').getCell('B1').value, '05/11/2026');
    assert.match(book.getWorksheet('Trong').getCell('A1').value, /Không có dữ liệu/);

    await exportExcel({ Phai_thu: [{ docNo: 'INV-A', remaining: 50000000, agingBucket: 'Quá hạn 1–30 ngày', customerName: 'Khách hàng mẫu', vendorRef: '15090 - HKD MỘC LAM PHÁT' }] },
      { 'Phân hệ': 'receivables', 'Nhóm công nợ': 'overdue' }, 'en');
    assert.equal(filename, 'Operations_report.xlsx');
    const englishBook = new ExcelJS.Workbook();
    await englishBook.xlsx.load(await exportedBlob.arrayBuffer());
    const sheet = englishBook.getWorksheet('Receivables');
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['Document number', 'Outstanding', 'Aging bucket', 'Customer', 'Supplier reference']);
    assert.deepEqual(sheet.getRow(2).values.slice(1), ['INV-A', 50000000, '1–30 days overdue', 'Khách hàng mẫu', '15090 - Moc Lam Phat Household Business']);
    assert.equal(englishBook.getWorksheet('Filters').getCell('B1').value, 'Accounts receivable');
    assert.equal(englishBook.getWorksheet('Filters').getCell('B2').value, 'Overdue');
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
