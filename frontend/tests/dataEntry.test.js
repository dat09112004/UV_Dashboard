import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { canOpenSection, homeSection } from '../src/utils/roles.js';
import { DIRECTORY_KEY, applyDirectoryAction, readDirectory, directoryProfiles } from '../src/features/users/services/demoDirectory.js';
import { ENTRY_SHEETS, canReadSheet, canWriteSheet } from '../src/features/dataEntry/schema.js';
import { clipboardRows, readEntryDraft, storeEntryDraft } from '../src/features/dataEntry/drafts.js';
import { saveEntryBatch } from '../src/features/dataEntry/service.js';
import { downloadEntryWorkbook, readEntrySheet } from '../src/features/dataEntry/workbook.js';
import { DEMO_FINANCE_KEY, DEMO_ORDERS, DEMO_TRACKING_KEY } from '../src/mock/bm41Scenarios.js';

const now = new Date('2026-11-06T09:00:00Z');
const mockBrowser = () => {
  const records = new Map();
  return { storage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) },
    locks: { request: (_, run) => run() }, now };
};
const rows = (...values) => values.map(value => ({ values: value }));

test('account navigation can restrict staff and never grants pages beyond the assigned role', async () => {
  const browser = mockBrowser();
  const state = readDirectory(browser.storage);
  const data = await applyDirectoryAction(state, 'user-admin', 'update-account', {
    id: 'user-sale', role: 'Sale', status: 'active', navigation: ['overview', 'orders', 'tasks'],
  }, now);
  browser.storage.setItem(DIRECTORY_KEY, JSON.stringify(data));
  const sale = directoryProfiles(readDirectory(browser.storage)).find(account => account.id === 'user-sale');
  assert.ok(canOpenSection(sale, 'orders'));
  assert.ok(canOpenSection(sale, 'data-entry'));
  assert.equal(canOpenSection(sale, 'overview'), false);
  assert.equal(canOpenSection(sale, 'payables'), false);
  assert.equal(homeSection(sale), 'orders');
  assert.ok(canWriteSheet(sale, ENTRY_SHEETS[0]));
  assert.ok(!canReadSheet(sale, ENTRY_SHEETS.find(sheet => sheet.id === 'payables')));
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'update-account', {
    id: 'user-sale', role: 'Sale', status: 'active', navigation: ['users'],
  }, now), /ngoài quyền/);
  await assert.rejects(saveEntryBatch('user-sale', 'payables', rows({ docNo: 'X' }), browser), /không có quyền/);
});

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
  assert.equal(imported[0].values.orderedQty, '10000');
});

test('PO creation, ordinary progress edits, and workbook updates share the same saved data', async () => {
  const browser = mockBrowser();
  const first = await saveEntryBatch('user-sale', 'orders', rows({
    poId: 'DEMO-NEW-PO', vendorItemNo: 'Mặt hàng thử', vendorNo: 'NCC-1', vendorName: 'Nhà cung cấp thử',
    category: 'Test', releasedPoDate: '2026-11-02', unit: 'pcs', orderedQty: 40, unitPriceVnd: 20000,
  }), browser);
  const po = first.items.find(item => item.poId === 'DEMO-NEW-PO');
  assert.equal(po.totalValueVnd, 800000);
  assert.equal(po.orderedQty, 40);
  const updated = await saveEntryBatch('user-sale', 'orders', rows({ rowId: po.rowId, nhap: 20 }), browser);
  assert.equal(updated.items.find(item => item.rowId === po.rowId).nhap, 20);
  assert.ok(browser.storage.getItem(DEMO_TRACKING_KEY));
  const stale = await saveEntryBatch('user-sale', 'orders', [{ expectedVersion: po.trackingVersion, values: { rowId: po.rowId, nhap: 25 } }], browser);
  assert.match(stale.issues[0].message, /cửa sổ khác/);
  const snapshot = browser.storage.getItem(DEMO_TRACKING_KEY);
  const batch = await saveEntryBatch('user-sale', 'orders', rows({ rowId: po.rowId, nhap: 30 }, { rowId: 3500002, nhap: 99999 }), browser);
  assert.equal(batch.issues[0].line, 2);
  assert.equal(browser.storage.getItem(DEMO_TRACKING_KEY), snapshot);
});

test('finance batches validate atomically and preserve invoice, receipt and payable rules', async () => {
  const browser = mockBrowser();
  const invoice = { poId: 'UV-Intl-3500002', customerName: 'Demo Retail A', recordDate: '2026-11-06',
    dueDate: '2026-11-12', shippedQty: 1, netRevenue: 150000, basis: 'Hóa đơn thử' };
  const failed = await saveEntryBatch('user-accountant', 'revenue', rows({ ...invoice, docNo: 'INV-NEW-1' },
    { ...invoice, docNo: 'INV-NEW-1' }), browser);
  assert.equal(failed.issues[0].line, 2);
  assert.equal(browser.storage.getItem(DEMO_FINANCE_KEY), null);
  const saved = await saveEntryBatch('user-accountant', 'revenue', rows({ ...invoice, docNo: 'INV-NEW-1' },
    { ...invoice, docNo: 'INV-NEW-2' }), browser);
  assert.equal(saved.finance.revision, 2);
  assert.equal(saved.finance.receivables.find(row => row.docNo === 'INV-NEW-2').remaining, 150000);
  await saveEntryBatch('user-accountant', 'receipts', rows({ reference: 'RCPT-NEW', customerName: 'Demo Retail A', date: '2026-11-06', amount: 150000 }), browser);
  const allocation = { entryReference: 'ALLOC-TEST', receiptReference: 'RCPT-NEW', docNo: 'INV-NEW-2', date: '2026-11-06', amount: 120000 };
  const allocated = await saveEntryBatch('user-accountant', 'allocations', rows(allocation), browser);
  assert.equal(allocated.finance.receivables.find(row => row.docNo === 'INV-NEW-2').remaining, 30000);
  const repeated = await saveEntryBatch('user-accountant', 'allocations', rows(allocation), browser);
  assert.match(repeated.issues[0].message, /đã tồn tại/);
  const bill = await saveEntryBatch('user-accountant', 'payables', rows({ poId: 'UV-Intl-3500002', docNo: 'BILL-NEW', originalAmount: 42000 }), browser);
  assert.equal(bill.finance.payables.find(row => row.docNo === 'BILL-NEW').remaining, 42000);
  const unapproved = await saveEntryBatch('user-accountant', 'payments', rows({ docNo: 'BILL-NEW', reference: 'PAY-NEW', amount: 42000, date: '2026-11-06' }), browser);
  assert.match(unapproved.issues[0].message, /chưa được CEO duyệt/);
});

test('an Admin can import assigned work, with duplicate protection', async () => {
  const browser = mockBrowser();
  const employee = directoryProfiles(readDirectory(browser.storage)).find(account => account.id === 'user-sale');
  const draft = rows({ title: 'Việc nhập thử', description: 'Thử nghiệm bảng công việc', assigneeEmail: employee.email,
    deadline: '2026-11-10', requiresFile: 'Có' });
  const imported = await saveEntryBatch('user-admin', 'tasks', draft, browser);
  assert.equal(imported.directory.tasks.at(-1).assigneeId, employee.id);
  assert.equal(imported.directory.tasks.at(-1).requiresFile, true);
  const repeated = await saveEntryBatch('user-admin', 'tasks', draft, browser);
  assert.match(repeated.issues[0].message, /đã được giao/);
});

test('an imported PO draft cannot replace a revision saved after the draft was prepared', async () => {
  const browser = mockBrowser();
  const book = new ExcelJS.Workbook();
  const page = book.addWorksheet('PO');
  page.addRow(['Mã dòng PO', 'SL đã về kho']);
  page.addRow([3500003, 8000]);
  const draft = readEntrySheet(page, ENTRY_SHEETS[0], 500);
  const baseline = DEMO_ORDERS.map(({ rowId, poId, vendorItemNo }) => ({ rowId, poId, vendorItemNo, trackingVersion: null }));
  await saveEntryBatch('user-sale', 'orders', rows({ rowId: 3500003, nhap: 9000 }), browser);
  const saved = browser.storage.getItem(DEMO_TRACKING_KEY);
  const stale = await saveEntryBatch('user-sale', 'orders', draft, { ...browser, orderBaseline: baseline });
  assert.equal(stale.issues[0].line, 2);
  assert.match(stale.issues[0].message, /cửa sổ khác/);
  assert.equal(browser.storage.getItem(DEMO_TRACKING_KEY), saved);
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
  assert.deepEqual(draft.values, { rowId: '3500003', onProcessPct: '80', packagingPct: '40', expectedReceiptDate: '2026-11-07' });
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

test('clipboard paste preserves trailing blank cells and accepts Excel percentages and VND', async () => {
  assert.deepEqual(clipboardRows('PO\t\r\nNEXT\tA\r\n'), [['PO', ''], ['NEXT', 'A']]);
  const browser = mockBrowser();
  const order = await saveEntryBatch('user-sale', 'orders', rows({ rowId: 3500003, onProcessPct: '80%', packagingPct: '40,5%' }), browser);
  const changed = order.items.find(row => row.rowId === 3500003);
  assert.equal(changed.onProcessPct, 80);
  assert.equal(changed.packagingPct, 40.5);
  const receipt = await saveEntryBatch('user-accountant', 'receipts', rows({
    reference: 'PASTE-VND', customerName: 'Demo Retail A', date: '2026-11-06', amount: '1.000.000 VND',
  }), browser);
  assert.equal(receipt.finance.receipts.at(-1).amount, 1000000);
});

test('entry draft survives a remount with its baseline, scoped by account', context => {
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

test('Vietnamese formatted PO quantity 1.000 and unit price 1.600 VND save as 1000 and 1600000 with ambiguity warning', async () => {
  const browser = mockBrowser();
  const created = await saveEntryBatch('user-sale', 'orders', rows({
    poId: 'PO-VN-1000', vendorItemNo: 'Túi mẫu VN', vendorNo: '15090', vendorName: 'Nhà cung cấp VN',
    category: 'Recycle Bag', releasedPoDate: '2026-11-02', unit: 'pcs', orderedQty: '1.000', unitPriceVnd: '1.600 VND',
  }), browser);
  assert.equal(created.issues, undefined);
  const po = created.items.find(item => item.poId === 'PO-VN-1000');
  assert.equal(po.orderedQty, 1000);
  assert.equal(po.unitPriceVnd, 1600);
  assert.equal(po.totalValueVnd, 1600000);
  assert.ok(created.warnings?.some(w => w.key === 'orderedQty' && /1\.000/.test(w.message)));

  const deltaUpdate = await saveEntryBatch('user-sale', 'orders', [
    { progressMode: 'today', values: { rowId: po.rowId, nhap: '400', changeReason: 'Nhập đợt 1' } },
  ], browser);
  assert.equal(deltaUpdate.items.find(item => item.rowId === po.rowId).nhap, 400);

  const secondDelta = await saveEntryBatch('user-sale', 'orders', [
    { progressMode: 'today', values: { rowId: po.rowId, nhap: '600', changeReason: 'Nhập đợt 2' } },
  ], browser);
  assert.equal(secondDelta.items.find(item => item.rowId === po.rowId).nhap, 1000);

  const ambiguous = await saveEntryBatch('user-sale', 'orders', rows({
    poId: 'PO-AMBIGUOUS', vendorItemNo: 'Túi lỗi', vendorNo: '15090', vendorName: 'Nhà cung cấp VN',
    category: 'Recycle Bag', releasedPoDate: '2026-11-02', unit: 'pcs', orderedQty: '1.00', unitPriceVnd: '1600',
  }), browser);
  assert.ok(ambiguous.issues?.length > 0);
});
