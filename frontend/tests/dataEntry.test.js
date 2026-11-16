import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { ENTRY_SHEETS } from '../src/features/dataEntry/schema.js';
import { clipboardRows, readEntryDraft, storeEntryDraft } from '../src/features/dataEntry/drafts.js';
import { downloadEntryWorkbook, readEntrySheet } from '../src/features/dataEntry/workbook.js';

const rows = (...values) => values.map(value => ({ values: value }));

test('a PO workbook recognizes the BM41 headers and month without year', () => {
  const book = new ExcelJS.Workbook();
  const page = book.addWorksheet('PO Released');
  page.addRow(['RELEASED NOTICE']);
  page.addRow(['Supplier Code', 'Supplier Name', ' SAP ', 'Merchandise Category', 'Item Description', 'Unit', 'Qty', 'Released', 'Req.', 'Unit Price', 'Total Amount']);
  page.addRow([15090, 'MOC LAM PHAT', 'UV-Intl-3500002', 210101080, 'Túi vải', 'pcs', 10000, 'Oct 17th', 'Nov 05th', 1600, 16000000]);
  page.addRow(['Sincerely']);
  page.mergeCells('A4:K6');
  const imported = readEntrySheet(page, ENTRY_SHEETS[0], 500, '2026');
  assert.equal(imported.length, 1);
  assert.equal(imported[0].line, 3);
  assert.equal(imported[0].values.poId, 'UV-Intl-3500002');
  assert.equal(imported[0].values.releasedPoDate, '2026-10-17');
  assert.equal(imported[0].values.expectedReceiptDate, '2026-11-05');
  assert.equal(imported[0].values.orderedQty, 10000);
});

test('Excel imports formatted percentages and reads numeric dates with the workbook epoch', async () => {
  const book = new ExcelJS.Workbook();
  book.properties.date1904 = true;
  const page = book.addWorksheet('PO');
  page.addRow(['Mã dòng PO', 'Sản xuất (%)', 'Đóng gói (%)', 'Dự kiến về kho']);
  const serial = (Date.UTC(2026, 10, 7) - Date.UTC(1904, 0, 1)) / 86400000;
  page.addRow([3500003, 0.8, 40, serial]);
  page.getCell('B2').numFmt = '0%';
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await book.xlsx.writeBuffer());
  const [draft] = readEntrySheet(reopened.worksheets[0], ENTRY_SHEETS[0], 500);
  assert.deepEqual(draft.values, { rowId: 3500003, onProcessPct: 80, packagingPct: 40, expectedReceiptDate: '2026-11-07' });
});

test('English Excel exports localize worksheet, headers and status while preserving document IDs', async context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { createObjectURL, revokeObjectURL } = URL;
  context.after(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  let file;
  let download;
  URL.createObjectURL = blob => { file = blob; return 'blob:test-export'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { body: { append() {} }, createElement: () => ({ click() { download = this.download; }, remove() {} }) };
  const schema = ENTRY_SHEETS.find(sheet => sheet.id === 'tasks');
  await downloadEntryWorkbook(schema, [...schema.columns, ...schema.extra],
    [{ title: 'PO-3500003', status: 'Hoàn tất' }], 'en');
  assert.equal(download, 'Tasks.xlsx');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet('Tasks');
  assert.equal(sheet.getCell('A1').value, 'Task title');
  assert.equal(sheet.getCell('A2').value, 'PO-3500003');
  assert.equal(sheet.getCell('G2').value, 'Complete');
  assert.equal(readEntrySheet(sheet, schema, 500)[0].values.title, 'PO-3500003');
});

test('clipboard paste preserves trailing blank cells and entry draft is scoped by account', context => {
  assert.deepEqual(clipboardRows('PO\t\r\nNEXT\tA\r\n'), [['PO', ''], ['NEXT', 'A']]);
  const store = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key),
  } });
  context.after(() => descriptor ? Object.defineProperty(globalThis, 'sessionStorage', descriptor) : delete globalThis.sessionStorage);
  const draft = { sheets: { orders: rows({ rowId: 3500003, nhap: 8000 }) }, orderBaseline: [{ rowId: 3500003, trackingVersion: 1 }] };
  assert.ok(storeEntryDraft('sale', draft));
  assert.deepEqual(readEntryDraft('sale'), draft);
  assert.deepEqual(readEntryDraft('admin'), { sheets: {} });
  assert.ok(storeEntryDraft('sale', { sheets: {} }));
  assert.deepEqual(readEntryDraft('sale'), { sheets: {} });
});
