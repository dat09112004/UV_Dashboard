import test from 'node:test';
import assert from 'node:assert/strict';
import { receivableAction, payableAction } from '../src/utils/workspaceUi.js';
import { AR_OPEN, AR_PENDING, AR_APPROVED, AP_APPROVED } from '../src/utils/financeWorkflow.js';

test('AR and AP confirm buttons appear after CEO approval/confirmation', () => {
  const arOpen = { id: 'AR-1', originalAmount: 10000000, adjustment: 0, allocatedPaid: 0, remaining: 10000000, collectionState: AR_OPEN };
  assert.equal(receivableAction(arOpen, 'Accountant')?.type, 'SUBMIT_AR');
  assert.equal(receivableAction(arOpen, 'Accountant')?.label, 'Lập đề nghị thu');

  const arPending = { ...arOpen, collectionState: AR_PENDING };
  assert.equal(receivableAction(arPending, 'CEO')?.type, 'REVIEW_AR');
  assert.equal(receivableAction(arPending, 'Accountant'), null);

  const arApproved = { ...arOpen, collectionState: AR_APPROVED };
  assert.equal(receivableAction(arApproved, 'Accountant')?.type, 'CONFIRM_AR');
  assert.equal(receivableAction(arApproved, 'Accountant')?.label, 'Xác nhận đã thu tiền');
  assert.equal(receivableAction(arApproved, 'Sale'), null);

  const apApproved = { id: 'AP-1', vendorNo: 'V1', originalAmount: 5000000, adjustment: 0, allocatedPaid: 0, remaining: 5000000, approvalState: AP_APPROVED };
  assert.equal(payableAction(apApproved, 'Accountant')?.type, 'PAY_AP');
  assert.equal(payableAction(apApproved, 'Accountant')?.label, 'Xác nhận đã chi trả');
});
