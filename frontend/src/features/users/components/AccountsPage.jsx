import React, { useEffect, useRef, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { phrase, t } from '../../../locales/i18n.js';
import { canEditAccount, defaultNavigationForRole, DEPARTMENT_ROLES, manageableRoles,
  navigationForRole, NAVIGATION_LABELS, OVERVIEW_SECTIONS, ROLE_PROFILES } from '../../../utils/roles.js';

function RoleSelect({ roles, defaultValue, onChange }) {
  return <label>{t('Vai trò')}<select name="role" defaultValue={defaultValue} onChange={onChange} required>
    {roles.map(role => <option key={role} value={role}>{t(ROLE_PROFILES[role].label)}</option>)}
  </select></label>;
}

function NavigationFields({ account, roles, departmentNavigation, onApplyDepartment, onCancel }) {
  const [role, setRole] = useState(account.role);
  const [selected, setSelected] = useState(account.navigation);
  const detailsAvailable = OVERVIEW_SECTIONS.every(section => selected.includes(section));
  return <>
    <RoleSelect roles={roles} defaultValue={role} onChange={event => {
      const nextRole = event.target.value;
      setRole(nextRole);
      setSelected(nextRole === account.role ? account.navigation : departmentNavigation?.[nextRole] ?? defaultNavigationForRole(nextRole));
    }} />
    <fieldset className="navigation-checklist">
      <legend>{t('Trang được phép truy cập')}</legend>
      {navigationForRole(role).map(section => <label key={section}>
        <input type="checkbox" name="navigation" value={section}
          checked={selected.includes(section) && (section !== 'overview' || detailsAvailable)}
          disabled={section === 'overview' && !detailsAvailable}
          onChange={event => setSelected(event.target.checked ? [...selected, section] : selected.filter(value => value !== section))} />
        {t(NAVIGATION_LABELS[section])}
      </label>)}
      <label><input type="checkbox" checked disabled />{t('Nhập liệu Excel')}</label>
    </fieldset>
    <p className="management-note">{t('Tổng quan cần quyền xem đủ đơn hàng, doanh thu và công nợ. Nhập liệu Excel luôn có sẵn theo quyền của vai trò.')}</p>
    <div className="workflow-footer">
      {role === account.role && Object.hasOwn(DEPARTMENT_ROLES, role) &&
        <button type="button" onClick={event => onApplyDepartment(role, new FormData(event.currentTarget.form).getAll('navigation'))}>
          {t('Áp dụng cho toàn bộ phòng ban')}
        </button>}
      <button type="button" onClick={onCancel}>{t('Hủy')}</button>
      <button className="primary" type="submit">{t('Lưu thay đổi')}</button>
    </div>
  </>;
}

export default function AccountsPage({ accounts, departmentNavigation, actor, onAction, busy }) {
  const [editingId, setEditingId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmError, setConfirmError] = useState('');
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
  const submit = async (event, action) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = Object.fromEntries(fields);
    if (action === 'update-account') payload.navigation = fields.getAll('navigation');
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
          <label>{t('Mật khẩu ban đầu')} <span className="required-mark" aria-hidden="true">*</span><input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>
          <RoleSelect roles={roles} defaultValue="Sale" />
          <div className="workflow-footer"><button className="primary" type="submit">{t('Tạo tài khoản')}</button></div>
        </fieldset>
      </form>
      <p className="management-note">{t('Quyền của tài khoản được áp dụng theo vai trò đã chọn.')}</p>
    </section>

    <section className="analytics-card management-panel">
      <h2>{t('Danh sách tài khoản')}</h2>
      <div className="table-scroll">
        <table className="management-table accounts-table">
          <thead><tr><th>{t('Họ và tên')}</th><th>{t('Vai trò')}</th><th>{t('Trạng thái')}</th><th>{t('Thao tác')}</th></tr></thead>
          <tbody>{accounts.map(account => {
            const locked = account.status === 'inactive';
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
                    payload: { id: account.id, expectedStatus: account.status, status: locked ? 'active' : 'inactive' },
                  })}><Icon size={17} aria-hidden="true" /></button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      {canEditAccount(actor, editing) && <form id="account-permissions-form" className="workflow-form management-edit" key={editing.id} onSubmit={event => submit(event, 'update-account')}>
        <fieldset disabled={busy}>
          <input type="hidden" name="id" value={editing.id} />
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
