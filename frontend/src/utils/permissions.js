// Client-side visibility checks. The API verifies permissions on each request.
export const canCreateOrAssignTask = (role) => ['CEO', 'Admin'].includes(role);
export const canChangeOfficialDeadlineOrAssignee = canCreateOrAssignTask;
export const canConfirmTaskCompletion = canCreateOrAssignTask;
// Chức năng: Kiểm tra quyền (canSubmitTaskHandover - Submit Task Handover) phục vụ xử lý dữ liệu trong permissions.js
export const canSubmitTaskHandover = (role) => ['Sale', 'Accountant'].includes(role);
// Chức năng: Kiểm tra quyền (canProposeDeadlineChange - Propose Deadline Change) phục vụ xử lý dữ liệu trong permissions.js
export const canProposeDeadlineChange = (role) => role === 'Sale';

let clientIdentity = null;
// Chức năng: Thiết lập (setClientIdentity - Client Identity) phục vụ xử lý dữ liệu trong permissions.js
export const setClientIdentity = user => { clientIdentity = user; };
// Chức năng: Lấy (getClientIdentity - Client Identity) phục vụ xử lý dữ liệu trong permissions.js
export const getClientIdentity = () => clientIdentity;

// Chức năng: Kiểm tra quyền (canSendTaskRequest - Send Task Request) phục vụ xử lý dữ liệu trong permissions.js
export function canSendTaskRequest(role, method, url, data = {}) {
  const verb = (method || 'get').toLowerCase();
  if (['get', 'head', 'options'].includes(verb)) return true;
  const path = String(url || '').split('?')[0].replace(/\/$/, '');
  if (/\/(accept|handover)$/.test(path)) return canSubmitTaskHandover(role);
  if (canCreateOrAssignTask(role)) return true;
  if (role !== 'Sale') return false;
  if (/\/(comments|proposals|progress)$/.test(path)) return true;
  if (verb === 'delete' || /\/(assign|reassign|official-deadline|confirm|complete|approve|reject)$/.test(path)) return false;
  if (verb === 'post') return false;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return false; }
  }
  const protectedKeys = ['deadline', 'assignee', 'assigner', 'status', 'role', 'completedAt', 'proposedDeadline', 'proposedAssignee'];
  return data && typeof data === 'object' && !protectedKeys.some(key => Object.hasOwn(data, key));
}
