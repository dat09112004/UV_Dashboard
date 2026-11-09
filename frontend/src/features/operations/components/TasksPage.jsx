import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, ChevronRight, ClipboardList, ClipboardPlus, Lock, Paperclip, Plus, RotateCcw, Search, X } from 'lucide-react';
import { phrase, t, translate } from '../../../locales/i18n.js';
import { businessToday, dateInputValue, parseBusinessDate } from '../../../utils/business.js';
import { readTaskAttachment } from '../../users/services/demoDirectory.js';
import { canDiscussTask, canManageTask, canViewManagedTask, canWorkOnAssignedTask, encodeTaskFiles, FILE_ACCEPT, canReceiveTasks,
  REMINDER_PENDING, taskStatusAt, TASK_ACTIVE, TASK_DEPARTMENTS, TASK_DONE, TASK_EXPIRED, TASK_EXPIRED_MESSAGE, TASK_NEW, TASK_REREVIEW, TASK_RETURNED, TASK_REVIEW } from '../services/taskWorkflow.js';

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

function AssignmentFields({ people, task, today }) {
  const [scope, setScope] = useState('person');
  const departments = Object.entries(TASK_DEPARTMENTS);
  return <>
    {!task && <label>{t('Phạm vi giao việc')}<select name="scope" value={scope} onChange={event => setScope(event.target.value)}>
      <option value="person">{t('Một nhân viên')}</option>
      <option value="department">{t('Toàn bộ phòng')}</option>
    </select></label>}
    {scope === 'department' ? <label>{t('Phòng nhận việc')} <span className="required-mark" aria-hidden="true">*</span><select name="department" required defaultValue="">
      <option value="">{t('Chọn phòng nhận việc')}</option>
      {departments.map(([role, label]) => <option key={role} value={role}>{t(label)}</option>)}
    </select></label> : <label>{t('Người phụ trách')} <span className="required-mark" aria-hidden="true">*</span><select name="assigneeId" defaultValue={task?.assigneeId ?? ''} required>
      <option value="">{t('Chọn người phụ trách')}</option>
      {people.filter(person => !task?.department || person.role === task.department).map(person =>
        <option key={person.id} value={person.id}>{person.name} · {t(person.roleLabel)}</option>)}
    </select></label>}
    <label>{t('Hạn hoàn thành')} <span className="required-mark" aria-hidden="true">*</span><input name="deadline" type="date" min={today} defaultValue={dateInputValue(task?.deadline)} required /></label>
  </>;
}

function FileField({ label, required = false }) {
  return <label>{t(label)}{required && <> <span className="required-mark" aria-hidden="true">*</span></>}<input name="files" type="file" accept={FILE_ACCEPT} multiple required={required} />
    <small className="management-note">{t('Tối đa 3 tệp và tổng dung lượng 1 MB mỗi lần gửi.')}</small></label>;
}

const statuses = [TASK_NEW, TASK_ACTIVE, TASK_REVIEW, TASK_REREVIEW, TASK_RETURNED, TASK_DONE, TASK_EXPIRED];
const taskTone = status => status === TASK_DONE ? 'done' : [TASK_RETURNED, TASK_EXPIRED].includes(status) ? 'returned' : undefined;


export default function TasksPage({ tasks, reminders = [], accounts, actor, onAction, busy, managing, fileNames, reReviewOnly = false, onNavigate, alertDraft, onClearAlertDraft }) {
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState('all');
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [today, setToday] = useState(businessToday);
  const [handoverDraft, setHandoverDraft] = useState('');
  const [showCloseDraftPrompt, setShowCloseDraftPrompt] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [quickAssignReminderId, setQuickAssignReminderId] = useState(null);
  const [quickAssignScope, setQuickAssignScope] = useState('person');
  const [quickAssignNote, setQuickAssignNote] = useState('');
  const [quickAssignError, setQuickAssignError] = useState('');
  const dialogRef = useRef(null);
  const detailRef = useRef(null);
  const errorRef = useRef(null);
  const handoverTextareaRef = useRef(null);
  const people = accounts.filter(canReceiveTasks);
  const visible = tasks.filter(task => managing ? canViewManagedTask(actor, task, accounts) : canWorkOnAssignedTask(actor, task))
    .map(task => ({ ...task, status: taskStatusAt(task, today) }));
  const reReviewCount = visible.filter(task => task.status === TASK_REREVIEW).length;
  const queue = managing ? visible.filter(task => (task.status === TASK_REREVIEW) === reReviewOnly) : visible;
  const alertTasks = managing ? [] : queue.filter(task => task.sourceAlert && ![TASK_DONE, TASK_EXPIRED].includes(task.status));
  const pendingReminders = reminders.filter(r => r.status === REMINDER_PENDING);
  const rows = filterTaskRows(queue, {
    statusFilter: filter,
    searchQuery,
    assigneeFilter,
    deadlineFilter,
    accounts,
    today,
  });
  const hasExtraFilters = Boolean(searchQuery.trim() || assigneeFilter !== 'all' || deadlineFilter !== 'all' || filter !== 'all');
  const filterStatuses = managing ? statuses.filter(status => status !== TASK_REREVIEW) : statuses;
  const task = visible.find(row => row.id === selectedId);
  const detailId = task?.id;
  const canManageSelected = canManageTask(actor, task, accounts);
  const canHandoverSelected = Boolean(task && !managing && [TASK_ACTIVE, TASK_RETURNED].includes(task.status));
  const hasUnsentHandover = canHandoverSelected && handoverDraft.trim().length > 0;
  const person = accounts.find(account => account.id === task?.assigneeId);
  const assigner = accounts.find(account => account.id === task?.assignerId);
  const lastSubmission = task?.submissions?.at(-1);
  const counts = Object.fromEntries(filterStatuses.map(status => [status, queue.filter(row => row.status === status).length]));
  const returnedCount = counts[TASK_RETURNED];
  const contactLabel = managing ? 'Người phụ trách' : 'Người giao việc';

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
    if (detailId && actor?.id) {
      setHandoverDraft(readTaskHandoverDraft(actor.id, detailId));
    } else {
      setHandoverDraft('');
    }
    setShowCloseDraftPrompt(false);
    setConfirmingApprove(false);
  }, [detailId, actor?.id]);

  useEffect(() => {
    const dialog = detailRef.current;
    if (detailId && !dialog.open) dialog.showModal();
    else if (!detailId && dialog.open) dialog.close();
  }, [detailId]);

  useEffect(() => {
    if (alertDraft && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [alertDraft]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const openTask = id => {
    setEditingId(null);
    setError('');
    setShowCloseDraftPrompt(false);
    setConfirmingApprove(false);
    setSelectedId(id);
  };

  const requestCloseDetail = () => {
    if (busy) return;
    if (hasUnsentHandover) {
      setShowCloseDraftPrompt(true);
      return;
    }
    detailRef.current?.close();
  };

  const keepDraftAndClose = () => {
    if (actor?.id && task?.id) storeTaskHandoverDraft(actor.id, task.id, handoverDraft);
    setShowCloseDraftPrompt(false);
    detailRef.current?.close();
  };

  const discardDraftAndClose = () => {
    if (actor?.id && task?.id) clearTaskHandoverDraft(actor.id, task.id);
    setHandoverDraft('');
    setShowCloseDraftPrompt(false);
    detailRef.current?.close();
  };

  const continueEditingDraft = () => {
    setShowCloseDraftPrompt(false);
    requestAnimationFrame(() => handoverTextareaRef.current?.focus());
  };

  const handleHandoverDraftChange = event => {
    const nextValue = event.target.value;
    setHandoverDraft(nextValue);
    if (actor?.id && task?.id) storeTaskHandoverDraft(actor.id, task.id, nextValue);
  };

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
    try {
      const files = await encodeTaskFiles(data.getAll('files'));
      if (!await onAction(action, {
        ...Object.fromEntries(data), id, files, requiresFile: data.has('requiresFile'),
        ...(isCreate && alertDraft && { sourceAlert: alertDraft.sourceAlert }),
      },
        reportError)) return;
      if (isCreate) {
        dialogRef.current?.close();
        setFormVersion(version => version + 1);
        setFilter('all');
      } else if (action === 'assign') {
        setEditingId(null);
      } else if (action === 'handover') {
        if (actor?.id && id) clearTaskHandoverDraft(actor.id, id);
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
    }
  };

  const review = async approve => {
    setError('');
    const ok = await onAction('confirm', { id: task.id, approve, submissionCount: task.submissions?.length || 0 }, setError);
    if (ok) setConfirmingApprove(false);
    return ok;
  };

  const download = (taskId, fileId) => {
    setError('');
    try {
      const { content, name } = readTaskAttachment(actor.id, taskId, fileId);
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
          <label className="assignment-wide">{t('Ghi chú chỉ đạo (Note cho nhân viên / phòng ban)')}<input name="managerNote" maxLength={500} placeholder={t('Nhập ghi chú hoặc lưu ý đặc biệt cho người nhận việc…')} /></label>
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

    {/* Khối Nhắc việc chờ giao việc nhanh dành cho Admin & CEO ngay trong trang Giao việc */}
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
          {pendingReminders.map(rem => {
            const isOpen = quickAssignReminderId === rem.id;
            return (
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
                      setQuickAssignReminderId(isOpen ? null : rem.id);
                    }}
                  >
                    <ClipboardPlus size={14} />
                    <span>{t(isOpen ? 'Đóng giao nhanh' : 'Giao việc nhanh')}</span>
                  </button>
                </div>
                {isOpen && (
                  <form className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs" onSubmit={e => submitQuickAssignFromReminder(e, rem)}>
                    {quickAssignError && <p className="sm:col-span-12 text-rose-700 font-semibold" role="alert">{t(quickAssignError)}</p>}
                    <label className="sm:col-span-2 flex flex-col gap-1 font-semibold">
                      {t('Giao cho')}
                      <select name="scope" value={quickAssignScope} onChange={e => setQuickAssignScope(e.target.value)} className="h-9 rounded border border-slate-300 px-2 bg-white">
                        <option value="person">{t('Nhân viên')}</option>
                        <option value="department">{t('Phòng ban')}</option>
                      </select>
                    </label>
                    {quickAssignScope === 'person' ? (
                      <label className="sm:col-span-3 flex flex-col gap-1 font-semibold">
                        {t('Người phụ trách')}
                        <select name="assigneeId" required defaultValue={people[0]?.id || ''} className="h-9 rounded border border-slate-300 px-2 bg-white">
                          {people.map(p => <option key={p.id} value={p.id}>{p.name} · {t(p.roleLabel)}</option>)}
                        </select>
                      </label>
                    ) : (
                      <label className="sm:col-span-3 flex flex-col gap-1 font-semibold">
                        {t('Phòng ban')}
                        <select name="department" required defaultValue={rem.alertType === 'orders' ? 'Sale' : 'Accountant'} className="h-9 rounded border border-slate-300 px-2 bg-white">
                          {Object.entries(TASK_DEPARTMENTS).map(([roleKey, label]) => <option key={roleKey} value={roleKey}>{t(label)}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="sm:col-span-3 flex flex-col gap-1 font-semibold">
                      {t('Tên công việc')}
                      <input name="title" required defaultValue={`Xử lý cảnh báo đỏ ${rem.reference} · ${rem.subject}`.slice(0, 160)} className="h-9 rounded border border-slate-300 px-2 bg-white" />
                    </label>
                    <label className="sm:col-span-2 flex flex-col gap-1 font-semibold">
                      {t('Hạn hoàn thành')}
                      <input name="deadline" type="date" min={today} defaultValue={today} required className="h-9 rounded border border-slate-300 px-2 bg-white" />
                    </label>
                    <div className="sm:col-span-2 flex justify-end">
                      <button type="submit" disabled={busy} className="w-full h-9 rounded bg-sky-700 hover:bg-sky-800 text-white font-bold cursor-pointer">
                        {t('Giao ngay')}
                      </button>
                    </div>
                    <label className="sm:col-span-12 flex flex-col gap-1 font-semibold">
                      {t('Ghi chú chỉ đạo (Note cho nhân viên / phòng ban)')}
                      <input name="managerNote" value={quickAssignNote} onChange={e => setQuickAssignNote(e.target.value)} placeholder={t('Nhập ghi chú hướng dẫn xử lý cho nhân viên hoặc phòng ban…')} className="h-9 rounded border border-slate-300 px-2.5 bg-white font-normal" />
                    </label>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>
    )}

    <section className="analytics-card management-panel" aria-labelledby="task-list-title">
      <h2 id="task-list-title">{t(reReviewOnly ? 'Công việc đã nộp lại' : managing ? 'Công việc đã giao' : 'Danh sách công việc')}</h2>
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
              placeholder={t('Tìm theo tên việc, mã PO, người phụ trách…')}
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
          onClick={() => { setFilter('all'); setSearchQuery(''); setAssigneeFilter('all'); setDeadlineFilter('all'); }}>{t('Xem tất cả công việc')}</button>}
      </div>}
      {rows.length > 0 && <div className="table-scroll task-table-frame"><table className="management-table task-table">
        <thead><tr>
          <th scope="col">{t('Tên công việc')}</th>
          <th scope="col">{t(contactLabel)}</th>
          <th scope="col">{t('Hạn hoàn thành')}</th>
          <th scope="col">{t('Trạng thái')}</th>
        </tr></thead>
        <tbody>{rows.map(row => {
          const contact = accounts.find(account => account.id === (managing ? row.assigneeId : row.assignerId));
          const hasFiles = row.fileIds?.length || row.submissions?.some(entry => entry.fileIds?.length);
          const hasSavedDraft = !managing && [TASK_ACTIVE, TASK_RETURNED].includes(row.status) &&
            Boolean(readTaskHandoverDraft(actor?.id, row.id).trim());
          return <tr key={row.id} data-tone={taskTone(row.status)} onClick={() => openTask(row.id)}>
            <td className="task-summary">
              <button className="task-row-open" type="button" aria-haspopup="dialog">
                {t(row.title)} <ChevronRight size={16} aria-hidden="true" />
              </button>
              <small className="task-description">{t(row.description)}</small>
              {row.managerNote && <small className="italic text-sky-800 mt-0.5 block">{t('Ghi chú chỉ đạo:')} “{row.managerNote}”</small>}
              {row.sourceAlert && <span className="task-alert-source">{t('Báo động đỏ')} · {row.sourceAlert.reference}</span>}
              {hasSavedDraft && <span className="task-draft-badge">{t('Đang có bản nháp')}</span>}
              {row.status === TASK_REREVIEW && <small>
                {phrase('Nộp lại lần §', row.reviews.filter(entry => entry.approve === false).length)}
              </small>}
              {Boolean(hasFiles) && <span className="task-attachment"><Paperclip size={13} aria-hidden="true" />{t('Có tệp đính kèm')}</span>}
            </td>
            <td><span className="task-mobile-label">{t(contactLabel)}</span>{contact?.name || '—'}
              {row.department && <small>{t(TASK_DEPARTMENTS[row.department])}</small>}</td>
            <td><span className="task-mobile-label">{t('Hạn hoàn thành')}</span>{row.deadline}</td>
            <td><span className="task-mobile-label">{t('Trạng thái')}</span>
              <span className="fulfillment-status task-status" data-tone={taskTone(row.status)}>{t(row.status)}</span></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
    <dialog className="assignment-dialog task-detail-dialog" ref={detailRef} aria-labelledby="task-detail-title"
      onCancel={event => {
        if (busy) { event.preventDefault(); return; }
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
              <button type="button" className="row-detail-button" onClick={keepDraftAndClose}>{t('Giữ bản nháp')}</button>
              <button type="button" className="task-return-button" onClick={discardDraftAndClose}>{t('Bỏ thay đổi')}</button>
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
          <p className="management-note">{managing ? person?.name : assigner?.name} · {t('Hạn hoàn thành')} {task.deadline}
            {task.department && <> · {t(TASK_DEPARTMENTS[task.department])}</>}</p>
          {managing && <p className="management-note">{t('Người giao việc')} · {assigner?.name || '—'}</p>}
          {managing && !canManageSelected && <p className="management-note">{t('Chỉ người giao việc có thể duyệt hoặc đổi phân công.')}</p>}
          <div className="task-files">{filesFor(task, task.fileIds)}</div>
          {task.requiresFile && <p className="management-note">{t('Công việc này yêu cầu tệp kết quả.')}</p>}
          {!managing && task.status === TASK_NEW && <button className="row-primary-button" type="button" disabled={busy}
            onClick={() => { setError(''); onAction('accept', { id: task.id }, setError); }}>{t('Tiếp nhận')}</button>}
          {!managing && [TASK_ACTIVE, TASK_RETURNED].includes(task.status) &&
            <form className="workflow-form task-result" onSubmit={event => submit(event, 'handover', task.id)}>
              <h4>{t(task.status === TASK_RETURNED ? 'Nộp lại kết quả' : 'Nộp kết quả hoàn thành')}</h4>
              <label>{t('Kết quả bàn giao')} <span className="required-mark" aria-hidden="true">*</span>
                <textarea ref={handoverTextareaRef} name="note" required maxLength={1000} value={handoverDraft} onChange={handleHandoverDraftChange} />
              </label>
              {hasUnsentHandover && <small className="management-note task-draft-status" role="status">
                {t('Bản nháp đang được tự động lưu theo công việc và tài khoản của bạn.')}
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
