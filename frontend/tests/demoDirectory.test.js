import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectoryAction as applyAction, DIRECTORY_KEY, directoryProfiles, readDirectory, readTaskAttachment, taskWorkspace } from '../src/features/users/services/demoDirectory.js';
import { attemptMockSignIn, authenticateMockAccount, changeMockPassword } from '../src/features/auth/services/mockAuth.js';
import { can, canOpenSection, homeSection, manageableRoles } from '../src/utils/roles.js';
import {
  TASK_DONE, TASK_EXPIRED, TASK_REREVIEW, TASK_RETURNED, TASK_REVIEW,
  REMINDER_PENDING, REMINDER_ASSIGNED, REMINDER_RESOLVED,
  resolveAlertAssignmentInfo, taskStatusAt,
} from '../src/features/operations/services/taskWorkflow.js';

const demoNow = new Date('2026-11-06T09:00:00.000Z');
const applyDirectoryAction = (state, actorId, action, payload, now = demoNow) => applyAction(state, actorId, action, payload, now);

const base = () => readDirectory({ getItem: () => null });
const newAccount = { name: 'Người dùng thử', email: 'sample@example.com', password: 'DemoPass!2026', role: 'Sale' };

test('both CEO and Admin have full executive workspaces, permissions, and role management', async () => {
  const directory = base();
  const users = directoryProfiles(directory);
  const ceo = users.find(row => row.role === 'CEO');
  const admin = users.find(row => row.role === 'Admin');
  assert.deepEqual(manageableRoles(admin), ['CEO', 'Admin', 'Sale', 'Accountant']);
  assert.deepEqual(manageableRoles(ceo), ['CEO', 'Admin', 'Sale', 'Accountant']);
  for (const page of ['overview', 'orders', 'revenue', 'receivables', 'payables', 'users', 'assignments', 'assignment-reviews', 'reminders']) {
    assert.ok(canOpenSection(ceo, page), `CEO should open ${page}`);
    assert.ok(canOpenSection(admin, page), `Admin should open ${page}`);
  }
  assert.equal(homeSection(admin), 'overview');
  assert.equal(canOpenSection(admin, 'payables'), true);
  assert.equal(canOpenSection(admin, 'assignment-reviews'), true);
  assert.equal(can(admin, 'tasks.assign'), true);
  assert.equal(can(admin, 'tasks.confirm'), true);
  assert.equal(can(admin, 'payables.approve'), true);
  assert.equal(canOpenSection(admin, 'tasks'), false);
  for (const user of users.filter(row => ['Sale', 'Accountant'].includes(row.role))) {
    assert.equal(canOpenSection(user, 'assignments'), false);
    assert.equal(canOpenSection(user, 'assignment-reviews'), false);
    assert.equal(canOpenSection(user, 'reminders'), true);
  }
  await assert.rejects(applyDirectoryAction(directory, 'user-sale', 'create-account', newAccount), /không có quyền/);
  await assert.rejects(applyDirectoryAction(directory, admin.id, 'update-account', { id: ceo.id, role: 'Sale', status: 'inactive' }), /không có quyền/);
  await assert.rejects(applyDirectoryAction(directory, ceo.id, 'update-account', { id: ceo.id, role: 'Admin', status: 'inactive' }), /không có quyền/);
});

test('a created account can log in, change password, receive a new role, and be locked', async context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value),
  } });
  context.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage);
  let directory = await applyDirectoryAction(base(), 'user-admin', 'create-account', newAccount);
  store.set(DIRECTORY_KEY, JSON.stringify(directory));
  assert.ok(!JSON.stringify(directory).includes(newAccount.password));
  await assert.rejects(applyDirectoryAction(directory, 'user-admin', 'create-account', { ...newAccount, email: ' SAMPLE@EXAMPLE.COM ' }), /đã được sử dụng/);
  const user = await authenticateMockAccount('Sample@example.com', newAccount.password);
  assert.equal(user.role, 'Sale');
  assert.equal(user.password, undefined);
  assert.equal(await authenticateMockAccount(user.email, 'incorrect'), null);
  assert.equal(await changeMockPassword(user.id, newAccount.password, 'ChangedPass!2026'), null);
  directory = await applyDirectoryAction(directory, 'user-admin', 'update-account', { id: user.id, role: 'Accountant', status: 'active' });
  store.set(DIRECTORY_KEY, JSON.stringify(directory));
  assert.equal((await authenticateMockAccount(user.email, 'ChangedPass!2026')).role, 'Accountant');
  directory = await applyDirectoryAction(directory, 'user-admin', 'update-account', { id: user.id, role: 'Accountant', status: 'inactive' });
  store.set(DIRECTORY_KEY, JSON.stringify(directory));
  assert.equal(await authenticateMockAccount(user.email, 'ChangedPass!2026'), null);
});

const task = { title: 'Đối soát', description: 'Đối soát chứng từ', deadline: '2026-11-12' };
const exampleFile = { name: 'bao-cao.txt', content: 'SGVsbG8=' };

test('both CEO and Admin can assign tasks and both can review and approve any task', async () => {
  for (const manager of ['user-ceo', 'user-admin']) {
    for (const assigneeId of ['user-ceo', 'user-admin']) {
      await assert.rejects(applyDirectoryAction(base(), manager, 'create-task', { ...task, assigneeId }), /người phụ trách/);
    }
  }
  await assert.rejects(applyDirectoryAction(base(), 'user-sale', 'create-task', { ...task, assigneeId: 'user-accountant' }), /Chỉ CEO và Admin/);
  let state = await applyDirectoryAction(base(), 'user-admin', 'create-task', {
    ...task, assigneeId: 'user-sale', files: [exampleFile], requiresFile: true,
  });
  const id = state.tasks.at(-1).id;
  await assert.rejects(applyDirectoryAction(state, 'user-accountant', 'accept', { id }), /không có quyền/);
  state = await applyDirectoryAction(state, 'user-sale', 'accept', { id });
  await assert.rejects(applyDirectoryAction(state, 'user-sale', 'handover', { id, note: 'Kết quả' }), /yêu cầu tệp/);
  await assert.rejects(applyDirectoryAction(state, 'user-sale', 'handover', { id, note: 'Kết quả', files: [
    { ...exampleFile, name: 'script.html' },
  ] }), /định dạng/);
  state = await applyDirectoryAction(state, 'user-sale', 'handover', { id, note: 'Đã đối soát', files: [exampleFile] });
  await assert.rejects(applyDirectoryAction(state, 'user-sale', 'confirm', { id, approve: true }), /không có quyền/);
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'confirm', { id, approve: false, files: [exampleFile] }), /Chỉ chọn kết quả/);
  assert.equal(taskStatusAt(state.tasks.at(-1), '2026-11-06'), TASK_REVIEW);
  for (let round = 1; round <= 3; round++) {
    const filesBefore = Object.keys(state.taskFiles);
    const reviewer = round % 2 === 1 ? 'user-admin' : 'user-ceo';
    state = await applyDirectoryAction(state, reviewer, 'confirm', { id, approve: false, submissionCount: round });
    assert.equal(taskStatusAt(state.tasks.at(-1), '2026-11-06'), TASK_RETURNED);
    assert.deepEqual(state.tasks.at(-1).reviews.at(-1), { approve: false, at: demoNow.toISOString() });
    assert.deepEqual(Object.keys(state.taskFiles), filesBefore);
    state = await applyDirectoryAction(state, 'user-sale', 'handover', { id, note: 'Đã bổ sung', files: [exampleFile] });
    assert.equal(taskStatusAt(state.tasks.at(-1), '2026-11-06'), TASK_REREVIEW);
    await assert.rejects(applyDirectoryAction(state, 'user-admin', 'confirm', {
      id, approve: true, submissionCount: round,
    }), /bản nộp mới/);
  }
  // CEO can approve a task created by Admin and vice versa
  state = await applyDirectoryAction(state, 'user-ceo', 'confirm', { id, approve: true, submissionCount: 4 });
  assert.equal(taskStatusAt(state.tasks.at(-1), '2026-11-06'), TASK_DONE);
  assert.equal(state.tasks.at(-1).submissions.length, 4);
  assert.deepEqual(state.tasks.at(-1).reviews.map(review => review.approve), [false, false, false, true]);
});

test('department assignment is shared with its active members and visible to both CEO and Admin', async context => {
  const seed = base();
  seed.accounts['sale-2'] = { id: 'sale-2', email: 'sale2@example.com', name: 'Sale 2', role: 'Sale', status: 'active' };
  seed.accounts['sale-locked'] = { id: 'sale-locked', email: 'locked@example.com', name: 'Sale Locked', role: 'Sale', status: 'inactive' };
  let state = await applyDirectoryAction(seed, 'user-ceo', 'create-task', { ...task, scope: 'department', department: 'Sale', files: [exampleFile] });
  const batchId = state.tasks.at(-1).batchId;
  const group = state.tasks.filter(row => row.batchId === batchId);
  assert.deepEqual(group.map(row => row.assigneeId), ['user-sale', 'sale-2']);
  assert.equal(group[0].fileIds[0], group[1].fileIds[0]);
  const [first, second] = group;
  const view = id => taskWorkspace(state, directoryProfiles(state).find(user => user.id === id));
  assert.equal(view('user-accountant').tasks.some(row => row.batchId === batchId), false);
  assert.equal(view('user-admin').tasks.some(row => row.batchId === batchId), true);
  assert.equal(view('user-ceo').tasks.some(row => row.batchId === batchId), true);
  assert.deepEqual(view('sale-2').tasks.map(row => row.id), [second.id]);
  state = await applyDirectoryAction(state, 'user-sale', 'accept', { id: first.id });
  state = await applyDirectoryAction(state, 'user-sale', 'handover', { id: first.id, note: 'Kết quả riêng', files: [exampleFile] });
  const resultId = state.tasks.find(row => row.id === first.id).submissions[0].fileIds[0];
  assert.equal(Object.hasOwn(view('sale-2').fileNames, resultId), false);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => key === DIRECTORY_KEY ? JSON.stringify(state) : null,
  } });
  context.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage);
  assert.equal(readTaskAttachment('user-sale', first.id, resultId).name, exampleFile.name);
  assert.equal(readTaskAttachment('user-ceo', first.id, resultId).content, exampleFile.content);
  assert.equal(readTaskAttachment('user-admin', first.id, resultId).content, exampleFile.content);
  assert.throws(() => readTaskAttachment('sale-2', first.id, resultId), /không có quyền/);
  assert.throws(() => readTaskAttachment('sale-2', second.id, resultId), /không có quyền/);
  assert.throws(() => readTaskAttachment('user-accountant', first.id, first.fileIds[0]), /không có quyền/);
});

test('reassignment hides earlier private results from the new recipient', async () => {
  let state = await applyDirectoryAction(base(), 'user-ceo', 'create-task', { ...task, assigneeId: 'user-sale' });
  const id = state.tasks.at(-1).id;
  state = await applyDirectoryAction(state, 'user-sale', 'accept', { id });
  state = await applyDirectoryAction(state, 'user-sale', 'handover', { id, note: 'Kết quả cũ', files: [exampleFile] });
  const oldFile = state.tasks.at(-1).submissions[0].fileIds[0];
  state = await applyDirectoryAction(state, 'user-ceo', 'assign', { id, assigneeId: 'user-accountant', deadline: '2026-11-14', reason: 'Đổi người phụ trách' });
  const view = role => taskWorkspace(state, directoryProfiles(state).find(row => row.role === role));
  const newRecipient = view('Accountant');
  const assigned = newRecipient.tasks.find(row => row.id === id);
  assert.equal(assigned.status, 'Mới giao');
  assert.deepEqual(assigned.submissions, []);
  assert.equal(assigned.previousAssignments, undefined);
  assert.equal(Object.hasOwn(newRecipient.fileNames, oldFile), false);
  assert.equal(view('Sale').tasks.some(row => row.id === id), false);
  assert.equal(view('CEO').fileNames[oldFile], exampleFile.name);
  assert.equal(view('Admin').fileNames[oldFile], exampleFile.name);
});

test('returned demo appears once on an existing directory and supports a new submission', async () => {
  const existing = base();
  const sampleId = 'demo-task-returned-sale';
  existing.tasks = existing.tasks.filter(row => row.id !== sampleId);
  delete existing.taskFiles;
  const stored = readDirectory({ getItem: () => JSON.stringify(existing) });
  const sample = stored.tasks.find(row => row.id === sampleId);
  assert.equal(stored.tasks.length, existing.tasks.length + 1);
  assert.equal(sample.status, TASK_RETURNED);
  assert.equal(sample.assignerId, 'user-ceo');
  assert.equal(sample.reviews[0].approve, false);
  for (const id of sample.submissions[0].fileIds) {
    assert.ok(stored.taskFiles[id].content);
  }
  assert.equal(readDirectory({ getItem: () => JSON.stringify(stored) }).tasks.length, stored.tasks.length);
  const submitted = await applyDirectoryAction(stored, 'user-sale', 'handover', {
    id: sample.id, note: 'Đã bổ sung số giao', files: [exampleFile],
  });
  assert.equal(submitted.tasks.find(row => row.id === sample.id).status, 'Chờ duyệt');
});

test('approval locks a resubmitted task against further edits while preserving the reviewed result', async () => {
  const id = 'demo-task-returned-sale';
  let state = await applyDirectoryAction(base(), 'user-sale', 'handover', {
    id, note: 'Đã bổ sung số giao và ngày xác nhận', files: [exampleFile],
  });
  assert.equal(state.tasks.find(row => row.id === id).status, 'Chờ duyệt');
  state = await applyDirectoryAction(state, 'user-admin', 'confirm', { id, approve: true });
  const approved = state.tasks.find(row => row.id === id);
  assert.equal(approved.status, 'Hoàn tất');
  assert.equal(approved.reviews.at(-1).approve, true);
  for (const action of ['accept', 'handover', 'assign', 'confirm']) {
    const actor = ['accept', 'handover'].includes(action) ? 'user-sale' : 'user-ceo';
    await assert.rejects(applyDirectoryAction(state, actor, action, { id, note: 'Sửa lại', approve: false }), /chỉ có thể xem/);
  }
  assert.equal(approved.submissions.at(-1).note, 'Đã bổ sung số giao và ngày xác nhận');
});

test('demo tasks cover every status for each role pair and preserve work when upgrading', async () => {
  const initial = base();
  const expected = ['Mới giao', 'Đang thực hiện', TASK_REVIEW, TASK_REREVIEW, TASK_RETURNED, TASK_DONE];
  for (const user of directoryProfiles(initial)) {
    const workspace = taskWorkspace(initial, user);
    const statuses = ['CEO', 'Admin'].includes(user.role) ? [...expected, ...expected, TASK_EXPIRED] :
      user.role === 'Accountant' ? [...expected, TASK_EXPIRED] : [...expected];
    assert.deepEqual(workspace.tasks.map(task => taskStatusAt(task, '2026-11-06')).sort(), statuses.sort(), user.role);
    assert.ok(Object.values(workspace.fileNames).every(Boolean));
  }

  const id = 'demo-task-po';
  const legacy = await applyDirectoryAction(initial, 'user-sale', 'accept', { id });
  legacy.tasks = legacy.tasks.slice(0, 3);
  const upgraded = readDirectory({ getItem: () => JSON.stringify(legacy) });
  assert.equal(upgraded.tasks.length, initial.tasks.length);
  assert.equal(new Set(upgraded.tasks.map(task => task.id)).size, initial.tasks.length);
  assert.deepEqual(upgraded.tasks.find(task => task.id === id), legacy.tasks[0]);
  assert.deepEqual(readDirectory({ getItem: () => JSON.stringify(upgraded) }), upgraded);
});

test('the Vietnam deadline includes the due date and locks every write at midnight', async () => {
  const before = new Date('2026-11-12T16:59:59.999Z');
  const expired = new Date('2026-11-12T17:00:00.000Z');
  const id = 'demo-task-returned-sale';
  const handover = { id, note: 'Đã bổ sung trước hạn', files: [exampleFile] };
  const returned = base();
  const submitted = await applyDirectoryAction(returned, 'user-sale', 'handover', handover, before);
  const approved = await applyDirectoryAction(submitted, 'user-ceo', 'confirm', { id, approve: true }, before);
  assert.equal(taskStatusAt(approved.tasks.find(task => task.id === id), '2026-11-13'), TASK_DONE);
  assert.equal(taskStatusAt(submitted.tasks.find(task => task.id === id), '2026-11-13'), TASK_EXPIRED);

  for (const [state, actor, action, payload] of [
    [returned, 'user-sale', 'handover', handover],
    [submitted, 'user-ceo', 'confirm', { id, approve: true }],
    [submitted, 'user-ceo', 'confirm', { id, approve: false }],
    [returned, 'user-ceo', 'assign', { id, assigneeId: 'user-accountant', deadline: '2026-11-14', reason: 'Gia hạn' }],
    [returned, 'user-sale', 'accept', { id: 'demo-task-po' }],
  ]) {
    const original = structuredClone(state);
    await assert.rejects(applyDirectoryAction(state, actor, action, payload, expired), /hết hạn/);
    assert.deepEqual(state, original);
  }
  await assert.rejects(applyDirectoryAction(returned, 'user-ceo', 'create-task',
    { ...task, assigneeId: 'user-sale' }, expired), /từ ngày hiện tại/);

  const locked = await applyDirectoryAction(returned, 'user-admin', 'update-account',
    { id: 'user-sale', role: 'Sale', status: 'inactive' }, expired);
  assert.equal(locked.accounts['user-sale'].status, 'inactive');
});

test('legacy returned tasks are still actionable and old review files are excluded', async context => {
  const state = base();
  const row = state.tasks.find(task => task.id === 'demo-task-returned-sale');
  row.status = 'Yêu cầu bổ sung';
  const legacyFile = 'DEMO-LEGACY-REVIEW';
  row.reviews[0].fileIds = [legacyFile];
  state.taskFiles[legacyFile] = exampleFile;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(state) } });
  context.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage);

  assert.equal(taskStatusAt(row, '2026-11-06'), TASK_RETURNED);
  assert.throws(() => readTaskAttachment('user-sale', row.id, legacyFile), /không có quyền/);
  assert.equal(readTaskAttachment('user-sale', row.id, row.submissions[0].fileIds[0]).name, 'doi-chieu-PO-lan-1.csv');
  const submitted = await applyDirectoryAction(state, 'user-sale', 'handover',
    { id: row.id, note: 'Đã bổ sung', files: [exampleFile] });
  assert.equal(submitted.tasks.find(task => task.id === row.id).status, TASK_REVIEW);
});

test('assigning a red alert preserves its source for the recipient and both CEO and Admin can monitor it', async () => {
  const sourceAlert = { type: 'orders', id: 'order-bm41-3', reference: 'UV-Intl-3500003' };
  const initial = base();
  await assert.rejects(applyDirectoryAction(initial, 'user-ceo', 'create-task', {
    ...task, assigneeId: 'user-sale', sourceAlert: { ...sourceAlert, type: 'unknown' },
  }), /Nguồn báo động đỏ/);
  const assigned = await applyDirectoryAction(initial, 'user-ceo', 'create-task', {
    ...task, assigneeId: 'user-sale', sourceAlert,
  });
  const saved = readDirectory({ getItem: () => JSON.stringify(assigned) });
  const [created] = saved.tasks.slice(-1);
  const view = role => taskWorkspace(saved, directoryProfiles(saved).find(user => user.role === role)).tasks;
  assert.deepEqual(view('Sale').find(row => row.id === created.id).sourceAlert, sourceAlert);
  assert.ok(!view('Accountant').some(row => row.id === created.id));
  assert.ok(view('Admin').some(row => row.id === created.id));
  assert.ok(view('CEO').some(row => row.id === created.id));
  const normal = await applyDirectoryAction(saved, 'user-ceo', 'create-task', { ...task, assigneeId: 'user-sale' });
  assert.equal(normal.tasks.at(-1).sourceAlert, undefined);
});

test('department access replaces member overrides and is inherited by new accounts', async () => {
  const saleId = 'user-sale';
  const initial = base();
  const byId = (state, id) => directoryProfiles(state).find(row => row.id === id);
  assert.deepEqual(byId(initial, saleId).navigation, ['orders', 'revenue', 'tasks', 'reminders']);
  assert.ok(canOpenSection(byId(initial, saleId), 'data-entry'));
  assert.equal(canOpenSection(byId(initial, saleId), 'receivables'), false);

  let state = await applyDirectoryAction(initial, 'user-admin', 'update-account', {
    id: saleId, role: 'Sale', navigation: ['orders', 'tasks'],
  });
  state = await applyDirectoryAction(state, 'user-admin', 'set-account-status', {
    id: saleId, expectedStatus: 'active', status: 'inactive',
  });
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'apply-department-navigation', {
    role: 'Sale', navigation: ['users'],
  }), /ngoài quyền/);
  await assert.rejects(applyDirectoryAction(state, 'user-accountant', 'apply-department-navigation', {
    role: 'Sale', navigation: ['tasks'],
  }), /không có quyền/);

  state = await applyDirectoryAction(state, 'user-admin', 'apply-department-navigation', {
    role: 'Sale', navigation: ['revenue', 'tasks'],
  });
  assert.equal(state.accounts[saleId].navigation, undefined);
  assert.equal(byId(state, saleId).status, 'inactive');
  assert.deepEqual(byId(state, saleId).navigation, ['revenue', 'tasks']);
  assert.deepEqual(byId(state, 'user-accountant').navigation, byId(initial, 'user-accountant').navigation);
  state = await applyDirectoryAction(state, 'user-admin', 'create-account', newAccount);
  const reloaded = readDirectory({ getItem: () => JSON.stringify(state) });
  const added = directoryProfiles(reloaded).find(row => row.email === newAccount.email);
  assert.deepEqual(added.navigation, ['revenue', 'tasks']);
  assert.equal(canOpenSection(added, 'orders'), false);
});

test('lock and unlock protect reserved accounts and keep open assignments intact', async context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => store.get(key) ?? null,
  } });
  context.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage);

  let state = await applyDirectoryAction(base(), 'user-admin', 'create-account', newAccount);
  const user = directoryProfiles(state).find(row => row.email === newAccount.email);
  state = await applyDirectoryAction(state, 'user-admin', 'create-task', { ...task, assigneeId: user.id });
  const assigned = state.tasks.at(-1);
  const lock = { id: user.id, expectedStatus: 'active', status: 'inactive' };
  for (const id of ['user-ceo', 'user-admin']) {
    await assert.rejects(applyDirectoryAction(state, 'user-admin', 'set-account-status', { ...lock, id }), /không có quyền/);
  }
  state = await applyDirectoryAction(state, 'user-admin', 'set-account-status', lock);
  store.set(DIRECTORY_KEY, JSON.stringify(state));
  assert.equal(await authenticateMockAccount(user.email, newAccount.password), null);
  assert.deepEqual(await attemptMockSignIn(user.email, newAccount.password), { status: 'locked' });
  assert.deepEqual(await attemptMockSignIn(user.email, 'incorrect-password'), { status: 'invalid' });
  assert.deepEqual(await attemptMockSignIn('unknown@example.com', newAccount.password), { status: 'invalid' });
  assert.deepEqual(state.tasks.at(-1), assigned);
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'set-account-status', lock), /đã thay đổi/);

  state = await applyDirectoryAction(state, 'user-admin', 'set-account-status', {
    id: user.id, expectedStatus: 'inactive', status: 'active',
  });
  store.set(DIRECTORY_KEY, JSON.stringify(state));
  assert.equal((await attemptMockSignIn(user.email, newAccount.password)).status, 'authenticated');
  assert.equal((await authenticateMockAccount(user.email, newAccount.password)).status, 'active');
  assert.deepEqual(state.tasks.at(-1), assigned);
});

test('admin assignment rights cannot be removed while assigned work is open', async () => {
  const state = await applyDirectoryAction(base(), 'user-admin', 'create-task', { ...task, assigneeId: 'user-sale' });
  await assert.rejects(applyDirectoryAction(state, 'user-ceo', 'update-account', {
    id: 'user-admin', role: 'Sale',
  }), /công việc đã giao chưa kết thúc/);
  await assert.rejects(applyDirectoryAction(state, 'user-ceo', 'update-account', {
    id: 'user-admin', role: 'Admin', navigation: ['users'],
  }), /công việc đã giao chưa kết thúc/);
  const legacy = structuredClone(state);
  legacy.accounts['user-admin'] = { id: 'user-admin', role: 'Sale', status: 'active' };
  const id = legacy.tasks.at(-1).id;
  const ceo = directoryProfiles(legacy).find(user => user.id === 'user-ceo');
  assert.ok(taskWorkspace(legacy, ceo).tasks.some(row => row.id === id));
  const accepted = await applyDirectoryAction(legacy, 'user-sale', 'accept', { id });
  const submitted = await applyDirectoryAction(accepted, 'user-sale', 'handover', { id, note: 'Đã xong' });
  const reviewed = await applyDirectoryAction(submitted, 'user-ceo', 'confirm', { id, approve: true, submissionCount: 1 });
  assert.equal(reviewed.tasks.find(row => row.id === id).status, TASK_DONE);
});

test('task assignment rejects recipients who cannot open My tasks', async () => {
  const directory = await applyDirectoryAction(base(), 'user-admin', 'apply-department-navigation', {
    role: 'Sale', navigation: ['orders', 'revenue'],
  }, new Date('2026-11-20T09:00:00Z'));
  await assert.rejects(applyDirectoryAction(directory, 'user-admin', 'create-task', {
    ...task, assigneeId: 'user-sale',
  }), /quyền mở Công việc/);
  await assert.rejects(applyDirectoryAction(directory, 'user-admin', 'create-task', {
    ...task, scope: 'department', department: 'Sale',
  }), /quyền mở Công việc/);
});

test('personal and department changes preserve access for active assignments', async () => {
  const state = await applyDirectoryAction(base(), 'user-admin', 'create-task', {
    ...task, scope: 'department', department: 'Sale',
  });
  const snapshot = structuredClone(state);
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'update-account', {
    id: 'user-sale', role: 'Sale', navigation: ['orders'],
  }), /còn việc chưa kết thúc/);
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'apply-department-navigation', {
    role: 'Sale', navigation: ['orders'],
  }), /còn việc chưa kết thúc/);
  assert.deepEqual(state, snapshot);
});

test('CEO and Admin can read each other work, and task discussion stays with current participants', async () => {
  let state = await applyDirectoryAction(base(), 'user-admin', 'create-task', { ...task, assigneeId: 'user-sale' });
  const id = state.tasks.at(-1).id;
  await assert.rejects(applyDirectoryAction(state, 'user-accountant', 'comment-task', { id, note: 'Outside the task' }), /không có quyền/);
  state = await applyDirectoryAction(state, 'user-sale', 'comment-task', { id, note: '  Cần đối chiếu thêm.  ' });
  const view = userId => taskWorkspace(state, directoryProfiles(state).find(user => user.id === userId)).tasks.find(row => row.id === id);
  assert.equal(view('user-ceo').discussion[0].text, 'Cần đối chiếu thêm.');
  assert.equal(view('user-admin').discussion[0].text, 'Cần đối chiếu thêm.');
  assert.equal(view('user-accountant'), undefined);
  state = await applyDirectoryAction(state, 'user-admin', 'assign', {
    id, assigneeId: 'user-accountant', reason: 'Đổi người phụ trách', deadline: task.deadline,
  });
  assert.equal(view('user-sale'), undefined);
  assert.deepEqual(view('user-accountant').discussion, []);
  assert.equal(view('user-accountant').previousAssignments, undefined);
  assert.equal(view('user-ceo').previousAssignments[0].discussion[0].text, 'Cần đối chiếu thêm.');
  await assert.rejects(applyDirectoryAction(state, 'user-admin', 'comment-task', { id, note: 'Quá hạn' },
    new Date('2026-11-20T09:00:00Z')), /đã hết hạn/);
});

test('employees can send reminders for red alerts and both Admin and CEO can quick-assign with notes to a person or department', async () => {
  let state = base();
  const users = directoryProfiles(state);

  // Unassigned alert shows italic status line indicating unassigned
  const initialInfo = resolveAlertAssignmentInfo(
    { id: 'order-9999', type: 'orders', reference: 'PO-NEW-ALERT' },
    state.tasks,
    users,
    state.reminders,
    '2026-11-06',
  );
  assert.equal(initialInfo.isAssigned, false);
  assert.match(initialInfo.italicLine, /Chưa giao việc · Chưa có người đảm nhận/);

  // Employee sends a reminder
  state = await applyDirectoryAction(state, 'user-sale', 'create-reminder', {
    alertId: 'order-9999',
    alertType: 'orders',
    reference: 'PO-NEW-ALERT',
    subject: 'Áo khoác mẫu mới',
    issue: 'Trễ ETD 2 ngày',
    message: 'Cảnh báo đỏ PO-NEW-ALERT chưa thấy sếp giao việc, nhờ sếp phân công xử lý.',
  });
  const createdReminder = state.reminders.find(r => r.reference === 'PO-NEW-ALERT');
  assert.ok(createdReminder);
  assert.equal(createdReminder.status, REMINDER_PENDING);

  // Status line reflects pending reminder
  const remindedInfo = resolveAlertAssignmentInfo(
    { id: 'order-9999', type: 'orders', reference: 'PO-NEW-ALERT' },
    state.tasks,
    users,
    state.reminders,
    '2026-11-06',
  );
  assert.equal(remindedInfo.isAssigned, false);
  assert.equal(remindedInfo.pendingRemindersCount, 1);
  assert.match(remindedInfo.italicLine, /Đã nhắc sếp/);

  // Non-executive cannot quick-assign
  await assert.rejects(applyDirectoryAction(state, 'user-sale', 'quick-assign-reminder', {
    reminderId: createdReminder.id,
    scope: 'person',
    assigneeId: 'user-sale',
    deadline: '2026-11-10',
  }), /Chỉ CEO và Admin/);

  // Admin quick-assigns reminder to an employee with a manager note
  state = await applyDirectoryAction(state, 'user-admin', 'quick-assign-reminder', {
    reminderId: createdReminder.id,
    scope: 'person',
    assigneeId: 'user-sale',
    title: 'Xử lý gấp PO-NEW-ALERT',
    managerNote: 'Kiểm tra ngay với xưởng may và báo lại trước 17h.',
    deadline: '2026-11-10',
  });
  const updatedReminder = state.reminders.find(r => r.id === createdReminder.id);
  assert.equal(updatedReminder.status, REMINDER_ASSIGNED);
  assert.equal(updatedReminder.assignedByName, 'Quản trị Demo');
  assert.equal(updatedReminder.managerNote, 'Kiểm tra ngay với xưởng may và báo lại trước 17h.');

  // Status line now shows assigned status, assignee name, and manager note for all roles
  const assignedInfo = resolveAlertAssignmentInfo(
    { id: 'order-9999', type: 'orders', reference: 'PO-NEW-ALERT' },
    state.tasks,
    users,
    state.reminders,
    '2026-11-06',
  );
  assert.equal(assignedInfo.isAssigned, true);
  assert.match(assignedInfo.italicLine, /Đã giao: Lê Hương đảm nhận/);
  assert.match(assignedInfo.italicLine, /Kiểm tra ngay với xưởng may/);

  // CEO quick-assigns another reminder to a whole department
  const pendingApReminder = state.reminders.find(r => r.id === 'demo-reminder-payable-bill03');
  state = await applyDirectoryAction(state, 'user-ceo', 'quick-assign-reminder', {
    reminderId: pendingApReminder.id,
    scope: 'department',
    department: 'Accountant',
    managerNote: 'Phòng Kế toán tách chứng từ ngay trong ngày.',
    deadline: '2026-11-11',
  });
  assert.equal(state.reminders.find(r => r.id === pendingApReminder.id).status, REMINDER_ASSIGNED);
  const deptInfo = resolveAlertAssignmentInfo(
    { id: 'payables-DEMO-AP-3', type: 'payables', reference: 'DEMO-BILL-03' },
    state.tasks,
    users,
    state.reminders,
    '2026-11-06',
  );
  assert.equal(deptInfo.isAssigned, true);
  assert.match(deptInfo.italicLine, /Phòng Kế toán/);
});
