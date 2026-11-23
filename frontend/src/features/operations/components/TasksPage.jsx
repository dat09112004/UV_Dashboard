import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BellRing, Briefcase, CheckCircle2, ChevronRight, ClipboardList, ClipboardPlus, Lock, Package, Paperclip, Plus, RotateCcw, Search, UserCheck, X } from 'lucide-react';
import { phrase, t, translate } from '../../../locales/i18n.js';
import { useDebouncedValue } from '../../../hooks/useDebounce.js';
import { useProgressivePagination } from '../../../hooks/useProgressivePagination.js';
import ProgressivePaginationBar from '../../../components/common/ProgressivePaginationBar.jsx';
import FormWindowDialog from '../../../components/common/FormWindowDialog.jsx';
import { businessToday, dateInputValue, parseBusinessDate } from '../../../utils/business.js';
import { readTaskDraftApi, writeTaskDraftApi } from '../../../services/api.js';
import { readTaskAttachment } from '../../users/services/directoryService.js';
import {
  canDiscussTask,
  canExecutiveAssignOrder,
  canManageTask,
  canReceiveTasks,
  canViewManagedTask,
  canWorkOnAssignedTask,
  encodeTaskFiles,
  FILE_ACCEPT,
  isAccountantSelfOwnedFinance,
  isSaleSelfOwnedOrder,
  REMINDER_PENDING,
  resolveAlertAssignmentInfo,
  resolveTaskCategory,
  taskStatusAt,
  TASK_ACTIVE,
  TASK_DEPARTMENTS,
  TASK_DONE,
  TASK_EXPIRED,
  TASK_EXPIRED_MESSAGE,
  TASK_NEW,
  TASK_REREVIEW,
  TASK_RETURNED,
  TASK_REVIEW,
} from '../services/taskWorkflow.js';

// Chức năng: Lọc (filterTaskRows - Task Rows) phục vụ xử lý dữ liệu trong TasksPage.jsx
export function filterTaskRows(rows, {
  statusFilter = 'all',
  searchQuery = '',
  assigneeFilter = 'all',
  deadlineFilter = 'all',
  categoryFilter = 'all',
  accounts = [],
  today = businessToday(),
} = {}) {
  const q = String(searchQuery ?? '').trim().toLowerCase();
  const todayDate = parseBusinessDate(today);
  return rows.filter(row => {
    if (categoryFilter === 'order' && resolveTaskCategory(row) !== 'order') return false;
    if (categoryFilter === 'external' && resolveTaskCategory(row) !== 'external') return false;
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

// Chức năng: Thành phần giao diện (React Component AssignmentFields) hiển thị và xử lý tương tác người dùng trong TasksPage.jsx
function AssignmentFields({ people, task, today, defaultRole = '' }) {
  const [scope, setScope] = useState('person');
  const departments = Object.entries(TASK_DEPARTMENTS);
  const defaultAssignee = defaultRole
    ? (people.find(p => p.role === defaultRole)?.id || people[0]?.id || '')
    : (task?.assigneeId ?? '');
  return <>
    {!task && <label>{t('Phạm vi giao việc')}<select name="scope" value={scope} onChange={event => setScope(event.target.value)}>
      <option value="person">{t('Một nhân viên')}</option>
      <option value="department">{t('Toàn bộ phòng')}</option>
    </select></label>}
    {scope === 'department' ? <label>{t('Phòng nhận việc')} <span className="required-mark" aria-hidden="true">*</span><select name="department" required defaultValue={defaultRole || ''}>
      <option value="">{t('Chọn phòng nhận việc')}</option>
      {departments.map(([role, label]) => <option key={role} value={role}>{t(label)}</option>)}
    </select></label> : <label>{t('Người phụ trách')} <span className="required-mark" aria-hidden="true">*</span><select name="assigneeId" defaultValue={defaultAssignee} required>
      <option value="">{t('Chọn người phụ trách')}</option>
      {people.filter(person => !task?.department || person.role === task.department).map(person =>
        <option key={person.id} value={person.id}>{person.employeeCode ? `[${person.employeeCode}] ` : ''}{person.name} · {t(person.roleLabel)}</option>)}
    </select></label>}
    <label>{t('Hạn hoàn thành')} <span className="required-mark" aria-hidden="true">*</span><input name="deadline" type="date" min={today} defaultValue={dateInputValue(task?.deadline) || today} required /></label>
  </>;
}

// Chức năng: Thành phần giao diện (React Component FileField) hiển thị và xử lý tương tác người dùng trong TasksPage.jsx
function FileField({ label, required = false }) {
  return <label>{t(label)}{required && <> <span className="required-mark" aria-hidden="true">*</span></>}<input name="files" type="file" accept={FILE_ACCEPT} multiple required={required} />
    </label>;
}

const statuses = [TASK_NEW, TASK_ACTIVE, TASK_REVIEW, TASK_REREVIEW, TASK_RETURNED, TASK_DONE, TASK_EXPIRED];
// Chức năng: Xử lý nghiệp vụ (taskTone - Tone) phục vụ xử lý dữ liệu trong TasksPage.jsx
const taskTone = status => status === TASK_DONE ? 'done' : [TASK_RETURNED, TASK_EXPIRED].includes(status) ? 'returned' : undefined;

// Chức năng: Trang Quản lý Giao việc (CEO/Admin) & Công việc của tôi (Sale/Kế toán): chia 2 khung Giao việc (Đơn hàng vs Việc bên ngoài) mở ở chế độ Cửa sổ (Modal Window) chuẩn responsive
export default function TasksPage({
  tasks,
  reminders = [],
  orderItems = [],
  finance = null,
  accounts,
  actor,
  onAction,
  busy,
  managing,
  fileNames,
  reReviewOnly = false,
  onNavigate,
  alertDraft,
  onClearAlertDraft,
}) {
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState('all');

  // Chế độ cửa sổ (Modal Window) cho Khung 1 (Giao việc Đơn hàng PO) và Khung 2 (Giao việc Bên ngoài)
  const [activeFrameWindow, setActiveFrameWindow] = useState(null);

  // Debounced search and filter values for smooth UI & API filtering
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const debouncedFilter = useDebouncedValue(filter, 150);
  const debouncedCategoryFilter = useDebouncedValue(categoryFilter, 150);
  const debouncedAssigneeFilter = useDebouncedValue(assigneeFilter, 150);
  const debouncedDeadlineFilter = useDebouncedValue(deadlineFilter, 150);

  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [orderFrameError, setOrderFrameError] = useState('');
  const [externalFrameError, setExternalFrameError] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [today, setToday] = useState(businessToday);
  const [handoverDraft, setHandoverDraft] = useState('');
  const [draftStatus, setDraftStatus] = useState('idle');
  const draftSession = useRef(null);
  const [showCloseDraftPrompt, setShowCloseDraftPrompt] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [quickAssignReminderId, setQuickAssignReminderId] = useState(null);
  const [quickAssignScope, setQuickAssignScope] = useState('person');
  const [quickAssignNote, setQuickAssignNote] = useState('');
  const [quickAssignError, setQuickAssignError] = useState('');

  // Khung 1 (Giao việc tới Đơn hàng): chỉ các đơn hàng do Sếp (CEO / Admin) tạo mới được giao việc
  const executiveOrders = (orderItems || []).filter(item => canExecutiveAssignOrder(item));
  const saleSelfOwnedOrders = (orderItems || []).filter(item => isSaleSelfOwnedOrder(item));
  const accountantSelfOwnedFinance = [
    ...(Array.isArray(finance?.revenue) ? finance.revenue.map(r => ({ ...r, financeDocType: "Doanh thu" })) : []),
    ...(Array.isArray(finance?.receivables) ? finance.receivables.map(r => ({ ...r, financeDocType: "Phải thu AR" })) : []),
    ...(Array.isArray(finance?.payables) ? finance.payables.map(r => ({ ...r, financeDocType: "Phải trả AP" })) : []),
  ].filter(doc => isAccountantSelfOwnedFinance(doc));
  const [selectedOrderRowId, setSelectedOrderRowId] = useState(() =>
    String(executiveOrders[0]?.rowId || '')
  );
  const selectedExecutiveOrder =
    executiveOrders.find(item => String(item.rowId) === String(selectedOrderRowId)) ||
    executiveOrders[0] ||
    null;

  const dialogRef = useRef(null);
  const detailRef = useRef(null);
  const errorRef = useRef(null);
  const handoverTextareaRef = useRef(null);
  const people = accounts.filter(canReceiveTasks);
  const visible = tasks.filter(task => managing ? canViewManagedTask(actor, task, accounts) : canWorkOnAssignedTask(actor, task))
    .map(task => ({ ...task, status: taskStatusAt(task, today) }));
  const reReviewCount = visible.filter(task => task.status === TASK_REREVIEW).length;
  const queue = managing ? visible.filter(task => (task.status === TASK_REREVIEW) === reReviewOnly) : visible;
  const orderTaskCount = queue.filter(task => resolveTaskCategory(task) === 'order').length;
  const externalTaskCount = queue.filter(task => resolveTaskCategory(task) === 'external').length;
  const alertTasks = managing ? [] : queue.filter(task => task.sourceAlert && ![TASK_DONE, TASK_EXPIRED].includes(task.status));
  const pendingReminders = reminders.filter(r => r.status === REMINDER_PENDING);
  const activeQuickReminder = pendingReminders.find(r => r.id === quickAssignReminderId) || null;
  const rows = filterTaskRows(queue, {
    statusFilter: debouncedFilter,
    searchQuery: debouncedSearchQuery,
    assigneeFilter: debouncedAssigneeFilter,
    deadlineFilter: debouncedDeadlineFilter,
    categoryFilter: debouncedCategoryFilter,
    accounts,
    today,
  });

  // Phân trang + Tải trước 1 phần & Cuộn tải dần + Xóa trang cũ khi đổi trang/tab
  const pagination = useProgressivePagination(rows, {
    sectionKey: managing ? (reReviewOnly ? 'assignment-reviews' : 'assignments') : 'tasks',
    initialChunkSize: 6,
    stepSize: 6,
    pageSize: 12,
    resetDeps: [debouncedFilter, debouncedCategoryFilter, debouncedSearchQuery, debouncedAssigneeFilter, debouncedDeadlineFilter],
  });
  const pagedRows = pagination.visibleItems;

  const hasExtraFilters = Boolean(
    searchQuery.trim() ||
    assigneeFilter !== 'all' ||
    deadlineFilter !== 'all' ||
    filter !== 'all' ||
    categoryFilter !== 'all'
  );
  const filterStatuses = managing ? statuses.filter(status => status !== TASK_REREVIEW) : statuses;
  const task = visible.find(row => row.id === selectedId);
  const detailId = task?.id;
  const canManageSelected = canManageTask(actor, task, accounts);
  const canHandoverSelected = Boolean(task && !managing && [TASK_ACTIVE, TASK_RETURNED].includes(task.status));
  const hasUnsentHandover = canHandoverSelected &&
    (handoverDraft.trim().length > 0 || handoverDraft !== (draftSession.current?.saved ?? '') || (draftSession.current?.pending ?? 0) > 0);
  const person = accounts.find(account => account.id === task?.assigneeId);
  const assigner = accounts.find(account => account.id === task?.assignerId);
  const lastSubmission = task?.submissions?.at(-1);
  const counts = Object.fromEntries(filterStatuses.map(status => [status, queue.filter(row => row.status === status).length]));
  const returnedCount = counts[TASK_RETURNED];
  const contactLabel = managing ? 'Người phụ trách' : 'Người giao việc';

  useEffect(() => {
    if (!selectedOrderRowId && executiveOrders.length > 0) {
      setSelectedOrderRowId(String(executiveOrders[0].rowId));
    }
  }, [executiveOrders, selectedOrderRowId]);

  useEffect(() => {
    const refresh = () => setToday(businessToday());
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    setHandoverDraft('');
    setDraftStatus(canHandoverSelected ? 'loading' : 'idle');
    setShowCloseDraftPrompt(false);
    setConfirmingApprove(false);
    if (!detailId || !canHandoverSelected) return;
    const controller = new AbortController();
    const session = { id: detailId, version: null, saved: '', queue: Promise.resolve(), paused: false, pending: 0 };
    draftSession.current = session;
    readTaskDraftApi(detailId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      session.version = result.version;
      session.saved = result.note;
      setHandoverDraft(result.note);
      setDraftStatus('ready');
    }).catch(error => {
      if (!controller.signal.aborted) {
        setError(error.message);
        setDraftStatus('failed');
      }
    });
    return () => {
      controller.abort();
      clearTimeout(session.timer);
      if (draftSession.current === session) draftSession.current = null;
    };
  }, [detailId, actor?.id, canHandoverSelected]);

  // Chức năng: Xử lý nghiệp vụ (persistDraft - Draft) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const persistDraft = (session, note) => {
    session.pending++;
    const task = session.queue.catch(() => {}).then(async () => {
      if (draftSession.current !== session || session.version === null || note === session.saved) return;
      const result = await writeTaskDraftApi(session.id, note, session.version);
      session.version = result.version;
      session.saved = result.note;
    }).finally(() => { session.pending--; });
    session.queue = task;
    return task;
  };

  useEffect(() => {
    const session = draftSession.current;
    if (!session || draftStatus !== 'ready' || session.paused) return;
    session.timer = setTimeout(() => {
      if (session.paused) return;
      persistDraft(session, handoverDraft).catch(error => {
        if (draftSession.current === session) {
          setError(error.message);
          setDraftStatus('failed');
        }
      });
    }, 500);
    return () => clearTimeout(session.timer);
  }, [handoverDraft, draftStatus]);

  useEffect(() => {
    const dialog = detailRef.current;
    if (detailId && !dialog.open) dialog.showModal();
    else if (!detailId && dialog.open) dialog.close();
  }, [detailId]);

  useEffect(() => {
    if (alertDraft && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [alertDraft]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  // Chức năng: Mở (openTask - Task) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const openTask = id => {
    setEditingId(null);
    setError('');
    setShowCloseDraftPrompt(false);
    setConfirmingApprove(false);
    setSelectedId(id);
  };

  // Chức năng: Xử lý nghiệp vụ (requestCloseDetail - Close Detail) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const requestCloseDetail = () => {
    if (busy || draftStatus === 'saving') return;
    if (hasUnsentHandover) {
      setShowCloseDraftPrompt(true);
      return;
    }
    detailRef.current?.close();
  };

  // Chức năng: Đóng (closeDraft - Draft) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const closeDraft = async note => {
    const session = draftSession.current;
    if (!session) return;
    session.paused = true;
    clearTimeout(session.timer);
    setDraftStatus('saving');
    try {
      if (session.version === null) throw new Error('Chưa tải được phiên bản bản nháp.');
      await persistDraft(session, note);
      setShowCloseDraftPrompt(false);
      detailRef.current?.close();
    } catch (error) {
      session.paused = false;
      setError(error.message);
      setDraftStatus('failed');
    }
  };
  // Chức năng: Xử lý nghiệp vụ (keepDraftAndClose - Draft And Close) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const keepDraftAndClose = () => closeDraft(handoverDraft);
  // Chức năng: Xử lý nghiệp vụ (discardDraftAndClose - Draft And Close) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const discardDraftAndClose = () => closeDraft('');

  // Chức năng: Xử lý nghiệp vụ (continueEditingDraft - Editing Draft) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const continueEditingDraft = () => {
    setShowCloseDraftPrompt(false);
    requestAnimationFrame(() => handoverTextareaRef.current?.focus());
  };

  // Chức năng: Xử lý sự kiện (handleHandoverDraftChange - Handover Draft Change) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const handleHandoverDraftChange = event => {
    const nextValue = event.target.value;
    setHandoverDraft(nextValue);
  };

  // Chức năng: Xử lý nghiệp vụ (submitQuickAssignFromReminder - Quick Assign From Reminder) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const submitQuickAssignFromReminder = async (event, reminder) => {
    event.preventDefault();
    setQuickAssignError('');
    const data = new FormData(event.currentTarget);
    const scope = data.get('scope') || quickAssignScope;
    const ok = await onAction('quick-assign-reminder', {
      reminderId: reminder.id,
      scope,
      assigneeId: scope === 'person' ? data.get('assigneeId') : undefined,
      department: scope === 'department' ? data.get('department') : undefined,
      title: data.get('title'),
      managerNote: data.get('managerNote') || quickAssignNote,
      deadline: data.get('deadline') || today,
      requiresFile: data.has('requiresFile'),
    }, setQuickAssignError);
    if (ok) {
      setQuickAssignReminderId(null);
      setQuickAssignNote('');
    }
  };

  // Chức năng: Giao việc ở Khung 1 (Giao việc tới Đơn hàng do Sếp tạo cho nhân sự/phòng ban xử lý)
  const submitOrderFrameTask = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setOrderFrameError('');
    if (!selectedExecutiveOrder) {
      setOrderFrameError('Không có đơn hàng do Sếp tạo để phân công.');
      return;
    }
    if (isSaleSelfOwnedOrder(selectedExecutiveOrder)) {
      setOrderFrameError('Đơn hàng do Sale tạo đã tự động thuộc quyền đảm nhận của Sale đó.');
      return;
    }
    setCreating(true);
    try {
      const files = await encodeTaskFiles(data.getAll('files'));
      const payload = {
        ...Object.fromEntries(data),
        files,
        requiresFile: data.has('requiresFile'),
        taskCategory: 'order',
        orderRowId: selectedExecutiveOrder.rowId,
        sourceAlert: {
          type: 'orders',
          id: `order-${selectedExecutiveOrder.rowId}`,
          reference: selectedExecutiveOrder.poId,
        },
      };
      const ok = await onAction('create-task', payload, setOrderFrameError);
      if (ok) {
        setFormVersion(v => v + 1);
        setFilter('all');
        setActiveFrameWindow(null);
      }
    } catch (err) {
      setOrderFrameError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Chức năng: Giao việc ở Khung 2 (Giao những việc bên ngoài không gắn với đơn hàng PO)
  const submitExternalFrameTask = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setExternalFrameError('');
    setCreating(true);
    try {
      const files = await encodeTaskFiles(data.getAll('files'));
      const payload = {
        ...Object.fromEntries(data),
        files,
        requiresFile: data.has('requiresFile'),
        taskCategory: 'external',
      };
      const ok = await onAction('create-task', payload, setExternalFrameError);
      if (ok) {
        form.reset();
        setFormVersion(v => v + 1);
        setFilter('all');
        setActiveFrameWindow(null);
      }
    } catch (err) {
      setExternalFrameError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Chức năng: Xử lý nghiệp vụ (submit - submit) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const submit = async (event, action, id) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const isCreate = action === 'create-task';
    const reportError = isCreate ? setCreateError : setError;
    reportError('');
    if (isCreate) setCreating(true);
    if (action === 'comment-task') {
      if (await onAction(action, { id, note: data.get('note') }, reportError)) form.reset();
      return;
    }
    const session = action === 'handover' ? draftSession.current : null;
    if (session?.paused) return;
    if (session) {
      session.paused = true;
      clearTimeout(session.timer);
      await session.queue.catch(() => {});
    }
    let submitted = false;
    try {
      const files = await encodeTaskFiles(data.getAll('files'));
      if (!await onAction(action, {
        ...Object.fromEntries(data), id, files, requiresFile: data.has('requiresFile'),
        ...(isCreate && alertDraft && {
          sourceAlert: alertDraft.sourceAlert,
          taskCategory: alertDraft.taskCategory || (alertDraft.sourceAlert?.type === 'orders' ? 'order' : 'external'),
          orderRowId: alertDraft.orderRowId,
        }),
      },
        reportError)) return;
      submitted = true;
      if (isCreate) {
        dialogRef.current?.close();
        setFormVersion(version => version + 1);
        setFilter('all');
      } else if (action === 'assign') {
        setEditingId(null);
      } else if (action === 'handover') {
        setHandoverDraft('');
        setShowCloseDraftPrompt(false);
        form.reset();
      } else {
        form.reset();
      }
    } catch (err) {
      reportError(err.message);
    } finally {
      if (isCreate) setCreating(false);
      if (session) {
        session.paused = false;
        if (!submitted && draftSession.current === session && draftStatus === 'ready') {
          persistDraft(session, String(data.get('note') ?? '')).catch(error => {
            if (draftSession.current !== session) return;
            setError(error.message);
            setDraftStatus('failed');
          });
        }
      }
    }
  };

  // Chức năng: Xử lý nghiệp vụ (review - review) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const review = async approve => {
    setError('');
    const ok = await onAction('confirm', {
      id: task.id,
      approve,
      assignmentEpoch: task.assignmentEpoch ?? 1,
      submissionCount: task.submissions?.length || 0,
    }, setError);
    if (ok) setConfirmingApprove(false);
    return ok;
  };

  // Chức năng: Xử lý nghiệp vụ (download - download) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const download = async (taskId, fileId) => {
    setError('');
    try {
      const { content, name } = await readTaskAttachment(actor.id, taskId, fileId);
      const bytes = Uint8Array.from(atob(content), value => value.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Không thể tải tệp đính kèm.');
    }
  };

  // Chức năng: Xử lý nghiệp vụ (filesFor - For) phục vụ xử lý dữ liệu trong TasksPage.jsx
  const filesFor = (task, ids) => (ids || []).map(id => <button key={id} className="row-detail-button" type="button"
    onClick={() => download(task.id, id)}>{t('Tải tệp')} · {fileNames[id] || id}</button>);

  return <>
    {managing && !reReviewOnly && <dialog className="assignment-dialog" ref={dialogRef} aria-labelledby="assignment-dialog-title"
      onClose={onClearAlertDraft}
      onCancel={event => { if (busy || creating) event.preventDefault(); }}>
      <header className="profile-dialog-heading">
        <h2 id="assignment-dialog-title">{t('Giao việc mới')}</h2>
        <button className="profile-dialog-close" type="button" disabled={busy || creating}
          aria-label={t('Đóng')} onClick={() => dialogRef.current.close()}><X size={20} /></button>
      </header>
      <form key={alertDraft?.sourceAlert.id ?? formVersion} className="workflow-form assignment-form" onSubmit={event => submit(event, 'create-task')}>
        {createError && <p className="profile-form-error" role="alert">{t(createError)}</p>}
        <fieldset disabled={busy || creating}>
          {alertDraft && <p className="assignment-wide task-alert-source">{t('Báo động đỏ')} · {alertDraft.sourceAlert.reference}</p>}
          <label className="assignment-wide">{t('Tên công việc')} <span className="required-mark" aria-hidden="true">*</span><input name="title" defaultValue={alertDraft?.title} required maxLength={160} /></label>
          <label className="assignment-wide">{t('Nội dung')} <span className="required-mark" aria-hidden="true">*</span><textarea name="description" defaultValue={alertDraft?.description} required maxLength={1000} /></label>
          <label className="assignment-wide">{t('Ghi chú chỉ đạo (Note cho nhân viên / phòng ban)')}<input name="managerNote" maxLength={500} /></label>
          <AssignmentFields people={people} today={today} />
          <FileField label="Tệp hướng dẫn" />
          <label className="assignment-wide task-file-required"><input name="requiresFile" type="checkbox" /> {t('Yêu cầu đính kèm tệp khi nộp kết quả')}</label>
          <div className="assignment-wide workflow-footer">
            <button type="button" onClick={() => dialogRef.current.close()}>{t('Hủy')}</button>
            <button className="primary" type="submit">{t('Giao việc')}</button>
          </div>
        </fieldset>
      </form>
    </dialog>}

    {/* Cửa sổ Khung 1: Giao việc tới Đơn hàng (Ai xử lý) */}
    <FormWindowDialog
      open={Boolean(managing && !reReviewOnly && activeFrameWindow === 'order')}
      title="Khung 1 · Giao việc tới Đơn hàng (Ai xử lý)"
      subtitle="Phân công xử lý Đơn hàng PO do Sếp tạo"
      size="lg"
      busy={busy || creating}
      onClose={() => setActiveFrameWindow(null)}
    >
      {executiveOrders.length > 0 ? (
        <form
          key={`order-frame-${selectedExecutiveOrder?.rowId || 'none'}-${formVersion}`}
          className="workflow-form space-y-3"
          onSubmit={submitOrderFrameTask}
        >
          {orderFrameError && <p className="profile-form-error" role="alert">{t(orderFrameError)}</p>}
          <fieldset disabled={busy || creating} className="item-form-grid">
            <label className="workflow-wide">
              {t('Chọn đơn hàng PO do Sếp tạo cần giao xử lý')} <span className="required-mark" aria-hidden="true">*</span>
              <select
                value={selectedExecutiveOrder?.rowId || ''}
                onChange={e => setSelectedOrderRowId(e.target.value)}
              >
                {executiveOrders.map(order => {
                  const info = resolveAlertAssignmentInfo(
                    { id: `order-${order.rowId}`, type: 'orders', reference: order.poId, data: order },
                    tasks,
                    accounts,
                    reminders,
                    today
                  );
                  return (
                    <option key={order.rowId} value={order.rowId}>
                      {order.poId} · {t(order.vendorItemNo)} ({order.vendorName}) — {info.isAssigned ? `Đã giao: ${info.assigneesText}` : 'Chưa giao người xử lý'}
                    </option>
                  );
                })}
              </select>
            </label>
            {selectedExecutiveOrder && (
              <div className="workflow-wide px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-wrap justify-between gap-2">
                <span>
                  <strong>PO:</strong> {selectedExecutiveOrder.poId} · <strong>{t('Mặt hàng:')}</strong> {t(selectedExecutiveOrder.vendorItemNo)} · <strong>{t('SL đặt:')}</strong> {selectedExecutiveOrder.orderedQty} {selectedExecutiveOrder.unit}
                </span>
                <span>
                  <strong>{t('Người tạo đơn:')}</strong> {selectedExecutiveOrder.createdByRole === 'Admin' || selectedExecutiveOrder.createdByName === 'Quản trị Demo' ? t('Ban Giám đốc') : (selectedExecutiveOrder.createdByName || 'Ban Giám đốc')}
                </span>
              </div>
            )}
            <label className="workflow-wide">
              {t('Tên công việc xử lý đơn hàng')} <span className="required-mark" aria-hidden="true">*</span>
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={
                  selectedExecutiveOrder
                    ? `Xử lý đơn hàng PO ${selectedExecutiveOrder.poId} · ${selectedExecutiveOrder.vendorItemNo}`.slice(0, 160)
                    : ''
                }
              />
            </label>
            <label className="workflow-wide">
              {t('Nội dung xử lý đơn hàng')} <span className="required-mark" aria-hidden="true">*</span>
              <textarea
                name="description"
                required
                maxLength={1000}
                rows={2}
                defaultValue={
                  selectedExecutiveOrder
                    ? `Theo dõi tiến độ nhập kho, sản xuất và giao hàng cho đơn hàng ${selectedExecutiveOrder.poId} (${selectedExecutiveOrder.vendorItemNo} · NCC: ${selectedExecutiveOrder.vendorName}).`
                    : ''
                }
              />
            </label>
            <AssignmentFields people={people} today={today} defaultRole="Sale" />
            <label className="workflow-wide">
              {t('Ghi chú chỉ đạo (Note cho người xử lý đơn hàng)')}
              <input
                name="managerNote"
                maxLength={500}
              />
            </label>
            <label className="workflow-wide task-file-required">
              <input name="requiresFile" type="checkbox" /> {t('Yêu cầu đính kèm tệp khi nộp kết quả')}
            </label>
          </fieldset>
          <div className="workflow-footer">
            <button type="button" disabled={busy || creating} onClick={() => setActiveFrameWindow(null)}>
              {t('Hủy')}
            </button>
            <button className="primary" type="submit" disabled={busy || creating}>
              {t('Giao người xử lý đơn hàng')}
            </button>
          </div>
        </form>
      ) : (
        <p className="management-note">
          {t('Hiện chưa có đơn hàng nào do Sếp tạo chờ phân công.')}
        </p>
      )}
    </FormWindowDialog>

    {/* Cửa sổ Khung 2: Giao những việc bên ngoài */}
    <FormWindowDialog
      open={Boolean(managing && !reReviewOnly && activeFrameWindow === 'external')}
      title="Khung 2 · Giao những việc bên ngoài"
      subtitle="Phân công Công việc Điều hành & Tác vụ Bên ngoài"
      size="lg"
      busy={busy || creating}
      onClose={() => setActiveFrameWindow(null)}
    >
      <form
        key={`external-frame-${formVersion}`}
        className="workflow-form space-y-3"
        onSubmit={submitExternalFrameTask}
      >
        {externalFrameError && <p className="profile-form-error" role="alert">{t(externalFrameError)}</p>}
        <fieldset disabled={busy || creating} className="item-form-grid">
          <label className="workflow-wide">
            {t('Tên công việc bên ngoài')} <span className="required-mark" aria-hidden="true">*</span>
            <input
              name="title"
              required
              maxLength={160}
            />
          </label>
          <label className="workflow-wide">
            {t('Nội dung công việc bên ngoài')} <span className="required-mark" aria-hidden="true">*</span>
            <textarea
              name="description"
              required
              maxLength={1000}
              rows={2}
            />
          </label>
          <AssignmentFields people={people} today={today} />
          <label className="workflow-wide">
            {t('Ghi chú chỉ đạo (Note cho nhân viên / phòng ban)')}
            <input
              name="managerNote"
              maxLength={500}
            />
          </label>
          <div className="workflow-wide">
            <FileField label="Tệp hướng dẫn" />
          </div>
          <label className="workflow-wide task-file-required">
            <input name="requiresFile" type="checkbox" /> {t('Yêu cầu đính kèm tệp khi nộp kết quả')}
          </label>
        </fieldset>
        <div className="workflow-footer">
          <button type="button" disabled={busy || creating} onClick={() => setActiveFrameWindow(null)}>
            {t('Hủy')}
          </button>
          <button className="primary" type="submit" disabled={busy || creating}>
            {t('Giao việc bên ngoài')}
          </button>
        </div>
      </form>
    </FormWindowDialog>

    {/* Cửa sổ Giao việc nhanh từ Nhắc việc chờ xử lý */}
    <FormWindowDialog
      open={Boolean(managing && !reReviewOnly && activeQuickReminder)}
      title="Giao việc nhanh từ nhắc việc"
      subtitle={activeQuickReminder ? `${activeQuickReminder.reference} · ${activeQuickReminder.subject}` : ''}
      size="md"
      busy={busy}
      onClose={() => setQuickAssignReminderId(null)}
    >
      {activeQuickReminder && (
        <form className="workflow-form space-y-3" onSubmit={e => submitQuickAssignFromReminder(e, activeQuickReminder)}>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-slate-800 space-y-1">
            <div>
              <strong className="text-rose-700">[{activeQuickReminder.reference}]</strong>{' '}
              <strong>{t(activeQuickReminder.subject)}</strong> · {t(activeQuickReminder.issue)}
            </div>
            <div>
              <strong>{activeQuickReminder.senderName}:</strong> “{t(activeQuickReminder.message)}”
            </div>
          </div>
          {quickAssignError && <p className="profile-form-error" role="alert">{t(quickAssignError)}</p>}
          <fieldset disabled={busy} className="item-form-grid">
            <label>
              {t('Giao cho')}
              <select name="scope" value={quickAssignScope} onChange={e => setQuickAssignScope(e.target.value)}>
                <option value="person">{t('Nhân viên')}</option>
                <option value="department">{t('Phòng ban')}</option>
              </select>
            </label>
            {quickAssignScope === 'person' ? (
              <label>
                {t('Người phụ trách')} <span className="required-mark" aria-hidden="true">*</span>
                <select name="assigneeId" required defaultValue={people[0]?.id || ''}>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name} · {t(p.roleLabel)}</option>)}
                </select>
              </label>
            ) : (
              <label>
                {t('Phòng ban')} <span className="required-mark" aria-hidden="true">*</span>
                <select name="department" required defaultValue={activeQuickReminder.alertType === 'orders' ? 'Sale' : 'Accountant'}>
                  {Object.entries(TASK_DEPARTMENTS).map(([roleKey, label]) => <option key={roleKey} value={roleKey}>{t(label)}</option>)}
                </select>
              </label>
            )}
            <label className="workflow-wide">
              {t('Tên công việc')} <span className="required-mark" aria-hidden="true">*</span>
              <input name="title" required defaultValue={`Xử lý cảnh báo đỏ ${activeQuickReminder.reference} · ${activeQuickReminder.subject}`.slice(0, 160)} />
            </label>
            <label>
              {t('Hạn hoàn thành')} <span className="required-mark" aria-hidden="true">*</span>
              <input name="deadline" type="date" min={today} defaultValue={today} required />
            </label>
            <label className="workflow-wide">
              {t('Ghi chú chỉ đạo (Note cho nhân viên / phòng ban)')}
              <input name="managerNote" value={quickAssignNote} onChange={e => setQuickAssignNote(e.target.value)} />
            </label>
          </fieldset>
          <div className="workflow-footer">
            <button type="button" disabled={busy} onClick={() => setQuickAssignReminderId(null)}>
              {t('Hủy')}
            </button>
            <button type="submit" disabled={busy} className="primary">
              {t('Giao ngay')}
            </button>
          </div>
        </form>
      )}
    </FormWindowDialog>

    <header className="page-heading task-page-heading">
      <div><p className="page-eyebrow">UYEN VU INTERNATIONAL</p>
        <h1>{t(reReviewOnly ? TASK_REREVIEW : managing ? 'Giao việc' : 'Công việc của tôi')}</h1></div>
      {reReviewOnly && <button className="row-detail-button" type="button" onClick={() => onNavigate('assignments')}>
        <ArrowLeft size={16} aria-hidden="true" />{t('Về trang giao việc')}
      </button>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="row-detail-button" type="button" onClick={() => onNavigate('reminders')}>
          <BellRing size={15} aria-hidden="true" />
          <span>{t('Nhắc việc')}</span>
          {pendingReminders.length > 0 && <strong className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[11px]">{pendingReminders.length}</strong>}
        </button>
        {managing && !reReviewOnly && <button className="row-primary-button" type="button" disabled={busy}
          onClick={() => { setCreateError(''); dialogRef.current.showModal(); }}><Plus size={16} aria-hidden="true" />{t('Giao việc')}</button>}
      </div>
    </header>

    {managing && !reReviewOnly && (
      <section
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4"
        aria-label={t('Hai khung giao việc điều hành: Đơn hàng và Việc bên ngoài')}
      >
        {/* KHUNG 1: GIAO VIỆC TỚI ĐƠN HÀNG AI XỬ LÝ */}
        <article
          className="analytics-card management-panel border-t-4 border-t-sky-700"
          data-assignment-frame="order"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-xs font-bold">
                <Package size={14} />
                {t('Khung 1 · Giao việc tới Đơn hàng (Ai xử lý)')}
              </span>
              <h2 className="m-0 mt-1.5 text-base font-bold text-slate-900">
                {t('Phân công xử lý Đơn hàng PO do Sếp tạo')}
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2 py-1 rounded bg-sky-50 border border-sky-200 text-sky-900 font-semibold">
                {t('Đơn Sếp tạo:')} <b>{executiveOrders.length}</b>
              </span>
              <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                {t('Đơn Sale tự nhận:')} <b>{saleSelfOwnedOrders.length}</b>
              </span>
              {accountantSelfOwnedFinance.length > 0 && (
                <span className="px-2 py-1 rounded bg-teal-50 border border-teal-200 text-teal-900 font-semibold">
                  {t('Chứng từ Kế toán tự nhận:')} <b>{accountantSelfOwnedFinance.length}</b>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-sky-50/70 border border-sky-200">
            <span className="text-xs text-slate-700">
              {executiveOrders.length > 0
                ? phrase('Hiện có § đơn hàng PO do Sếp tạo có thể phân công người xử lý.', executiveOrders.length)
                : t('Hiện chưa có đơn hàng nào do Sếp tạo chờ phân công.')}
            </span>
            <button
              type="button"
              disabled={busy || creating || executiveOrders.length === 0}
              onClick={() => {
                setOrderFrameError('');
                setActiveFrameWindow('order');
              }}
              className="row-primary-button text-xs flex items-center gap-1.5"
            >
              <ClipboardPlus size={15} />
              <span>{t('+ Mở cửa sổ Giao việc Đơn hàng')}</span>
            </button>
          </div>

          {saleSelfOwnedOrders.length > 0 && (
            <details className="mt-3 pt-3 border-t border-slate-200 text-xs" open>
              <summary className="font-bold text-emerald-900 cursor-pointer flex items-center gap-1.5">
                <UserCheck size={14} className="text-emerald-700 shrink-0" />
                <span>
                  {phrase('Đơn hàng do Sale tạo — Sale tự động nhận xử lý (§ đơn)', saleSelfOwnedOrders.length)}
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {saleSelfOwnedOrders.map(order => (
                  <li
                    key={order.rowId}
                    className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-emerald-50/70 border border-emerald-200 text-emerald-950"
                  >
                    <span>
                      <strong>{order.poId}</strong> · {t(order.vendorItemNo)} ({order.orderedQty} {order.unit})
                    </span>
                    <span className="italic font-semibold text-emerald-800">
                      {t('Sale tạo & tự nhận:')} {order.assignedSaleName || order.createdByName || 'Phòng Sale'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {accountantSelfOwnedFinance.length > 0 && (
            <details className="mt-3 pt-3 border-t border-slate-200 text-xs" open>
              <summary className="font-bold text-teal-900 cursor-pointer flex items-center gap-1.5">
                <UserCheck size={14} className="text-teal-700 shrink-0" />
                <span>
                  {phrase('Chứng từ tài chính do Kế toán tạo — Kế toán tự động nhận xử lý (§ chứng từ)', accountantSelfOwnedFinance.length)}
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {accountantSelfOwnedFinance.map(doc => (
                  <li
                    key={`${doc.financeDocType}-${doc.id || doc.docNo}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-teal-50/70 border border-teal-200 text-teal-950"
                  >
                    <span>
                      <strong>{doc.docNo}</strong> · {t(doc.financeDocType)} ({doc.poId || "Độc lập"})
                    </span>
                    <span className="italic font-semibold text-teal-800">
                      {t('Kế toán tạo & tự nhận:')} {doc.assignedAccountantName || doc.createdByName || doc.pic || 'Phòng Kế toán'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>

        {/* KHUNG 2: GIAO NHỮNG VIỆC BÊN NGOÀI */}
        <article
          className="analytics-card management-panel border-t-4 border-t-indigo-700 flex flex-col justify-between"
          data-assignment-frame="external"
        >
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-bold">
                  <Briefcase size={14} />
                  {t('Khung 2 · Giao những việc bên ngoài')}
                </span>
                <h2 className="m-0 mt-1.5 text-base font-bold text-slate-900">
                  {t('Phân công Công việc Điều hành & Tác vụ Bên ngoài')}
                </h2>
              </div>
              <span className="px-2 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold">
                {t('Việc bên ngoài đã giao:')} <b>{externalTaskCount}</b>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
              <span className="text-xs text-slate-700">
                {t('Giao các công việc nội bộ, báo cáo, kiểm toán, đối soát hoặc tác vụ bên ngoài cho nhân sự / phòng ban.')}
              </span>
              <button
                type="button"
                disabled={busy || creating}
                onClick={() => {
                  setExternalFrameError('');
                  setActiveFrameWindow('external');
                }}
                className="row-primary-button text-xs flex items-center gap-1.5"
              >
                <Plus size={15} />
                <span>{t('+ Mở cửa sổ Giao việc Bên ngoài')}</span>
              </button>
            </div>
          </div>
        </article>
      </section>
    )}

    {managing && !reReviewOnly && pendingReminders.length > 0 && (
      <section className="analytics-card management-panel mb-4 border-l-4 border-l-amber-500 bg-amber-50/40" aria-label={t('Nhắc việc từ nhân viên chờ giao việc')}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <BellRing size={18} className="text-amber-700" />
            <h2 className="m-0 text-base font-bold text-slate-900">
              {phrase('Có § nhắc việc từ nhân viên chờ sếp giao việc', pendingReminders.length)}
            </h2>
          </div>
          <button type="button" className="row-detail-button text-xs" onClick={() => onNavigate('reminders')}>
            {t('Xem toàn bộ Nhắc việc')} <ChevronRight size={14} />
          </button>
        </div>
        <div className="space-y-2.5">
          {pendingReminders.map(rem => (
            <div key={rem.id} className="p-3 rounded-xl bg-white border border-amber-200 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-rose-700">[{rem.reference}]</span>{' '}
                  <strong className="text-xs sm:text-sm text-slate-900">{t(rem.subject)}</strong>{' '}
                  <span className="text-xs text-slate-600">· {t(rem.issue)}</span>
                  <p className="text-xs text-slate-700 mt-1">
                    <strong>{rem.senderName}:</strong> “{t(rem.message)}”
                  </p>
                </div>
                <button
                  type="button"
                  className="row-primary-button text-xs flex items-center gap-1"
                  onClick={() => {
                    setQuickAssignError('');
                    setQuickAssignReminderId(rem.id);
                  }}
                >
                  <ClipboardPlus size={14} />
                  <span>{t('Giao việc nhanh')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    <section className="analytics-card management-panel" aria-labelledby="task-list-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="task-list-title" className="m-0">{t(reReviewOnly ? 'Công việc đã nộp lại' : managing ? 'Công việc đã giao' : 'Danh sách công việc')}</h2>
        <div className="workflow-filter-tabs" role="group" aria-label={t('Lọc theo khung giao việc')}>
          <button
            type="button"
            aria-pressed={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          >
            {t('Tất cả')} ({queue.length})
          </button>
          <button
            type="button"
            aria-pressed={categoryFilter === 'order'}
            onClick={() => setCategoryFilter('order')}
          >
            {t('Khung 1: Việc theo Đơn hàng PO')} ({orderTaskCount})
          </button>
          <button
            type="button"
            aria-pressed={categoryFilter === 'external'}
            onClick={() => setCategoryFilter('external')}
          >
            {t('Khung 2: Việc bên ngoài')} ({externalTaskCount})
          </button>
        </div>
      </div>
      {!managing && returnedCount > 0 && <div className="task-notice" data-tone="returned">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>{t('Có công việc không đạt yêu cầu. Hãy chỉnh sửa và gửi duyệt lại trước hạn.')}</span>
        <button className="row-detail-button" type="button" onClick={() => setFilter(TASK_RETURNED)}>
          {t(TASK_RETURNED)} · {returnedCount}
        </button>
      </div>}
      {alertTasks.length > 0 && <div className="task-notice task-alert-reminder" data-tone="returned">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>{t('Nhắc việc từ báo động đỏ')}</span>
        <button className="row-detail-button" type="button" aria-pressed={filter === 'alert-tasks'}
          onClick={() => setFilter(filter === 'alert-tasks' ? 'all' : 'alert-tasks')}>
          {phrase('Xem § việc được giao', alertTasks.length)}
        </button>
      </div>}
      {reReviewOnly ? <div className="task-filters">
        <div className="task-filter-card task-review-count">
          <span>{t(TASK_REREVIEW)}</span>
          <strong>{reReviewCount}</strong>
        </div>
      </div> : <div className="task-filters task-filters-expanded" role="group" aria-label={t('Lọc trạng thái công việc')}>
        {['all', ...filterStatuses].map(status => <button type="button" key={status} aria-pressed={filter === status}
          data-tone={taskTone(status)} onClick={() => setFilter(status)}>
          <span>{t(status === 'all' ? 'Tất cả' : status)}</span>
          <strong>{status === 'all' ? queue.length : counts[status]}</strong>
        </button>)}
        {managing && <button type="button" className="task-review-link" onClick={() => onNavigate('assignment-reviews')}>
          <span>{t(TASK_REREVIEW)}</span>
          <strong>{reReviewCount}</strong>
        </button>}
      </div>}
      <div className="task-search-toolbar" role="search" aria-label={t('Tìm kiếm và lọc công việc')}>
        <label className="filter-search task-search-field">
          {t('Tìm công việc')}
          <span>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              aria-label={t('Tìm theo tên việc, mã PO, người phụ trách')}
            />
          </span>
        </label>
        {managing && <label className="task-filter-select">
          {t('Người phụ trách')}
          <select value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)} aria-label={t('Lọc theo người phụ trách')}>
            <option value="all">{t('Tất cả người phụ trách')}</option>
            {people.map(personItem => <option key={personItem.id} value={personItem.id}>{personItem.name} · {t(personItem.roleLabel)}</option>)}
            {Object.entries(TASK_DEPARTMENTS).map(([role, label]) => <option key={role} value={`dept:${role}`}>{t(label)}</option>)}
          </select>
        </label>}
        <label className="task-filter-select">
          {t('Lọc theo hạn')}
          <select value={deadlineFilter} onChange={event => setDeadlineFilter(event.target.value)} aria-label={t('Lọc theo hạn hoàn thành')}>
            <option value="all">{t('Tất cả thời hạn')}</option>
            <option value="overdue">{t('Quá hạn')}</option>
            <option value="today">{t('Hạn hôm nay')}</option>
            <option value="soon">{t('Sắp đến hạn (1–3 ngày)')}</option>
            <option value="upcoming">{t('Còn hạn (>3 ngày)')}</option>
          </select>
        </label>
        {hasExtraFilters && <button type="button" className="row-detail-button task-reset-filter" onClick={() => {
          setFilter('all');
          setCategoryFilter('all');
          setSearchQuery('');
          setAssigneeFilter('all');
          setDeadlineFilter('all');
        }}>
          <RotateCcw size={15} aria-hidden="true" />{t('Xóa lọc')}
        </button>}
      </div>
      {!rows.length && <div className="task-empty">
        <ClipboardList size={25} aria-hidden="true" />
        <p>{t(reReviewOnly ? 'Chưa có công việc đã nộp lại cần duyệt.' : 'Không có công việc ở trạng thái này.')}</p>
        {hasExtraFilters && <button type="button" className="row-detail-button"
          onClick={() => { setFilter('all'); setCategoryFilter('all'); setSearchQuery(''); setAssigneeFilter('all'); setDeadlineFilter('all'); }}>{t('Xem tất cả công việc')}</button>}
      </div>}
      {rows.length > 0 && <>
        <div className="table-scroll task-table-frame"><table className="management-table task-table">
          <thead><tr>
            <th scope="col">{t('Tên công việc')}</th>
            <th scope="col">{t(contactLabel)}</th>
            <th scope="col">{t('Hạn hoàn thành')}</th>
            <th scope="col">{t('Trạng thái')}</th>
          </tr></thead>
          <tbody>{pagedRows.map(row => {
            const contact = accounts.find(account => account.id === (managing ? row.assigneeId : row.assignerId));
            const hasFiles = row.fileIds?.length || row.submissions?.some(entry => entry.fileIds?.length);
            const isOrderTask = resolveTaskCategory(row) === 'order';
            return <tr key={row.id} data-tone={taskTone(row.status)} onClick={() => openTask(row.id)}>
              <td className="task-summary">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                      isOrderTask
                        ? 'bg-sky-100 text-sky-900 border border-sky-200'
                        : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                    }`}
                  >
                    {isOrderTask
                      ? `${t('Khung 1 · Đơn hàng PO')}${row.sourceAlert?.reference ? ` (${row.sourceAlert.reference})` : ''}`
                      : t('Khung 2 · Việc bên ngoài')}
                  </span>
                </div>
                <button className="task-row-open" type="button" aria-haspopup="dialog">
                  {t(row.title)} <ChevronRight size={16} aria-hidden="true" />
                </button>
                <small className="task-description">{t(row.description)}</small>
                {row.managerNote && <small className="italic text-sky-800 mt-0.5 block">{t('Ghi chú chỉ đạo:')} “{row.managerNote}”</small>}
                {row.sourceAlert && <span className="task-alert-source">{t('Báo động đỏ')} · {row.sourceAlert.reference}</span>}
                {row.status === TASK_REREVIEW && <small>
                  {phrase('Nộp lại lần §', row.reviews.filter(entry => entry.approve === false).length)}
                </small>}
                {Boolean(hasFiles) && <span className="task-attachment"><Paperclip size={13} aria-hidden="true" />{t('Có tệp đính kèm')}</span>}
              </td>
              <td><span className="task-mobile-label">{t(contactLabel)}</span>{contact?.role === 'Admin' || contact?.name === 'Quản trị Demo' ? t('Ban Giám đốc') : (contact?.name || '—')}
                {row.department && <small>{t(TASK_DEPARTMENTS[row.department])}</small>}</td>
              <td><span className="task-mobile-label">{t('Hạn hoàn thành')}</span>{row.deadline}</td>
              <td><span className="task-mobile-label">{t('Trạng thái')}</span>
                <span className="fulfillment-status task-status" data-tone={taskTone(row.status)}>{t(row.status)}</span></td>
            </tr>;
          })}</tbody>
        </table></div>
        <ProgressivePaginationBar pagination={pagination} itemUnit="công việc" />
      </>}
    </section>
    <dialog className="assignment-dialog task-detail-dialog" ref={detailRef} aria-labelledby="task-detail-title"
      onCancel={event => {
        if (busy || draftStatus === 'saving') { event.preventDefault(); return; }
        if (hasUnsentHandover) {
          event.preventDefault();
          setShowCloseDraftPrompt(true);
        }
      }}
      onClose={() => { setSelectedId(null); setEditingId(null); setError(''); setShowCloseDraftPrompt(false); setConfirmingApprove(false); }}>
      {task && <>
        <header className="profile-dialog-heading">
          <div><h2 id="task-detail-title">{t(task.title)}</h2>
            <span className="fulfillment-status task-status" data-tone={taskTone(task.status)}>{t(task.status)}</span>
          </div>
          <button className="profile-dialog-close" type="button" disabled={busy} aria-label={t('Đóng')}
            onClick={requestCloseDetail}><X size={20} /></button>
        </header>
        <article className="task-detail-content" key={task.id}>
          {error && <p ref={errorRef} tabIndex={-1} className="profile-form-error" role="alert">{t(error)}</p>}
          {showCloseDraftPrompt && <section className="task-draft-confirm" role="alertdialog" aria-labelledby="task-draft-confirm-title">
            <h4 id="task-draft-confirm-title">{t('Nội dung bàn giao chưa được gửi')}</h4>
            <p>{t('Bạn đang soạn kết quả bàn giao cho công việc này. Hãy chọn cách xử lý trước khi đóng:')}</p>
            <div className="workflow-footer task-draft-actions">
              <button type="button" className="primary" onClick={continueEditingDraft}>{t('Tiếp tục soạn')}</button>
              <button type="button" className="row-detail-button" disabled={draftStatus === 'saving'} onClick={keepDraftAndClose}>{t('Giữ bản nháp')}</button>
              <button type="button" className="task-return-button" disabled={draftStatus === 'saving'} onClick={discardDraftAndClose}>{t('Bỏ bản nháp')}</button>
              {draftStatus === 'failed' && <button type="button" onClick={() => detailRef.current?.close()}>{t('Đóng để tải lại bản nháp')}</button>}
            </div>
          </section>}
          {task.status === TASK_EXPIRED && <div className="task-notice" data-tone="returned" role="status">
            <Lock size={18} aria-hidden="true" />
            <span>{t(TASK_EXPIRED_MESSAGE)}</span>
          </div>}
          {task.status === TASK_DONE && <div className="task-notice" data-tone="done" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{t('Đã duyệt hoàn thành. Công việc này chỉ có thể xem.')}</span>
          </div>}
          {!managing && task.status === TASK_RETURNED && <div className="task-notice" data-tone="returned" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{t('Kết quả chưa đạt yêu cầu. Hãy chỉnh sửa và gửi duyệt lại trước hạn.')}</span>
          </div>}
          {task.sourceAlert && <p className="task-alert-source">{t('Báo động đỏ')} · {task.sourceAlert.reference}</p>}
          <p>{t(task.description)}</p>
          {task.managerNote && <p className="italic text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded px-2.5 py-1.5 my-2">{t('Ghi chú chỉ đạo:')} “{task.managerNote}”</p>}
          <p className="management-note">{managing ? person?.name : (assigner?.role === 'Admin' || assigner?.name === 'Quản trị Demo' ? t('Ban Giám đốc') : assigner?.name)} · {t('Hạn hoàn thành')} {task.deadline}
            {task.department && <> · {t(TASK_DEPARTMENTS[task.department])}</>}</p>
          {managing && <p className="management-note">{t('Người giao việc')} · {assigner?.role === 'Admin' || assigner?.name === 'Quản trị Demo' ? t('Ban Giám đốc') : (assigner?.name || '—')}</p>}
          {managing && !canManageSelected && <p className="management-note">{t('Chỉ người giao việc có thể duyệt hoặc đổi phân công.')}</p>}
          <div className="task-files">{filesFor(task, task.fileIds)}</div>
          {task.requiresFile && <p className="management-note">{t('Công việc này yêu cầu tệp kết quả.')}</p>}
          {!managing && task.status === TASK_NEW && <button className="row-primary-button" type="button" disabled={busy}
            onClick={() => { setError(''); onAction('accept', { id: task.id }, setError); }}>{t('Tiếp nhận')}</button>}
          {!managing && [TASK_ACTIVE, TASK_RETURNED].includes(task.status) &&
            <form className="workflow-form task-result" onSubmit={event => submit(event, 'handover', task.id)}>
              <h4>{t(task.status === TASK_RETURNED ? 'Nộp lại kết quả' : 'Nộp kết quả hoàn thành')}</h4>
              <label>{t('Kết quả bàn giao')} <span className="required-mark" aria-hidden="true">*</span>
                <textarea ref={handoverTextareaRef} name="note" required maxLength={1000} value={handoverDraft} disabled={draftStatus === 'loading' || draftStatus === 'saving'} onChange={handleHandoverDraftChange} />
              </label>
              {hasUnsentHandover && <small className="management-note task-draft-status" role="status">
                {t(draftStatus === 'failed' ? 'Chưa đồng bộ được bản nháp.' : 'Bản nháp tự động đồng bộ với máy chủ.')}
              </small>}
              <FileField label="Tệp kết quả" required={task.requiresFile} />
              <div className="workflow-footer">
                <button type="button" onClick={requestCloseDetail} disabled={busy}>{t('Đóng')}</button>
                <button className="primary" type="submit" disabled={busy}>{t(task.status === TASK_RETURNED ? 'Gửi duyệt lại' : 'Gửi duyệt')}</button>
              </div>
            </form>}
          {(lastSubmission || task.handoverNote) && <div className="task-result">
            <h4>{t('Kết quả đã nộp')}</h4><p>{t(lastSubmission?.note || task.handoverNote)}</p>
            <div className="task-files">{filesFor(task, lastSubmission?.fileIds)}</div>
          </div>}
          {canManageSelected && [TASK_REVIEW, TASK_REREVIEW].includes(task.status) && <section className="task-result">
            <h4>{t('Duyệt kết quả')}</h4>
            {confirmingApprove ? <div className="task-approve-confirm" role="alertdialog" aria-labelledby="task-approve-confirm-title">
              <strong id="task-approve-confirm-title">{t('Xác nhận duyệt hoàn thành')}</strong>
              <p className="management-note">{t('Sau khi duyệt hoàn thành, công việc sẽ chuyển sang trạng thái Hoàn tất và bị khóa chỉnh sửa (chỉ có thể xem). Bạn có chắc chắn muốn duyệt?')}</p>
              <div className="workflow-footer">
                <button type="button" disabled={busy} onClick={() => setConfirmingApprove(false)}>{t('Hủy')}</button>
                <button className="task-approve-button" type="button" disabled={busy} onClick={() => review(true)}>{t('Xác nhận duyệt hoàn thành')}</button>
              </div>
            </div> : <div className="workflow-footer">
              <button className="task-return-button" type="button" disabled={busy} onClick={() => review(false)}>{t(TASK_RETURNED)}</button>
              <button className="task-approve-button" type="button" disabled={busy} onClick={() => setConfirmingApprove(true)}>{t('Duyệt hoàn thành')}</button>
            </div>}
          </section>}
          {canManageSelected && ![TASK_DONE, TASK_EXPIRED].includes(task.status) && (editingId === task.id ?
            <form className="workflow-form" onSubmit={event => submit(event, 'assign', task.id)}>
              <AssignmentFields people={people} task={task} today={today} />
              <label>{t('Lý do thay đổi')} <span className="required-mark" aria-hidden="true">*</span><input name="reason" required maxLength={500} /></label>
              <div className="workflow-footer"><button type="button" onClick={() => setEditingId(null)}>{t('Hủy')}</button>
                <button className="primary" type="submit" disabled={busy}>{t('Lưu thay đổi')}</button></div>
            </form> : <button type="button" className="row-detail-button" onClick={() => setEditingId(task.id)}>{t('Đổi phân công')}</button>)}
          {(task.submissions?.length > 1 || task.reviews?.length > 1 || (managing && task.previousAssignments?.length > 0)) &&
            <details className="workflow-history"><summary>{t('Lịch sử trao đổi tệp và kết quả')}</summary>
              {[task, ...(managing ? task.previousAssignments || [] : [])].map((entry, index) =>
                <div key={entry.assigneeId + '-' + index}>
                  {index > 0 && <h4>{accounts.find(user => user.id === entry.assigneeId)?.name}</h4>}
                  {[...(entry.submissions || []), ...(entry.reviews || [])]
                    .sort((a, b) => a.at.localeCompare(b.at)).map((item, rowIndex) => <div key={item.at + '-' + rowIndex} className="task-result">
                      <strong>{t(item.approve === undefined ? 'Kết quả đã nộp' :
                        item.approve ? 'Đã chấp nhận hoàn thành.' : TASK_RETURNED)}</strong>
                      {item.approve === undefined && <>
                        {item.note && <p>{t(item.note)}</p>}
                        <div className="task-files">{filesFor(task, item.fileIds)}</div>
                      </>}
                    </div>)}
                  {index > 0 && entry.discussion?.map(comment => <div key={comment.id} className="task-result">
                    <strong>{comment.author}</strong><p className="whitespace-pre-wrap break-words">{comment.text}</p>
                  </div>)}
                  {index > 0 && entry.handoverNote && <p>{entry.handoverNote}</p>}
                </div>)}
            </details>}
          <section className="task-result" aria-labelledby="task-discussion-title">
            <h4 id="task-discussion-title">{t('Bình luận')}</h4>
            {task.discussion?.length ? <ul>{task.discussion.map(comment =>
              <li key={comment.id}><strong>{comment.author}</strong><p className="whitespace-pre-wrap break-words">{comment.text}</p></li>
            )}</ul> : <p className="management-note">{t('Chưa có bình luận.')}</p>}
            {canDiscussTask(actor, task, accounts) && ![TASK_DONE, TASK_EXPIRED].includes(task.status) &&
              <form className="workflow-form" onSubmit={event => submit(event, 'comment-task', task.id)}>
                <label>{t('Nội dung bình luận')} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={1000} /></label>
                <div className="workflow-footer"><button className="primary" type="submit" disabled={busy}>{t('Gửi bình luận')}</button></div>
              </form>}
          </section>
          {task.comments.length > 0 && <details className="workflow-history">
            <summary>{t('Lịch sử công việc')}</summary>
            <ul>{task.comments.map(comment => <li key={comment.id}><strong>{comment.author}</strong> · {t(comment.text)}</li>)}</ul>
          </details>}
        </article>
      </>}
    </dialog>
  </>;
}
