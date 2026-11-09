import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptAnalytics, matchesReceiptChart } from '../src/utils/receiptAnalytics.js';
import { INITIAL_VENDOR_ITEMS, DATA_AS_OF } from '../src/mock/dashboard.js';
import { getFulfillment } from '../src/utils/orderFulfillment.js';

test('receipt chart includes partial arrivals in their receipt and deadline groups', () => {
  const base = { orderedQty: 100, nhap: 0, releasedPoDate: '20/10/2026' };
  const items = [
    { ...base, rowId: 1, nhap: 100, expectedReceiptDate: '01/11/2026' },
    { ...base, rowId: 2, nhap: 40, expectedReceiptDate: '02/11/2026' },
    { ...base, rowId: 3, expectedReceiptDate: '12/11/2026' },
    { ...base, rowId: 4, releasedPoDate: '30/10/2026' },
    { ...base, rowId: 5, expectedReceiptDate: '04/11/2026' },
    { ...base, rowId: 6, expectedReceiptDate: '13/11/2026' },
    { ...base, rowId: 7, releasedPoDate: '29/10/2026', etaDate: '06/11/2026' },
    { ...base, rowId: 8, nhap: null, expectedReceiptDate: '04/11/2026' },
    { ...base, rowId: 9, releasedPoDate: '05/11/2026', expectedReceiptDate: '05/11/2026' },
    { ...base, rowId: 10, nhap: 60, expectedReceiptDate: '06/11/2026' },
  ];
  const result = receiptAnalytics(items, DATA_AS_OF);
  assert.deepEqual(result.groups.map(group => group.count), [3, 3, 1, 2, 1, 2]);
  assert.deepEqual(result.schedule.map(row => row.item.rowId), [2, 5, 9, 10, 3]);
  assert.deepEqual(result.rows.filter(row => matchesReceiptChart(row, 'late')).map(row => row.item.rowId), [2, 5]);
  assert.deepEqual(result.rows.filter(row => matchesReceiptChart(row, 'upcoming')).map(row => row.item.rowId), [3, 9, 10]);
  assert.equal(result.rows.filter(row => matchesReceiptChart(row, 'watch')).length, 5);
  assert.equal(getFulfillment(items[7], DATA_AS_OF).lateReceiptDays, 0);
});

test('original orders with no warehouse dates do not borrow the outbound ETA', () => {
  const result = receiptAnalytics(INITIAL_VENDOR_ITEMS, DATA_AS_OF);
  assert.equal(result.groups.find(group => group.id === 'arrived').count, 2);
  assert.equal(result.groups.find(group => group.id === 'upcoming').count, 0);
  assert.deepEqual(result.schedule, []);
  assert.ok(receiptAnalytics([], DATA_AS_OF).groups.every(group => group.count === 0));
});
