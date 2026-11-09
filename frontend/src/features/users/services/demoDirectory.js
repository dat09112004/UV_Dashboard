import { MOCK_ACCOUNTS } from '../../../mock/accounts.js';
import { DEMO_TASK_FILES, DEMO_TASKS, DEMO_REMINDERS } from '../../../mock/tasks.js';
import { canEditAccount, defaultNavigationForRole, DEPARTMENT_ROLES, manageableRoles, navigationForRole, ROLE_PROFILES } from '../../../utils/roles.js';
import { applyTaskAction, canAssignTasks, canReceiveTasks, canViewTask, canViewManagedTask, taskStatusAt, TASK_DONE, TASK_EXPIRED } from '../../operations/services/taskWorkflow.js';
import { businessToday } from '../../../utils/business.js';
import { newRecordId } from '../../../utils/recordId.js';
import { createPasswordRecord, validNewPassword } from '../../auth/services/demoPasswords.js';

export const DIRECTORY_KEY = 'uv-demo-directory-v1';

function includeDemoTasks(state) {
  const existingIds = new Set(state.tasks.map(task => task.id));
  const sampleAccounts = Object.fromEntries(MOCK_ACCOUNTS.map(account => [account.id, account]));
  const canSeedFor = id => {
    const saved = state.accounts[id];
    return !saved || (saved.role === sampleAccounts[id].role && saved.status === 'active');
  };
  const recipients = new Set(directoryProfiles(state).filter(canReceiveTasks).map(user => user.id));
  const missing = DEMO_TASKS.filter(task =>
    !existingIds.has(task.id) && (task.legacyManagerAssignment || recipients.has(task.assigneeId)) && canSeedFor(task.assigneeId) && canSeedFor(task.assignerId));

  const existingReminderIds = new Set((state.reminders || []).map(rem => rem.id));
  const missingReminders = (DEMO_REMINDERS || []).filter(rem => !existingReminderIds.has(rem.id));

  if (!missing.length && !missingReminders.length) {
    if (!Array.isArray(state.reminders)) return { ...state, reminders: [] };
    return state;
  }

  const fileIds = new Set(missing.flatMap(task => [
    ...(task.fileIds || []), ...historyFiles(task),
  ]));
  const files = Object.fromEntries([...fileIds].map(id => [id, DEMO_TASK_FILES[id]]));
  return {
    ...state,
    tasks: [...state.tasks, ...structuredClone(missing)],
    taskFiles: { ...files, ...state.taskFiles },
    reminders: [...(state.reminders || []), ...structuredClone(missingReminders)],
  };
}

const validNavigation = (role, list) => Array.isArray(list) &&
  list.every(section => navigationForRole(role).includes(section));

function checkedNavigation(role, list) {
  if (!validNavigation(role, list)) throw new Error('Trang được chọn nằm ngoài quyền của vai trò.');
  return [...new Set(list)];
}

export function readDirectory(storage = globalThis.localStorage) {
  const raw = storage?.getItem(DIRECTORY_KEY);
  if (!raw) return includeDemoTasks({ version: 1, accounts: {}, credentials: {}, tasks: [], reminders: [] });
  const state = JSON.parse(raw);
  if (state?.version !== 1 || !state.accounts || typeof state.accounts !== 'object' || Array.isArray(state.accounts) ||
    !state.credentials || typeof state.credentials !== 'object' || Array.isArray(state.credentials) || !Array.isArray(state.tasks) ||
    (state.reminders !== undefined && !Array.isArray(state.reminders)) ||
    Object.entries(state.accounts).some(([id, account]) => account?.id !== id || id === 'user-ceo' ||
      !Object.hasOwn(ROLE_PROFILES, account.role) || !['active', 'inactive'].includes(account.status) ||
      (account.navigation !== undefined && !validNavigation(account.role, account.navigation))) ||
    (state.departmentNavigation !== undefined && (!state.departmentNavigation || typeof state.departmentNavigation !== 'object' ||
      Array.isArray(state.departmentNavigation) || Object.entries(state.departmentNavigation).some(([role, list]) =>
        !Object.hasOwn(DEPARTMENT_ROLES, role) || !validNavigation(role, list)))) ||
    state.tasks.some(task => typeof task?.id !== 'string' || typeof task.assigneeId !== 'string' || !Array.isArray(task.comments))) {
    throw new Error('Dữ liệu quản trị đã lưu không hợp lệ.');
  }
  state.tasks = state.tasks.map(task => ({
    ...task, status: task.status === 'Chờ CEO xác nhận' ? 'Chờ duyệt' : task.status,
    ...(['user-admin', 'user-ceo'].includes(task.assigneeId) ? { legacyManagerAssignment: true } : {}),
  }));
  state.reminders = Array.isArray(state.reminders) ? state.reminders : [];
  return includeDemoTasks(state);
}

function profile(record, departmentNavigation) {
  const role = ROLE_PROFILES[record.role];
  const publicRecord = { ...record };
  delete publicRecord.password;
  return { ...publicRecord, permissions: role.permissions, roleLabel: role.label, title: publicRecord.title || role.title,
    navigation: [...(record.navigation ?? departmentNavigation?.[record.role] ?? defaultNavigationForRole(record.role))] };
}

export function directoryProfiles(state) {
  if (!state) return [];
  const seed = MOCK_ACCOUNTS.map(account => profile({ ...account, ...state.accounts[account.id] }, state.departmentNavigation));
  const custom = Object.values(state.accounts).filter(account => !seed.some(row => row.id === account.id));
  return [...seed, ...custom.map(account => profile(account, state.departmentNavigation))];
}

const required = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

function checkTaskNavigation(state, target, next, now) {
  // Locking a login is a separate action. Keep the task permission in place
  // so a locked employee can resume work when the account is unlocked.
  const active = { ...target, status: 'active' };
  if (!canReceiveTasks(active) || canReceiveTasks({ ...next, status: 'active' })) return;
  const today = businessToday(now);
  if (state.tasks.some(task => task.assigneeId === target.id &&
    ![TASK_DONE, TASK_EXPIRED].includes(taskStatusAt(task, today)))) {
    throw new Error(`Không thể bỏ quyền Công việc của tôi của ${target.name} khi còn việc chưa kết thúc. Hãy chuyển việc trước.`);
  }
}

export async function applyDirectoryAction(state, actorId, action, payload, now = new Date()) {
  const users = directoryProfiles(state);
  const actor = users.find(row => row.id === actorId);
  const next = structuredClone(state);
  if (action === 'create-account') {
    if (!manageableRoles(actor).includes(payload.role)) throw new Error('Bạn không có quyền cấp vai trò này.');
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!required(name, 100) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Họ tên hoặc email không hợp lệ.');
    }
    if (users.some(row => row.email === email)) throw new Error('Email này đã được sử dụng.');
    if (!validNewPassword(payload.password)) throw new Error('Mật khẩu mới phải có từ 8 đến 128 ký tự.');
    const id = newRecordId('USER');
    next.credentials[id] = await createPasswordRecord(payload.password);
    next.accounts[id] = { id, email, username: email, name, role: payload.role, status: 'active',
      initials: name.split(/\s+/).slice(-2).map(part => part[0].toUpperCase()).join(''),
      employeeCode: id, department: ROLE_PROFILES[payload.role].label };
    return next;
  }
  if (action === 'apply-department-navigation') {
    if (!Object.hasOwn(DEPARTMENT_ROLES, payload.role) || !manageableRoles(actor).includes(payload.role)) {
      throw new Error('Bạn không có quyền cấp quyền cho phòng ban này.');
    }
    const navigation = checkedNavigation(payload.role, payload.navigation);
    next.departmentNavigation = { ...next.departmentNavigation, [payload.role]: navigation };
    for (const account of users) {
      if (account.role === payload.role && canEditAccount(actor, account) && next.accounts[account.id]) {
        delete next.accounts[account.id].navigation;
      }
    }
    const members = directoryProfiles(next).filter(account => account.role === payload.role);
    for (const member of members) {
      const previous = users.find(account => account.id === member.id);
      checkTaskNavigation(state, previous, member, now);
    }
    return next;
  }
  if (action === 'set-account-status') {
    const target = users.find(row => row.id === payload.id);
    if (!canEditAccount(actor, target)) throw new Error('Bạn không có quyền thay đổi tài khoản này.');
    if (!['active', 'inactive'].includes(payload.status)) throw new Error('Trạng thái tài khoản không hợp lệ.');
    if (target.status !== payload.expectedStatus || payload.status === target.status) {
      throw new Error('Trạng thái tài khoản đã thay đổi. Hãy kiểm tra và thử lại.');
    }
    next.accounts[target.id] = { ...next.accounts[target.id], id: target.id, role: target.role, status: payload.status };
    return next;
  }
  if (action === 'update-account') {
    const target = users.find(row => row.id === payload.id);
    if (!canEditAccount(actor, target) || !manageableRoles(actor).includes(payload.role)) {
      throw new Error('Bạn không có quyền thay đổi tài khoản này.');
    }
    const status = payload.status ?? target.status;
    if (!['active', 'inactive'].includes(status)) throw new Error('Trạng thái tài khoản không hợp lệ.');
    const today = businessToday(now);
    if (payload.role !== target.role &&
      state.tasks.some(task => !task.legacyManagerAssignment && task.assigneeId === target.id &&
        ![TASK_DONE, TASK_EXPIRED].includes(taskStatusAt(task, today)))) {
      throw new Error('Hãy chuyển công việc đang mở trước khi đổi vai trò.');
    }
    next.accounts[target.id] = { ...next.accounts[target.id], id: target.id, role: payload.role, status };
    if (payload.navigation !== undefined) {
      next.accounts[target.id].navigation = checkedNavigation(payload.role, payload.navigation);
    } else if (payload.role !== target.role) {
      delete next.accounts[target.id].navigation;
    }
    if (payload.role !== target.role) {
      next.accounts[target.id].title = ROLE_PROFILES[payload.role].title;
      next.accounts[target.id].department = ROLE_PROFILES[payload.role].label;
    }
    const updated = profile({ ...target, ...next.accounts[target.id], navigation: next.accounts[target.id].navigation },
      next.departmentNavigation);
    checkTaskNavigation(state, target, updated, now);
    if (canAssignTasks({ ...target, status: 'active' }) && !canAssignTasks({ ...updated, status: 'active' }) &&
      state.tasks.some(task => task.assignerId === target.id && ![TASK_DONE, TASK_EXPIRED].includes(taskStatusAt(task, today)))) {
      throw new Error('Không thể bỏ quyền Giao việc khi tài khoản còn công việc đã giao chưa kết thúc.');
    }
    return next;
  }
  return applyTaskAction(next, users, actor, action, payload, now);
}

export async function saveDirectoryAction(actorId, action, payload) {
  const storage = globalThis.localStorage;
  const locks = globalThis.navigator?.locks;
  if (!storage || !locks) throw new Error('Cần mở bản thử nghiệm qua HTTPS hoặc localhost.');
  return locks.request(DIRECTORY_KEY, async () => {
    const next = await applyDirectoryAction(readDirectory(storage), actorId, action, payload);
    try { storage.setItem(DIRECTORY_KEY, JSON.stringify(next)); }
    catch (error) {
      if (error.name === 'QuotaExceededError') throw new Error('Bộ nhớ trình duyệt đã đầy. Hãy dùng tệp nhỏ hơn.');
      throw error;
    }
    return next;
  });
}

const historyFiles = entry => (entry.submissions || []).flatMap(row => row.fileIds || []);

function visibleFileIds(actor, task, users) {
  const previous = canViewManagedTask(actor, task, users) ? (task.previousAssignments || []).flatMap(historyFiles) : [];
  return [...(task.fileIds || []), ...historyFiles(task), ...previous];
}

export function taskWorkspace(state, actor, users = directoryProfiles(state)) {
  const tasks = state.tasks.filter(task => canViewTask(actor, task, users)).map(task => {
    if (canViewManagedTask(actor, task, users)) return task;
    const view = { ...task };
    delete view.previousAssignments;
    return view;
  });
  const ids = new Set(tasks.flatMap(task => visibleFileIds(actor, task, users)));
  const fileNames = Object.fromEntries([...ids].map(id => [id, state.taskFiles?.[id]?.name]));
  const reminders = Array.isArray(state.reminders) ? state.reminders : [];
  return { tasks, fileNames, reminders, allTasks: state.tasks };
}

export function readTaskAttachment(actorId, taskId, fileId) {
  const state = readDirectory();
  const users = directoryProfiles(state);
  const actor = users.find(user => user.id === actorId);
  const task = state.tasks.find(row => row.id === taskId);
  if (!canViewTask(actor, task, users) || !visibleFileIds(actor, task, users).includes(fileId) || !Object.hasOwn(state.taskFiles || {}, fileId)) {
    throw new Error('Bạn không có quyền tải tệp này.');
  }
  return state.taskFiles[fileId];
}
