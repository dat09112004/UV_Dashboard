import test from 'node:test';
import assert from 'node:assert/strict';
import { BM41_ORDERS, BM41_REPORT_DATE } from '../src/mock/bm41.js';
import { DEMO_ORDERS, DEMO_FINANCE_BASE, DEMO_TRACKING_KEY, DEMO_FINANCE_KEY } from '../src/mock/bm41Scenarios.js';
import { MOCK_ACCOUNTS } from '../src/mock/accounts.js';
import { classifyDebt, debtSummary, sumBy } from '../src/utils/dashboardMetrics.js';
import { AP_APPROVED, AP_REVIEW, allocateReceipt, loadFinanceState, recordPayablePayment, reviewPayable,
  saveReceipt, splitPayable, unallocatedTotal, validateFinanceState } from '../src/utils/financeWorkflow.js';
import { loadTrackedItems, persistTrackedItem, TRACKING_STORAGE_KEY } from '../src/utils/orderFulfillment.js';

const accountant = MOCK_ACCOUNTS.find(row => row.role === 'Accountant');
const ceo = MOCK_ACCOUNTS.find(row => row.role === 'CEO');
const seed = DEMO_FINANCE_BASE;
const summary = rows => debtSummary(rows.map(row => classifyDebt(row, BM41_REPORT_DATE)));

test('demo preserves BM41 purchasing data and reconciles revenue, payments and balances', () => {
  validateFinanceState(seed);
  for (const source of BM41_ORDERS) {
    const row = DEMO_ORDERS.find(order => order.rowId === source.rowId);
    for (const key of ['vendorNo', 'poId', 'orderedQty', 'releasedPoDate', 'expectedReceiptDate', 'unitPriceVnd', 'totalValueVnd']) {
      assert.equal(row[key], source[key]);
    }
    assert.equal(sumBy(seed.revenue.filter(doc => doc.poLineId === row.rowId), 'shippedQty'), row.deliveredQty ?? 0);
  }
  assert.equal(sumBy(seed.revenue, 'netRevenue'), 52000000);
  assert.equal(sumBy(seed.revenue, 'cashCollected'), 24000000);
  assert.equal(sumBy(seed.allocations, 'amount'), 24000000);
  assert.equal(unallocatedTotal(seed), 6000000);
  assert.deepEqual(summary(seed.receivables), { total: 28000000, overdue: 10000000, today: 9000000, upcoming: 9000000, unknown: 0, due: 19000000 });
  assert.deepEqual(summary(seed.payables), { total: 52200000, overdue: 10000000, today: 12800000, upcoming: 26200000, unknown: 3200000, due: 22800000 });
});

test('the seeded documents support reconciliation, allocation, approval, payment and splitting', () => {
  const receipt = seed.receipts.find(row => !row.customerName);
  let state = saveReceipt(seed, accountant, { ...receipt, customerName: 'Demo Retail B' }, BM41_REPORT_DATE);
  state = allocateReceipt(state, accountant, { receiptId: receipt.id, debtId: 'DEMO-AR-B1', amount: 4000000, date: BM41_REPORT_DATE }, BM41_REPORT_DATE);
  assert.equal(state.receivables.find(row => row.id === 'DEMO-AR-B1').remaining, 6000000);
  state = reviewPayable(state, ceo, { id: 'DEMO-AP-03', approve: true, note: 'Test approval' }, BM41_REPORT_DATE);
  assert.equal(state.payables.find(row => row.id === 'DEMO-AP-03').approvalState, AP_APPROVED);
  state = recordPayablePayment(state, accountant, {
    id: 'DEMO-AP-03', amount: 1000000, date: BM41_REPORT_DATE, reference: 'DEMO-TEST-CHI',
  }, BM41_REPORT_DATE);
  assert.equal(state.payables.find(row => row.id === 'DEMO-AP-03').remaining, 11800000);
  const totalBeforeSplit = summary(state.payables).total;
  state = splitPayable(state, accountant, { id: 'DEMO-AP-GROUP', note: 'Test split',
    parts: {
      '15090': { docNo: 'DEMO-BILL-GROUP-A', originalAmount: 19000000, dueDate: '12/11/2026' },
      'DEMO-NCC-02': { docNo: 'DEMO-BILL-GROUP-B', originalAmount: 4000000, dueDate: '12/11/2026' },
    },
  }, DEMO_ORDERS);
  assert.equal(summary(state.payables).total, totalBeforeSplit);
  assert.ok(state.payables.filter(row => row.splitSourceDocNo).every(row => row.approvalState === AP_REVIEW));
  assert.equal(state.payableSplitSources[0].docNo, 'DEMO-BILL-GROUP');
  validateFinanceState(state);
});

test('the seeded tracking history is visible and previous demo data does not override the scenario', () => {
  const oldTracking = JSON.stringify({ version: 1, items: { 3500002: { nhap: 1 } } });
  const data = new Map([[TRACKING_STORAGE_KEY, oldTracking]]);
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const [row] = loadTrackedItems(DEMO_ORDERS, storage, DEMO_TRACKING_KEY);
  assert.equal(row.nhap, 10000);
  assert.equal(row.trackingHistory.length, 1);
  assert.ok(persistTrackedItem(row, storage, DEMO_TRACKING_KEY));
  assert.equal(data.get(TRACKING_STORAGE_KEY), oldTracking);
  assert.equal(loadFinanceState(seed, storage, DEMO_FINANCE_KEY).revision, 0);
});
