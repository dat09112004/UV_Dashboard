import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  apiRequest,
  configureApi,
  clearAuthToken,
  setAuthToken,
  getSessionVersion,
  getSessionIdentityKey,
  parseRetryAfterMs,
  loginApi,
  fetchOrdersApi,
  fetchDashboardSummaryApi,
  previewOrderProgressApi,
  fetchAccountsApi,
  fetchTasksApi,
  fetchRemindersApi,
  fetchAuditLogsApi,
  saveEntryBatchApi,
} from '../src/services/api.js';
import { buildRemotePageRequestKey } from '../src/hooks/useRemotePage.js';
import { fetchOrdersPage, fetchOrderCollection } from '../src/features/orders/services/ordersService.js';
import { clearEntryDrafts, readEntryDraft, storeEntryDraft } from '../src/features/dataEntry/drafts.js';
import { inspectEntryCell } from '../src/features/dataEntry/service.js';
import { inspectWorkbookZipArchive } from '../src/features/dataEntry/workbook.js';

test('React source is separated from backend and fixture data', () => {
  for (const name of ['mock', 'mocks', 'db', 'database', 'server.js', 'app.js', 'cluster.js', 'shims']) {
    assert.equal(fs.existsSync(new URL(`../src/${name}`, import.meta.url)), false, `src/${name} must not exist in Frontend`);
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
  const { canEditAccount, canToggleAccountStatus, canOpenSection, homeSection, manageableRoles, navigationForRole } =
    await import('../src/utils/roles.js');
  const ceo = { id: 'ceo', status: 'active', role: 'CEO', permissions: ['dashboard.read', 'tasks.assign'] };
  const admin = { id: 'admin', status: 'active', role: 'Admin', permissions: ['users.manage'] };
  const sale = { id: 'sale', status: 'active', role: 'Sale', permissions: ['orders.read', 'tasks.read', 'dashboard.read'],
    navigation: ['tasks', 'orders'] };
  assert.equal(canOpenSection(admin, 'users'), true);
  assert.equal(canOpenSection(ceo, 'users'), false);
  assert.deepEqual(manageableRoles(ceo), []);
  assert.deepEqual(manageableRoles(admin), ['Sale', 'Accountant']);
  assert.equal(canEditAccount(admin, { id: 'another-ceo', role: 'CEO' }), false);
  assert.equal(canEditAccount(ceo, { id: 'sale', role: 'Sale' }), false);
  assert.equal(canToggleAccountStatus(ceo, { id: 'sale', role: 'Sale' }), false);
  assert.equal(canToggleAccountStatus(admin, { id: 'ceo', role: 'CEO' }), true);
  assert.equal(canOpenSection(sale, 'tasks'), true);
  assert.equal(homeSection(sale), 'tasks');
  assert.equal(canOpenSection(sale, 'data-entry'), false);
  assert.equal(canOpenSection(sale, 'reminders'), false);
  assert.deepEqual(navigationForRole('Sale'), ['orders', 'tasks', 'reminders', 'data-entry']);
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

test('P1-04, P1-05, P1-08, P1-12, P1-15, P2-13 regressions: session-scoped useRemotePage key, refresh retry key, X-Data-Revision, cursor page helper & API endpoints', async t => {
  // P1-04: useRemotePage requestKey changes immediately when token/session or actor scope changes
  clearAuthToken();
  setAuthToken('token-user-ceo-11111111', 'refresh-ceo');
  const keyCeo = buildRemotePageRequestKey({
    params: { section: 'receivables', filter: 'all' },
    page: 1,
    revision: 3,
    sessionKey: getSessionIdentityKey(),
    sessionScope: 'user-ceo',
  });
  const versionBeforeLogout = getSessionVersion();
  clearAuthToken();
  assert.equal(getSessionVersion(), versionBeforeLogout + 1);
  setAuthToken('token-user-sale-22222222', 'refresh-sale');
  const keySaleSameRevision = buildRemotePageRequestKey({
    params: { section: 'receivables', filter: 'all' },
    page: 1,
    revision: 3,
    sessionKey: getSessionIdentityKey(),
    sessionScope: 'user-sale',
  });
  assert.notEqual(keyCeo, keySaleSameRevision, 'Different user sessions must never share remote page requestKey');

  // P2-13: parseRetryAfterMs supports seconds and fallback
  assert.equal(parseRetryAfterMs('2'), 2000);
  assert.equal(parseRetryAfterMs('', 350), 350);

  // P1-05 & P1-08 & P1-12: refresh sends X-Refresh-Retry-Id, apiRequest parses X-Data-Revision and canonicalizes trailing slash on Idempotency-Key
  configureApi({ baseURL: 'http://localhost:4000/api/v1' });
  setAuthToken('expired-access-token', 'valid-refresh-token');
  let refreshHeaders = null;
  let refreshBody = null;
  const writeKeys = [];

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/auth/refresh')) {
      refreshHeaders = options.headers;
      refreshBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: { token: 'fresh-access-token', refreshToken: 'fresh-refresh-token' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (pathname.endsWith('/orders/items')) {
      if (options.headers.Authorization === 'Bearer expired-access-token') {
        return new Response(JSON.stringify({ message: 'Token expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            items: [{ rowId: 3500002 }],
            nextCursor: null,
            hasMore: false,
            pagination: { page: 1, limit: 50, totalItems: 1, totalPages: 1, nextCursor: null, hasMore: false },
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Data-Revision': '42',
          },
        }
      );
    }
    if (pathname.includes('/finance/invoices')) {
      writeKeys.push(options.headers['Idempotency-Key']);
      if (writeKeys.length === 1) {
        return new Response(JSON.stringify({ message: 'Gateway Timeout' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0.05' },
        });
      }
      return new Response(
        JSON.stringify({
          code: 'REQUEST_ALREADY_COMMITTED',
          committedResult: { invoiceId: 'INV-REPLAY-1' },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json', 'X-Data-Revision': '43' },
        }
      );
    }
    return new Response(
      JSON.stringify({ status: 'ok', data: { ok: true, items: [] } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });

  const pageData = await fetchOrdersPage({ limit: 50 });
  assert.equal(pageData.items.length, 1);
  assert.equal(pageData.hasMore, false);
  assert.ok(refreshHeaders['X-Refresh-Retry-Id'], 'Must send X-Refresh-Retry-Id on /auth/refresh');
  assert.equal(refreshHeaders['X-Refresh-Retry-Id'], refreshBody.retryKey);

  // P1-12 & P2-13: Auto-retry with maxRetries=1 reuses identical Idempotency-Key and unwraps 409 REQUEST_ALREADY_COMMITTED replay
  const writeReplay = await apiRequest(
    'POST',
    '/finance/invoices/',
    { docNo: 'INV-01' },
    { maxRetries: 1, retryDelayMs: 50 }
  );
  assert.equal(writeKeys.length, 2);
  assert.equal(writeKeys[0], writeKeys[1]);
  assert.equal(writeReplay.status, 200);
  assert.equal(writeReplay.data.invoiceId, 'INV-REPLAY-1');
  assert.equal(writeReplay.meta.dataRevision, 43);

  // Verify new API helper endpoints
  assert.ok(await fetchDashboardSummaryApi({ reportDate: '2026-11-06' }));
  assert.ok(await previewOrderProgressApi(3500002, { nhap: 100 }));
  assert.ok(await fetchAccountsApi({ page: 1 }));
  assert.ok(await fetchTasksApi({ page: 1 }));
  assert.ok(await fetchRemindersApi({ alertType: 'orders' }));
  assert.ok(await fetchAuditLogsApi({ domain: 'finance' }));
  clearAuthToken();
});

test('QA07, QA08, F5 JWT+Refresh Session Persistence, CEO Reminder Removal & AR/AP Full CRUD', async t => {
  const {
    executeFinanceActionApi,
    getStoredAuthSession,
    refreshSession,
    AUTH_SESSION_STORAGE_KEY,
  } = await import('../src/services/api.js');
  const { readFileSync } = await import('node:fs');
  const { restoreSessionOnLoad } = await import('../src/features/auth/services/authService.js');
  const { canSendReminders, canAssignTasks } = await import('../src/features/operations/services/taskWorkflow.js');
  const {
    initialFinanceState,
    createReceivable,
    updateReceivable,
    deleteReceivable,
    recordPayable,
    updatePayable,
    deletePayable,
  } = await import('../src/utils/financeWorkflow.js');

  // 1. Role CEO: canSendReminders is false ("xóa chỗ gửi nhắc việc cho sếp") while canAssignTasks is true ("với điều kiện giao việc")
  const ceoActor = {
    id: 'user-ceo',
    name: 'Lê Minh Quân',
    role: 'CEO',
    status: 'active',
    permissions: ['dashboard.read', 'tasks.assign', 'receivables.allocate', 'payables.approve'],
    navigation: ['overview', 'orders', 'receivables', 'payables', 'assignments', 'reminders'],
  };
  const saleActor = {
    id: 'user-sale',
    name: 'Lê Hương',
    role: 'Sale',
    status: 'active',
    permissions: ['dashboard.read', 'orders.read', 'tasks.read'],
    navigation: ['orders', 'tasks', 'reminders'],
  };
  assert.equal(canSendReminders(ceoActor), false, 'CEO must not have send-reminder capability');
  assert.equal(canAssignTasks(ceoActor), true, 'CEO must retain full task assignment capability');
  assert.equal(canSendReminders(saleActor), true, 'Sale retains send-reminder capability');

  // 2. Local AR & AP CRUD workflow validation
  let finState = initialFinanceState([], [], [], '2026-10-17');
  finState = createReceivable(finState, ceoActor, {
    docNo: 'AR-FE-001',
    customerName: 'CÔNG TY NỘI THẤT ĐÔNG Á',
    poId: 'UV-Intl-3500002',
    sku: 'Ghế gỗ cao su',
    category: 'Furniture',
    dueDate: '2026-11-25',
    originalAmount: 95000000,
    commitmentNote: 'Đợt 1',
  });
  assert.equal(finState.receivables.length, 1);
  const arRowId = finState.receivables[0].id;
  finState = updateReceivable(finState, ceoActor, {
    id: arRowId,
    originalAmount: 110000000,
    commitmentNote: 'Đã điều chỉnh hợp đồng',
  });
  assert.equal(finState.receivables[0].remaining, 110000000);
  finState = deleteReceivable(finState, ceoActor, { id: arRowId });
  assert.equal(finState.receivables.length, 0);

  finState = recordPayable(finState, ceoActor, {
    docNo: 'AP-FE-001',
    vendorNo: '15090',
    supplierName: 'NHÀ CUNG CẤP BAO BÌ VIỆT',
    poId: 'UV-Intl-3500002',
    sku: 'Thùng carton 5 lớp',
    category: 'Packaging',
    dueDate: '2026-11-28',
    originalAmount: 45000000,
    requestNote: 'Hóa đơn đợt 1',
  });
  assert.equal(finState.payables.length, 1);
  const apRowId = finState.payables[0].id;
  finState = updatePayable(finState, ceoActor, {
    id: apRowId,
    originalAmount: 52000000,
    requestNote: 'Cập nhật phụ phí vận chuyển',
  });
  assert.equal(finState.payables[0].remaining, 52000000);
  finState = deletePayable(finState, ceoActor, { id: apRowId });
  assert.equal(finState.payables.length, 0);

  // 3. QA08: Stable retryId across transient /auth/refresh failures + F5 Session Persistence with Expiry
  const memStore = new Map();
  globalThis.sessionStorage = {
    getItem: k => memStore.get(k) ?? null,
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: k => memStore.delete(k),
  };
  globalThis.localStorage = globalThis.sessionStorage;

  configureApi({ baseURL: 'http://localhost:4000/api/v1' });
  const now = Date.now();
  setAuthToken('acc-initial', 'ref-initial', {
    accessExpiresAt: now + 5000, // within 15s buffer so ensureValidSessionToken triggers refresh
    refreshExpiresAt: now + 3600000,
    accountId: 'user-ceo',
  });
  assert.ok(memStore.get(AUTH_SESSION_STORAGE_KEY));
  assert.equal(getStoredAuthSession()?.accountId, 'user-ceo');

  const seenRetryIds = [];
  let refreshCallCount = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/auth/refresh')) {
      refreshCallCount += 1;
      seenRetryIds.push(options.headers['X-Refresh-Retry-Id']);
      if (refreshCallCount === 1) {
        return new Response(JSON.stringify({ message: 'Temporary 503' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            token: 'acc-rotated-f5',
            refreshToken: 'ref-rotated-f5',
            accessExpiresAt: Date.now() + 900000,
            refreshExpiresAt: Date.now() + 604800000,
            account: ceoActor,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (pathname.endsWith('/directory/bootstrap')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            accounts: [{ ...ceoActor, home: 'overview' }],
            tasks: [],
            reminders: [],
            departmentNavigation: {},
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (pathname.endsWith('/operations/tasks')) {
      // QA07: Backend AppError puts committedResult inside details.committedResult
      return new Response(
        JSON.stringify({
          status: 'error',
          code: 'REQUEST_ALREADY_COMMITTED',
          message: 'Mã yêu cầu đã được ghi nhận.',
          details: {
            committedStatus: 'completed',
            committedStatusCode: 201,
            committedResult: {
              committed: true,
              task: { id: 'TASK-QA07-FE', title: 'Giao việc từ CEO' },
            },
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (pathname.includes('/finance/receivables') || pathname.includes('/finance/payables')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: { revision: 10, receivables: [], payables: [] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ status: 'ok', data: {} }), { status: 200 });
  });

  const firstRefresh = await refreshSession();
  assert.equal(firstRefresh.status, 'transient_error');
  const restored = await restoreSessionOnLoad();
  assert.equal(restored.status, 'authenticated');
  assert.equal(restored.account.id, 'user-ceo');
  assert.equal(seenRetryIds.length, 2);
  assert.equal(seenRetryIds[0], seenRetryIds[1], 'QA08: Must reuse identical retryId for same refreshToken across transient retry');

  // QA07: Unwraps details.committedResult and details.committedStatusCode (201)
  const taskReplay = await apiRequest('POST', '/operations/tasks', { title: 'Giao việc từ CEO' });
  assert.equal(taskReplay.status, 201);
  assert.equal(taskReplay.data.task.id, 'TASK-QA07-FE');
  assert.equal(taskReplay.meta.replayed, true);

  // RESTful API CRUD calls via executeFinanceActionApi
  assert.equal((await executeFinanceActionApi('create-receivable', { docNo: 'AR-1' })).revision, 10);
  assert.equal((await executeFinanceActionApi('update-receivable', { id: 'AR-1', docNo: 'AR-1' })).revision, 10);
  assert.equal((await executeFinanceActionApi('delete-receivable', { id: 'AR-1' })).revision, 10);
  assert.equal((await executeFinanceActionApi('create-payable', { docNo: 'AP-1' })).revision, 10);
  assert.equal((await executeFinanceActionApi('update-payable', { id: 'AP-1', docNo: 'AP-1' })).revision, 10);
  assert.equal((await executeFinanceActionApi('delete-payable', { id: 'AP-1' })).revision, 10);

  // Expired refreshExpiresAt logs out on F5
  setAuthToken('acc-exp', 'ref-exp', {
    accessExpiresAt: Date.now() - 10000,
    refreshExpiresAt: Date.now() - 1000,
    accountId: 'user-ceo',
  });
  assert.equal(getStoredAuthSession(), null);
  clearAuthToken();
});


test('QA01-QA08 Audit v3 Regressions: sessionStorage-only tokens, strict principal check, rotated token preservation, backoff, minimal commit receipt reconciliation, 11-page PO loading, explicit PayableForm review decision, and Buffer-free JWT decoder', async t => {
  const {
    AUTH_SESSION_STORAGE_KEY,
    clearAuthToken,
    configureApi,
    decodeJwtExpMs,
    decodeJwtPayload,
    executeFinanceActionApi,
    getAuthToken,
    getStoredAuthSession,
    isFinanceSnapshotPayload,
    refreshSession,
    setAuthToken,
  } = await import('../src/services/api.js');
  const { readFileSync } = await import('node:fs');
  const { restoreSessionOnLoad } = await import('../src/features/auth/services/authService.js');

  // QA08: Verify api.js does not use Node-only Buffer identifier and decodes base64url JWT payloads
  const apiSource = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
  assert.equal(/\bBuffer\b/.test(apiSource), false, 'QA08: api.js must not reference Buffer global');
  const samplePayload = { sub: 'user-ceo', role: 'CEO', exp: 1893456000 };
  const encodedPayload = btoa(JSON.stringify(samplePayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sampleJwt = `eyJhbGciOiJIUzI1NiJ9.${encodedPayload}.sig`;
  assert.equal(decodeJwtPayload(sampleJwt)?.sub, 'user-ceo');
  assert.equal(decodeJwtExpMs(sampleJwt), 1893456000 * 1000);

  // QA01: Tokens are stored ONLY in sessionStorage, never in localStorage
  const sessionMap = new Map();
  const localMap = new Map();
  globalThis.sessionStorage = {
    getItem: k => sessionMap.get(k) ?? null,
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: k => sessionMap.delete(k),
  };
  globalThis.localStorage = {
    getItem: k => localMap.get(k) ?? null,
    setItem: (k, v) => localMap.set(k, String(v)),
    removeItem: k => localMap.delete(k),
  };

  configureApi({ baseURL: 'http://localhost:4000/api/v1' });
  const now = Date.now();
  setAuthToken(sampleJwt, 'ref-qa01', {
    accessExpiresAt: now + 600000,
    refreshExpiresAt: now + 3600000,
    accountId: 'user-ceo',
  });
  assert.ok(sessionMap.get(AUTH_SESSION_STORAGE_KEY), 'QA01: Must store session in sessionStorage');
  assert.equal(localMap.get(AUTH_SESSION_STORAGE_KEY), undefined, 'QA01: Must NOT store tokens in localStorage');
  sessionMap.delete(AUTH_SESSION_STORAGE_KEY);
  localMap.set(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ token: 'stale-local', refreshToken: 'stale-ref', accountId: 'user-ceo' }));
  assert.equal(getStoredAuthSession(), null, 'QA01: Clearing tab sessionStorage must not restore from localStorage');
  assert.equal(localMap.get(AUTH_SESSION_STORAGE_KEY), undefined, 'QA01: Stale localStorage session key is cleaned');

  // QA02: restoreSessionOnLoad rejects mismatched principal instead of falling back to another active account
  setAuthToken(sampleJwt, 'ref-qa02', {
    accessExpiresAt: now + 600000,
    refreshExpiresAt: now + 3600000,
    accountId: 'user-ceo',
  });
  let bootstrapStep = 'wrong-account';
  let bootstrapCalls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/directory/bootstrap')) {
      bootstrapCalls += 1;
      if (bootstrapStep === 'wrong-account') {
        return Response.json({
          status: 'ok',
          data: {
            accounts: [{ id: 'user-sale', name: 'Lê Hương', role: 'Sale', status: 'active', home: 'orders' }],
            tasks: [],
            reminders: [],
          },
        });
      }
      if (bootstrapStep === 'rotate-on-401' && bootstrapCalls === 1) {
        return new Response(JSON.stringify({ message: 'Expired access token' }), { status: 401 });
      }
      return Response.json({
        status: 'ok',
        data: {
          me: { id: 'user-ceo', name: 'Trần Quốc', role: 'CEO', status: 'active', home: 'overview' },
          accounts: [{ id: 'user-ceo', name: 'Trần Quốc', role: 'CEO', status: 'active', home: 'overview' }],
          tasks: [],
          reminders: [],
        },
      });
    }
    if (pathname.endsWith('/auth/refresh')) {
      if (bootstrapStep === 'transient-503') {
        return new Response(JSON.stringify({ message: 'Server busy' }), {
          status: 503,
          headers: { 'Retry-After': '4', 'Content-Type': 'application/json' },
        });
      }
      return Response.json({
        status: 'ok',
        data: {
          token: 'acc-rotated-qa03',
          refreshToken: 'ref-rotated-qa03',
          accessExpiresAt: Date.now() + 900000,
          refreshExpiresAt: Date.now() + 3600000,
          account: { id: 'user-ceo', name: 'Trần Quốc', role: 'CEO', status: 'active', home: 'overview' },
        },
      });
    }
    if (pathname.endsWith('/finance/payables/AP-QA05/submit')) {
      // QA05: Minimal idempotent replay receipt without finance snapshot
      return Response.json({
        status: 'ok',
        data: { committed: true, dataRevision: 15 },
      });
    }
    if (pathname.endsWith('/finance/state')) {
      return Response.json({
        status: 'ok',
        data: {
          revision: 15,
          revenue: [],
          receivables: [],
          payables: [{ id: 'AP-QA05', docNo: 'BILL-QA05', approvalState: 'Chờ CEO duyệt chi' }],
          receipts: [],
          allocations: [],
          payments: [],
          audit: [{ id: 'AUD-15', type: 'PAYABLE_SUBMITTED', reference: 'BILL-QA05' }],
        },
      });
    }
    if (pathname.endsWith('/orders/items')) {
      const searchParams = new URL(url).searchParams;
      const cursor = Number(searchParams.get('cursor') || 0);
      const pageIndex = Math.floor(cursor / 100) + 1;
      const count = pageIndex < 11 ? 100 : 1;
      const items = Array.from({ length: count }, (_, idx) => {
        const rowId = cursor + idx + 1;
        return { rowId, poId: `PO-${rowId}`, vendorNo: '15090', vendorItemNo: `SKU-${rowId}` };
      });
      const nextCursor = pageIndex < 11 ? cursor + count : null;
      return Response.json({
        status: 'ok',
        data: { items, nextCursor, hasMore: nextCursor !== null },
      });
    }
    return Response.json({ status: 'ok', data: {} });
  });

  const wrongRestore = await restoreSessionOnLoad();
  assert.equal(wrongRestore.status, 'expired', 'QA02: Must reject when logged-in principal is missing from bootstrap');
  assert.equal(getAuthToken(), null);

  // QA03: Access token rotated during 401 on bootstrap is preserved after restoreSessionOnLoad completes
  bootstrapStep = 'rotate-on-401';
  bootstrapCalls = 0;
  setAuthToken('acc-old-before-401', 'ref-valid-qa03', {
    accessExpiresAt: now + 600000,
    refreshExpiresAt: now + 3600000,
    accountId: 'user-ceo',
  });
  const rotatedRestore = await restoreSessionOnLoad();
  assert.equal(rotatedRestore.status, 'authenticated');
  assert.equal(rotatedRestore.account.id, 'user-ceo');
  assert.equal(getAuthToken(), 'acc-rotated-qa03', 'QA03: Newly rotated access token must not be overwritten by old token');
  assert.equal(getStoredAuthSession()?.token, 'acc-rotated-qa03');

  // QA04: Transient refresh error honors Retry-After / backoff and returns transient_error on restoreSessionOnLoad
  bootstrapStep = 'transient-503';
  setAuthToken('acc-near-exp', 'ref-transient-qa04', {
    accessExpiresAt: Date.now() + 2000,
    refreshExpiresAt: Date.now() + 3600000,
    accountId: 'user-ceo',
  });
  const transientRestore = await restoreSessionOnLoad();
  assert.equal(transientRestore.status, 'transient_error', 'QA04: Must surface transient_error instead of swallowing error');
  assert.ok(transientRestore.retryAfterMs >= 4000, 'QA04: Must honor Retry-After backoff');

  // QA05: Minimal commit receipt ({ committed: true, dataRevision }) is reconciled via GET /finance/state
  bootstrapStep = 'ok';
  setAuthToken('acc-rotated-qa03', 'ref-rotated-qa03', {
    accessExpiresAt: Date.now() + 600000,
    refreshExpiresAt: Date.now() + 3600000,
    accountId: 'user-ceo',
  });
  const reconciledFin = await executeFinanceActionApi('submit', { id: 'AP-QA05', amount: 1000000, dueDate: '15/11/2026', note: 'Test QA05' });
  assert.equal(isFinanceSnapshotPayload(reconciledFin), true, 'QA05: Must reconcile minimal receipt into full finance snapshot');
  assert.equal(Array.isArray(reconciledFin.audit), true);
  assert.equal(reconciledFin.payables[0].id, 'AP-QA05');

  // QA06: 11 pages (1,001 POs) load completely without falling back to 100 rows
  const allPos = await fetchOrderCollection(undefined, { limit: 100 });
  assert.equal(allPos.length, 1001, 'QA06: Must load all 1,001 POs across 11 pages');
  assert.equal(allPos[1000].rowId, 1001, 'QA06: Last PO #1001 must be present');

  // QA07: PayableForm requires explicit 'approve' or 'return' decision on review submit
  const formsSource = readFileSync(new URL('../src/components/finance/FinanceForms.jsx', import.meta.url), 'utf8');
  assert.ok(formsSource.includes("explicitDecision !== 'approve' && explicitDecision !== 'return'"), 'QA07: Must guard against implicit submit without explicit decision');

  clearAuthToken();
});


test('VPS01 & VPS07 Pre-Deploy Regressions: App.jsx imports fetchOrderHistory and separates ordersWarning from dataError', async () => {
  const { readFileSync } = await import('node:fs');
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /import\s*\{[^}]*fetchOrderHistory[^}]*\}\s*from\s*['"]\.\/features\/orders\/services\/ordersService\.js['"]/);
  assert.ok(appSource.includes('const [ordersWarning, setOrdersWarning] = useState'), 'VPS07: Must separate ordersWarning from dataError');
});


test('Mục 04, 05, 06, 07, 08, 10, 11 Production Checklist Regressions (FE)', async () => {
  const { readFileSync } = await import('node:fs');
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const apiSource = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
  const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const pkgJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  // Mục 04: /orders/history/query does not attach write Idempotency-Key
  assert.ok(apiSource.includes("const isReadOnlyPost = path === '/orders/history/query';"));

  // Mục 08: App.jsx loads initial PO page via fetchOrdersPage and decouples PO loading from Finance loading
  assert.ok(appSource.includes("fetchOrdersPage({ view: 'reference', limit: 100 }"));
  assert.ok(appSource.includes('}, [isAuthenticated, currentAccountId, loadOrders, dataRevision]);'));
  assert.ok(appSource.includes('}, [isAuthenticated, currentAccountId, loadFinance, dataRevision]);'));

  // Mục 10: CSP in index.html and X-Requested-With + credentials: same-origin in api.js
  assert.ok(htmlSource.includes('http-equiv="Content-Security-Policy"'));
  assert.ok(apiSource.includes("'X-Requested-With': 'XMLHttpRequest'") || apiSource.includes("headers['X-Requested-With'] = 'XMLHttpRequest'"));
  assert.ok(apiSource.includes("credentials: 'same-origin'"));

  // Mục 11: Stable EMPTY_LIST reference and full test suite in package.json
  assert.ok(appSource.includes('const EMPTY_LIST = Object.freeze([]);'));
  assert.equal(pkgJson.scripts.test, 'node --test tests/*.test.js');
});


test('QA01, QA12, QA14, QA16 v1.1.0 Regressions (FE Role Matrix, Multi-page PO Reference, Order Detail Reconciliation)', async () => {
  const { readFileSync } = await import('node:fs');
  const { canEditAccount, manageableRoles } = await import('../src/utils/roles.js');

  const activeCeo = { id: 'user-ceo', role: 'CEO', status: 'active' };
  const activeAdmin = { id: 'user-admin', role: 'Admin', status: 'active' };
  assert.deepEqual(manageableRoles(activeCeo), []);
  assert.deepEqual(manageableRoles(activeAdmin), ['Sale', 'Accountant']);
  assert.equal(canEditAccount(activeCeo, { id: 'ceo-2', role: 'CEO', status: 'active' }), false);
  assert.equal(canEditAccount(activeCeo, { id: 'user-ceo', role: 'CEO', status: 'active' }), false);
  assert.equal(canEditAccount(activeAdmin, { id: 'u-sale', role: 'Sale', status: 'active' }), true);
  assert.equal(canEditAccount(activeAdmin, { id: 'admin-2', role: 'Admin', status: 'active' }), false);
  assert.equal(canEditAccount({ ...activeAdmin, status: 'inactive' }, { id: 'u-sale', role: 'Sale', status: 'active' }), false);

  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  // QA12: Uses fetchOrdersPage first and automatically calls fetchOrderCollection when firstPage.hasMore is true
  assert.ok(appSource.includes('if (!firstPage.hasMore || firstPage.nextCursor === null)'));
  assert.ok(appSource.includes('startCursor: firstPage.nextCursor'));
  // QA16: Handles both detail.item and direct detail object from fetchOrderDetailApi
  assert.ok(appSource.includes('updated = detail?.item?.poId ? detail.item : detail?.poId ? detail : null;'));
});


test('Mục 05, 06, 07, 08 Kế hoạch sửa và deploy VPS v1.1.0 Regressions (FE)', async t => {
  const { readFileSync } = await import('node:fs');
  const { AUTH_SESSION_STORAGE_KEY, setAuthToken, clearAuthToken } = await import('../src/services/api.js');
  const { fetchOrdersPage, fetchOrderCollection } = await import('../src/features/orders/services/ordersService.js');

  // Mục 05: sessionStorage never contains refreshToken
  const sessionMap = new Map();
  globalThis.sessionStorage = {
    getItem: k => sessionMap.get(k) ?? null,
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: k => sessionMap.delete(k),
  };
  setAuthToken('acc-muc05', 'secret-refresh-token-muc05', {
    accessExpiresAt: Date.now() + 600000,
    refreshExpiresAt: Date.now() + 3600000,
    accountId: 'user-ceo',
  });
  const storedRaw = sessionMap.get(AUTH_SESSION_STORAGE_KEY) || '';
  assert.equal(storedRaw.includes('secret-refresh-token-muc05'), false, 'Mục 05: sessionStorage must NEVER store refreshToken');
  clearAuthToken();

  // Mục 08: 100 POs use 1 request; 1,001 POs use 11 requests (continuing from firstPage.nextCursor without re-fetching page 1)
  let totalRows = 100;
  let requestCount = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requestCount += 1;
    const searchParams = new URL(url).searchParams;
    const cursor = Number(searchParams.get('cursor') || 0);
    const remaining = Math.max(0, totalRows - cursor);
    const count = Math.min(100, remaining);
    const items = Array.from({ length: count }, (_, idx) => {
      const rowId = cursor + idx + 1;
      return { rowId, poId: `PO-${rowId}`, vendorNo: '15090', vendorItemNo: `SKU-${rowId}` };
    });
    const nextCursor = cursor + count < totalRows ? cursor + count : null;
    return Response.json({
      status: 'ok',
      data: { items, nextCursor, hasMore: nextCursor !== null },
    });
  });

  // Case 1: 100 rows -> 1 request
  requestCount = 0;
  const page1For100 = await fetchOrdersPage({ view: 'reference', limit: 100 });
  assert.equal(page1For100.hasMore, false);
  assert.equal(requestCount, 1, 'Mục 08: 100 rows must use exactly 1 request');

  // Case 2: 1,001 rows -> 11 requests total (Page 1 + 10 continuation pages)
  totalRows = 1001;
  requestCount = 0;
  const firstPage = await fetchOrdersPage({ view: 'reference', limit: 100 });
  assert.equal(firstPage.hasMore, true);
  const all1001 = await fetchOrderCollection(undefined, {
    maxPages: 100,
    limit: 100,
    initialItems: firstPage.items,
    startCursor: firstPage.nextCursor,
  });
  assert.equal(all1001.length, 1001);
  assert.equal(requestCount, 11, 'Mục 08: 1,001 rows must use exactly 11 requests (no duplicate page 1 fetch)');

  // Mục 07: App.jsx blocks export when ordersLoading or incomplete
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes('if (showOrders && ordersLoading)'));
  assert.ok(appSource.includes('if (showOrders && (ordersHasMore || ordersIncomplete))'));
});


test('R01, R02, R04 Nghiệm thu v1.1.0 Pre-Deploy VPS Regressions (FE)', async t => {
  const {
    AUTH_SESSION_STORAGE_KEY,
    computeProactiveRefreshDelayMs,
    setAuthToken,
    clearAuthToken,
  } = await import('../src/services/api.js');
  const { fetchOrderHistory } = await import('../src/features/orders/services/ordersService.js');

  // R01: sessionStorage stores neither access token nor refreshToken
  const sessionMap = new Map();
  globalThis.sessionStorage = {
    getItem: k => sessionMap.get(k) ?? null,
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: k => sessionMap.delete(k),
  };
  const now = Date.now();
  setAuthToken('in-memory-access-token-r01', null, {
    accessExpiresAt: now + 120000,
    refreshExpiresAt: now + 3600000,
    accountId: 'user-ceo',
  });
  const rawStored = sessionMap.get(AUTH_SESSION_STORAGE_KEY) || '{}';
  const parsedStored = JSON.parse(rawStored);
  assert.equal(parsedStored.token, undefined, 'R01: Access token must stay in memory and NOT be written to sessionStorage');
  assert.equal(parsedStored.refreshToken, undefined, 'R01: Refresh token must NOT be written to sessionStorage');
  assert.equal(parsedStored.hasSession, true);

  // R02: When access token has 120s left in cookie mode (refreshToken === null), proactive timer schedules at ~90s (never 600s!)
  const delayMs = computeProactiveRefreshDelayMs(now);
  assert.equal(delayMs, 90000, 'R02: Proactive refresh delay for 120s access token in cookie mode must be 90000ms (120s - 30s), not 600000ms');
  clearAuthToken();

  // R04: Exporting history for 2,001 POs uses 5 requests (batchSize=500) and automatically retries on 429 Retry-After
  setAuthToken('acc-r04-export', null, {
    accessExpiresAt: Date.now() + 600000,
    refreshExpiresAt: Date.now() + 3600000,
    accountId: 'user-ceo',
  });
  let historyCalls = 0;
  let injected429 = false;
  t.mock.method(globalThis, 'fetch', async () => {
    historyCalls += 1;
    if (historyCalls === 3 && !injected429) {
      injected429 = true;
      return new Response(JSON.stringify({ message: 'Too many requests' }), {
        status: 429,
        headers: { 'Retry-After': '0.05', 'Content-Type': 'application/json' },
      });
    }
    return Response.json({
      status: 'ok',
      data: { items: [{ id: `H-${historyCalls}`, occurredAt: '2026-11-16T00:00:00Z' }] },
    });
  });
  const items2001 = Array.from({ length: 2001 }, (_, idx) => ({ rowId: idx + 1 }));
  const histResult = await fetchOrderHistory(items2001);
  assert.equal(histResult.length, 5, 'R04: 2,001 POs must complete in 5 batches of <=500');
  assert.equal(historyCalls, 6, 'R04: 5 batches + 1 automatic retry after 429');
  clearAuthToken();
});

test('Mục 01, 02, 05 Báo cáo QA tổng hợp v1.1.0 Bản 2 Regressions (FE)', async t => {
  const {
    AUTH_SESSION_STORAGE_KEY,
    clearAuthToken,
    getAuthToken,
    getRefreshToken,
    hasActiveAuthSession,
    logoutApi,
    parseRetryAfterMs,
  } = await import('../src/services/api.js');
  const { fetchOrderHistory } = await import('../src/features/orders/services/ordersService.js');

  // 1. Mục 01 (P1): Logout when only cookie + sessionStorage metadata exist (authToken === null, refreshToken === null in JS)
  clearAuthToken();
  globalThis.sessionStorage?.setItem?.(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      hasSession: true,
      accessExpiresAt: 0,
      refreshExpiresAt: Date.now() + 3600_000,
      accountId: 'user-ceo',
      account: { id: 'user-ceo', role: 'CEO', status: 'active' },
    })
  );
  assert.equal(getAuthToken(), null);
  assert.equal(getRefreshToken(), null);
  assert.equal(hasActiveAuthSession(), true);

  let logoutCalls = 0;
  let logoutCredentials = null;
  let logoutHeaders = null;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/auth/logout')) {
      logoutCalls += 1;
      logoutCredentials = options?.credentials;
      logoutHeaders = options?.headers;
      return new Response(JSON.stringify({ status: 'ok', data: { loggedOut: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ status: 'ok', data: {} }), { status: 200 });
  });

  await logoutApi();
  assert.equal(logoutCalls, 1, 'Mục 01: Must call POST /auth/logout even when only cookie metadata exists in sessionStorage');
  assert.equal(logoutCredentials, 'same-origin');
  assert.equal(logoutHeaders?.['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(globalThis.sessionStorage?.getItem?.(AUTH_SESSION_STORAGE_KEY), null);
  assert.equal(hasActiveAuthSession(), false);

  // 2. Mục 02: nginx.vps.conf includes HTTPS (443 ssl) and redirects HTTP (80) -> HTTPS
  const nginxConf = fs.readFileSync(new URL('../nginx.vps.conf', import.meta.url), 'utf8');
  assert.match(nginxConf, /listen\s+443\s+ssl/);
  assert.match(nginxConf, /return\s+301\s+https:\/\/\$host\$request_uri/);
  assert.match(nginxConf, /proxy_pass\s+http:\/\/127\.0\.0\.1:4000/);

  // 3. Mục 05 (P2): parseRetryAfterMs does not clamp 30s to 10s, and fetchOrderHistory surfaces retry time when Retry-After exceeds deadline
  assert.equal(parseRetryAfterMs('30'), 30000);
  assert.equal(parseRetryAfterMs('60'), 60000);

  let historyCallCount = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    historyCallCount += 1;
    return new Response(
      JSON.stringify({ code: 'RATE_LIMITED', message: 'Quá giới hạn truy vấn báo cáo.' }),
      {
        status: 429,
        headers: { 'Retry-After': '60', 'Content-Type': 'application/json' },
      }
    );
  });

  let rateErr = null;
  try {
    await fetchOrderHistory([{ rowId: 101 }], undefined, {
      maxRetries: 3,
      maxRetryWaitMs: 15000,
      operationDeadlineMs: 20000,
    });
  } catch (err) {
    rateErr = err;
  }
  assert.ok(rateErr, 'Mục 05: Must reject when Retry-After exceeds retry budget/deadline');
  assert.equal(historyCallCount, 1, 'Mục 05: Must not wait in vain when Retry-After exceeds budget');
  assert.equal(rateErr.status, 429);
  assert.equal(rateErr.retryAfterMs, 60000);
  assert.equal(rateErr.retryAfterSeconds, 60);
  assert.equal(rateErr.exceededDeadline, true);
  assert.match(rateErr.message, /thử lại sau 60 giây/i);

  // Verify user cancellation during Retry-After wait aborts immediately
  const abortCtrl = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    setTimeout(() => abortCtrl.abort(), 30);
    return new Response(
      JSON.stringify({ code: 'RATE_LIMITED', message: 'Tạm giới hạn.' }),
      {
        status: 429,
        headers: { 'Retry-After': '5', 'Content-Type': 'application/json' },
      }
    );
  });
  await assert.rejects(
    () => fetchOrderHistory([{ rowId: 102 }], abortCtrl.signal, { maxRetries: 3, maxRetryWaitMs: 30000 }),
    { name: 'AbortError' }
  );
});

test('F01, F02, D01 Báo cáo QA v1.1.0 Bản 3 Regressions (FE)', async t => {
  const {
    LOGOUT_BROADCAST_KEY,
    parseCrossTabLogoutPayload,
    clearAuthToken,
    setAuthToken,
    logoutApi,
  } = await import('../src/services/api.js');
  const { fetchOrderHistory } = await import('../src/features/orders/services/ordersService.js');

  // F01: Multi-batch export MUST NOT start a second batch once operationDeadlineMs has expired
  let batchFetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    batchFetchCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 60));
    return new Response(JSON.stringify({ status: 'ok', data: { items: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const itemsTwoBatches = Array.from({ length: 600 }, (_, i) => ({ rowId: i + 1 }));
  await assert.rejects(
    () => fetchOrderHistory(itemsTwoBatches, undefined, { batchSize: 500, operationDeadlineMs: 25 }),
    { code: 'OPERATION_DEADLINE_EXCEEDED' }
  );
  assert.equal(batchFetchCalls, 1, 'F01: Must NOT fire batch 2 after operationDeadlineMs expires');

  // F01: App.jsx passes exportController.signal to fetchOrderHistory
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /fetchOrderHistory\s*\(\s*exportVendorItems\s*,\s*exportController\.signal\s*\)/);

  // F02: App.jsx registers storage listener on LOGOUT_BROADCAST_KEY and logoutApi emits structured payload
  assert.match(appSource, /addEventListener\s*\(\s*['"]storage['"]/);
  assert.match(appSource, /LOGOUT_BROADCAST_KEY/);

  clearAuthToken();
  setAuthToken('access-tab-a', 'refresh-tab-a', { accountId: 'user-ceo' });
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ status: 'ok', data: { loggedOut: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  await logoutApi();
  const rawBroadcast = globalThis.localStorage?.getItem?.(LOGOUT_BROADCAST_KEY);
  const parsedBroadcast = parseCrossTabLogoutPayload(rawBroadcast);
  assert.equal(parsedBroadcast?.accountId, 'user-ceo');
  assert.equal(parsedBroadcast?.serverRevoked, true);

  // D01: nginx.vps.conf only declares erp.uyenvu-international.com (does not hijack main company domain)
  const nginxConf = fs.readFileSync(new URL('../nginx.vps.conf', import.meta.url), 'utf8');
  assert.match(nginxConf, /server_name\s+erp\.uyenvu-international\.com;/);
  assert.doesNotMatch(nginxConf, /server_name\s+[^;]*\s+uyenvu-international\.com/);
});


test('SEC-01, SEC-02, SEC-07, SEC-08 Security Audit Regressions (FE)', async () => {
  const { readFileSync } = await import('node:fs');
  const { initialFinanceState, recordPayable, submitPayable, reviewPayable } = await import('../src/utils/financeWorkflow.js');

  const ceo = { id: 'user-ceo', role: 'CEO', status: 'active', permissions: ['payables.read', 'payables.submit', 'payables.approve'], navigation: ['payables'] };
  const admin = { id: 'user-admin', role: 'Admin', status: 'active', permissions: ['payables.read', 'payables.submit', 'payables.approve'], navigation: ['payables'] };

  // SEC-01 & SEC-02 in FE financeWorkflow
  let state = initialFinanceState([], [], [], '2026-11-10');
  state = recordPayable(state, ceo, {
    docNo: 'AP-FE-SEC01',
    vendorNo: '15000',
    supplierName: 'Nhật Long Anh',
    poId: 'UV-55151',
    sku: 'Quần tây xanh',
    category: 'Quần áo',
    dueDate: '2026-11-25',
    originalAmount: 40000000,
  });
  const apId = state.payables[0].id;
  assert.throws(() => submitPayable(state, ceo, { id: apId, amount: 40000000, dueDate: '2026-11-25', note: 'Tự duyệt', approveDirectly: true }), /không được tự duyệt/);
  state = submitPayable(state, ceo, { id: apId, amount: 40000000, dueDate: '2026-11-25', note: 'Trình lần 1' });
  assert.equal(state.payables[0].proposalVersion, 1);
  assert.throws(() => reviewPayable(state, ceo, { id: apId, approve: true, note: 'CEO tự duyệt' }), /không được tự duyệt/);
  assert.throws(() => reviewPayable(state, admin, { id: apId, approve: true, note: 'Sai phiên bản', expectedProposalVersion: 2 }), /phiên bản mới/);
  state = reviewPayable(state, admin, { id: apId, approve: true, note: 'Admin duyệt đúng bản v1', expectedProposalVersion: 1, expectedRequestedAmount: 40000000 });
  assert.equal(state.payables[0].approvalState, 'Đã duyệt');

  // SEC-07: nginx.vps.conf includes HSTS and CSP headers
  const nginxConf = readFileSync(new URL('../nginx.vps.conf', import.meta.url), 'utf8');
  assert.match(nginxConf, /Strict-Transport-Security/);
  assert.match(nginxConf, /Content-Security-Policy/);

  // BUILD-01 & DOS-01/02: package-lock.json has authentic npm registry versions (2.3.2 and 4.0.7) and nginx.vps.conf has limit_req_zone & limit_conn_zone
  const lockObj = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lockObj.packages['node_modules/picomatch'].version, '2.3.2');
  assert.equal(lockObj.packages['node_modules/vite/node_modules/picomatch'].version, '4.0.7');
  assert.equal(lockObj.packages['node_modules/tinyglobby/node_modules/picomatch'].version, '4.0.7');
  assert.match(nginxConf, /limit_req_zone/);
  assert.match(nginxConf, /limit_conn_zone/);
});

test('Sale auto-owns created order and TasksPage splits into 2 frames (Order assignment vs External tasks)', async () => {
  const { updateProgressRecord, loadTrackedItems } = await import('../src/utils/orderFulfillment.js');
  const {
    applyTaskAction,
    canExecutiveAssignOrder,
    filterTaskRows,
    isSaleSelfOwnedOrder,
    resolveAlertAssignmentInfo,
    resolveTaskCategory,
  } = await import('../src/features/operations/services/taskWorkflow.js');
  const { readEntryRows } = await import('../src/features/dataEntry/service.js');
  const { ENTRY_SHEETS } = await import('../src/features/dataEntry/schema.js');

  const saleUser = {
    id: 'user-sale-1',
    name: 'Lê Hương',
    email: 'sale@uyenvu.vn',
    role: 'Sale',
    roleLabel: 'Phòng Sale',
    status: 'active',
    permissions: ['orders.read', 'orders.update', 'tasks.read', 'tasks.work'],
    navigation: ['overview', 'orders', 'data-entry', 'tasks', 'reminders'],
  };
  const ceoUser = {
    id: 'user-ceo-1',
    name: 'Trần Quốc',
    email: 'ceo@uyenvu.vn',
    role: 'CEO',
    roleLabel: 'CEO',
    status: 'active',
    permissions: ['orders.read', 'orders.update', 'tasks.assign', 'tasks.read'],
    navigation: ['overview', 'orders', 'data-entry', 'assignments', 'reminders'],
  };
  const today = new Date().toISOString().slice(0, 10);

  const saleOrderRaw = updateProgressRecord(
    {
      rowId: 101,
      poId: 'UV-SALE-101',
      vendorItemNo: 'Áo Khoác Dù',
      vendorNo: '15000',
      vendorName: 'Nhật Long Anh',
      category: 'Quần Áo',
      releasedPoDate: today,
      unit: 'pcs',
      orderedQty: 300,
      nhap: 0,
      deliveredQty: 0,
      onProcessPct: 0,
      packagingPct: 0,
      trackingHistory: [],
    },
    saleUser,
    { orderedQty: 300, unit: 'pcs', nhap: 0, deliveredQty: 0, onProcessPct: 0, packagingPct: 0, changeReason: 'Sale tạo đơn hàng mới' },
    today
  );

  const ceoOrderRaw = updateProgressRecord(
    {
      rowId: 102,
      poId: 'UV-CEO-102',
      vendorItemNo: 'Quần Kaki',
      vendorNo: '15000',
      vendorName: 'Nhật Long Anh',
      category: 'Quần Áo',
      releasedPoDate: today,
      unit: 'pcs',
      orderedQty: 500,
      nhap: 0,
      deliveredQty: 0,
      onProcessPct: 0,
      packagingPct: 0,
      trackingHistory: [],
    },
    ceoUser,
    { orderedQty: 500, unit: 'pcs', nhap: 0, deliveredQty: 0, onProcessPct: 0, packagingPct: 0, changeReason: 'CEO tạo đơn hàng mới' },
    today
  );

  const tracked = loadTrackedItems([saleOrderRaw, ceoOrderRaw]);
  assert.equal(isSaleSelfOwnedOrder(tracked[0]), true);
  assert.equal(canExecutiveAssignOrder(tracked[0]), false);
  assert.equal(tracked[0].assignedSaleName, 'Lê Hương');

  assert.equal(isSaleSelfOwnedOrder(tracked[1]), false);
  assert.equal(canExecutiveAssignOrder(tracked[1]), true);

  const saleAlertInfo = resolveAlertAssignmentInfo(
    { id: 'order-101', type: 'orders', reference: 'UV-SALE-101', data: tracked[0] },
    [],
    [saleUser, ceoUser],
    [],
    today
  );
  assert.equal(saleAlertInfo.isAssigned, true);
  assert.match(saleAlertInfo.italicLine, /Sale tạo & đảm nhận: Lê Hương/);

  const ordersSheet = ENTRY_SHEETS.find(s => s.id === 'orders');
  const entryRows = readEntryRows(ordersSheet, saleUser, {
    items: tracked,
    finance: {},
    directory: { accounts: [saleUser, ceoUser], tasks: [], reminders: [] },
  });
  assert.match(entryRows[0].createdByLabel, /Lê Hương/);
  assert.match(entryRows[0].ownerHandlerLabel, /Sale tự nhận đơn/);
  assert.match(entryRows[1].ownerHandlerLabel, /Đơn Sếp tạo · Chờ giao việc/);

  const dirState = { tasks: [], reminders: [], taskFiles: {} };
  // Chặn Sếp giao lại đơn hàng do Sale tạo
  assert.throws(() =>
    applyTaskAction(
      dirState,
      [saleUser, ceoUser],
      ceoUser,
      'create-task',
      {
        scope: 'person',
        assigneeId: saleUser.id,
        title: 'Thử giao đơn của Sale',
        description: 'Không được phép',
        deadline: today,
        taskCategory: 'order',
        orderRowId: 101,
        sourceAlert: { type: 'orders', id: 'order-101', reference: 'UV-SALE-101' },
      },
      new Date(),
      tracked
    )
  );

  // Sếp giao đơn hàng do Sếp tạo ở Khung 1
  applyTaskAction(
    dirState,
    [saleUser, ceoUser],
    ceoUser,
    'create-task',
    {
      scope: 'person',
      assigneeId: saleUser.id,
      title: 'Xử lý đơn hàng PO UV-CEO-102',
      description: 'Theo dõi nhập kho và giao hàng',
      deadline: today,
      taskCategory: 'order',
      orderRowId: 102,
      sourceAlert: { type: 'orders', id: 'order-102', reference: 'UV-CEO-102' },
    },
    new Date(),
    tracked
  );

  // Sếp giao việc bên ngoài ở Khung 2
  applyTaskAction(
    dirState,
    [saleUser, ceoUser],
    ceoUser,
    'create-task',
    {
      scope: 'person',
      assigneeId: saleUser.id,
      title: 'Chuẩn bị hồ sơ kiểm toán',
      description: 'Việc bên ngoài không gắn với PO',
      deadline: today,
      taskCategory: 'external',
    },
    new Date(),
    tracked
  );

  assert.equal(dirState.tasks.length, 2);
  assert.equal(resolveTaskCategory(dirState.tasks[0]), 'order');
  assert.equal(resolveTaskCategory(dirState.tasks[1]), 'external');
  assert.equal(filterTaskRows(dirState.tasks, { categoryFilter: 'order', accounts: [saleUser, ceoUser], today }).length, 1);
  assert.equal(filterTaskRows(dirState.tasks, { categoryFilter: 'external', accounts: [saleUser, ceoUser], today }).length, 1);
});

test("Accountant auto-owns financial records (Revenue, AR, AP) when Accountant creates them; Boss-created finance records can be assigned", async () => {
  const { recordInvoice, createReceivable, recordPayable } = await import("../src/utils/financeWorkflow.js");
  const { isAccountantSelfOwnedFinance, canExecutiveAssignFinance, resolveAlertAssignmentInfo, applyTaskAction } = await import("../src/features/operations/services/taskWorkflow.js");
  const { businessToday } = await import("../src/utils/business.js");

  const today = businessToday();
  const accountantUser = { id: "user-accountant", name: "Phạm Lan", email: "ketoan@uyenvu.vn", role: "Accountant", roleLabel: "Phòng Kế toán", status: "active", permissions: ["revenue.create", "receivables.allocate", "payables.submit"] };
  const ceoUser = { id: "user-ceo", name: "Trần Quốc", email: "ceo@uyenvu.vn", role: "CEO", roleLabel: "CEO", status: "active", permissions: ["revenue.create", "receivables.allocate", "payables.submit"] };

  const poItems = [{
    rowId: 501,
    poId: "UV-FIN-501",
    vendorNo: "15316",
    vendorName: "Nhật Long Anh",
    vendorItemNo: "Áo Sơ Mi Trắng",
    category: "Quần Áo",
    unit: "pcs",
    orderedQty: 500,
    nhap: 400,
    deliveredQty: 200,
    unitPriceVnd: 100000,
    totalValueVnd: 50000000,
  }];

  let fin = { openingDate: today, revenue: [], receivables: [], receipts: [], allocations: [], payables: [], payments: [], payableSplitSources: [], audit: [] };
  // 1. Accountant records invoice -> auto-owns both revenue and linked AR
  fin = recordInvoice(fin, accountantUser, {
    rowId: 501,
    docNo: "HD-ACC-501",
    customerName: "Công ty Minh Phát",
    recordDate: today,
    dueDate: today,
    shippedQty: 100,
    netRevenue: 15000000,
    basis: "Nghiệm thu lô 1",
  }, poItems, today);

  const accRev = fin.revenue.find(r => r.docNo === "HD-ACC-501");
  const accLinkedAr = fin.receivables.find(r => r.docNo === "HD-ACC-501");
  assert.equal(accRev.ownerType, "accountant_self_owned");
  assert.equal(accRev.assignedAccountantId, accountantUser.id);
  assert.equal(accLinkedAr.ownerType, "accountant_self_owned");
  assert.equal(accLinkedAr.assignedAccountantName, "Phạm Lan");
  assert.equal(isAccountantSelfOwnedFinance(accLinkedAr), true);
  assert.equal(canExecutiveAssignFinance(accLinkedAr), false);

  // 2. Accountant creates standalone AR & AP -> auto-owns both and defaults PIC on AP
  fin = createReceivable(fin, accountantUser, {
    docNo: "AR-ACC-502",
    customerName: "Khách Lẻ A",
    dueDate: today,
    originalAmount: 8000000,
  }, poItems, today);
  const accStandaloneAr = fin.receivables.find(r => r.docNo === "AR-ACC-502");
  assert.equal(accStandaloneAr.ownerType, "accountant_self_owned");

  fin = recordPayable(fin, accountantUser, {
    docNo: "AP-ACC-503",
    poId: "UV-FIN-501",
    vendorNo: "15316",
    supplierName: "Nhật Long Anh",
    sku: "Áo Sơ Mi Trắng",
    category: "Quần Áo",
    dueDate: today,
    originalAmount: 12000000,
  }, poItems, today);
  const accAp = fin.payables.find(p => p.docNo === "AP-ACC-503");
  assert.equal(accAp.ownerType, "accountant_self_owned");
  assert.equal(accAp.pic, "Phạm Lan");

  const accAlertInfo = resolveAlertAssignmentInfo(
    { id: `payables-${accAp.id}`, type: "payables", reference: accAp.docNo, data: accAp },
    [],
    [accountantUser, ceoUser],
    [],
    today
  );
  assert.equal(accAlertInfo.isAssigned, true);
  assert.equal(accAlertInfo.isAccountantSelfOwned, true);
  assert.ok(accAlertInfo.summaryText.includes("Kế toán tạo & đảm nhận: Phạm Lan"));

  // Boss cannot reassign Accountant self-owned finance alert
  const dirState = { tasks: [], taskFiles: {}, reminders: [] };
  assert.throws(() =>
    applyTaskAction(
      dirState,
      [accountantUser, ceoUser],
      ceoUser,
      "create-task",
      {
        scope: "person",
        assigneeId: accountantUser.id,
        title: "Thử giao đè AP của Kế toán",
        description: "Không được phép",
        deadline: today,
        sourceAlert: { type: "payables", id: `payables-${accAp.id}`, reference: accAp.docNo, data: accAp },
      },
      new Date(),
      poItems,
      fin
    )
  );
});

test("UI Cleanups: No form placeholders, no Admin text in dataEntry tables, and bug report email dat.lt@uyenvu-international.com above logout", async () => {
  const { readEntryRows } = await import("../src/features/dataEntry/service.js");
  const { ENTRY_SHEETS } = await import("../src/features/dataEntry/schema.js");
  const fsMod = await import("node:fs");
  const menuSrc = fsMod.readFileSync(new URL("../src/features/auth/components/AccountMenu.jsx", import.meta.url), "utf8");
  assert.ok(menuSrc.includes("Báo cáo lỗi vui lòng email:"));
  assert.ok(menuSrc.includes("dat.lt@uyenvu-international.com"));
  const bugIdx = menuSrc.indexOf("profile-menu-bug-report");
  const logoutIdx = menuSrc.indexOf("profile-menu-footer");
  assert.ok(bugIdx > 0 && logoutIdx > bugIdx, "Bug report email block must be positioned above the logout footer");

  for (const rel of [
    "../src/components/finance/FinanceForms.jsx",
    "../src/components/finance/MoneyField.jsx",
    "../src/features/dataEntry/DataEntryPage.jsx",
    "../src/features/operations/components/TasksPage.jsx",
    "../src/features/operations/components/RemindersPage.jsx",
  ]) {
    const code = fsMod.readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.equal(code.includes("placeholder="), false, `${rel} must not contain faint placeholder text`);
  }

  const ceoActor = { id: "user-ceo", name: "Trần Quốc", role: "CEO", status: "active", permissions: ["orders.read", "orders.write"], navigation: ["orders", "data-entry"] };
  const ordersSheet = ENTRY_SHEETS.find(s => s.id === "orders");
  const rows = readEntryRows(ordersSheet, ceoActor, {
    items: [{ rowId: 1, poId: "PO-1", createdByRole: "Admin", createdByName: "Quản trị Demo", ownerType: "executive_created" }],
    finance: {},
    directory: { accounts: [], tasks: [], reminders: [] },
  });
  assert.equal(rows[0].createdByLabel.includes("Admin"), false);
  assert.equal(rows[0].createdByLabel.includes("Quản trị"), false);
});

test('Pre-Deploy Audit v1.1.0 Ban 4 Regressions (FE): AP-01, DOS-01, DOS-02, BUILD-01, SUP-01', () => {
  const pkgLock = fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  assert.ok(!pkgLock.includes('picomatch-4.0.8.tgz'), 'BUILD-01: package-lock.json must not reference non-existent picomatch@4.0.8');
  assert.ok(pkgLock.includes('picomatch-4.0.7.tgz') && pkgLock.includes('picomatch-2.3.2.tgz'), 'BUILD-01/SUP-01: package-lock.json must use valid registry picomatch tarballs');

  const nginxConf = fs.readFileSync(new URL('../nginx.vps.conf', import.meta.url), 'utf8');
  assert.ok(nginxConf.includes('limit_req_zone') && nginxConf.includes('limit_conn_zone'), 'DOS-01: nginx.vps.conf must define limit_req_zone and limit_conn_zone');
  assert.ok(nginxConf.includes('location = /api/v1/health') && nginxConf.includes('allow 127.0.0.1;') && nginxConf.includes('deny all;'), 'DOS-02: nginx.vps.conf must restrict /api/v1/health to loopback');

  const fw = fs.readFileSync(new URL('../src/utils/financeWorkflow.js', import.meta.url), 'utf8');
  assert.ok(fw.includes('AP_PROPOSAL_VERSION_REQUIRED') && fw.includes('AP_PROPOSAL_CONFLICT'), 'AP-01: FE financeWorkflow.js must enforce mandatory expectedProposalVersion');
});

test('Modal Window Data Entry, Hidden rowId, Unique PO Check & Typed Excel Template Regressions (FE)', async context => {
  const { ENTRY_SHEETS, visibleSheetColumns } = await import('../src/features/dataEntry/schema.js');
  const { inspectEntryCell, validateDraftRowsFrontend } = await import('../src/features/dataEntry/service.js');
  const { downloadEntryWorkbook, getColumnFormatMetadata } = await import('../src/features/dataEntry/workbook.js');
  const { default: ExcelJS } = await import('exceljs');

  // 1. rowId ('Mã dòng PO') is hidden in visibleSheetColumns while all other business columns remain intact
  const ordersSheet = ENTRY_SHEETS.find(s => s.id === 'orders');
  const visibleCols = visibleSheetColumns([...ordersSheet.columns, ...(ordersSheet.extra || [])]);
  assert.equal(visibleCols.some(c => c.key === 'rowId'), false, 'rowId must be hidden from UI and template');
  for (const requiredKey of [
    'poId', 'vendorItemNo', 'vendorNo', 'vendorName', 'category', 'countryOfOrigin',
    'releasedPoDate', 'unit', 'orderedQty', 'unitPriceVnd', 'nhap', 'deliveredQty',
    'onProcessPct', 'packagingPct', 'expectedReceiptDate', 'shipDateEtd', 'etaDate',
    'actualShipDate', 'actualDeliveryDate', 'changeReason', 'createdByLabel', 'ownerHandlerLabel'
  ]) {
    assert.equal(visibleCols.some(c => c.key === requiredKey), true, `Column ${requiredKey} must be preserved`);
  }

  // 2. Frontend catches duplicate PO ID against existing orders and within draft rows
  const existingOrders = [{ rowId: 1, poId: 'UV-55151', vendorItemNo: 'Quần tây xanh' }];
  const dupExistingCell = inspectEntryCell('poId', 'uv-55151', {}, { sheetId: 'orders', existingOrders, draftPoCounts: ['uv-55151'] });
  assert.match(dupExistingCell.error, /đã tồn tại/);

  const dupDraftCell = inspectEntryCell('poId', 'UV-99999', {}, { sheetId: 'orders', existingOrders, draftPoCounts: ['uv-99999', 'uv-99999'] });
  assert.match(dupDraftCell.error, /lặp lại/);

  const draftIssues = validateDraftRowsFrontend(
    ordersSheet,
    [
      { line: 2, values: { poId: 'UV-55151', vendorItemNo: 'Áo sơ mi', vendorNo: '15000', vendorName: 'NCC A', category: 'Quần áo', releasedPoDate: '2026-11-10', unit: 'pcs', orderedQty: '100' } },
      { line: 3, values: { poId: 'UV-NEW-1', vendorItemNo: 'Áo khoác', vendorNo: '15000', vendorName: 'NCC A', category: 'Quần áo', releasedPoDate: '2026-11-10', unit: 'pcs', orderedQty: '200' } },
      { line: 4, values: { poId: 'UV-NEW-1', vendorItemNo: 'Quần kaki', vendorNo: '15000', vendorName: 'NCC A', category: 'Quần áo', releasedPoDate: '2026-11-10', unit: 'pcs', orderedQty: '300' } },
    ],
    { items: existingOrders, finance: {} }
  );
  assert.equal(draftIssues.length, 2);
  assert.match(draftIssues[0].message, /UV-55151.*đã tồn tại/);
  assert.match(draftIssues[1].message, /UV-NEW-1.*trùng lặp/);

  // 3. Excel template (rows = []) hides rowId, formats columns with numFmt & dataValidation, and adds Huong_dan_kieu_du_lieu sheet
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { createObjectURL, revokeObjectURL } = URL;
  context.after(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  let templateBlob;
  URL.createObjectURL = blob => { templateBlob = blob; return 'blob:test-template'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { body: { append() {} }, createElement: () => ({ click() {}, remove() {} }) };

  await downloadEntryWorkbook(ordersSheet, visibleSheetColumns(ordersSheet.columns), [], 'vi');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await templateBlob.arrayBuffer());
  const poSheet = wb.getWorksheet('PO');
  const guideSheet = wb.getWorksheet('Huong_dan_kieu_du_lieu');
  assert.ok(poSheet, 'Template must contain PO worksheet');
  assert.ok(guideSheet, 'Template must contain Huong_dan_kieu_du_lieu worksheet');
  assert.equal(poSheet.getCell('A1').value, 'Mã PO', 'First column in PO template must be Mã PO (rowId hidden)');
  assert.ok(getColumnFormatMetadata({ key: 'releasedPoDate', label: 'Ngày phát hành PO', type: 'date' }).numFmt.includes('yyyy-mm-dd'));

  // 4. All data entry pages use FormWindowDialog modal window mode
  for (const rel of [
    '../src/features/dataEntry/DataEntryPage.jsx',
    '../src/features/operations/components/RemindersPage.jsx',
    '../src/features/operations/components/TasksPage.jsx',
    '../src/features/users/components/AccountsPage.jsx',
  ]) {
    const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(src.includes('FormWindowDialog'), `${rel} must use FormWindowDialog for modal window data entry`);
  }
});

