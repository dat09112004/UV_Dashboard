import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  apiRequest,
  configureApi, clearAuthToken, setAuthToken, loginApi, fetchOrdersApi, saveEntryBatchApi,
} from '../src/services/api.js';
import { clearEntryDrafts, readEntryDraft, storeEntryDraft } from '../src/features/dataEntry/drafts.js';
import { inspectEntryCell } from '../src/features/dataEntry/service.js';
import { inspectWorkbookZipArchive } from '../src/features/dataEntry/workbook.js';

test('React source is separated from backend and fixture data', () => {
  for (const name of ['mock', 'mocks', 'db', 'database', 'server.js']) {
    assert.equal(fs.existsSync(new URL(`../src/${name}`, import.meta.url)), false);
  }
});

test('API client unwraps server responses and forwards pagination, abort signal and batch rows', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/auth/login')) {
      assert.equal(JSON.parse(options.body).policyVersion, '2026.1');
      return Response.json({ status: 'ok', data: { token: 'access' } });
    }
    assert.equal(options.headers.Authorization, 'Bearer access');
    if (path.endsWith('/batch')) {
      assert.deepEqual(JSON.parse(options.body), { rows: [{ values: { poId: 'PO-TEST' } }] });
      assert.ok(options.headers['Idempotency-Key']);
      return Response.json({ status: 'ok', data: { committedCount: 1 } });
    }
    assert.equal(new URL(url).searchParams.get('page'), '2');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ status: 'ok', data: { items: [], pagination: { page: 2 } } });
  });
  configureApi({ baseURL: 'http://localhost:4000/api/v1' });
  const result = await loginApi('local@integration.invalid', 'test-input', true, '2026.1');
  setAuthToken(result.data.token);
  const controller = new AbortController();
  assert.equal((await fetchOrdersApi({ page: 2 }, controller.signal)).pagination.page, 2);
  assert.equal((await saveEntryBatchApi('orders', [{ values: { poId: 'PO-TEST' } }])).committedCount, 1);
  assert.equal(fetch.mock.callCount(), 3);
  clearAuthToken();
});

test('server RBAC profiles open accounts and employee tasks and honor department menus', async () => {
  const { canEditAccount, canOpenSection, homeSection, manageableRoles, navigationForRole } =
    await import('../src/utils/roles.js');
  const admin = { id: 'admin', status: 'active', role: 'Admin', permissions: ['users.manage'] };
  const sale = { id: 'sale', status: 'active', role: 'Sale', permissions: ['orders.read', 'tasks.read', 'dashboard.read'],
    navigation: ['tasks', 'orders'] };
  assert.equal(canOpenSection(admin, 'users'), true);
  assert.deepEqual(manageableRoles(admin), ['Admin', 'Sale', 'Accountant']);
  assert.equal(canEditAccount(admin, { id: 'another-ceo', role: 'CEO' }), false);
  assert.equal(canOpenSection(sale, 'tasks'), true);
  assert.equal(homeSection(sale), 'tasks');
  assert.equal(canOpenSection(sale, 'data-entry'), false);
  assert.equal(canOpenSection(sale, 'reminders'), false);
  assert.deepEqual(navigationForRole('Sale'), ['orders', 'revenue', 'tasks', 'reminders', 'data-entry']);
});

test('order reference links use the exact line and support regular PO codes', async () => {
  const { linkedItems, poReferences } = await import('../src/utils/recordReferences.js');
  const items = [{ rowId: 1, poId: 'UV-Intl-3500' }, { rowId: 2, poId: 'UV-Intl-3500' }];
  assert.deepEqual(linkedItems({ poId: items[0].poId, poLineId: null }, items), items);
  assert.deepEqual(linkedItems({ poId: items[0].poId, poLineId: 2 }, items), [items[1]]);
  assert.deepEqual(poReferences({ poId: 'UV-Intl-3500 / UV-Intl-3501' }), ['UV-Intl-3500', 'UV-Intl-3501']);
  assert.deepEqual(poReferences({ poId: 'PO-2026-123A / B' }), ['PO-2026-123A', 'PO-2026-123B']);
});

test('logout sends the refresh token and prevents a previous session response from updating the next session', async t => {
  const { logoutApi, getAuthToken } = await import('../src/services/api.js');
  let completeOrders;
  t.mock.method(globalThis, 'fetch', (url, options) => {
    if (url.endsWith('/auth/logout')) {
      assert.equal(options.headers.Authorization, 'Bearer old-access');
      assert.deepEqual(JSON.parse(options.body), { refreshToken: 'old-refresh' });
      return Promise.resolve(Response.json({ status: 'ok', data: { loggedOut: true } }));
    }
    return new Promise(resolve => { completeOrders = resolve; });
  });
  setAuthToken('old-access', 'old-refresh');
  const oldRequest = fetchOrdersApi();
  await logoutApi();
  assert.equal(getAuthToken(), null);
  setAuthToken('new-access', 'new-refresh');
  completeOrders(Response.json({ status: 'ok', data: { items: [{ rowId: 1 }] } }));
  await assert.rejects(oldRequest, { name: 'AbortError' });
  assert.equal(getAuthToken(), 'new-access');
  clearAuthToken();
});

test('PO reference paging rejects a repeated cursor before a third request', async t => {
  const { fetchOrderCollection } = await import('../src/features/orders/services/ordersService.js');
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ status: 'ok', data: { items: [{ rowId: 7 }], nextCursor: 7 } }));
  await assert.rejects(fetchOrderCollection(), /danh sách PO không hợp lệ/);
  assert.equal(fetch.mock.callCount(), 2);
});

test('form localization preserves validation supplied by the amount field', async () => {
  const { localizeInvalidInput, clearLocalizedValidation } = await import('../src/locales/formValidation.js');
  const field = {
    validationMessage: 'Nhập số tiền nguyên VND',
    validity: { customError: true, valid: false },
    setCustomValidity(message) { this.validationMessage = message; },
  };
  localizeInvalidInput({ target: field });
  clearLocalizedValidation({ target: field });
  assert.equal(field.validationMessage, 'Nhập số tiền nguyên VND');
});

test('alert view keeps assignments by document and latest repeat reminder in its module', async () => {
  const { matchAlertTask, REMINDER_PENDING, resolveAlertAssignmentInfo } =
    await import('../src/features/operations/services/taskWorkflow.js');
  const alert = { id: 'same', type: 'payables', reference: 'AP-01' };
  assert.equal(matchAlertTask({ title: 'AP-01', sourceAlert: { id: 'same', type: 'receivables', reference: 'AP-01' } }, alert), false);
  assert.equal(matchAlertTask({ title: 'AP-01', sourceAlert: { id: 'same', type: 'payables', reference: 'AP-02' } }, alert), false);
  const reminders = [
    { alertType: 'payables', reference: 'AP-01', senderName: 'Latest', updatedAt: '2026-11-11T03:00:00Z', remindCount: 3, status: REMINDER_PENDING },
    { alertType: 'payables', reference: 'AP-01', senderName: 'Earlier', updatedAt: '2026-11-11T01:00:00Z', remindCount: 2, status: REMINDER_PENDING },
    { alertType: 'receivables', reference: 'AP-01', alertId: 'same', senderName: 'Other', remindCount: 7, status: REMINDER_PENDING },
  ];
  const view = resolveAlertAssignmentInfo(alert, [], [], reminders, '2026-11-11');
  assert.equal(view.pendingRemindersCount, 2);
  assert.equal(view.lastReminder.senderName, 'Latest');
  assert.match(view.italicLine, /5 lần/);
});

test('F01, F02, F09, F10, S11, S13 regressions: numeric Excel decimals, idempotency reuse on retry, transient refresh, cache headers, ZIP precheck and draft cleanup', async t => {
  // F01: Numeric 1.234 from Excel is preserved as 1.234, whereas Vietnamese string "1.234" is 1234
  assert.equal(inspectEntryCell('orderedQty', 1.234, { unit: 'kg' }).value, 1.234);
  assert.equal(inspectEntryCell('orderedQty', '1,234', { unit: 'kg' }).value, 1.234);
  assert.equal(inspectEntryCell('orderedQty', '1.234', { unit: 'kg' }).value, 1234);

  // S13: Drafts in memory/sessionStorage are cleared on clearEntryDrafts / clearAuthToken
  storeEntryDraft('user-sale', { sheets: { orders: [{ values: { poId: 'PO-1' } }] } });
  assert.ok(readEntryDraft('user-sale').sheets.orders);
  clearEntryDrafts('user-sale');
  assert.deepEqual(readEntryDraft('user-sale'), { sheets: {} });

  // S11: Rejects invalid or oversized ZIP central directory before ExcelJS load
  assert.throws(() => inspectWorkbookZipArchive(new ArrayBuffer(32)), /Tệp Excel không đúng định dạng/);

  // F02 & F10: Reuses Idempotency-Key across retry after 503 and parses namespace list in X-Cache-Invalidated
  configureApi({ baseURL: 'http://localhost:4000/api/v1' });
  setAuthToken('access-1', 'refresh-1');
  const seenKeys = [];
  let attempt = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    attempt += 1;
    seenKeys.push(options.headers['Idempotency-Key']);
    if (attempt === 1) {
      return new Response(JSON.stringify({ message: 'Busy' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ status: 'ok', data: { saved: true } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache-Invalidated': 'finance,dashboard,orders',
      },
    });
  });

  await assert.rejects(apiRequest('POST', '/finance/receipts', { amount: 100 }), /Busy/);
  const second = await apiRequest('POST', '/finance/receipts', { amount: 100 });
  assert.equal(seenKeys[0], seenKeys[1]);
  assert.equal(second.meta.cacheInvalidated, true);
  assert.deepEqual(second.meta.invalidatedNamespaces, ['finance', 'dashboard', 'orders']);

  // F09: Transient 503 on /auth/refresh keeps session token instead of wiping auth state
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ message: 'Refresh rate limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ message: 'Expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await assert.rejects(apiRequest('GET', '/orders/items'), { code: 'REFRESH_TRANSIENT_ERROR' });
  clearAuthToken();
});

test('S03, S07, L01, L02, L05, X03, X08 direct-audit Frontend regressions', async t => {
  const { canSendReminders } = await import('../src/features/operations/services/taskWorkflow.js');
  const { getFulfillment, validateTracking } = await import('../src/utils/orderFulfillment.js');
  const { sanitizeExcelCellValue } = await import('../src/utils/exportExcel.js');
  const { signIn } = await import('../src/features/auth/services/authService.js');
  const { saveEntryBatchApi } = await import('../src/services/api.js');

  // S03: canSendReminders requires 'reminders' section access
  assert.equal(canSendReminders({ id: 'u1', role: 'Sale', status: 'active', navigation: ['orders', 'reminders'] }), true);
  assert.equal(canSendReminders({ id: 'u2', role: 'Sale', status: 'active', navigation: ['orders'] }), false);

  // L01: inboundOnly item with nhap=null
  const inbound = {
    rowId: 'PO-INB-FE',
    poId: '3500999',
    inboundOnly: true,
    orderedQty: 50,
    nhap: null,
    deliveredQty: 10,
    tonDau: 25,
    unit: 'pcs',
    releasedPoDate: '01/10/2026',
    etaDate: '25/10/2026',
  };
  assert.equal(getFulfillment(inbound, '18/10/2026').receivedComplete, false);
  assert.equal(
    validateTracking(inbound, { orderedQty: 50, nhap: '', deliveredQty: 10, unit: 'pcs', actualDeliveryDate: '15/10/2026' }, '18/10/2026').nhap,
    null
  );

  // X03: sanitizeExcelCellValue neutralizes leading formula characters
  assert.equal(sanitizeExcelCellValue('=cmd|\'/C calc\'!A0'), '\'=cmd|\'/C calc\'!A0');
  assert.equal(sanitizeExcelCellValue('\n+SUM(A1:A2)'), '\'\n+SUM(A1:A2)');
  assert.equal(sanitizeExcelCellValue('Bình thường'), 'Bình thường');

  // S07: signIn respects requiredOnLogin=false
  const blocked = await signIn('sale@uyenvu.vn', 'Sale@20261234', false, '2026.04', { requiredOnLogin: true });
  assert.equal(blocked.status, 'terms_required');

  // L02 & L05: Retains Idempotency-Key on 500 and maps multi-row issues in saveEntryBatchApi
  configureApi({ baseURL: 'http://localhost:4000/api/v1' });
  setAuthToken('access-token-test', 'refresh-token-test');
  const keysOn500 = [];
  let callIdx = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    callIdx += 1;
    keysOn500.push(options.headers['Idempotency-Key']);
    if (callIdx === 1) {
      return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        message: 'Dữ liệu lô không hợp lệ',
        code: 'ENTRY_BATCH_VALIDATION_FAILED',
        details: {
          row: 2,
          issues: [
            { line: 2, message: 'Lỗi dòng 2' },
            { line: 4, message: 'Lỗi dòng 4' },
          ],
        },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  });

  await assert.rejects(saveEntryBatchApi('receipts', [{ line: 2, values: {} }]), /Internal Server Error/);
  const batchRes = await saveEntryBatchApi('receipts', [{ line: 2, values: {} }]);
  assert.equal(keysOn500[0], keysOn500[1], 'Must reuse Idempotency-Key after 500 error');
  assert.equal(batchRes.issues.length, 2, 'Must preserve all validation issues from Backend');
  clearAuthToken();
});
