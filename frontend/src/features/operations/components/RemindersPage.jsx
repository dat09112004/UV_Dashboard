import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BellRing, ClipboardPlus,
  RotateCcw, Search, Send, UserCheck
} from 'lucide-react';
import { locale, phrase, t } from '../../../locales/i18n.js';
import { useDebouncedValue } from '../../../hooks/useDebounce.js';
import { useProgressivePagination } from '../../../hooks/useProgressivePagination.js';
import { businessToday } from '../../../utils/business.js';
import { isExecutiveRole } from '../../../utils/roles.js';
import {
  canAssignTasks,
  canReceiveTasks,
  REMINDER_ASSIGNED,
  REMINDER_PENDING,
  resolveAlertAssignmentInfo,
  reminderMatchesAlert,
  TASK_DEPARTMENTS,
} from '../services/taskWorkflow.js';
import AlertAssignmentLine from '../../../components/common/AlertAssignmentLine.jsx';
import ProgressivePaginationBar from '../../../components/common/ProgressivePaginationBar.jsx';

function QuickAssignBox({ reminder, people, today, busy, onQuickAssign, onDismiss }) {
  const [scope, setScope] = useState('person');
  const [assigneeId, setAssigneeId] = useState(() => {
    const defaultRole = reminder.alertType === 'orders' ? 'Sale' : 'Accountant';
    return people.find(p => p.role === defaultRole)?.id || people[0]?.id || '';
  });
  const [department, setDepartment] = useState(() => (reminder.alertType === 'orders' ? 'Sale' : 'Accountant'));
  const [title, setTitle] = useState(() => `Xử lý cảnh báo đỏ ${reminder.reference} · ${reminder.subject}`.slice(0, 160));
  const [managerNote, setManagerNote] = useState('');
  const [deadline, setDeadline] = useState(today);
  const [requiresFile, setRequiresFile] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async event => {
    event.preventDefault();
    setLocalError('');
    const ok = await onQuickAssign({
      reminderId: reminder.id,
      scope,
      assigneeId: scope === 'person' ? assigneeId : undefined,
      department: scope === 'department' ? department : undefined,
      title,
      managerNote,
      deadline,
      requiresFile,
    }, setLocalError);
    if (ok) {
      setManagerNote('');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-sky-200 space-y-3"
      aria-label={t('Giao việc nhanh từ nhắc việc')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-900">
          <ClipboardPlus size={15} />
          {t('Giao việc nhanh ngay tại nhắc việc')}
        </span>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setScope('person')}
            className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              scope === 'person' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t('Giao cho Nhân viên')}
          </button>
          <button
            type="button"
            onClick={() => setScope('department')}
            className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              scope === 'department' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t('Giao cho Phòng ban')}
          </button>
        </div>
      </div>

      {localError && (
        <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
          {t(localError)}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {scope === 'person' ? (
          <label className="flex flex-col gap-1 font-semibold text-slate-700">
            <span>{t('Nhân viên đảm nhận')} <span className="text-rose-600">*</span></span>
            <select
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              required
              disabled={busy}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 font-medium"
            >
              <option value="">{t('Chọn người phụ trách')}</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.name} · {t(person.roleLabel)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 font-semibold text-slate-700">
            <span>{t('Phòng ban đảm nhận')} <span className="text-rose-600">*</span></span>
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              required
              disabled={busy}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 font-medium"
            >
              {Object.entries(TASK_DEPARTMENTS).map(([roleKey, label]) => (
                <option key={roleKey} value={roleKey}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 font-semibold text-slate-700">
          <span>{t('Tên công việc giao')} <span className="text-rose-600">*</span></span>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={160}
            disabled={busy}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 font-medium"
          />
        </label>

        <label className="flex flex-col gap-1 font-semibold text-slate-700">
          <span>{t('Hạn hoàn thành')} <span className="text-rose-600">*</span></span>
          <input
            type="date"
            min={today}
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            required
            disabled={busy}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 font-medium"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end text-xs">
        <label className="sm:col-span-8 flex flex-col gap-1 font-semibold text-slate-700">
          <span>{t('Ghi chú chỉ đạo (Note cho nhân viên / phòng ban)')}</span>
          <input
            type="text"
            value={managerNote}
            onChange={e => setManagerNote(e.target.value)}
            maxLength={500}
            disabled={busy}
            placeholder={t('Nhập ghi chú, hướng dẫn xử lý nhanh cho nhân viên hoặc phòng ban…')}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-slate-900 font-normal"
          />
        </label>
        <div className="sm:col-span-4 flex flex-wrap items-center justify-end gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer mr-auto">
            <input
              type="checkbox"
              checked={requiresFile}
              onChange={e => setRequiresFile(e.target.checked)}
              disabled={busy}
            />
            <span>{t('Cần tệp kết quả')}</span>
          </label>
          {reminder.status === REMINDER_PENDING && onDismiss && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDismiss(reminder.id, managerNote)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
            >
              {t('Đánh dấu đã xử lý')}
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold shadow-2xs cursor-pointer"
          >
            <ClipboardPlus size={14} />
            <span>{t('Giao việc ngay')}</span>
          </button>
        </div>
      </div>
    </form>
  );
}

export default function RemindersPage({
  reminders = [],
  tasks = [],
  accounts = [],
  alerts = [],
  actor,
  busy = false,
  onAction,
  onOpenAlert,
  onNavigate,
  initialDraft = null,
  onClearDraft,
}) {
  const today = businessToday();
  const isExec = isExecutiveRole(actor?.role) && canAssignTasks(actor);
  const people = useMemo(() => accounts.filter(canReceiveTasks), [accounts]);
  const redAlerts = useMemo(() => alerts.filter(a => a.data?.priorityRank === 0), [alerts]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Debounced search & filter values
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const debouncedStatusFilter = useDebouncedValue(statusFilter, 150);
  const debouncedTypeFilter = useDebouncedValue(typeFilter, 150);

  const [showCreateForm, setShowCreateForm] = useState(Boolean(initialDraft));
  const [selectedAlertKey, setSelectedAlertKey] = useState(() => initialDraft?.alertId || '');
  const [customReference, setCustomReference] = useState(() => initialDraft?.reference || '');
  const [customType, setCustomType] = useState(() => initialDraft?.alertType || 'orders');
  const [customSubject, setCustomSubject] = useState(() => initialDraft?.subject || '');
  const [customIssue, setCustomIssue] = useState(() => initialDraft?.issue || '');
  const [message, setMessage] = useState(() => initialDraft?.message || '');
  const [formError, setFormError] = useState('');
  const [expandedQuickAssignId, setExpandedQuickAssignId] = useState(null);

  const handleSelectRedAlert = alertId => {
    setSelectedAlertKey(alertId);
    const found = redAlerts.find(a => a.id === alertId);
    if (found) {
      setCustomReference(found.reference);
      setCustomType(found.type);
      setCustomSubject(found.label || found.reference);
      setCustomIssue(found.status || 'Báo động đỏ cần xử lý');
    }
  };

  const submitReminder = async event => {
    event.preventDefault();
    setFormError('');
    const ok = await onAction('create-reminder', {
      alertId: selectedAlertKey || `${customType}-${customReference.trim()}`,
      alertType: customType,
      reference: customReference,
      subject: customSubject || customReference,
      issue: customIssue || 'Báo động đỏ chưa xử lý',
      message,
    }, setFormError);
    if (ok) {
      setMessage('');
      setShowCreateForm(false);
      onClearDraft?.();
    }
  };

  const handleQuickAssign = async (payload, reportError) => {
    const ok = await onAction('quick-assign-reminder', payload, reportError);
    if (ok) setExpandedQuickAssignId(null);
    return ok;
  };

  const handleDismiss = async (reminderId, managerNote) => {
    await onAction('dismiss-reminder', { reminderId, managerNote });
  };

  const pendingCount = reminders.filter(r => r.status === REMINDER_PENDING).length;
  const assignedCount = reminders.filter(r => r.status === REMINDER_ASSIGNED).length;

  const unassignedRedAlerts = useMemo(() => {
    return redAlerts.filter(alert => {
      const info = resolveAlertAssignmentInfo(
        { id: alert.id, type: alert.type, reference: alert.reference },
        tasks,
        accounts,
        reminders,
        today
      );
      return !info.isAssigned;
    });
  }, [redAlerts, tasks, accounts, reminders, today]);

  const filteredReminders = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return reminders.filter(rem => {
      if (debouncedStatusFilter !== 'all' && rem.status !== debouncedStatusFilter) return false;
      if (debouncedTypeFilter !== 'all' && rem.alertType !== debouncedTypeFilter) return false;
      if (q) {
        const hay = [
          rem.reference,
          rem.subject,
          rem.issue,
          rem.message,
          rem.senderName,
          rem.assignedTargetLabel,
          rem.managerNote,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reminders, debouncedStatusFilter, debouncedTypeFilter, debouncedSearchQuery]);

  // Phân trang + Tải trước 1 phần & Cuộn tải dần + Xóa trang cũ khi đổi trang/tab
  const pagination = useProgressivePagination(filteredReminders, {
    sectionKey: 'reminders',
    initialChunkSize: 5,
    stepSize: 5,
    pageSize: 10,
    resetDeps: [debouncedStatusFilter, debouncedTypeFilter, debouncedSearchQuery],
  });
  const pagedReminders = pagination.visibleItems;

  const formatTime = iso => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(locale(), {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const typeLabel = type => ({
    orders: 'Đơn hàng & Tiến độ',
    receivables: 'Công nợ phải thu',
    payables: 'Công nợ phải trả',
  }[type] || 'Công việc');

  return (
    <div className="space-y-5">
      <header className="page-heading task-page-heading">
        <div>
          <p className="page-eyebrow">UYEN VU INTERNATIONAL</p>
          <h1>{t('Nhắc việc & Điều phối Cảnh báo đỏ')}</h1>
          <p className="text-xs text-slate-600 mt-1">
            {t(isExec
              ? 'Nhận nhắc việc từ nhân viên đối với các cảnh báo đỏ chưa xử lý và giao việc nhanh kèm ghi chú cho nhân viên hoặc phòng ban.'
              : 'Gửi nhắc việc cho CEO và Admin khi có cảnh báo đỏ chưa được giao hoặc chưa xử lý để tránh bị bỏ sót.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreateForm(open => !open)}
            className="row-primary-button flex items-center gap-1.5"
          >
            <BellRing size={16} />
            <span>{t(showCreateForm ? 'Đóng khung nhắc việc' : '+ Gửi nhắc việc cho Sếp')}</span>
          </button>
          {isExec && (
            <button
              type="button"
              onClick={() => onNavigate?.('assignments')}
              className="row-detail-button"
            >
              <span>{t('Mở bảng Giao việc')}</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </header>

      {(showCreateForm || initialDraft) && (
        <section className="analytics-card bg-amber-50/60 border border-amber-300 p-5 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-amber-200 pb-3">
            <div className="flex items-center gap-2">
              <BellRing className="text-amber-700" size={20} />
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('Gửi nhắc việc cho CEO & Admin')}</h2>
                <p className="text-xs text-slate-600">
                  {t('Chọn cảnh báo đỏ đang chờ xử lý hoặc nhập mã PO / chứng từ để nhắc các sếp phân công xử lý.')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); onClearDraft?.(); }}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {t('Đóng')}
            </button>
          </div>

          <form onSubmit={submitReminder} className="space-y-3 text-xs sm:text-sm">
            {formError && (
              <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
                {t(formError)}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 font-semibold text-slate-700">
                <span>{t('Chọn nhanh từ danh sách Báo động đỏ')}</span>
                <select
                  value={selectedAlertKey}
                  onChange={e => handleSelectRedAlert(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                >
                  <option value="">{t('-- Chọn cảnh báo đỏ hoặc tự nhập bên cạnh --')}</option>
                  {redAlerts.map(alert => {
                    const info = resolveAlertAssignmentInfo(
                      { id: alert.id, type: alert.type, reference: alert.reference },
                      tasks,
                      accounts,
                      reminders,
                      today
                    );
                    return (
                      <option key={alert.id} value={alert.id}>
                        [{typeLabel(alert.type)}] {alert.reference} — {alert.label} ({info.isAssigned ? `Đã giao: ${info.assigneesText}` : 'Chưa giao việc'})
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="flex flex-col gap-1 font-semibold text-slate-700">
                <span>{t('Phân hệ cảnh báo')} <span className="text-rose-600">*</span></span>
                <select
                  value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                >
                  <option value="orders">{t('Đơn hàng & Tiến độ')}</option>
                  <option value="receivables">{t('Công nợ phải thu')}</option>
                  <option value="payables">{t('Công nợ phải trả')}</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 font-semibold text-slate-700">
                <span>{t('Mã PO / Số chứng từ')} <span className="text-rose-600">*</span></span>
                <input
                  type="text"
                  value={customReference}
                  onChange={e => setCustomReference(e.target.value)}
                  required
                  maxLength={160}
                  placeholder={t('Nhập mã PO hoặc số chứng từ')}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 font-semibold text-slate-700">
                <span>{t('Tên mặt hàng / Đối tác liên quan')}</span>
                <input
                  type="text"
                  value={customSubject}
                  onChange={e => setCustomSubject(e.target.value)}
                  maxLength={180}
                  placeholder={t('Ví dụ: Túi vải kích thước 22cm x 15cm')}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 font-semibold text-slate-700">
                <span>{t('Tình trạng cảnh báo hiện tại')}</span>
                <input
                  type="text"
                  value={customIssue}
                  onChange={e => setCustomIssue(e.target.value)}
                  maxLength={240}
                  placeholder={t('Ví dụ: Quá hạn nhận hàng 1 ngày, chưa có người đảm nhận')}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 font-semibold text-slate-700">
              <span>{t('Nội dung nhắc việc gửi CEO & Admin')} <span className="text-rose-600">*</span></span>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                maxLength={1000}
                rows={3}
                placeholder={t('Nhập lời nhắn nhắc sếp giao việc hoặc chỉ đạo xử lý (ví dụ: Cảnh báo này đã báo đỏ nhưng chưa thấy phân công người phụ trách, nhờ sếp giao việc giúp)…')}
                className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); onClearDraft?.(); }}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
              >
                {t('Hủy')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
              >
                <Send size={15} />
                <span>{t('Gửi nhắc việc ngay')}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`text-left p-4 rounded-xl border transition cursor-pointer ${
            statusFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span className="text-xs opacity-80">{t('Tổng số nhắc việc')}</span>
          <div className="text-2xl font-bold mt-1">{reminders.length}</div>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(REMINDER_PENDING)}
          className={`text-left p-4 rounded-xl border transition cursor-pointer ${
            statusFilter === REMINDER_PENDING ? 'bg-rose-700 text-white border-rose-700' : 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100/70'
          }`}
        >
          <span className="text-xs font-semibold">{t('Chờ CEO / Admin giao việc')}</span>
          <div className="text-2xl font-bold mt-1">{pendingCount}</div>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(REMINDER_ASSIGNED)}
          className={`text-left p-4 rounded-xl border transition cursor-pointer ${
            statusFilter === REMINDER_ASSIGNED ? 'bg-sky-700 text-white border-sky-700' : 'bg-sky-50/70 border-sky-200 text-sky-900 hover:bg-sky-100/70'
          }`}
        >
          <span className="text-xs font-semibold">{t('Đã giao việc từ nhắc việc')}</span>
          <div className="text-2xl font-bold mt-1">{assignedCount}</div>
        </button>
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 text-amber-950">
          <span className="text-xs font-semibold">{t('Báo động đỏ chưa có người đảm nhận')}</span>
          <div className="text-2xl font-bold mt-1">{unassignedRedAlerts.length} / {redAlerts.length}</div>
        </div>
      </div>

      <section className="analytics-card management-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900 m-0">{t('Danh sách nhắc việc từ nhân viên & các bộ phận')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('Mọi vai trò đều theo dõi được trạng thái đã giao hay chưa. Admin và CEO có thể giao việc nhanh kèm ghi chú trực tiếp tại từng mục.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 border border-slate-300 rounded-lg bg-white px-2.5 h-9">
              <Search size={14} className="text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('Tìm mã PO, chứng từ, người nhắc…')}
                className="outline-none bg-transparent text-xs w-44"
              />
            </label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              aria-label={t('Lọc phân hệ nhắc việc')}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800"
            >
              <option value="all">{t('Tất cả phân hệ')}</option>
              <option value="orders">{t('Đơn hàng & Tiến độ')}</option>
              <option value="receivables">{t('Công nợ phải thu')}</option>
              <option value="payables">{t('Công nợ phải trả')}</option>
            </select>
            {(statusFilter !== 'all' || typeFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setSearchQuery(''); }}
                className="row-detail-button h-9"
              >
                <RotateCcw size={14} />
                <span>{t('Xóa lọc')}</span>
              </button>
            )}
          </div>
        </div>

        {!filteredReminders.length ? (
          <div className="task-empty">
            <BellRing size={24} />
            <p>{t('Không có nhắc việc nào trong phạm vi lọc hiện tại.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pagedReminders.map(reminder => {
              const alertRef = {
                id: reminder.alertId,
                type: reminder.alertType,
                reference: reminder.reference,
              };
              const matchedAlert = alerts.find(alert => reminderMatchesAlert(reminder, alert));
              const isPending = reminder.status === REMINDER_PENDING;
              const isQuickOpen = expandedQuickAssignId === reminder.id || (isExec && isPending && expandedQuickAssignId === null && pagedReminders[0]?.id === reminder.id);

              return (
                <article
                  key={reminder.id}
                  className={`rounded-xl border p-4 transition ${
                    isPending
                      ? 'border-l-4 border-rose-300 border-l-rose-600 bg-white shadow-2xs'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                          {t(typeLabel(reminder.alertType))}
                        </span>
                        <strong className="text-sm font-bold text-slate-900">{reminder.reference}</strong>
                        <span className="text-xs font-semibold text-slate-700">· {t(reminder.subject)}</span>
                        {reminder.remindCount > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
                            {phrase('Đã nhắc § lần', reminder.remindCount)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                        <AlertTriangle size={13} />
                        <span>{t(reminder.issue)}</span>
                      </p>
                      <AlertAssignmentLine
                        alertRef={alertRef}
                        tasks={tasks}
                        accounts={accounts}
                        reminders={reminders}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          isPending
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : reminder.status === REMINDER_ASSIGNED
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t(reminder.status)}
                      </span>
                      {matchedAlert && onOpenAlert && (
                        <button
                          type="button"
                          onClick={() => onOpenAlert(matchedAlert)}
                          className="row-detail-button text-xs"
                        >
                          <span>{t('Xem hồ sơ gốc')}</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                      {isExec && (
                        <button
                          type="button"
                          onClick={() => setExpandedQuickAssignId(isQuickOpen ? '__closed__' : reminder.id)}
                          className="row-primary-button text-xs flex items-center gap-1"
                        >
                          <ClipboardPlus size={14} />
                          <span>{t(isQuickOpen ? 'Thu gọn giao việc' : isPending ? 'Giao việc nhanh' : 'Giao thêm / Đổi phân công')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-xs text-slate-800 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        <strong className="text-slate-800">{reminder.senderName}</strong> ({t(reminder.senderRole)}) {t('đã nhắc việc')}
                      </span>
                      <span>{formatTime(reminder.updatedAt || reminder.createdAt)}</span>
                    </div>
                    <p className="text-slate-900 font-medium whitespace-pre-line">“{t(reminder.message)}”</p>
                  </div>

                  {reminder.assignedByName && (
                    <div className="mt-2 text-xs text-emerald-900 bg-emerald-50/80 border border-emerald-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <UserCheck size={13} className="inline mr-1" />
                        <strong>{reminder.assignedByName}</strong> {t('đã giao cho')} <strong>{t(reminder.assignedTargetLabel)}</strong>
                        {reminder.managerNote && <> · <em className="italic">{t('Ghi chú:')} “{reminder.managerNote}”</em></>}
                      </span>
                      <span className="text-[11px] text-emerald-700">{formatTime(reminder.assignedAt)}</span>
                    </div>
                  )}

                  {isExec && isQuickOpen && (
                    <QuickAssignBox
                      reminder={reminder}
                      people={people}
                      today={today}
                      busy={busy}
                      onQuickAssign={handleQuickAssign}
                      onDismiss={handleDismiss}
                    />
                  )}
                </article>
              );
            })}
            <ProgressivePaginationBar pagination={pagination} itemUnit="nhắc việc" />
          </div>
        )}
      </section>

      <section className="analytics-card management-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 m-0">{t('Cảnh báo đỏ trên hệ thống & Trạng thái người đảm nhận')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('Hiển thị đầy đủ các cảnh báo đỏ hiện có kèm dòng trạng thái nhỏ in nghiêng để mọi bộ phận theo dõi và nhắc việc khi cần.')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {redAlerts.map(alert => {
            const alertRef = { id: alert.id, type: alert.type, reference: alert.reference };
            const info = resolveAlertAssignmentInfo(alertRef, tasks, accounts, reminders, today);
            return (
              <div
                key={alert.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      [{t(typeLabel(alert.type))}] {alert.reference} · {t(alert.label)}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-600 text-white">
                      {t(alert.status)}
                    </span>
                  </div>
                  <AlertAssignmentLine
                    alertRef={alertRef}
                    tasks={tasks}
                    accounts={accounts}
                    reminders={reminders}
                    canRemind={true}
                    onRemind={() => {
                      setSelectedAlertKey(alert.id);
                      setCustomReference(alert.reference);
                      setCustomType(alert.type);
                      setCustomSubject(alert.label || alert.reference);
                      setCustomIssue(alert.status || 'Báo động đỏ cần xử lý');
                      setMessage(`Cảnh báo đỏ ${alert.reference} (${alert.status}) hiện ${info.isAssigned ? `đã giao cho ${info.assigneesText} nhưng chưa hoàn tất` : 'chưa có người đảm nhận'}. Nhờ sếp kiểm tra và giao việc xử lý.`);
                      setShowCreateForm(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  {onOpenAlert && (
                    <button
                      type="button"
                      onClick={() => onOpenAlert(alert)}
                      className="row-detail-button text-xs"
                    >
                      <span>{t('Chi tiết')}</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
