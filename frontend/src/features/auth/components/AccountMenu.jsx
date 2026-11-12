import { getLanguage, t } from '../../../locales/i18n.js';
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, KeyRound, LogOut, UserRound, X } from 'lucide-react';
import { changePassword } from '../services/authService.js';

function Avatar({ user }) {
  return <span className="profile-avatar" aria-hidden="true">{user.initials}</span>;
}

function PasswordField({ name, label, autoComplete }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const visibilityLabel = getLanguage() === 'en' ? `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}` : `${visible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`;
  return <div className="profile-password-field">
    <label htmlFor={id}>{t(label)}</label>
    <div className="profile-password-input">
      <input id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        required maxLength={128} minLength={autoComplete === 'new-password' ? 12 : undefined} />
      <button type="button" onClick={() => setVisible(!visible)} aria-label={visibilityLabel} title={visibilityLabel}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>;
}

function AccountDialog({ view, user, onClose, onChangeView, onPasswordChanged }) {
  const dialog = useRef(null);
  const headingId = useId();
  const noteId = useId();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isPassword = view === 'password';
  const fields = [
    ['Email công việc', user.email], ['Mã nhân viên', user.employeeCode],
    ['Phòng ban', user.department], ['Chức danh', user.title],
  ];

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const initialFocus = isPassword ? element.querySelector('input') : element.querySelector('h2');
    initialFocus?.focus();
    return () => element.close();
  }, [isPassword]);

  const closeDialog = () => {
    dialog.current.close();
    onClose();
  };

  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const password = form.get('newPassword');
    if (password !== form.get('confirmPassword')) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setError('');
    setSaving(true);
    let issue;
    try {
      issue = await changePassword(user.id, form.get('currentPassword'), password);
    } catch {
      issue = 'Không thể cập nhật mật khẩu. Vui lòng thử lại.';
    } finally {
      setSaving(false);
    }
    if (issue) setError(issue);
    else onPasswordChanged();
  };

  return <dialog ref={dialog} className="profile-dialog" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); if (!saving) closeDialog(); }}>
    <div className="profile-dialog-heading">
      <span className="profile-dialog-icon">{isPassword ? <KeyRound size={21} /> : <UserRound size={21} />}</span>
      <div><h2 id={headingId} tabIndex={-1}>{t(isPassword ? 'Đổi mật khẩu' : 'Thông tin tài khoản')}</h2>
        <p>{t(isPassword ? 'Xác minh mật khẩu hiện tại để tiếp tục.' : 'Hồ sơ làm việc của bạn')}</p></div>
      <button type="button" className="profile-dialog-close" aria-label={t("Đóng")} onClick={closeDialog} disabled={saving}><X size={20} /></button>
    </div>
    {isPassword ? <form className="profile-password-form" onSubmit={submit} onInput={() => setError('')} aria-describedby={noteId}>
      <fieldset disabled={saving}>
        <PasswordField name="currentPassword" label={t("Mật khẩu hiện tại")} autoComplete="current-password" />
        <PasswordField name="newPassword" label={t("Mật khẩu mới")} autoComplete="new-password" />
        <PasswordField name="confirmPassword" label={t("Xác nhận mật khẩu mới")} autoComplete="new-password" />
      </fieldset>
      <p id={noteId} className="profile-dialog-note">{t("Dùng từ 12 đến 128 ký tự. Đăng nhập lại sau khi lưu.")}</p>
      {error && <p className="profile-form-error" role="alert">{t(error)}</p>}
      <div className="profile-dialog-actions">
        <button type="button" className="profile-secondary" onClick={closeDialog} disabled={saving}>{t("Hủy")}</button>
        <button type="submit" className="profile-primary" disabled={saving}>{t(saving ? 'Đang lưu…' : 'Lưu mật khẩu')}</button>
      </div>
    </form> : <>
      <div className="profile-identity">
        <Avatar user={user} />
        <div><strong>{user.name}</strong><span>{t(user.roleLabel)}</span></div>
      </div>
      <dl className="profile-fields">
        {fields.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{t(value || '—')}</dd></div>)}
      </dl>
      <p className="profile-dialog-note">{t("Liên hệ quản trị viên nếu cần cập nhật thông tin hồ sơ.")}</p>
      <div className="profile-dialog-actions">
        <button type="button" className="profile-primary" onClick={onChangeView}><KeyRound size={16} />{t(" Đổi mật khẩu")}</button>
      </div>
    </>}
  </dialog>;
}

export default function AccountMenu({ user, onLogout, onPasswordChanged }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [open]);

  const show = nextView => { setOpen(false); setView(nextView); };
  const close = () => { setView(null); trigger.current?.focus(); };

  return <div ref={root} className="profile-menu"
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { setOpen(false); trigger.current?.focus(); }
    }}>
    <button type="button" ref={trigger} className="profile-trigger" aria-label={t(`Tài khoản ${user.name}`)}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      <Avatar user={user} />
      <span className="profile-trigger-text"><strong>{user.name}</strong><small>{t(user.roleLabel)}</small></span>
      <ChevronDown className="profile-chevron" size={16} aria-hidden="true" />
    </button>
    {open && <div id={id} className="profile-popover">
      <div className="profile-popover-heading">
        <Avatar user={user} />
        <div><strong>{user.name}</strong><span>{user.email}</span><small>{t(user.roleLabel)}</small></div>
      </div>
      <div className="profile-menu-items">
        <button type="button" onClick={() => show('account')}><UserRound size={18} />{t("Thông tin tài khoản")}</button>
        <button type="button" onClick={() => show('password')}><KeyRound size={18} />{t("Đổi mật khẩu")}</button>
      </div>
      <div className="profile-menu-items profile-menu-footer">
        <button type="button" onClick={onLogout}><LogOut size={18} />{t("Đăng xuất")}</button>
      </div>
    </div>}
    {view && <AccountDialog key={view} view={view} user={user} onClose={close}
      onChangeView={() => setView('password')} onPasswordChanged={onPasswordChanged} />}
  </div>;
}
