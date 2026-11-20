import { defaultNavigationForRole, ROLE_PROFILES } from '../../../utils/roles.js';
import { canViewTask, canViewManagedTask } from '../../operations/services/taskWorkflow.js';
import {
  executeDirectoryOrTaskActionApi,
  fetchBootstrapApi,
  fetchTaskAttachmentApi,
} from '../../../services/api.js';

// Chức năng: Khởi tạo trạng thái rỗng ban đầu cho danh bạ tài khoản, công việc và nhắc việc
export function createEmptyDirectoryState() {
  return {
    version: 1,
    accounts: [],
    departmentNavigation: {},
    tasks: [],
    allTasksSummary: [],
    reminders: [],
    fileNames: {},
  };
}

// Chức năng: Chuẩn hóa hồ sơ tài khoản, ẩn mật khẩu và lọc danh sách tab điều hướng theo đúng vai trò (CEO không có tab Quản lý tài khoản 'users')
function normalizeProfile(record, departmentNavigation) {
  const role = ROLE_PROFILES[record.role] || ROLE_PROFILES.Sale;
  const publicRecord = { ...record };
  delete publicRecord.password;
  let baseNav = [
    ...(record.navigation ??
      departmentNavigation?.[record.role] ??
      defaultNavigationForRole(record.role)),
  ];
  if (record.role === 'Sale' && !baseNav.includes('data-entry')) {
    baseNav.push('data-entry');
  }
  if (record.role === 'Accountant') {
    baseNav = baseNav.filter(sec => sec !== 'orders' && sec !== 'data-entry');
  }
  if (record.role !== 'Admin') {
    baseNav = baseNav.filter(sec => sec !== 'users');
  }
  const basePermissions = Array.isArray(publicRecord.permissions)
    ? publicRecord.permissions
    : role.permissions;
  const filteredPermissions = record.role === 'Admin'
    ? basePermissions
    : basePermissions.filter(p => p !== 'users.manage');
  return {
    ...publicRecord,
    permissions: filteredPermissions,
    roleLabel: publicRecord.roleLabel || role.label,
    title: publicRecord.title || role.title,
    navigation: baseNav,
  };
}

// Chức năng: Chuyển đổi danh sách tài khoản nhận từ Backend API sang danh sách hồ sơ chuẩn hiển thị trên giao diện
export function directoryProfiles(state) {
  if (!state) return [];
  const rawAccounts = Array.isArray(state.accounts)
    ? state.accounts
    : Object.values(state.accounts || {});
  return rawAccounts.map(account => normalizeProfile(account, state.departmentNavigation));
}

// Chức năng: Trả về trạng thái danh bạ mặc định khi chưa nạp dữ liệu từ máy chủ
export function readDirectory() {
  return createEmptyDirectoryState();
}

// Chức năng: Gọi API làm mới toàn bộ dữ liệu khởi tạo (bootstrap) gồm tài khoản, công việc và nhắc việc
export async function refreshDirectoryFromApi() {
  return fetchBootstrapApi();
}

// Chức năng: Gửi thao tác cập nhật tài khoản, phân quyền hoặc công việc lên máy chủ Backend
export async function saveDirectoryAction(_actorId, action, payload) {
  return executeDirectoryOrTaskActionApi(action, payload);
}

// Chức năng: Lọc và chuẩn bị dữ liệu không gian làm việc (công việc, nhắc việc, tệp đính kèm) theo quyền của người dùng hiện tại
export function taskWorkspace(state, actor, users = directoryProfiles(state)) {
  if (!state) {
    return { tasks: [], fileNames: {}, reminders: [], allTasks: [] };
  }
  const rawTasks = Array.isArray(state.tasks) ? state.tasks : [];
  const tasks = rawTasks
    .filter(task => !actor || canViewTask(actor, task, users))
    .map(task => {
      if (actor && canViewManagedTask(actor, task, users)) return task;
      const view = { ...task };
      delete view.previousAssignments;
      return view;
    });
  const fileNames = state.fileNames || {};
  const reminders = Array.isArray(state.reminders) ? state.reminders : [];
  const allTasks = Array.isArray(state.allTasksSummary)
    ? state.allTasksSummary
    : Array.isArray(state.allTasks)
      ? state.allTasks
      : tasks;
  return { tasks, fileNames, reminders, allTasks };
}

// Chức năng: Tải nội dung tệp đính kèm của một công việc từ máy chủ Backend
export async function readTaskAttachment(_actorId, taskId, fileId) {
  return fetchTaskAttachmentApi(taskId, fileId);
}
