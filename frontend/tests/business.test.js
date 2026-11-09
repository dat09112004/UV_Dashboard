import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBusinessDate, debtAtDate, isDue, onTimeStats, updateTask, validateProgress, allocatePayment, inRevenuePeriod } from '../src/utils/business.js';
import { canSendTaskRequest } from '../src/utils/permissions.js';

test('strict dates reject impossible dates and accept leap years', () => {
  assert.equal(parseBusinessDate('31/02/2026'), null);
  assert.equal(parseBusinessDate('29/02/2026'), null);
  assert.ok(parseBusinessDate('29/02/2024'));
  assert.ok(parseBusinessDate('2026-11-05'));
});
test('aging changes with report date and due excludes future or unknown deadlines', () => {
  const debt = { originalAmount: 100, adjustment: 0, allocatedPaid: 25, dueDate: '05/11/2026' };
  assert.equal(debtAtDate(debt, '05/11/2026').agingBucket, 'Đến hạn hôm nay');
  assert.equal(debtAtDate(debt, '06/11/2026').overdueDays, 1);
  assert.equal(isDue(debtAtDate(debt), '04/11/2026'), false);
  assert.equal(isDue(debtAtDate({ ...debt, dueDate: '—' }), '05/11/2026'), false);
});
test('on-time denominator includes undelivered overdue shipments and excludes future', () => {
  const result = onTimeStats([{ etd: '01/11/2026', actualShip: '01/11/2026', qty: 20 }, { etd: '04/11/2026', actualShip: '—', qty: 20 }, { etd: '10/11/2026', actualShip: '—', qty: 20 }]);
  assert.equal(result.rate, 50);
});
const task = { id: 'T1', status: 'Đang thực hiện', assignee: 'Lê Hương (Sale)', deadline: '04/11/2026', comments: [], proposedDeadline: '08/11/2026' };
const ceo = { name: 'Trần Quốc', role: 'CEO' };
const sale = { name: 'Lê Hương', role: 'Sale' };
test('Sale can only update assigned work and cannot confirm completion', () => {
  assert.throws(() => updateTask(task, { name: 'Nguyễn Minh', role: 'Sale' }, 'handover', { note: 'x' }));
  assert.throws(() => updateTask(task, sale, 'confirm', { approve: true }));
  assert.equal(updateTask(task, sale, 'handover', { note: 'Đã đối chiếu' }).status, 'Chờ CEO xác nhận');
});
test('rejecting deadline proposal preserves overdue state; CEO completion closes it', () => {
  assert.equal(updateTask(task, ceo, 'review', { accept: false }).isOverdue, true);
  assert.equal(updateTask({ ...task, status: 'Chờ CEO xác nhận' }, ceo, 'confirm', { approve: true }).isOverdue, false);
});
test('progress rejects negative, impossible sequence, invalid dates and shipment mismatch', () => {
  const po = { effectiveQty: 1000, shippedQty: 200, shipments: [{ id: 'S1', qty: 200, actualShip: '01/11/2026' }, { id: 'S2', qty: 800, actualShip: '—' }] };
  const values = { productionQty: 600, packagingQty: 400, shippedQty: 200, etdUpdated: '12/11/2026', etaUpdated: '20/11/2026' };
  assert.throws(() => validateProgress(po, { ...values, productionQty: -1 }));
  assert.throws(() => validateProgress(po, { ...values, packagingQty: 700 }));
  assert.throws(() => validateProgress(po, { ...values, etaUpdated: '01/11/2026' }));
  assert.throws(() => validateProgress(po, { ...values, shippedQty: 300 }));
  assert.equal(validateProgress(po, { ...values, shippedQty: 300, shipmentId: 'S2' })[1].shippedQty, 100);
});
test('allocation never overpays or crosses unrelated partners/currencies', () => {
  const payment = { partnerName: 'A', currency: 'VND', allocatedAmount: 75, unallocatedAmount: 25, allocations: [] };
  const debt = { customerName: 'A', originalAmount: 100, adjustment: 0, allocatedPaid: 80, remaining: 20, dueDate: '05/11/2026' };
  assert.throws(() => allocatePayment(payment, debt, 21));
  assert.throws(() => allocatePayment(payment, { ...debt, customerName: 'B' }, 10));
  assert.throws(() => allocatePayment(payment, { ...debt, currency: 'USD' }, 10));
  assert.throws(() => allocatePayment(payment, debt, Infinity));
  const next = allocatePayment(payment, debt, 20);
  assert.equal(next.payment.unallocatedAmount, 5);
  assert.equal(next.debt.remaining, 0);
  assert.equal(payment.unallocatedAmount, 25);
});
test('revenue period uses recognition date, approval state and year boundaries', () => {
  assert.equal(inRevenuePeriod({ recordDate: '31/12/2025', approvalStatus: 'Đã duyệt' }, 'Tháng trước', '05/01/2026'), true);
  assert.equal(inRevenuePeriod({ recordDate: '03/11/2026', approvalStatus: 'Chờ duyệt' }, 'Tháng này'), false);
});
test('client request guard fails closed and permits Sale workflow endpoints', () => {
  assert.equal(canSendTaskRequest(null, 'post', '/operations/tasks'), false);
  assert.equal(canSendTaskRequest('Sale', 'POST', '/operations/tasks'), false);
  assert.equal(canSendTaskRequest('Sale', 'post', '/operations/tasks/T1/handover'), true);
  assert.equal(canSendTaskRequest('Sale', 'patch', '/operations/tasks/T1', { deadline: '10/11/2026' }), false);
  assert.equal(canSendTaskRequest('Sale', 'post', '/operations/tasks/T1/confirm'), false);
  assert.equal(canSendTaskRequest('CEO', 'post', '/operations/tasks'), true);
});
