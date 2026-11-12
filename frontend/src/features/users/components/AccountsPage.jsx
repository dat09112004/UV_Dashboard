import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, LockOpen, RotateCcw, Search } from 'lucide-react';
import { phrase, t } from '../../../locales/i18n.js';
import { useDebouncedValue } from '../../../hooks/useDebounce.js';
import { useProgressivePagination } from '../../../hooks/useProgressivePagination.js';
import ProgressivePaginationBar from '../../../components/common/ProgressivePaginationBar.jsx';
import { canEditAccount, defaultNavigationForRole, DEPARTMENT_ROLES, manageableRoles,
  navigationForRole, NAVIGATION_LABELS, OVERVIEW_SECTIONS, ROLE_PROFILES } from '../../../utils/roles.js';

function RoleSelect({ roles, defaultValue, onChange }) {
  return <label>{t('Vai trò')}<select name="role" defaultValue={defaultValue} onChange={onChange} required>
    {roles.map(role => <option key={role} value={role}>{t(ROLE_PROFILES[role].label)}</option>)}
  </select></label>;
}

function NavigationFields({ account, roles, departmentNavigation, onApplyDepartment, onCancel }) {
  const [role, setRole] = useState(account.role);
  const [selected, setSelected] = useState(() =>
    departmentNavigation?.[account.role] ?? defaultNavigationForRole(account.role));
  const detailsAvailable = OVERVIEW_SECTIONS.every(section => selected.includes(section));
  const selectedForDepartment = selected.filter(section => section !== 'overview' || detailsAvailable);
  return <>
    <RoleSelect roles={roles} defaultValue={role} onChange={event => {
      const nextRole = event.target.value;
      setRole(nextRole);
      setSelected(departmentNavigation?.[nextRole] ?? defaultNavigationForRole(nextRole));
    }} />
    {Object.hasOwn(DEPARTMENT_ROLES, role) && <>
      <fieldset className="navigation-checklist">
        <legend>{t('Trang được phép truy cập của phòng ban')}</legend>
        {navigationForRole(role).map(section => <label key={section}>
          <input type="checkbox" value={section}
            checked={selectedForDepartment.includes(section)}
            disabled={section === 'overview' && !detailsAvailable}
            onChange={event => {
              const checked = event.target.checked;
              setSelected(previous => checked ? [...previous, section] : previous.filter(value => value !== section));
            }} />
          {t(NAVIGATION_LABELS[section])}
        </label>)}
      </fieldset>
      <p className="management-note">{t('Lưu thay đổi để cập nhật vai trò tài khoản. Dùng nút áp dụng để cập nhật các trang cho cả phòng ban.')}</p>
      <button type="button" className="row-detail-button" disabled={!selectedForDepartment.length}
        onClick={() => onApplyDepartment(role, selectedForDepartment)}>
        {t('Áp dụng cho toàn bộ phòng ban')}
      </button>
    </>}
    <div className="workflow-footer">
      <button type="button" onClick={onCancel}>{t('Hủy')}</button>
      <button className="primary" type="submit">{t('Lưu vai trò')}</button>
    </div>
  </>;
}

export default function AccountsPage({ accounts, departmentNavigation, actor, onAction, busy }) {
  const [editingId, setEditingId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmError, setConfirmError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Debounced search and role filter for Accounts directory
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const debouncedRoleFilter = useDebouncedValue(roleFilter, 150);

  const dialogRef = useRef(null);
  const editHeading = useRef(null);
  const editTrigger = useRef(null);
  useEffect(() => { if (editingId) editHeading.current?.focus(); }, [editingId]);
  const closeEditor = () => { setEditingId(null); requestAnimationFrame(() => editTrigger.current?.focus()); };
  useEffect(() => {
    if (confirmation && !dialogRef.current.open) dialogRef.current.showModal();
  }, [confirmation]);
  const roles = manageableRoles(actor);
  const editing = accounts.find(account => account.id === editingId);

  const filteredAccounts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return accounts.filter(acc => {
      if (debouncedRoleFilter !== 'all' && acc.role !== debouncedRoleFilter) return false;
      if (q) {
        const hay = [acc.name, acc.email, acc.roleLabel, acc.department].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, debouncedSearch, debouncedRoleFilter]);

  // Phân trang + Tải trước 1 phần & Cuộn tải dần + Clear trang cũ khi chuyển trang
  const pagination = useProgressivePagination(filteredAccounts, {
    sectionKey: 'users',
    initialChunkSize: 6,
    stepSize: 6,
    pageSize: 12,
    resetDeps: [debouncedSearch, debouncedRoleFilter],
  });
  const pagedAccounts = pagination.visibleItems;

  const submit = async (event, action) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = Object.fromEntries(fields);
    if (!await onAction(action, payload)) return;
    if (action === 'create-account') form.reset();
    else closeEditor();
  };

  const requestConfirmation = request => {
    setConfirmError('');
    setConfirmation(request);
  };
  const confirm = async () => {
    if (!confirmation || busy) return;
    setConfirmError('');
    const { action, payload } = confirmation;
    if (!await onAction(action, payload, setConfirmError)) return;
    dialogRef.current?.close();
    if (action === 'apply-department-navigation') closeEditor();
  };

  return <div className="management-grid">
    <dialog className="account-confirm-dialog" ref={dialogRef} aria-labelledby="account-confirm-title"
      aria-describedby="account-confirm-description"
      onClose={() => setConfirmation(null)} onCancel={event => { if (busy) event.preventDefault(); }}>
      {confirmation && <>
        <h2 id="account-confirm-title">{t(confirmation.title)}</h2>
        <p id="account-confirm-description">{confirmation.description}</p>
        {confirmError && <p className="account-confirm-error" role="alert">{t(confirmError)}</p>}
        <div className="workflow-footer">
          <button type="button" disabled={busy} onClick={() => dialogRef.current.close()}>{t('Hủy')}</button>
          <button type="button" className={confirmation.danger ? 'account-confirm-danger' : 'primary'}
            disabled={busy} onClick={confirm}>{t(confirmation.label)}</button>
        </div>
      </>}
    </dialog>
    <section className="analytics-card management-panel">
      <h2>{t('Tạo tài khoản')}</h2>
      <form className="workflow-form" onSubmit={event => submit(event, 'create-account')}>
        <fieldset disabled={busy}>
          <label>{t('Họ và tên')} <span className="required-mark" aria-hidden="true">*</span><input name="name" autoComplete="name" required maxLength={100} /></label>
          <label>{t('Email')} <span className="required-mark" aria-hidden="true">*</span><input name="email" type="email" autoComplete="off" required maxLength={254} /></label>
          <label>{t('Mật khẩu ban đầu')} <span className="required-mark" aria-hidden="true">*</span><input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
          <RoleSelect roles={roles} defaultValue="Sale" />
          <div className="workflow-footer"><button className="primary" type="submit">{t('Tạo tài khoản')}</button></div>
        </fieldset>
      </form>
      <p className="management-note">{t('Quyền của tài khoản được áp dụng theo vai trò đã chọn.')}</p>
    </section>

    <section className="analytics-card management-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2>{t('Danh sách tài khoản')}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1.5 border border-slate-300 rounded-lg bg-white px-2.5 h-8">
            <Search size={13} className="text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('Tìm tên, email…')}
              aria-label={t('Tìm tài khoản')}
              className="outline-none bg-transparent text-xs w-36"
            />
          </label>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            aria-label={t('Lọc vai trò')}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800"
          >
            <option value="all">{t('Tất cả vai trò')}</option>
            {Object.keys(ROLE_PROFILES).map(r => (
              <option key={r} value={r}>{t(ROLE_PROFILES[r].label)}</option>
            ))}
          </select>
          {(searchQuery || roleFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setRoleFilter('all'); }}
              className="row-detail-button h-8 text-xs"
            >
              <RotateCcw size={13} />
              <span>{t('Xóa lọc')}</span>
            </button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="management-table accounts-table">
          <thead><tr><th>{t('Họ và tên')}</th><th>{t('Vai trò')}</th><th>{t('Trạng thái')}</th><th>{t('Thao tác')}</th></tr></thead>
          <tbody>{pagedAccounts.map(account => {
            const locked = account.status !== 'active';
            const Icon = locked ? Lock : LockOpen;
            const actionLabel = locked ? 'Mở khóa tài khoản' : 'Khóa tài khoản';
            return <tr key={account.id} className={locked ? 'account-row-locked' : undefined}>
              <td><strong>{account.name}</strong><small>{account.email}</small></td>
              <td>{t(account.roleLabel)}</td>
              <td><span className={locked ? 'account-locked-badge' : undefined}>{t(locked ? 'Đã khóa' : 'Đang hoạt động')}</span></td>
              <td>{canEditAccount(actor, account) && <div className="account-row-actions">
                <button className="row-detail-button" type="button" disabled={busy}
                  aria-expanded={editingId === account.id} aria-controls={editingId === account.id ? 'account-permissions-form' : undefined}
                  onClick={event => {
                    editTrigger.current = event.currentTarget;
                    if (editingId === account.id) editHeading.current?.focus();
                    else setEditingId(account.id);
                  }}>{t('Cấp quyền')}</button>
                <button className="account-lock-button" type="button" disabled={busy} aria-haspopup="dialog"
                  aria-label={`${t(actionLabel)} · ${account.name}`} title={t(actionLabel)}
                  onClick={() => requestConfirmation({
                    action: 'set-account-status', title: actionLabel, label: locked ? 'Mở khóa' : 'Khóa tài khoản', danger: !locked,
                    description: phrase(locked ? 'Cho phép § đăng nhập lại?' : 'Khóa đăng nhập của §? Các công việc đã giao vẫn được lưu.', account.name),
                    payload: { id: account.id, expectedStatus: account.status, expectedTokenVersion: account.tokenVersion, status: locked ? 'active' : 'inactive' },
                  })}><Icon size={17} aria-hidden="true" /></button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <ProgressivePaginationBar pagination={pagination} itemUnit="tài khoản" />

      {canEditAccount(actor, editing) && <form id="account-permissions-form" className="workflow-form management-edit" key={editing.id} onSubmit={event => submit(event, 'update-account')}>
        <fieldset disabled={busy}>
          <input type="hidden" name="id" value={editing.id} />
          {editing.tokenVersion !== undefined && <input type="hidden" name="expectedTokenVersion" value={editing.tokenVersion} />}
          <h3 ref={editHeading} tabIndex={-1}>{t('Cấp quyền')} · {editing.name}</h3>
          <NavigationFields roles={roles} account={editing} departmentNavigation={departmentNavigation}
            onCancel={closeEditor} onApplyDepartment={(role, navigation) => requestConfirmation({
              action: 'apply-department-navigation', title: 'Áp dụng cho toàn bộ phòng ban', label: 'Áp dụng',
              description: phrase('Dùng các trang đã chọn cho tất cả tài khoản thuộc § và làm mặc định cho tài khoản mới?', t(DEPARTMENT_ROLES[role])),
              payload: { role, navigation },
            })} />
        </fieldset>
      </form>}
    </section>
  </div>;
}
