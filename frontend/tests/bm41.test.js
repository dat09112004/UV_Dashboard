import test from 'node:test';
import assert from 'node:assert/strict';
import { BM41_ORDERS, BM41_OPENING_DATE, BM41_REPORT_DATE, BM41_FINANCE_STORAGE_KEY } from '../src/mock/bm41.js';
import { classifyProgress, summarizeCategories } from '../src/utils/dashboardMetrics.js';
import { receiptAnalytics } from '../src/utils/receiptAnalytics.js';
import { deliveryAnalytics } from '../src/utils/deliveryAnalytics.js';
import { getFulfillment, loadTrackedItems, updateProgressRecord } from '../src/utils/orderFulfillment.js';
import { FINANCE_STORAGE_KEY, initialFinanceState, loadFinanceState } from '../src/utils/financeWorkflow.js';

test('BM41 order references, dates, quantity and purchase value match the source', () => {
  assert.deepEqual(BM41_ORDERS.map(row => [row.poId, row.expectedReceiptDate, row.unitPriceVnd]), [
    ['UV-Intl-3500002', '25/10/2026', 1600],
    ['UV-Intl-3500003', '05/11/2026', 1600],
    ['UV-Intl-3500004', '15/11/2026', 1600],
    ['UV-Intl-3500005', '30/11/2026', 1600],
    ['UV-Intl-3500006', '05/11/2026', 1900],
  ]);
  assert.equal(BM41_ORDERS.reduce((total, row) => total + row.orderedQty, 0), 50000);
  assert.equal(BM41_ORDERS.reduce((total, row) => total + row.totalValueVnd, 0), 83000000);
  assert.ok(BM41_ORDERS.every(row => row.unitPriceVnd * row.orderedQty === row.totalValueVnd));
});

test('BM41 flags pending receipts by requested date without assuming actual receipts or customer delivery', () => {
  const rows = loadTrackedItems(BM41_ORDERS, null);
  const progress = rows.map(row => classifyProgress(row, BM41_REPORT_DATE));
  assert.equal(progress.filter(row => row.priorityRank === 0).length, 3);
  assert.ok(progress.every(row => row.nhap === null && row.deliveredQty === null));
  assert.equal(receiptAnalytics(rows, BM41_REPORT_DATE).groups.find(group => group.id === 'scheduled').count, 2);
  assert.equal(deliveryAnalytics(progress, BM41_REPORT_DATE).attention.length, 0);
  assert.equal(summarizeCategories(rows, [], [], ['210101080'])[0].avgOnProcess, null);
  assert.equal(classifyProgress(rows[1], '2026-11-05').alertLabel, 'Đến hạn nhận hàng vào ngày theo dõi');
  assert.equal(getFulfillment({ ...rows[0], nhap: 10000 }, BM41_REPORT_DATE).lateReceiptDays, 0);
});

test('updating BM41 receipt data preserves unknown production and customer delivery', () => {
  const [order] = loadTrackedItems(BM41_ORDERS, null);
  const sale = { id: 'test', name: 'Test', role: 'Sale', status: 'active', permissions: ['orders.update'] };
  const values = { orderedQty: 10000, nhap: 10000, unit: 'pcs', expectedReceiptDate: order.expectedReceiptDate,
    onProcessPct: '', packagingPct: '', changeReason: 'Xác nhận nhập kho theo chứng từ' };
  const updated = updateProgressRecord(order, sale, values, BM41_REPORT_DATE);
  assert.equal(updated.onProcessPct, null);
  assert.equal(updated.deliveredQty, null);
  assert.equal(classifyProgress(updated, BM41_REPORT_DATE).priorityRank, 2);
});

test('BM41 does not read the opening finance balances from the previous demo', () => {
  const old = initialFinanceState([], [], [], BM41_OPENING_DATE);
  const base = initialFinanceState([], [], [], BM41_OPENING_DATE, { includeOpeningReceipt: false });
  const store = { getItem: key => key === FINANCE_STORAGE_KEY ? JSON.stringify(old) : null };
  const current = loadFinanceState(base, store, BM41_FINANCE_STORAGE_KEY);
  for (const key of ['revenue', 'receivables', 'payables', 'receipts']) assert.deepEqual(current[key], []);
});
