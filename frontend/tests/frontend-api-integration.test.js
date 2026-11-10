import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_RESET = 'true';

import { startServer } from '../../uyen-vu-backend/src/server.js';
import {
  configureApi,
  executeFinanceActionApi,
  apiRequest,
} from '../src/services/api.js';
import {
  attemptMockSignIn,
  changeMockPassword,
} from '../src/features/auth/services/mockAuth.js';
import {
  directoryProfiles,
  readDirectory,
  readTaskAttachment,
  saveDirectoryAction,
  taskWorkspace,
} from '../src/features/users/services/demoDirectory.js';
import { saveTrackedItem } from '../src/utils/orderFulfillment.js';
import { saveEntryBatch } from '../src/features/dataEntry/service.js';

let serverInstance = null;

test.before(async () => {
  const started = await startServer(0, '127.0.0.1');
  serverInstance = started.server;
  configureApi({ baseURL: `http://127.0.0.1:${started.port}/api/v1` });
});

test.after(async () => {
  if (serverInstance) {
    await new Promise(resolve => serverInstance.close(resolve));
  }
});

test('FE Zero-Mock Verification: src/mock directory does not exist and readDirectory() returns empty state prior to API login', () => {
  assert.equal(fs.existsSync(path.resolve('src/mock')), false);
  const initialDir = readDirectory();
  assert.deepEqual(initialDir.accounts, []);
  assert.deepEqual(initialDir.tasks, []);
  assert.deepEqual(initialDir.reminders, []);
});

test('FE -> BE End-to-End Integration: Auth, Directory, PO Progress, Finance, Reminders, Private Attachments & Batch Entry via API', async () => {
  await apiRequest('POST', '/testing/reset');

  // 1. Đăng nhập từ Frontend qua API Backend
  const loginRes = await attemptMockSignIn('ceo@uyenvu.vn', '123');
  assert.equal(loginRes.status, 'authenticated');
  assert.equal(loginRes.account.id, 'user-ceo');
  assert.ok(loginRes.orders.length >= 6);
  assert.ok(loginRes.finance.revenue.length >= 4);
  assert.ok(loginRes.directory.tasks.length > 0);

  // 2. Tạo tài khoản mới qua saveDirectoryAction của Frontend
  const dirAfterCreate = await saveDirectoryAction('user-ceo', 'create-account', {
    name: 'Trần Sale API',
    email: 'sale.api@uyenvu.vn',
    password: 'StrongPassword@123',
    role: 'Sale',
  });
  const profiles = directoryProfiles(dirAfterCreate);
  assert.ok(profiles.some(p => p.email === 'sale.api@uyenvu.vn'));

  // 3. Cập nhật tiến độ PO từ Frontend qua saveTrackedItem -> PATCH /orders/items/:rowId/progress
  const updatedPo = await saveTrackedItem(3500003, {
    progressMode: 'today',
    nhap: '500',
    changeReason: 'Cập nhật từ Frontend qua RESTful API.',
    reportDate: '06/11/2026',
    expectedTrackingVersion: null,
  });
  assert.equal(updatedPo.nhap, 8500);
  assert.ok(updatedPo.trackingVersion);

  // 4. Thực hiện nghiệp vụ Tài chính từ Frontend qua executeFinanceActionApi
  const invRes = await executeFinanceActionApi('invoice', {
    rowId: 3500004,
    docNo: 'FE-API-INV-01',
    customerName: 'Demo Retail A',
    recordDate: '05/11/2026',
    dueDate: '25/11/2026',
    shippedQty: 1000,
    netRevenue: 5000000,
    basis: 'Hóa đơn tạo từ Frontend nối API.',
    today: '2026-11-06',
    expectedRevision: loginRes.finance.revision,
  });
  assert.ok(invRes.finance.revenue.some(r => r.docNo === 'FE-API-INV-01'));

  // 5. Tải tệp đính kèm công việc từ Frontend qua readTaskAttachment -> GET /operations/tasks/:id/files/:fileId
  const file = await readTaskAttachment(
    'user-ceo',
    'demo-task-active-sale',
    'DEMO-TASKFILE-PACKING-GUIDE'
  );
  assert.equal(file.name, 'huong-dan-kiem-tra-dong-goi.txt');
  assert.ok(file.content.length > 0);

  // 6. Nhập liệu lô Excel từ Frontend qua saveEntryBatch -> POST /data-entry/sheets/orders/batch
  const batchRes = await saveEntryBatch(
    'user-ceo',
    'orders',
    [
      {
        line: 2,
        values: {
          rowId: '3500004',
          poId: 'UV-Intl-3500004',
          nhap: '2.000',
          onProcessPct: '75%',
          packagingPct: '50%',
          changeReason: 'FE Batch API',
        },
      },
    ],
    { now: '2026-11-06T09:00:00+07:00' }
  );
  assert.ok(Array.isArray(batchRes.items));
  const po4 = batchRes.items.find(i => i.rowId === 3500004);
  assert.equal(po4.nhap, 2000);

  // 7. Đổi mật khẩu từ Frontend qua changeMockPassword -> POST /auth/change-password
  const saleLogin = await attemptMockSignIn('sale.api@uyenvu.vn', 'StrongPassword@123');
  assert.equal(saleLogin.status, 'authenticated');
  const pwdIssue = await changeMockPassword(
    saleLogin.account.id,
    'StrongPassword@123',
    'UpdatedPassword@456'
  );
  assert.equal(pwdIssue, null);
});
