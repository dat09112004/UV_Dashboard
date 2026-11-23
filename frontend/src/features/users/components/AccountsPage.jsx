import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Lock, LockOpen, RotateCcw, Search, UserPlus } from 'lucide-react';
import { phrase, t } from '../../../locales/i18n.js';
import { useDebouncedValue } from '../../../hooks/useDebounce.js';
import { useProgressivePagination } from '../../../hooks/useProgressivePagination.js';
import ProgressivePaginationBar from '../../../components/common/ProgressivePaginationBar.jsx';
import FormWindowDialog from '../../../components/common/FormWindowDialog.jsx';
import SearchableSelect from '../../../components/common/SearchableSelect.jsx';
import {
  canEditAccount,
  canToggleAccountStatus,
  defaultNavigationForRole,
  DEPARTMENT_ROLES,
  manageableRoles,
  navigationForRole,
  NAVIGATION_LABELS,
  OVERVIEW_SECTIONS,
  ROLE_PROFILES,
} from '../../../utils/roles.js';

// Chức năng: Ô chọn vai trò người dùng khi tạo mới hoặc cập nhật phân quyền tài khoản
function RoleSelect({ roles, defaultValue, onChange }) {
  return <label>{t('Vai trò')}<select name="role" defaultValue={defaultValue} onChange={onChange} required>
    {roles.map(role => <option key={role} value={role}>{t(ROLE_PROFILES[role].label)}</option>)}
  </select></label>;
}

// Chức năng: Bảng đánh dấu các phân hệ được phép truy cập của từng tài khoản hoặc áp dụng đồng loạt cho cả phòng ban
function NavigationFields({ account, roles, departmentNavigation, onApplyDepartment, onCancel }) {
  const [role, setRole] = useState(account.role);
  const [empCode, setEmpCode] = useState(account.employeeCode || '');
  const [selected, setSelected] = useState(() =>
    departmentNavigation?.[account.role] ?? defaultNavigationForRole(account.role));
  const detailsAvailable = OVERVIEW_SECTIONS.every(section => selected.includes(section));
  const selectedForDepartment = selected.filter(section => section !== 'overview' || detailsAvailable);
  return <>
    <div className="item-form-grid">
      <label>{t('Mã nhân viên (UV...)')} <span className="required-mark" aria-hidden="true">*</span>
        <input
          name="employeeCode"
          value={empCode}
          onChange={e => setEmpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
          required
          pattern="^UV[A-Za-z0-9_-]{1,30}$"
          maxLength={32}
          placeholder="UV001"
        />
      </label>
      <RoleSelect roles={roles} defaultValue={role} onChange={event => {
        const nextRole = event.target.value;
        setRole(nextRole);
        setSelected(departmentNavigation?.[nextRole] ?? defaultNavigationForRole(nextRole));
      }} />
      <label className="workflow-wide">{t('Đặt lại mật khẩu mới (để trống nếu giữ nguyên)')}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          placeholder={t('Tối thiểu 8 ký tự (bỏ trống nếu không đổi)')}
        />
      </label>
    </div>
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
          {t(NAVIGATION_LABELS[section] || section)}
        </label>)}
      </fieldset>

      <button type="button" className="row-detail-button" disabled={!selectedForDepartment.length}
        onClick={() => onApplyDepartment(role, selectedForDepartment)}>
        {t('Áp dụng cho toàn bộ phòng ban')}
      </button>
    </>}
    <div className="workflow-footer">
      <button type="button" onClick={onCancel}>{t('Hủy')}</button>
      <button className="primary" type="submit">{t('Lưu thay đổi')}</button>
    </div>
  </>;
}

// Chức năng: Trang Quản lý tài khoản (chỉ dành cho Admin): tạo tài khoản bắt buộc Mã nhân viên UV..., đặt lại mật khẩu, lọc nhanh gõ chữ và cấp quyền phòng ban
export default function AccountsPage({ accounts, departmentNavigation, actor, onAction, busy }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmpCode, setCreateEmpCode] = useState('UV');
  const [editingId, setEditingId] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetConfirmPwd, setResetConfirmPwd] = useState('');
  const [resetError, setResetError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [confirmError, setConfirmError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Debounced search (300ms) and role/status filters (150ms) for Accounts directory
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const debouncedRoleFilter = useDebouncedValue(roleFilter, 150);
  const debouncedStatusFilter = useDebouncedValue(statusFilter, 150);

  const availableRoles = useMemo(() => {
    const fromAccounts = [...new Set((accounts || []).map(acc => acc.role).filter(r => r && r !== 'Admin'))];
    return fromAccounts.length > 0 ? fromAccounts : Object.keys(ROLE_PROFILES).filter(r => r !== 'Admin');
  }, [accounts]);

  const roleFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('Tất cả vai trò') },
      ...availableRoles.map(r => ({ value: r, label: t(ROLE_PROFILES[r]?.label || r), keywords: r })),
    ],
    [availableRoles]
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('Tất cả trạng thái') },
      { value: 'active', label: t('Đang hoạt động') },
      { value: 'inactive', label: t('Đã khóa') },
    ],
    []
  );

  const dialogRef = useRef(null);
  const editHeading = useRef(null);
  const editTrigger = useRef(null);
  useEffect(() => { if (editingId) editHeading.current?.focus(); }, [editingId]);
  // Chức năng: Đóng (closeEditor - Editor) phục vụ xử lý dữ liệu trong AccountsPage.jsx
  const closeEditor = () => { setEditingId(null); requestAnimationFrame(() => editTrigger.current?.focus()); };
  useEffect(() => {
    if (confirmation && !dialogRef.current.open) dialogRef.current.showModal();
  }, [confirmation]);
  const roles = manageableRoles(actor);
  const editing = accounts.find(account => account.id === editingId);

  const filteredAccounts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return accounts.filter(acc => {
      if (acc.role === 'Admin') return false;
      if (debouncedRoleFilter !== 'all' && acc.role !== debouncedRoleFilter) return false;
      if (debouncedStatusFilter !== 'all' && acc.status !== debouncedStatusFilter) return false;
      if (q) {
        const hay = [acc.employeeCode, acc.name, acc.email, acc.roleLabel, acc.department, acc.title].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, debouncedSearch, debouncedRoleFilter, debouncedStatusFilter]);

  // Phân trang + Tải trước 1 phần & Cuộn tải dần + Clear trang cũ khi chuyển trang
  const pagination = useProgressivePagination(filteredAccounts, {
    sectionKey: 'users',
    initialChunkSize: 6,
    stepSize: 6,
    pageSize: 12,
    resetDeps: [debouncedSearch, debouncedRoleFilter, debouncedStatusFilter],
  });
  const pagedAccounts = pagination.visibleItems;

  // Chức năng: Xử lý nghiệp vụ (submit - submit) phục vụ xử lý dữ liệu trong AccountsPage.jsx
  const submit = async (event, action) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = Object.fromEntries(fields);
    if (payload.employeeCode) {
      payload.employeeCode = String(payload.employeeCode).trim().toUpperCase();
    }
    if (action === 'update-account' && !String(payload.password || '').trim()) {
      delete payload.password;
    }
    if (!await onAction(action, payload)) return;
    if (action === 'create-account') {
      form.reset();
      setCreateEmpCode('UV');
      setShowCreateModal(false);
    } else {
      closeEditor();
    }
  };

  // Chức năng: Gửi lệnh đặt lại mật khẩu trực tiếp cho tài khoản từ giao diện Admin
  const submitResetPassword = async event => {
    event.preventDefault();
    if (!resetTarget || busy) return;
    if (resetPwd.length < 8) {
      setResetError('Mật khẩu mới phải tối thiểu 8 ký tự.');
      return;
    }
    if (resetPwd !== resetConfirmPwd) {
      setResetError('Xác nhận mật khẩu mới không khớp.');
      return;
    }
    setResetError('');
    const ok = await onAction(
      'update-account',
      {
        id: resetTarget.id,
        name: resetTarget.name,
        email: resetTarget.email,
        role: resetTarget.role,
        status: resetTarget.status,
        employeeCode: resetTarget.employeeCode || '',
        expectedTokenVersion: resetTarget.tokenVersion,
        password: resetPwd,
      },
      setResetError
    );
    if (ok) {
      setResetTarget(null);
      setResetPwd('');
      setResetConfirmPwd('');
      setResetError('');
    }
  };

  // Chức năng: Xử lý nghiệp vụ (requestConfirmation - Confirmation) phục vụ xử lý dữ liệu trong AccountsPage.jsx
  const requestConfirmation = request => {
    setConfirmError('');
    setConfirmation(request);
  };
  // Chức năng: Xử lý nghiệp vụ (confirm - confirm) phục vụ xử lý dữ liệu trong AccountsPage.jsx
  const confirm = async () => {
    if (!confirmation || busy) return;
    setConfirmError('');
    const { action, payload } = confirmation;
    if (!await onAction(action, payload, setConfirmError)) return;
    dialogRef.current?.close();
    if (action === 'apply-department-navigation') closeEditor();
  };

  return <div className="space-y-4">
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

    {/* Cửa sổ Tạo tài khoản mới (Bắt buộc nhập Mã nhân viên UV...) */}
    <FormWindowDialog
      open={showCreateModal}
      title="Tạo tài khoản mới"
      subtitle="Quản lý tài khoản & Phân quyền phòng ban"
      size="md"
      busy={busy}
      onClose={() => setShowCreateModal(false)}
    >
      <form className="workflow-form" onSubmit={event => submit(event, 'create-account')}>
        <fieldset disabled={busy} className="item-form-grid">
          <label>{t('Mã nhân viên (UV...)')} <span className="required-mark" aria-hidden="true">*</span>
            <input
              name="employeeCode"
              value={createEmpCode}
              onChange={e => setCreateEmpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              required
              pattern="^UV[A-Za-z0-9_-]{1,30}$"
              maxLength={32}
              placeholder="UV001"
            />
          </label>
          <RoleSelect roles={roles} defaultValue="Sale" />
          <label className="workflow-wide">{t('Họ và tên')} <span className="required-mark" aria-hidden="true">*</span><input name="name" autoComplete="name" required maxLength={100} /></label>
          <label className="workflow-wide">{t('Email')} <span className="required-mark" aria-hidden="true">*</span><input name="email" type="email" autoComplete="off" required maxLength={254} /></label>
          <label className="workflow-wide">{t('Mật khẩu ban đầu')} <span className="required-mark" aria-hidden="true">*</span><input name="password" type="password" autoComplete="new-password" required minLength={8} placeholder={t("Tối thiểu 8 ký tự")} maxLength={128} /></label>
        </fieldset>
        <div className="workflow-footer">
          <button type="button" disabled={busy} onClick={() => setShowCreateModal(false)}>{t('Hủy')}</button>
          <button className="primary" type="submit" disabled={busy}>{t('Tạo tài khoản')}</button>
        </div>
      </form>
    </FormWindowDialog>

    {/* Cửa sổ Đặt lại mật khẩu cho tài khoản (Admin) */}
    <FormWindowDialog
      open={Boolean(resetTarget)}
      title={resetTarget ? `${t('Đặt lại mật khẩu')} · ${resetTarget.name}` : t('Đặt lại mật khẩu')}
      subtitle={resetTarget ? `${resetTarget.employeeCode ? `${resetTarget.employeeCode} · ` : ''}${resetTarget.email}` : ''}
      size="sm"
      busy={busy}
      onClose={() => { setResetTarget(null); setResetPwd(''); setResetConfirmPwd(''); setResetError(''); }}
    >
      {resetTarget && (
        <form className="workflow-form" onSubmit={submitResetPassword}>
          <fieldset disabled={busy} className="item-form-grid">
            <label className="workflow-wide">{t('Mật khẩu mới')} <span className="required-mark" aria-hidden="true">*</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={resetPwd}
                onChange={e => { setResetPwd(e.target.value); setResetError(''); }}
                placeholder={t('Tối thiểu 8 ký tự')}
              />
            </label>
            <label className="workflow-wide">{t('Xác nhận mật khẩu mới')} <span className="required-mark" aria-hidden="true">*</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={resetConfirmPwd}
                onChange={e => { setResetConfirmPwd(e.target.value); setResetError(''); }}
                placeholder={t('Nhập lại mật khẩu mới')}
              />
            </label>
          </fieldset>
          {resetError && <p className="account-confirm-error" role="alert" style={{ marginTop: 8 }}>{t(resetError)}</p>}
          <p className="text-xs text-slate-500 mt-2 mb-0">{t('Sau khi đặt lại mật khẩu, các phiên đăng nhập cũ của tài khoản này sẽ tự động đăng xuất.')}</p>
          <div className="workflow-footer">
            <button type="button" disabled={busy} onClick={() => { setResetTarget(null); setResetPwd(''); setResetConfirmPwd(''); setResetError(''); }}>{t('Hủy')}</button>
            <button className="primary" type="submit" disabled={busy}>{t('Xác nhận đặt lại mật khẩu')}</button>
          </div>
        </form>
      )}
    </FormWindowDialog>

    {/* Cửa sổ Cấp quyền, Mã nhân viên & Đặt lại mật khẩu */}
    <FormWindowDialog
      open={Boolean(editing && canEditAccount(actor, editing))}
      title={editing ? `${t('Cấp quyền')} · ${editing.name}` : t('Cấp quyền')}
      subtitle={editing ? `${editing.employeeCode ? `${editing.employeeCode} · ` : ''}${editing.email}` : ''}
      size="md"
      busy={busy}
      onClose={closeEditor}
    >
      {editing && canEditAccount(actor, editing) && (
        <form id="account-permissions-form" className="workflow-form" key={editing.id} onSubmit={event => submit(event, 'update-account')}>
          <fieldset disabled={busy}>
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="name" value={editing.name} />
            <input type="hidden" name="email" value={editing.email} />
            <input type="hidden" name="status" value={editing.status} />
            {editing.tokenVersion !== undefined && <input type="hidden" name="expectedTokenVersion" value={editing.tokenVersion} />}
            <h3 ref={editHeading} tabIndex={-1} className="sr-only">{t('Cấp quyền')} · {editing.name}</h3>
            <NavigationFields roles={roles} account={editing} departmentNavigation={departmentNavigation}
              onCancel={closeEditor} onApplyDepartment={(role, navigation) => requestConfirmation({
                action: 'apply-department-navigation', title: 'Áp dụng cho toàn bộ phòng ban', label: 'Áp dụng',
                description: phrase('Dùng các trang đã chọn cho tất cả tài khoản thuộc § và làm mặc định cho tài khoản mới?', t(DEPARTMENT_ROLES[role])),
                payload: { role, sections: navigation, navigation },
              })} />
          </fieldset>
        </form>
      )}
    </FormWindowDialog>

    <section className="analytics-card management-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2>{t('Danh sách tài khoản')}</h2>
        <div className="management-toolbar">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setCreateEmpCode('UV'); setShowCreateModal(true); }}
            className="row-primary-button flex items-center gap-1.5"
          >
            <UserPlus size={15} />
            <span>{t('+ Tạo tài khoản')}</span>
          </button>
          <label className="management-toolbar-search">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('Tìm tên, email, mã NV (UV...)')}
              aria-label={t('Tìm tài khoản')}
            />
          </label>
          <SearchableSelect
            value={roleFilter}
            options={roleFilterOptions}
            onChange={setRoleFilter}
            ariaLabel={t('Lọc vai trò')}
            placeholder={t('Lọc vai trò…')}
            allowClear
            clearValue="all"
          />
          <SearchableSelect
            value={statusFilter}
            options={statusFilterOptions}
            onChange={setStatusFilter}
            ariaLabel={t('Lọc trạng thái')}
            placeholder={t('Lọc trạng thái…')}
            allowClear
            clearValue="all"
          />
          {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setRoleFilter('all'); setStatusFilter('all'); }}
              className="row-detail-button"
            >
              <RotateCcw size={14} />
              <span>{t('Xóa lọc')}</span>
            </button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="management-table accounts-table">
          <thead><tr><th>{t('Mã NV')}</th><th>{t('Họ và tên')}</th><th>{t('Vai trò')}</th><th>{t('Trạng thái')}</th><th>{t('Thao tác')}</th></tr></thead>
          <tbody>{pagedAccounts.map(account => {
            const locked = account.status !== 'active';
            const Icon = locked ? Lock : LockOpen;
            const actionLabel = locked ? 'Mở khóa tài khoản' : 'Khóa tài khoản';
            const canEdit = canEditAccount(actor, account);
            const canToggle = canToggleAccountStatus(actor, account);
            return <tr key={account.id} className={locked ? 'account-row-locked' : undefined}>
              <td><span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded px-2 py-0.5">{account.employeeCode || '—'}</span></td>
              <td><strong>{account.name}</strong><small>{account.email}</small></td>
              <td>{t(account.roleLabel)}</td>
              <td><span className={locked ? 'account-locked-badge' : undefined}>{t(locked ? 'Đã khóa' : 'Đang hoạt động')}</span></td>
              <td>{(canEdit || canToggle) && <div className="account-row-actions">
                {canEdit && <button className="row-detail-button" type="button" disabled={busy}
                  aria-expanded={editingId === account.id} aria-controls={editingId === account.id ? 'account-permissions-form' : undefined}
                  onClick={event => {
                    editTrigger.current = event.currentTarget;
                    setEditingId(account.id);
                  }}>{t('Cấp quyền')}</button>}
                {canEdit && <button className="row-detail-button" type="button" disabled={busy}
                  title={t('Đặt lại mật khẩu')}
                  onClick={() => { setResetTarget(account); setResetPwd(''); setResetConfirmPwd(''); setResetError(''); }}>
                  <KeyRound size={14} aria-hidden="true" /><span>{t('Đặt lại MK')}</span>
                </button>}
                {canToggle && <button className="account-lock-button" type="button" disabled={busy} aria-haspopup="dialog"
                  aria-label={`${t(actionLabel)} · ${account.name}`} title={t(actionLabel)}
                  onClick={() => requestConfirmation({
                    action: 'set-account-status', title: actionLabel, label: locked ? 'Mở khóa' : 'Khóa tài khoản', danger: !locked,
                    description: phrase(locked ? 'Cho phép § đăng nhập lại?' : 'Khóa đăng nhập của §? Các công việc đã giao vẫn được lưu.', account.name),
                    payload: { id: account.id, expectedStatus: account.status, expectedTokenVersion: account.tokenVersion, status: locked ? 'active' : 'inactive' },
                  })}><Icon size={17} aria-hidden="true" /></button>}
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <ProgressivePaginationBar pagination={pagination} itemUnit="tài khoản" />
    </section>
  </div>;
}
