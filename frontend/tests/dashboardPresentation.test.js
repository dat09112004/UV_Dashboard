import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_LAYOUTS, getRoleLayout, presentAlert } from '../src/utils/dashboardPresentation.js';
import { DEBT_COLORS } from '../src/utils/chartColors.js';
import { INITIAL_VENDOR_ITEMS as items, INITIAL_REVENUE_RECORDS as revenue, INITIAL_RECEIVABLES as ar, INITIAL_PAYABLES as ap, DATA_AS_OF } from './fixtures/dashboard.js';
import { classifyProgress, classifyDebt, summarizeCategories, buildAlertQueue, revenueBreakdown, sumBy } from '../src/utils/dashboardMetrics.js';
const orders = items.map(row => classifyProgress(row, DATA_AS_OF));
const receivables = ar.map(row => classifyDebt(row, DATA_AS_OF));
const payables = ap.map(row => classifyDebt(row, DATA_AS_OF));
const alerts = buildAlertQueue(orders, receivables, payables, { includeWarnings: true });

test('CEO sees full company workspace while Sale and Accountant are strictly isolated to their own domains', () => {
  const ceo = getRoleLayout('CEO');
  const sale = getRoleLayout('Sale');
  const accountant = getRoleLayout('Accountant');
  assert.equal(ceo.alertType, 'all');
  assert.equal(sale.alertType, 'orders');
  assert.equal(accountant.alertType, 'finance');
  assert.deepEqual(sale.kpis, ['orders']);
  assert.deepEqual(accountant.kpis, ['receivables', 'payables', 'revenue']);
  assert.ok(!accountant.widgets.some(([id]) => id === 'orders' || id === 'progress'));
  assert.ok(!sale.widgets.some(([id]) => ['receivables', 'payables', 'revenue', 'cash'].includes(id)));
});

test('warnings are visible on demand while critical work stays first and unchanged', () => {
  assert.equal(alerts.filter(a => a.data.priorityRank === 0).length, 16);
  assert.ok(alerts.some(a => a.data.priorityRank === 1));
  assert.ok(alerts.every((a, index) => !index || alerts[index - 1].data.priorityRank <= a.data.priorityRank));
  assert.equal(new Set(Object.values(DEBT_COLORS)).size, 5);
});

test('alert cards identify a specific order, its deadline, blockage and actual next action', () => {
  const alert = alerts.find(a => a.reference === 'PO-2026-109');
  const view = presentAlert(alert, 'Sale');
  assert.equal(view.issue, 'Đến hạn xuất vào ngày theo dõi');
  assert.equal(view.subject, alert.data.vendorItemNo);
  assert.match(view.deadline, /05\/11\/2026/);
  assert.match(view.facts, /Đóng gói 20%/);
  assert.match(view.action, /giao hàng/);
  assert.equal(view.button, 'Mở tiến độ đơn hàng');
  const missing = presentAlert(alerts.find(a => a.reference === 'PO-2026-095A'), 'Sale');
  assert.match(missing.action, /Xác nhận lịch/);
});

test('finance cards expose due amount and a CEO-specific approval action only for pending requests', () => {
  const arAlert = alerts.find(a => a.reference === 'INV-2026-089');
  assert.equal(presentAlert(arAlert, 'Accountant').amount, '68.000.000 VND');
  assert.equal(presentAlert(arAlert, 'Accountant').issue, 'Đến hạn hôm nay');
  const pending = alerts.find(a => a.type === 'payables' && a.data.approvalState === 'Chờ CEO duyệt chi');
  assert.equal(presentAlert(pending, 'CEO').button, 'Xem đề nghị duyệt chi');
  assert.equal(presentAlert(pending, 'Sale').button, 'Mở khoản phải trả');
  const unknown = alerts.find(a => a.data.debtStatus === 'unknown');
  assert.equal(presentAlert(unknown, 'Accountant').deadline, 'Chưa xác định hạn');
  assert.match(presentAlert(unknown, 'Accountant').action, /Tách chứng từ/);
});

test('revenue segments reconcile exactly and isolate overdue/today balances from future debt', () => {
  const stats = summarizeCategories(orders, revenue, receivables);
  assert.equal(sumBy(stats, 'revenueCollected'), 596350000);
  assert.equal(sumBy(stats, 'revenueDue'), 265000000);
  assert.equal(sumBy(stats, 'revenueUpcoming'), 125000000);
  assert.equal(sumBy(stats, 'revenueUnclassified'), 0);
  for (const row of stats) assert.equal(row.revenue, row.revenueCollected + row.revenueDue + row.revenueUpcoming + row.revenueUnclassified);
  const partial = revenueBreakdown(revenue.filter(row => row.priorityRank === 0), receivables);
  assert.equal(partial.revenueDue, 147000000);
  const unmatched = revenueBreakdown([{ docNo: 'NEW', netRevenue: 100, cashCollected: 25 }], []);
  assert.deepEqual(unmatched, { revenueCollected: 25, revenueDue: 0, revenueUpcoming: 0, revenueUnclassified: 75 });
});
