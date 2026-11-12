// Client-side visibility checks. The API verifies permissions on each request.
export const canCreateOrAssignTask = (role) => ['CEO', 'Admin'].includes(role);
export const canChangeOfficialDeadlineOrAssignee = canCreateOrAssignTask;
export const canConfirmTaskCompletion = canCreateOrAssignTask;
export const canSubmitTaskHandover = (role) => ['Sale', 'Accountant'].includes(role);
export const canProposeDeadlineChange = (role) => role === 'Sale';

let clientIdentity = null;
export const setClientIdentity = user => { clientIdentity = user; };
export const getClientIdentity = () => clientIdentity;

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
