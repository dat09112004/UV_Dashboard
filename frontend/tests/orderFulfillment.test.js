import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_VENDOR_ITEMS, DATA_AS_OF } from '../src/mock/dashboard.js';
import { classifyProgress } from '../src/utils/dashboardMetrics.js';
import { loadTrackedItems, persistTrackedItem, validateTracking, getFulfillment, fulfillmentSummary, matchesFulfillment, TRACKING_STORAGE_KEY, formatPercent } from '../src/utils/orderFulfillment.js';
const source = INITIAL_VENDOR_ITEMS[0];
const ready = { ...source, orderedQty: 10000, unit: 'PCS', nhap: 9000, deliveredQty: 4500, expectedReceiptDate: '06/11/2026', actualDeliveryDate: '04/11/2026' };
const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, value) => map.set(k, value) }; };

test('legacy incoming quantity is retained; sold quantity is never inferred as confirmed delivery', () => {
 const items = loadTrackedItems(INITIAL_VENDOR_ITEMS, memory());
 assert.equal(items[0].nhap, 9000); assert.equal(items[0].ban, 9000);
 assert.equal(items[0].orderedQty, null); assert.equal(items[0].deliveredQty, null);
 const state = getFulfillment(items[0], DATA_AS_OF);
 assert.equal(state.receivedPct, null); assert.equal(state.deliveredPct, null);
 assert.equal(formatPercent(state.receivedPct), '—');
 assert.deepEqual(fulfillmentSummary(items, DATA_AS_OF), { released: 20, arrived: 2, delivered: 0, partial: 0, unconfirmed: 20, missing: 20 });
});

test('received and delivered percentages use ordered quantity as denominator and remain independent', () => {
 const state = getFulfillment(ready, DATA_AS_OF);
 assert.equal(state.receivedPct, 90); assert.equal(state.deliveredPct, 45);
 assert.equal(state.remainingReceipt, 1000); assert.equal(state.remainingDelivery, 5500);
 assert.equal(state.label, 'Đang giao một phần');
 assert.equal(matchesFulfillment(ready, 'partial_receipt', DATA_AS_OF), true);
 assert.equal(matchesFulfillment(ready, 'partial_delivery', DATA_AS_OF), true);
 assert.equal(matchesFulfillment(ready, 'delivered', DATA_AS_OF), false);
});

test('unknown delivery differs from an explicitly confirmed zero', () => {
 assert.equal(getFulfillment({ ...ready, deliveredQty: null }, DATA_AS_OF).deliveredPct, null);
 assert.equal(getFulfillment({ ...ready, deliveredQty: 0 }, DATA_AS_OF).deliveredPct, 0);
 assert.equal(getFulfillment({ ...ready, orderedQty: null }, DATA_AS_OF).receivedPct, null);
 assert.equal(getFulfillment({ ...ready, orderedQty: 0 }, DATA_AS_OF).deliveredPct, null);
});

test('validation rejects negative, non-finite, over-ordered and unavailable delivered quantities', () => {
 assert.throws(() => validateTracking(source, { ...ready, orderedQty: -2 }));
 assert.throws(() => validateTracking(source, { ...ready, orderedQty: 0 }));
 assert.throws(() => validateTracking(source, { ...ready, nhap: Infinity }));
 assert.throws(() => validateTracking(source, { ...ready, nhap: 11000 }));
 assert.throws(() => validateTracking(source, { ...ready, deliveredQty: 10001 }));
 assert.throws(() => validateTracking(source, { ...ready, deliveredQty: 9500 }));
 assert.throws(() => validateTracking(source, { ...ready, unit: '' }));
 assert.equal(validateTracking(source, ready).deliveredQty, 4500);
});

test('delivery can use supplied opening inventory without inventing incoming goods', () => {
 const opening = INITIAL_VENDOR_ITEMS.find(row => row.tonDau === 323);
 const result = validateTracking(opening, { ...opening, orderedQty: 323, deliveredQty: 323, unit: 'PCS', actualDeliveryDate: '05/11/2026' }, DATA_AS_OF);
 assert.equal(result.nhap, 0); assert.equal(result.deliveredQty, 323);
 const state = getFulfillment({ ...opening, ...result }, DATA_AS_OF);
 assert.equal(state.receivedPct, 0); assert.equal(state.deliveredPct, 100); assert.equal(state.label, 'Đã giao đủ');
});

test('invalid date sequence and future confirmations are rejected', () => {
 assert.throws(() => validateTracking(source, { ...ready, expectedReceiptDate: '31/02/2026' }));
 assert.throws(() => validateTracking(source, { ...ready, expectedReceiptDate: '20/11/2026' }));
 assert.throws(() => validateTracking(source, { ...ready, actualDeliveryDate: '01/09/2026' }));
 assert.throws(() => validateTracking(source, { ...ready, deliveredQty: 0 }));
 assert.throws(() => validateTracking(source, { ...ready, actualDeliveryDate: '06/11/2026' }, DATA_AS_OF));
 assert.equal(validateTracking(source, { ...ready, actualDeliveryDate: '2026-11-04' }, DATA_AS_OF).actualDeliveryDate, '04/11/2026');
});

test('late arrival and delivery are flagged, while missing confirmation is described as uncertainty', () => {
 const incomingLate = { ...ready, expectedReceiptDate: '03/11/2026' };
 assert.equal(getFulfillment(incomingLate, DATA_AS_OF).lateReceiptDays, 2);
 const deliveryLate = { ...ready, etaDate: '04/11/2026' };
 assert.equal(getFulfillment(deliveryLate, DATA_AS_OF).label, 'Trễ giao 1 ngày');
 assert.match(getFulfillment({ ...deliveryLate, deliveredQty: null }, DATA_AS_OF).label, /chưa xác nhận/);
 const complete = { ...ready, orderedQty: 9000, deliveredQty: 9000 };
 assert.equal(getFulfillment(complete, '15/11/2026').label, 'Đã giao đủ');
 assert.equal(getFulfillment({ ...complete, actualDeliveryDate: '' }, DATA_AS_OF).label, 'Đã giao đủ, thiếu ngày xác nhận');
});

test('tracking updates persist and reload without changing original financial data or original mock records', () => {
 const storage = memory();
 assert.ok(persistTrackedItem({ ...ready, role: 'CEO', revenueVnd: 1 }, storage));
 const restored = loadTrackedItems(INITIAL_VENDOR_ITEMS, storage)[0];
 assert.equal(restored.orderedQty, 10000); assert.equal(restored.deliveredQty, 4500);
 assert.equal(restored.revenueVnd, source.revenueVnd); assert.equal(restored.role, undefined);
 assert.equal(source.orderedQty, undefined); assert.equal(source.nhap, 9000);
 storage.setItem(TRACKING_STORAGE_KEY, '{broken');
 assert.equal(loadTrackedItems(INITIAL_VENDOR_ITEMS, storage)[0].orderedQty, null);
 storage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ version: 1, items: { 1: { ...ready, deliveredQty: 20000 } } }));
 assert.equal(loadTrackedItems(INITIAL_VENDOR_ITEMS, storage)[0].deliveredQty, null);
 assert.equal(persistTrackedItem(ready, { getItem: () => null, setItem: () => { throw new Error('Unavailable'); } }), false);
});

test('a stale edit cannot overwrite a PO line or its history, and legacy rows remain editable', () => {
 const storage = memory();
 const previous = { id: 'legacy-revision', actorId: 'user-sale', reason: 'Bản cũ', time: '2026-11-05T01:00:00Z' };
 storage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ version: 1, items: { [source.rowId]: { ...ready, trackingHistory: [previous] } } }));
 const [tabA, other] = loadTrackedItems(INITIAL_VENDOR_ITEMS, storage);
 const [tabB] = loadTrackedItems(INITIAL_VENDOR_ITEMS, storage);
 const nextEntry = { ...previous, id: 'first-edit', reason: 'Lần lưu mới' };
 const savedVersion = persistTrackedItem({ ...tabA, orderedQty: 12000, trackingHistory: [previous, nextEntry] }, storage);
 assert.ok(savedVersion);
 assert.throws(() => persistTrackedItem({ ...tabB, orderedQty: 11000 }, storage), /cửa sổ khác/);
 assert.ok(persistTrackedItem(other, storage));
 const [latest] = loadTrackedItems(INITIAL_VENDOR_ITEMS, storage);
 assert.equal(latest.orderedQty, 12000);
 assert.equal(latest.trackingVersion, savedVersion);
 assert.deepEqual(latest.trackingHistory.map(row => row.id), ['legacy-revision', 'first-edit']);
 assert.ok(persistTrackedItem({ ...latest, orderedQty: 13000 }, storage));
});

test('new tracked late delivery is reflected in the shared dashboard alert classifier', () => {
 const row = { ...ready, priorityRank: 2, onProcessPct: 100, packagingPct: 100, etaDate: '04/11/2026' };
 const classified = classifyProgress(row, DATA_AS_OF);
 assert.equal(classified.priorityRank, 0); assert.match(classified.alertLabel, /Trễ giao/);
 assert.equal(classified.overdueDays, 1);
});


test('a partial delivery with time remaining is ordinary progress, while a near or missed deadline raises an alert', async () => {
  const row = { orderedQty: 10000, nhap: 9000, deliveredQty: 4500, actualDeliveryDate: '05/11/2026', etaDate: '20/11/2026' };
  assert.equal(getFulfillment(row, '2026-11-05').tone, 'normal');
  assert.equal(getFulfillment(row, '2026-11-05').label, 'Đang giao một phần');
  assert.equal(getFulfillment(row, '2026-11-18').tone, 'warning');
  assert.equal(getFulfillment(row, '2026-11-21').tone, 'critical');
  const { classifyProgress } = await import('../src/utils/dashboardMetrics.js');
  const tracked = { ...row, rowId: 999, manualPriorityRank: 2, priorityRank: 2, onProcessPct: 100, packagingPct: 100, actualShipDate: '04/11/2026', shipDateEtd: '04/11/2026', releasedPoDate: '01/10/2026' };
  assert.equal(classifyProgress(tracked, '2026-11-05').priorityRank, 2);
  assert.equal(classifyProgress(tracked, '2026-11-18').priorityRank, 1);
  assert.equal(classifyProgress(tracked, '2026-11-18').alertLabel, 'Sắp đến hạn giao');
});
