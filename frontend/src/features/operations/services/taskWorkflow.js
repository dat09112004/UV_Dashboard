import { canOpenSection, isExecutiveRole } from '../../../utils/roles.js';
import { businessToday, dateInputValue, formatBusinessDate, isTaskOverdue, parseBusinessDate } from '../../../utils/business.js';
import { newRecordId } from '../../../utils/recordId.js';
import { translate } from '../../../locales/i18n.js';

export const TASK_NEW = 'Mới giao';
export const TASK_ACTIVE = 'Đang thực hiện';
export const TASK_REVIEW = 'Chờ duyệt';
export const TASK_REREVIEW = 'Chờ duyệt lại';
export const TASK_RETURNED = 'Không đạt yêu cầu';
export const TASK_EXPIRED = 'Hết hạn';
export const TASK_DONE = 'Hoàn tất';
export const TASK_DEPARTMENTS = { Sale: 'Phòng Sale', Accountant: 'Phòng Kế toán' };

export const REMINDER_PENDING = 'Chờ giao việc';
export const REMINDER_ASSIGNED = 'Đã giao việc';
export const REMINDER_RESOLVED = 'Đã xử lý';

export const isTaskEmployee = user => user?.status === 'active' && Object.hasOwn(TASK_DEPARTMENTS, user.role);
export const canReceiveTasks = user => isTaskEmployee(user) && canOpenSection(user, 'tasks');
export const canAssignTasks = user => isExecutiveRole(user?.role) && canOpenSection(user, 'assignments');
export const canSendReminders = user => Boolean(user?.status === 'active' && (isTaskEmployee(user) || isExecutiveRole(user.role)));

export function canManageTask(user, task, users) {
  if (!task || !canAssignTasks(user)) return false;
  if (isExecutiveRole(user.role)) return true;
  if (task.assignerId === user.id) return true;
  return Boolean(users && !canAssignTasks(users.find(account => account.id === task.assignerId)));
}

export const canWorkOnAssignedTask = (user, task) => Boolean(task && canReceiveTasks(user) && task.assigneeId === user.id &&
  (!task.department || task.department === user.role));
export const canViewManagedTask = (user, task, users) => Boolean(task &&
  ((isExecutiveRole(user?.role) && canAssignTasks(user)) || canManageTask(user, task, users)));
export const canViewTask = (user, task, users) => canViewManagedTask(user, task, users) || canWorkOnAssignedTask(user, task);
export const canDiscussTask = (user, task, users) => canManageTask(user, task, users) || canWorkOnAssignedTask(user, task);
export const TASK_EXPIRED_MESSAGE = 'Công việc đã hết hạn và chỉ có thể xem.';

export function taskStatusAt(task, today = businessToday()) {
  if (isTaskOverdue(task, today)) return TASK_EXPIRED;
  if (task.status === TASK_REVIEW && task.reviews?.at(-1)?.approve === false) return TASK_REREVIEW;
  return task.status === 'Yêu cầu bổ sung' ? TASK_RETURNED : task.status;
}

export function matchAlertTask(task, alertRef) {
  if (!task || !alertRef) return false;
  if (task.sourceAlert) {
    if (alertRef.id && task.sourceAlert.id === alertRef.id) return true;
    if (alertRef.reference && task.sourceAlert.reference === alertRef.reference &&
      (!alertRef.type || task.sourceAlert.type === alertRef.type)) return true;
  }
  const ref = String(alertRef.reference || '').trim();
  if (!ref) return false;
  const hay = `${task.title || ''} ${task.description || ''}`;
  return hay.includes(ref);
}

/**
 * Returns assignment & reminder status metadata for any red alert / work item,
 * visible to ALL roles (CEO, Admin, Sale, Accountant).
 */
export function resolveAlertAssignmentInfo(alertRef, tasks = [], accounts = [], reminders = [], today = businessToday()) {
  if (!alertRef) {
    return {
      isAssigned: false,
      status: null,
      assigneesText: '',
      departmentText: '',
      assignerText: '',
      deadline: '',
      taskIds: [],
      pendingRemindersCount: 0,
      lastReminder: null,
      italicLine: 'Chưa giao việc · Chưa có người đảm nhận',
      tone: 'unassigned',
    };
  }
  const matchedTasks = (tasks || [])
    .filter(task => matchAlertTask(task, alertRef))
    .map(task => ({ ...task, currentStatus: taskStatusAt(task, today) }));

  const activeTasks = matchedTasks.filter(task => task.currentStatus !== TASK_EXPIRED);
  const chosenTasks = activeTasks.length ? activeTasks : matchedTasks;

  const matchedReminders = (reminders || []).filter(rem => {
    if (alertRef.id && rem.alertId === alertRef.id) return true;
    if (alertRef.reference && rem.reference === alertRef.reference && (!alertRef.type || rem.alertType === alertRef.type)) return true;
    return false;
  });
  const pendingReminders = matchedReminders.filter(rem => rem.status === REMINDER_PENDING);
  const lastReminder = matchedReminders.at(-1) || null;

  if (!chosenTasks.length) {
    const reminderSuffix = pendingReminders.length > 0
      ? ` · Đã nhắc sếp (${pendingReminders.length} lần, gần nhất bởi ${lastReminder?.senderName || 'nhân viên'})`
      : '';
    return {
      isAssigned: false,
      status: null,
      assigneesText: '',
      departmentText: '',
      assignerText: '',
      deadline: '',
      taskIds: [],
      pendingRemindersCount: pendingReminders.length,
      lastReminder,
      italicLine: `Chưa giao việc · Chưa có người đảm nhận${reminderSuffix}`,
      tone: pendingReminders.length > 0 ? 'reminded' : 'unassigned',
    };
  }

  const assigneeNames = [...new Set(chosenTasks.map(task => {
    const person = accounts.find(acc => acc.id === task.assigneeId);
    return person ? person.name : task.assigneeId;
  }).filter(Boolean))];
  const departments = [...new Set(chosenTasks.map(task => task.department ? TASK_DEPARTMENTS[task.department] : null).filter(Boolean))];
  const latest = chosenTasks.at(-1);
  const assigner = accounts.find(acc => acc.id === latest.assignerId);
  const statusLabel = latest.currentStatus;
  const holderLabel = departments.length
    ? `${departments.join(', ')} (${assigneeNames.join(', ')})`
    : assigneeNames.join(', ');
  const noteText = latest.managerNote ? ` · Ghi chú: ${latest.managerNote}` : '';
  const reminderSuffix = pendingReminders.length > 0
    ? ` · Có ${pendingReminders.length} nhắc việc mới`
    : '';

  return {
    isAssigned: true,
    status: statusLabel,
    assigneesText: assigneeNames.join(', '),
    departmentText: departments.join(', '),
    assignerText: assigner?.name || '',
    deadline: latest.deadline || '',
    managerNote: latest.managerNote || '',
    taskIds: chosenTasks.map(t => t.id),
    pendingRemindersCount: pendingReminders.length,
    lastReminder,
    italicLine: `Đã giao: ${holderLabel} đảm nhận · Trạng thái: ${statusLabel}${latest.deadline ? ` · Hạn ${latest.deadline}` : ''}${noteText}${reminderSuffix}`,
    tone: statusLabel === TASK_DONE ? 'done' : 'assigned',
  };
}

export const FILE_LIMIT = 1024 * 1024;
export const FILE_COUNT = 3;
export const FILE_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.csv,.txt';
const extensions = new Set(FILE_ACCEPT.split(','));
const invalidFilename = name => /[\\/]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const required = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

function appendFiles(state, input = []) {
  if (!Array.isArray(input) || input.length > FILE_COUNT) throw new Error('Tối đa 3 tệp và tổng dung lượng 1 MB mỗi lần gửi.');
  let total = 0;
  for (const file of input) {
    const name = file?.name;
    const content = file?.content;
    if (typeof name !== 'string' || name.length > 180 || invalidFilename(name) ||
      !extensions.has(name.slice(name.lastIndexOf('.')).toLowerCase()) ||
      typeof content !== 'string' || content.length > Math.ceil(FILE_LIMIT / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(content) || content.length % 4 !== 0) {
      throw new Error('Tệp đính kèm không hợp lệ hoặc không thuộc định dạng cho phép.');
    }
    const size = content.length / 4 * 3 - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0);
    if (size <= 0) throw new Error('Tệp đính kèm không hợp lệ hoặc không thuộc định dạng cho phép.');
    total += size;
  }
  if (total > FILE_LIMIT) throw new Error('Tối đa 3 tệp và tổng dung lượng 1 MB mỗi lần gửi.');
  state.taskFiles ||= {};
  return input.map(({ name, content }) => {
    const id = newRecordId('TASKFILE');
    state.taskFiles[id] = { id, name, content };
    return id;
  });
}

function record(task, actor, text, now) {
  task.comments.push({ id: newRecordId('TASKLOG'), author: actor.name, time: now.toISOString(), text });
}

function createTasksFromPayload(state, users, actor, payload, now = new Date()) {
  const today = businessToday(now);
  const staff = users.filter(canReceiveTasks);
  if (!canAssignTasks(actor)) throw new Error('Chỉ CEO và Admin được giao việc.');
  const department = payload.scope === 'department' ? payload.department : null;
  const recipients = department && Object.hasOwn(TASK_DEPARTMENTS, department) ?
    staff.filter(user => user.role === department) :
    payload.scope === 'person' || payload.scope === undefined ? staff.filter(user => user.id === payload.assigneeId) : [];
  if (!recipients.length) throw new Error('Chọn người phụ trách có quyền mở Công việc của tôi.');
  if (!required(payload.title, 160) || !required(payload.description, 1000) ||
    !dateInputValue(payload.deadline)) {
    throw new Error('Nhập đủ tên việc, nội dung, người phụ trách và hạn hoàn thành.');
  }
  if (dateInputValue(payload.deadline) < today) throw new Error('Hạn hoàn thành phải từ ngày hiện tại trở đi.');
  const source = payload.sourceAlert;
  if (source != null && (!['orders', 'receivables', 'payables'].includes(source.type) ||
    !required(source.id, 160) || !required(source.reference, 160))) {
    throw new Error('Nguồn báo động đỏ không hợp lệ.');
  }
  const sourceAlert = source ? { type: source.type, id: source.id.trim(), reference: source.reference.trim() } : null;
  const managerNote = typeof payload.managerNote === 'string' && payload.managerNote.trim()
    ? payload.managerNote.trim().slice(0, 500)
    : '';
  const fileIds = appendFiles(state, payload.files);
  const batchId = department ? newRecordId('TASKGROUP') : null;
  const createdIds = [];
  for (const recipient of recipients) {
    const taskId = newRecordId('TASK');
    createdIds.push(taskId);
    state.tasks.push({
      id: taskId, assignerId: actor.id, assigneeId: recipient.id, department, batchId,
      title: payload.title.trim(), description: payload.description.trim(),
      ...(managerNote && { managerNote }),
      deadline: formatBusinessDate(payload.deadline),
      status: TASK_NEW, ...(sourceAlert && { sourceAlert }),
      requiresFile: payload.requiresFile === true, fileIds,
      comments: managerNote ? [{ id: newRecordId('TASKLOG'), author: actor.name, time: now.toISOString(), text: `Ghi chú giao việc: ${managerNote}` }] : [],
      submissions: [], reviews: [],
    });
  }
  if (sourceAlert && Array.isArray(state.reminders)) {
    for (const rem of state.reminders) {
      if ((rem.alertId === sourceAlert.id || rem.reference === sourceAlert.reference) && rem.status === REMINDER_PENDING) {
        rem.status = REMINDER_ASSIGNED;
        rem.assignedById = actor.id;
        rem.assignedByName = actor.name;
        rem.assignedAt = now.toISOString();
        rem.assignedTaskIds = createdIds;
        rem.assignedScope = department ? 'department' : 'person';
        rem.assignedTargetLabel = department
          ? TASK_DEPARTMENTS[department]
          : recipients.map(r => r.name).join(', ');
        if (managerNote) rem.managerNote = managerNote;
      }
    }
  }
  return createdIds;
}

export function applyTaskAction(state, users, actor, action, payload, now = new Date()) {
  const today = businessToday(now);
  const staff = users.filter(canReceiveTasks);
  state.reminders ||= [];

  if (action === 'create-task') {
    createTasksFromPayload(state, users, actor, payload, now);
    return state;
  }

  if (action === 'create-reminder') {
    if (!canSendReminders(actor)) throw new Error('Bạn không có quyền gửi nhắc việc.');
    const alertType = payload.alertType || 'orders';
    if (!['orders', 'receivables', 'payables'].includes(alertType)) {
      throw new Error('Phân hệ nhắc việc không hợp lệ.');
    }
    const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
    const alertId = typeof payload.alertId === 'string' && payload.alertId.trim() ? payload.alertId.trim() : `${alertType}-${reference}`;
    const subject = typeof payload.subject === 'string' && payload.subject.trim() ? payload.subject.trim().slice(0, 180) : reference;
    const issue = typeof payload.issue === 'string' && payload.issue.trim() ? payload.issue.trim().slice(0, 240) : 'Cảnh báo cần giao việc xử lý';
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!required(reference, 160) || !required(message, 1000)) {
      throw new Error('Vui lòng nhập mã chứng từ/PO và nội dung nhắc việc (tối đa 1.000 ký tự).');
    }
    const existingPending = state.reminders.find(rem =>
      rem.status === REMINDER_PENDING && (rem.alertId === alertId || (rem.reference === reference && rem.alertType === alertType))
    );
    if (existingPending) {
      existingPending.message = message;
      existingPending.senderId = actor.id;
      existingPending.senderName = actor.name;
      existingPending.senderRole = actor.role;
      existingPending.updatedAt = now.toISOString();
      existingPending.remindCount = (existingPending.remindCount || 1) + 1;
      (existingPending.history ||= []).push({
        id: newRecordId('REMLOG'),
        senderId: actor.id,
        senderName: actor.name,
        senderRole: actor.role,
        message,
        at: now.toISOString(),
      });
      return state;
    }
    const reminderId = newRecordId('REMINDER');
    state.reminders.unshift({
      id: reminderId,
      alertId,
      alertType,
      reference,
      subject,
      issue,
      message,
      senderId: actor.id,
      senderName: actor.name,
      senderRole: actor.role,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      remindCount: 1,
      status: REMINDER_PENDING,
      history: [{
        id: newRecordId('REMLOG'),
        senderId: actor.id,
        senderName: actor.name,
        senderRole: actor.role,
        message,
        at: now.toISOString(),
      }],
    });
    return state;
  }

  if (action === 'quick-assign-reminder') {
    if (!canAssignTasks(actor)) throw new Error('Chỉ CEO và Admin được giao việc từ nhắc việc.');
    const reminder = state.reminders.find(rem => rem.id === payload.reminderId);
    if (!reminder) throw new Error('Không tìm thấy nhắc việc cần xử lý.');
    const scope = payload.scope === 'department' ? 'department' : 'person';
    const managerNote = typeof payload.managerNote === 'string' ? payload.managerNote.trim() : '';
    const title = typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : `Xử lý cảnh báo đỏ ${reminder.reference} · ${reminder.subject}`.slice(0, 160);
    const baseDesc = typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim()
      : `${reminder.subject} (${reminder.issue}). Nhắc việc từ ${reminder.senderName}: "${reminder.message}"`;
    const description = managerNote
      ? `${baseDesc}\nGhi chú chỉ đạo (${actor.name}): ${managerNote}`.slice(0, 1000)
      : baseDesc.slice(0, 1000);
    const defaultDeadline = payload.deadline || today;
    const createdIds = createTasksFromPayload(state, users, actor, {
      scope,
      department: payload.department,
      assigneeId: payload.assigneeId,
      title,
      description,
      managerNote,
      deadline: defaultDeadline,
      requiresFile: Boolean(payload.requiresFile),
      sourceAlert: {
        type: reminder.alertType || 'orders',
        id: reminder.alertId || `${reminder.alertType || 'orders'}-${reminder.reference}`,
        reference: reminder.reference,
      },
    }, now);
    reminder.status = REMINDER_ASSIGNED;
    reminder.assignedById = actor.id;
    reminder.assignedByName = actor.name;
    reminder.assignedAt = now.toISOString();
    reminder.assignedTaskIds = createdIds;
    reminder.assignedScope = scope;
    reminder.assignedTargetLabel = scope === 'department'
      ? TASK_DEPARTMENTS[payload.department]
      : staff.find(u => u.id === payload.assigneeId)?.name || '';
    reminder.managerNote = managerNote;
    return state;
  }

  if (action === 'dismiss-reminder') {
    if (!canAssignTasks(actor)) throw new Error('Chỉ CEO và Admin được đánh dấu xử lý nhắc việc.');
    const reminder = state.reminders.find(rem => rem.id === payload.reminderId);
    if (!reminder) throw new Error('Không tìm thấy nhắc việc.');
    reminder.status = REMINDER_RESOLVED;
    reminder.resolvedById = actor.id;
    reminder.resolvedByName = actor.name;
    reminder.resolvedAt = now.toISOString();
    if (typeof payload.managerNote === 'string' && payload.managerNote.trim()) {
      reminder.managerNote = payload.managerNote.trim().slice(0, 500);
    }
    return state;
  }

  const task = state.tasks.find(row => row.id === payload.id);
  if (!canViewTask(actor, task, users)) throw new Error('Bạn không có quyền thực hiện thao tác trên công việc này.');
  if (['confirm', 'assign'].includes(action) && !canManageTask(actor, task, users)) {
    throw new Error('Bạn không có quyền thực hiện thao tác trên công việc này.');
  }
  const status = taskStatusAt(task, today);
  if (status === TASK_EXPIRED) throw new Error(TASK_EXPIRED_MESSAGE);
  if (status === TASK_DONE) throw new Error('Công việc đã duyệt hoàn thành, chỉ có thể xem.');
  if (action === 'comment-task' && canDiscussTask(actor, task, users)) {
    if (!required(payload.note, 1000)) throw new Error('Bình luận phải có từ 1 đến 1.000 ký tự.');
    (task.discussion ||= []).push({ id: newRecordId('TASKCOMMENT'), author: actor.name, time: now.toISOString(), text: payload.note.trim() });
  } else if (action === 'accept' && canWorkOnAssignedTask(actor, task) && status === TASK_NEW) {
    task.status = TASK_ACTIVE;
    record(task, actor, 'Tiếp nhận công việc.', now);
  } else if (action === 'handover' && canWorkOnAssignedTask(actor, task) && [TASK_ACTIVE, TASK_RETURNED].includes(status)) {
    if (!required(payload.note, 1000)) throw new Error('Cần nhập kết quả bàn giao.');
    const fileIds = appendFiles(state, payload.files);
    if (task.requiresFile && !fileIds.length) throw new Error('Công việc này yêu cầu tệp kết quả.');
    (task.submissions ||= []).push({ note: payload.note.trim(), fileIds, at: now.toISOString() });
    task.status = TASK_REVIEW;
    record(task, actor, 'Đã gửi kết quả công việc.', now);
  } else if (action === 'confirm' && [TASK_REVIEW, TASK_REREVIEW].includes(status)) {
    if (typeof payload.approve !== 'boolean' || (payload.files != null &&
      (!Array.isArray(payload.files) || payload.files.length > 0))) {
      throw new Error('Chỉ chọn kết quả duyệt công việc.');
    }
    if (payload.submissionCount !== undefined && payload.submissionCount !== (task.submissions?.length || 0)) {
      throw new Error('Đã có bản nộp mới. Mở lại chi tiết để xem trước khi duyệt.');
    }
    (task.reviews ||= []).push({ approve: payload.approve, at: now.toISOString() });
    task.status = payload.approve ? TASK_DONE : TASK_RETURNED;
    record(task, actor, payload.approve ? 'Đã chấp nhận hoàn thành.' : TASK_RETURNED, now);
  } else if (action === 'assign') {
    const recipient = staff.find(user => user.id === payload.assigneeId && (!task.department || user.role === task.department));
    if (!recipient || !required(payload.reason, 500) || !dateInputValue(payload.deadline)) {
      throw new Error('Chọn người phụ trách và nhập lý do thay đổi.');
    }
    if (dateInputValue(payload.deadline) < today) throw new Error('Hạn hoàn thành phải từ ngày hiện tại trở đi.');
    if (recipient.id !== task.assigneeId) {
      if (task.batchId && state.tasks.some(row => row.batchId === task.batchId && row.assigneeId === recipient.id)) {
        throw new Error('Người này đã nhận công việc trong đợt giao theo phòng.');
      }
      (task.previousAssignments ||= []).push({ assigneeId: task.assigneeId, comments: task.comments,
        submissions: task.submissions || [], reviews: task.reviews || [], discussion: task.discussion || [], handoverNote: task.handoverNote });
      Object.assign(task, { assigneeId: recipient.id, status: TASK_NEW, comments: [], submissions: [], reviews: [], discussion: [], handoverNote: '' });
      delete task.legacyManagerAssignment;
    }
    task.deadline = formatBusinessDate(payload.deadline);
    record(task, actor, payload.reason.trim(), now);
  } else {
    throw new Error('Thao tác không hợp lệ với trạng thái hoặc quyền hiện tại.');
  }
  return state;
}

export async function encodeTaskFiles(entries) {
  const files = entries.filter(file => file.size > 0 || file.name);
  if (files.length > FILE_COUNT || files.reduce((total, file) => total + file.size, 0) > FILE_LIMIT) {
    throw new Error('Tối đa 3 tệp và tổng dung lượng 1 MB mỗi lần gửi.');
  }
  return Promise.all(files.map(async file => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { name: file.name, content: btoa(binary) };
  }));
}

const HANDOVER_DRAFT_PREFIX = 'uv-task-handover-draft-v1';
const memoryHandoverDrafts = new Map();
const draftKey = (actorId, taskId) => `${HANDOVER_DRAFT_PREFIX}:${actorId || 'anon'}:${taskId || 'none'}`;

export function readTaskHandoverDraft(actorId, taskId, storage = globalThis.localStorage) {
  if (!actorId || !taskId) return '';
  const key = draftKey(actorId, taskId);
  try {
    const saved = storage?.getItem(key);
    if (saved !== null && saved !== undefined) return String(saved);
  } catch { /* Fall back to in-memory map when storage is blocked. */ }
  return memoryHandoverDrafts.get(key) || '';
}

export function storeTaskHandoverDraft(actorId, taskId, note, storage = globalThis.localStorage) {
  if (!actorId || !taskId) return false;
  const key = draftKey(actorId, taskId);
  const value = String(note ?? '');
  if (!value.trim()) return clearTaskHandoverDraft(actorId, taskId, storage);
  memoryHandoverDrafts.set(key, value);
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function clearTaskHandoverDraft(actorId, taskId, storage = globalThis.localStorage) {
  if (!actorId || !taskId) return false;
  const key = draftKey(actorId, taskId);
  memoryHandoverDrafts.delete(key);
  try {
    storage?.removeItem?.(key);
    if (!storage?.removeItem && storage?.setItem) storage.setItem(key, '');
    return true;
  } catch {
    return false;
  }
}

export function filterTaskRows(rows, {
  statusFilter = 'all',
  searchQuery = '',
  assigneeFilter = 'all',
  deadlineFilter = 'all',
  accounts = [],
  today = businessToday(),
} = {}) {
  const q = String(searchQuery ?? '').trim().toLowerCase();
  const todayDate = parseBusinessDate(today);
  return rows.filter(row => {
    if (statusFilter === 'alert-tasks') {
      if (!row.sourceAlert || [TASK_DONE, TASK_EXPIRED].includes(row.status)) return false;
    } else if (statusFilter !== 'all' && row.status !== statusFilter) {
      return false;
    }
    const assignee = accounts.find(account => account.id === row.assigneeId);
    const assigner = accounts.find(account => account.id === row.assignerId);
    if (assigneeFilter !== 'all') {
      if (assigneeFilter.startsWith('dept:')) {
        const dept = assigneeFilter.slice(5);
        if (row.department !== dept && assignee?.role !== dept) return false;
      } else if (row.assigneeId !== assigneeFilter) {
        return false;
      }
    }
    if (deadlineFilter !== 'all') {
      const due = parseBusinessDate(row.deadline);
      if (!due || !todayDate) return false;
      const diffDays = Math.floor((due - todayDate) / 86400000);
      if (deadlineFilter === 'overdue' && !(diffDays < 0 && row.status !== TASK_DONE)) return false;
      if (deadlineFilter === 'today' && diffDays !== 0) return false;
      if (deadlineFilter === 'soon' && !(diffDays >= 1 && diffDays <= 3)) return false;
      if (deadlineFilter === 'upcoming' && !(diffDays > 3)) return false;
    }
    if (q) {
      const deptLabel = row.department ? TASK_DEPARTMENTS[row.department] : '';
      const fields = [
        row.title,
        translate(row.title, 'en'),
        row.description,
        translate(row.description, 'en'),
        row.sourceAlert?.reference,
        assignee?.name,
        assignee?.email,
        assigner?.name,
        deptLabel,
        deptLabel ? translate(deptLabel, 'en') : '',
        row.deadline,
      ];
      if (!fields.some(value => typeof value === 'string' && value.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
