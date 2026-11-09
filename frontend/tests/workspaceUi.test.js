import test from 'node:test';
import assert from 'node:assert/strict';
import { payableAction, alertDestination, normalizeAmountInput, amountInputError, inspectQuantityInput, normalizeQuantityInput, computeProjectedProgress, splitNavigationItems, readPageGuideDismissed, storePageGuideDismissed } from '../src/utils/workspaceUi.js';
import { readTaskHandoverDraft, storeTaskHandoverDraft, clearTaskHandoverDraft, filterTaskRows } from '../src/features/operations/services/taskWorkflow.js';
import { AP_APPROVED, AP_PENDING, AP_REVIEW } from '../src/utils/financeWorkflow.js';

test('warning actions keep the exact record and do not require filtering another module', () => {
  const order = { rowId: 1, poId: 'PO-1' };
  assert.deepEqual(alertDestination({ type: 'orders', data: order }, 'Sale'), { type: 'ITEM_DETAIL', data: order });
  const debt = { id: 'AP-1', approvalState: AP_PENDING, originalAmount: 100, allocatedPaid: 0 };
  assert.deepEqual(alertDestination({ type: 'payables', data: debt }, 'CEO'), { type: 'REVIEW_AP', data: debt });
  assert.deepEqual(alertDestination({ type: 'payables', data: debt }, 'Sale'), { type: 'DEBT_DETAIL', debtType: 'payables', data: debt });
  assert.equal(alertDestination({ type: 'receivables', data: { id: 'AR-1' } }, 'CEO').type, 'DEBT_DETAIL');
});

test('payable row actions match role, approval state and the remaining balance', () => {
  const row = { originalAmount: 100, allocatedPaid: 20, approvalState: AP_PENDING, vendorNo: '15090' };
  assert.equal(payableAction(row, 'CEO').type, 'REVIEW_AP');
  assert.equal(payableAction(row, 'Accountant'), null);
  assert.equal(payableAction({ ...row, approvalState: AP_REVIEW }, 'Accountant').type, 'SUBMIT_AP');
  assert.equal(payableAction({ ...row, approvalState: AP_APPROVED }, 'Accountant').type, 'PAY_AP');
  for (const state of [AP_PENDING, AP_REVIEW, AP_APPROVED]) assert.equal(payableAction({ ...row, approvalState: state }, 'Sale'), null);
  assert.equal(payableAction({ ...row, allocatedPaid: 100 }, 'CEO'), null);
  const grouped = { ...row, approvalState: AP_APPROVED, vendorNo: '15090/15091' };
  assert.equal(payableAction(grouped, 'Accountant').type, 'SPLIT_AP');
  assert.equal(alertDestination({ type: 'payables', data: grouped }, 'Accountant').type, 'SPLIT_AP');
});

test('VND input accepts plain digits and complete thousands groups without changing value', () => {
  for (const value of ['25000000', '25.000.000', '25,000,000', '25 000 000', '25.000.000 VND']) assert.equal(normalizeAmountInput(value), '25000000');
  assert.equal(normalizeAmountInput('00025000'), '25000');
  assert.equal(normalizeAmountInput(''), '');
});

test('VND input rejects fractions, negative amounts, exponent syntax and excess precision', () => {
  for (const value of ['-25.000', '1e6', '2.5', '12,34', 'abc100', '1.000,50']) {
    assert.equal(normalizeAmountInput(value), null);
    assert.ok(amountInputError(value));
  }
  assert.ok(amountInputError('9007199254740992'));
  assert.ok(amountInputError('0'));
  assert.ok(amountInputError('26.000.000', 25000000));
  assert.equal(amountInputError('25.000.000', 25000000), '');
});

test('payable split alerts fall back to debt details when order tracking is unavailable', () => {
  const debt = { id: 'AP-grouped', originalAmount: 100, allocatedPaid: 0, approvalState: AP_REVIEW, vendorNo: '15090/15091' };
  assert.equal(payableAction(debt, 'Accountant').type, 'SPLIT_AP');
  assert.equal(payableAction(debt, 'Accountant', false), null);
  assert.deepEqual(alertDestination({ type: 'payables', data: debt }, 'Accountant', false),
    { type: 'DEBT_DETAIL', debtType: 'payables', data: debt });
});

test('quantity parser, projected progress, laptop navigation overflow, and task draft/filter helpers work as expected', () => {
  assert.equal(normalizeQuantityInput('1.000'), '1000');
  assert.equal(normalizeQuantityInput('10.000'), '10000');
  assert.equal(normalizeQuantityInput('40,5'), '40.5');
  assert.equal(normalizeQuantityInput('1.00'), null);
  const inspected = inspectQuantityInput('1.000', { allowZero: false, unit: 'pcs' });
  assert.equal(inspected.value, 1000);
  assert.ok(inspected.warning.includes('1.000'));

  const projToday = computeProjectedProgress(
    { orderedQty: 10000, nhap: 6000, deliveredQty: 2000, tonDau: 0, unit: 'pcs' },
    { mode: 'today', nhapInput: '1.500', deliveredInput: '500' },
  );
  assert.equal(projToday.projectedReceived, 7500);
  assert.equal(projToday.projectedDelivered, 2500);
  assert.equal(projToday.nhapInspect.error, '');

  const navSample = [
    { id: 'overview' }, { id: 'orders' }, { id: 'revenue' }, { id: 'receivables' },
    { id: 'payables' }, { id: 'data-entry' }, { id: 'users' }, { id: 'assignments' },
  ];
  const laptopSplit = splitNavigationItems(navSample, 1366);
  assert.equal(laptopSplit.primary.length, 5);
  assert.equal(laptopSplit.overflow.length, 3);
  const desktopSplit = splitNavigationItems(navSample, 1600);
  assert.equal(desktopSplit.primary.length, 8);
  assert.equal(desktopSplit.overflow.length, 0);

  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  storeTaskHandoverDraft('user-sale', 'task-1', 'Đang soạn bàn giao PO 3500003', storage);
  assert.equal(readTaskHandoverDraft('user-sale', 'task-1', storage), 'Đang soạn bàn giao PO 3500003');
  assert.equal(readTaskHandoverDraft('user-accountant', 'task-1', storage), '');
  assert.equal(readTaskHandoverDraft('user-sale', 'task-2', storage), '');
  clearTaskHandoverDraft('user-sale', 'task-1', storage);
  assert.equal(readTaskHandoverDraft('user-sale', 'task-1', storage), '');

  const sampleTasks = [
    { id: 't1', title: 'Đối chiếu tiến độ UV-Intl-3500003', description: 'Kiểm tra PO', assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '06/11/2026', status: 'Đang thực hiện' },
    { id: 't2', title: 'Đối soát công nợ BM41', description: 'Kiểm tra hóa đơn', assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '10/11/2026', status: 'Mới giao' },
  ];
  const accounts = [
    { id: 'user-sale', name: 'Lê Hương', email: 'sale@uyenvu.vn', role: 'Sale' },
    { id: 'user-accountant', name: 'Phạm Lan', email: 'acc@uyenvu.vn', role: 'Accountant' },
  ];
  assert.equal(filterTaskRows(sampleTasks, { searchQuery: '3500003', accounts, today: '2026-11-06' }).length, 1);
  assert.equal(filterTaskRows(sampleTasks, { searchQuery: 'Phạm Lan', accounts, today: '2026-11-06' })[0].id, 't2');
  assert.equal(filterTaskRows(sampleTasks, { deadlineFilter: 'today', accounts, today: '2026-11-06' })[0].id, 't1');
  assert.equal(filterTaskRows(sampleTasks, { deadlineFilter: 'upcoming', accounts, today: '2026-11-06' })[0].id, 't2');

  assert.equal(readPageGuideDismissed('user-sale', 'orders', storage), false);
  storePageGuideDismissed('user-sale', 'orders', true, storage);
  assert.equal(readPageGuideDismissed('user-sale', 'orders', storage), true);
});
