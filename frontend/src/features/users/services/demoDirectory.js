import { defaultNavigationForRole, ROLE_PROFILES } from '../../../utils/roles.js';
import { canViewTask, canViewManagedTask } from '../../operations/services/taskWorkflow.js';
import {
  executeDirectoryOrTaskActionApi,
  fetchBootstrapApi,
  fetchTaskAttachmentApi,
} from '../../../services/api.js';

export const DIRECTORY_KEY = 'uv-directory-api-state';

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

function normalizeProfile(record, departmentNavigation) {
  const role = ROLE_PROFILES[record.role] || ROLE_PROFILES.Sale;
  const publicRecord = { ...record };
  delete publicRecord.password;
  return {
    ...publicRecord,
    permissions: publicRecord.permissions || role.permissions,
    roleLabel: publicRecord.roleLabel || role.label,
    title: publicRecord.title || role.title,
    navigation: [
      ...(record.navigation ??
        departmentNavigation?.[record.role] ??
        defaultNavigationForRole(record.role)),
    ],
  };
}

/**
 * Chuyển đổi danh sách tài khoản nhận từ Backend API sang danh sách hồ sơ chuẩn.
 * Đã loại bỏ hoàn toàn MOCK_ACCOUNTS, DEMO_TASKS, DEMO_REMINDERS và DEMO_TASK_FILES.
 */
export function directoryProfiles(state) {
  if (!state) return [];
  const rawAccounts = Array.isArray(state.accounts)
    ? state.accounts
    : Object.values(state.accounts || {});
  return rawAccounts.map(account => normalizeProfile(account, state.departmentNavigation));
}

export function readDirectory() {
  return createEmptyDirectoryState();
}

export async function refreshDirectoryFromApi() {
  return fetchBootstrapApi();
}

export async function saveDirectoryAction(_actorId, action, payload) {
  return executeDirectoryOrTaskActionApi(action, payload);
}

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

export async function readTaskAttachment(_actorId, taskId, fileId) {
  return fetchTaskAttachmentApi(taskId, fileId);
}
