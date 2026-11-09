import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryAnalytics, deliveryRow, matchesDeliveryChart } from '../src/utils/deliveryAnalytics.js';
import { INITIAL_VENDOR_ITEMS, DATA_AS_OF } from '../src/mock/dashboard.js';
const base = { rowId: 1, orderedQty: 100, nhap: 100, unit: 'PCS', deliveredQty: 0, manualPriorityRank: 2, priorityRank: 2, onProcessPct: 100, packagingPct: 100, releasedPoDate: '01/11/2026', shipDateEtd: '04/11/2026', actualShipDate: '04/11/2026', etaDate: '20/11/2026' };

test('delivery distribution is exclusive and never interprets missing confirmations as zero', () => {
  const rows = [base, { ...base, rowId: 2, deliveredQty: 40, actualDeliveryDate: '05/11/2026' }, { ...base, rowId: 3, deliveredQty: 100, actualDeliveryDate: '05/11/2026' }, { ...base, rowId: 4, deliveredQty: null }, { ...base, rowId: 5, deliveredQty: 100, actualDeliveryDate: '' }];
  const result = deliveryAnalytics(rows, '2026-11-05');
  assert.equal(result.groups.reduce((sum, g) => sum + g.count, 0), 5);
  assert.deepEqual(result.groups.map(g => g.count), [1, 1, 1, 2]);
  assert.equal(result.attention.some(r => r.item.rowId === 2), false);
  assert.equal(deliveryRow({ ...base, deliveredQty: 100, actualDeliveryDate: 'invalid' }, '2026-11-05').delivery, 'unconfirmed');
});

test('overdue, due-today and near-due orders enter different actionable risk buckets', () => {
  assert.equal(deliveryRow({ ...base, etaDate: '03/11/2026' }, '2026-11-05').risk, 'late');
  assert.equal(deliveryRow({ ...base, etaDate: '05/11/2026' }, '2026-11-05').risk, 'today');
  assert.equal(deliveryRow({ ...base, etaDate: '07/11/2026' }, '2026-11-05').risk, 'warning');
  assert.equal(deliveryRow(base, '2026-11-05').risk, 'normal');
});

test('warehouse delays do not create outbound alerts or mask an outbound deadline', () => {
  const partialReceipt = { ...base, nhap: 40, expectedReceiptDate: '04/11/2026' };
  const normal = deliveryRow(partialReceipt, DATA_AS_OF);
  assert.equal(normal.state.lateReceiptDays, 1);
  assert.equal(normal.risk, 'normal');
  assert.equal(normal.state.label, 'Chưa giao');
  const due = deliveryRow({ ...partialReceipt, etaDate: '05/11/2026' }, DATA_AS_OF);
  assert.equal(due.risk, 'today');
  assert.equal(due.reason, 'Đến hạn giao vào ngày theo dõi');
  assert.equal(deliveryRow({ ...partialReceipt, etaDate: '04/11/2026' }, DATA_AS_OF).risk, 'late');
});

test('confirmed delivery closes automatic delay but does not hide unresolved manual warnings', () => {
  const row = { ...base, deliveredQty: 100, actualDeliveryDate: '03/11/2026', etaDate: '03/11/2026' };
  assert.equal(deliveryRow(row, '2026-11-05').risk, 'normal');
  assert.equal(deliveryRow({ ...row, manualPriorityRank: 0, manualAlertReason: 'Đang đối soát' }, '2026-11-05').risk, 'critical');
});

test('chart filtering returns the exact underlying rows and remains valid for an empty scope', () => {
  const result = deliveryAnalytics([base, { ...base, rowId: 2, etaDate: '03/11/2026' }], '2026-11-05');
  assert.deepEqual(result.rows.filter(r => matchesDeliveryChart(r, 'risk:late')).map(r => r.item.rowId), [2]);
  assert.equal(result.rows.filter(r => matchesDeliveryChart(r, 'delivery:not_delivered')).length, 2);
  assert.equal(result.rows.filter(r => matchesDeliveryChart(r, 'all')).length, 2);
  assert.equal(deliveryAnalytics([], '2026-11-05').attention.length, 0);
});

test('source rows without confirmed delivery stay unconfirmed while ETD alarms remain actionable', () => {
  const result = deliveryAnalytics(INITIAL_VENDOR_ITEMS, DATA_AS_OF);
  assert.equal(result.total, 20);
  assert.equal(result.groups.find(g => g.id === 'unconfirmed').count, 20);
  assert.ok(result.attention.some(r => r.item.poId === 'PO-2026-092' && r.risk === 'late'));
});
