import { getLanguage, t } from "../../../locales/i18n.js";
import React, { useEffect, useId, useRef, useState } from "react";
import { Bug, ChevronDown, Eye, EyeOff, KeyRound, LogOut, Mail, UserRound, X } from "lucide-react";
import { changePassword } from "../services/authService.js";

export const BUG_REPORT_EMAIL = "dat.lt@uyenvu-international.com";

// Chức năng: Thành phần giao diện (React Component Avatar) hiển thị và xử lý tương tác người dùng trong AccountMenu.jsx
function Avatar({ user }) {
  return <span className="profile-avatar" aria-hidden="true">{user.initials}</span>;
}

// Chức năng: Thành phần giao diện (React Component PasswordField) hiển thị và xử lý tương tác người dùng trong AccountMenu.jsx
function PasswordField({ name, label, autoComplete }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const visibilityLabel = getLanguage() === "en" ? `${visible ? "Hide" : "Show"} ${label.toLowerCase()}` : `${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`;
  return <div className="profile-password-field">
    <label htmlFor={id}>{t(label)}</label>
    <div className="profile-password-input">
      <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
        required maxLength={128} minLength={autoComplete === "new-password" ? 12 : undefined} />
      <button type="button" onClick={() => setVisible(!visible)} aria-label={visibilityLabel} title={visibilityLabel}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>;
}

// Chức năng: Thành phần giao diện (React Component AccountDialog) hiển thị thông tin tài khoản, đổi mật khẩu và gửi báo cáo lỗi qua email
function AccountDialog({ view, user, onClose, onChangeView, onPasswordChanged }) {
  const dialog = useRef(null);
  const headingId = useId();
  const noteId = useId();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [bugSubject, setBugSubject] = useState(() => `[Uyen Vu ERP] Báo cáo lỗi hệ thống - ${user.name}`);
  const [bugDescription, setBugDescription] = useState("");
  const [bugSentNotice, setBugSentNotice] = useState("");
  const isPassword = view === "password";
  const isBugReport = view === "bug-report";
  const fields = [
    ["Email công việc", user.email], ["Mã nhân viên", user.employeeCode],
    ["Phòng ban", user.department], ["Chức danh", user.title],
  ];

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const initialFocus = (isPassword || isBugReport) ? element.querySelector("input, textarea") : element.querySelector("h2");
    initialFocus?.focus();
    return () => element.close();
  }, [isPassword, isBugReport]);

  // Chức năng: Đóng (closeDialog - Dialog) phục vụ xử lý dữ liệu trong AccountMenu.jsx
  const closeDialog = () => {
    dialog.current.close();
    onClose();
  };

  // Chức năng: Xử lý nghiệp vụ (submit - submit) phục vụ xử lý dữ liệu trong AccountMenu.jsx
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const password = form.get("newPassword");
    if (password !== form.get("confirmPassword")) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setError("");
    setSaving(true);
    let issue;
    try {
      issue = await changePassword(user.id, form.get("currentPassword"), password);
    } catch {
      issue = "Không thể cập nhật mật khẩu. Vui lòng thử lại.";
    } finally {
      setSaving(false);
    }
    if (issue) setError(issue);
    else onPasswordChanged();
  };

  // Chức năng: Gửi báo cáo lỗi qua ứng dụng email tới dat.lt@uyenvu-international.com
  const submitBugReport = event => {
    event.preventDefault();
    const subjectText = bugSubject.trim() || `[Uyen Vu ERP] Báo cáo lỗi hệ thống - ${user.name}`;
    const bodyLines = [
      "Kính gửi bộ phận kỹ thuật Uyên Vũ International,",
      "",
      `Người báo lỗi: ${user.name} (${user.email})`,
      `Thời gian: ${new Date().toLocaleString("vi-VN")}`,
      "",
      "Mô tả chi tiết lỗi:",
      bugDescription.trim() || "( Đính kèm mô tả / ảnh chụp màn hình lỗi )",
    ];
    const mailtoUrl = `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
    if (typeof window !== "undefined") {
      window.location.href = mailtoUrl;
    }
    setBugSentNotice(`Đã mở trình gửi email tới ${BUG_REPORT_EMAIL}.`);
  };

  return <dialog ref={dialog} className="profile-dialog" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); if (!saving) closeDialog(); }}>
    <div className="profile-dialog-heading">
      <span className="profile-dialog-icon">
        {isPassword ? <KeyRound size={21} /> : isBugReport ? <Bug size={21} /> : <UserRound size={21} />}
      </span>
      <div>
        <h2 id={headingId} tabIndex={-1}>
          {t(isPassword ? "Đổi mật khẩu" : isBugReport ? "Báo cáo lỗi hệ thống" : "Thông tin tài khoản")}
        </h2>
        <p>
          {t(isPassword
            ? "Xác minh mật khẩu hiện tại để tiếp tục."
            : isBugReport
              ? `Báo cáo lỗi vui lòng email: ${BUG_REPORT_EMAIL}`
              : "Hồ sơ làm việc của bạn")}
        </p>
      </div>
      <button type="button" className="profile-dialog-close" aria-label={t("Đóng")} onClick={closeDialog} disabled={saving}><X size={20} /></button>
    </div>
    {isPassword ? <form className="profile-password-form" onSubmit={submit} onInput={() => setError("")} aria-describedby={noteId}>
      <fieldset disabled={saving}>
        <PasswordField name="currentPassword" label={t("Mật khẩu hiện tại")} autoComplete="current-password" />
        <PasswordField name="newPassword" label={t("Mật khẩu mới")} autoComplete="new-password" />
        <PasswordField name="confirmPassword" label={t("Xác nhận mật khẩu mới")} autoComplete="new-password" />
      </fieldset>
      <p id={noteId} className="profile-dialog-note">{t("Dùng từ 12 đến 128 ký tự. Đăng nhập lại sau khi lưu.")}</p>
      {error && <p className="profile-form-error" role="alert">{t(error)}</p>}
      <div className="profile-dialog-actions">
        <button type="button" className="profile-secondary" onClick={closeDialog} disabled={saving}>{t("Hủy")}</button>
        <button type="submit" className="profile-primary" disabled={saving}>{t(saving ? "Đang lưu…" : "Lưu mật khẩu")}</button>
      </div>
    </form> : isBugReport ? <form className="profile-password-form space-y-3" onSubmit={submitBugReport}>
      <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-slate-800">
        <strong>{t("Báo cáo lỗi vui lòng email:")}</strong>{" "}
        <a href={`mailto:${BUG_REPORT_EMAIL}`} className="font-bold text-sky-700 underline">{BUG_REPORT_EMAIL}</a>
      </div>
      <fieldset className="space-y-3">
        <label className="block text-xs font-semibold text-slate-700">
          {t("Tiêu đề báo lỗi")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            type="text"
            required
            maxLength={160}
            value={bugSubject}
            onChange={e => setBugSubject(e.target.value)}
            className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 bg-white"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          {t("Nội dung lỗi gặp phải")} <span className="required-mark" aria-hidden="true">*</span>
          <textarea
            required
            rows={4}
            maxLength={1000}
            value={bugDescription}
            onChange={e => setBugDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 bg-white"
          />
        </label>
      </fieldset>
      {bugSentNotice && <p className="text-xs font-semibold text-emerald-700" role="status">{t(bugSentNotice)}</p>}
      <div className="profile-dialog-actions">
        <button type="button" className="profile-secondary" onClick={closeDialog}>{t("Đóng")}</button>
        <button type="submit" className="profile-primary inline-flex items-center gap-1.5">
          <Mail size={15} aria-hidden="true" />
          <span>{t("Gửi email báo lỗi")}</span>
        </button>
      </div>
    </form> : <>
      <div className="profile-identity">
        <Avatar user={user} />
        <div><strong>{user.name}</strong><span>{t(user.roleLabel)}</span></div>
      </div>
      <dl className="profile-fields">
        {fields.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{t(value || "—")}</dd></div>)}
      </dl>
      <div className="profile-dialog-actions">
        <button type="button" className="profile-primary" onClick={onChangeView}><KeyRound size={16} />{t(" Đổi mật khẩu")}</button>
      </div>
    </>}
  </dialog>;
}

// Chức năng: Menu tài khoản góc phải: hiển thị thông tin người dùng, đổi mật khẩu, báo lỗi qua email dat.lt@uyenvu-international.com và đăng xuất
export default function AccountMenu({ user, onLogout, onPasswordChanged }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  // Chức năng: Xử lý nghiệp vụ (show - show) phục vụ xử lý dữ liệu trong AccountMenu.jsx
  const show = nextView => { setOpen(false); setView(nextView); };
  // Chức năng: Đóng (close - close) phục vụ xử lý dữ liệu trong AccountMenu.jsx
  const close = () => { setView(null); trigger.current?.focus(); };

  const mailtoReportHref = `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(`[Uyen Vu ERP] Báo cáo lỗi hệ thống - ${user.name} (${user.email})`)}`;

  return <div ref={root} className="profile-menu"
    onKeyDown={event => {
      if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
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
        <button type="button" onClick={() => show("account")}><UserRound size={18} />{t("Thông tin tài khoản")}</button>
        <button type="button" onClick={() => show("password")}><KeyRound size={18} />{t("Đổi mật khẩu")}</button>
      </div>
      <div className="profile-menu-bug-report px-3.5 py-2.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-700 space-y-1.5" role="region" aria-label={t("Báo cáo lỗi qua email")}>
        <div className="flex items-start gap-1.5">
          <Mail size={14} className="text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="m-0 leading-snug text-slate-800">
            {t("Báo cáo lỗi vui lòng email:")}{" "}
            <a
              href={mailtoReportHref}
              className="font-bold text-sky-700 hover:text-sky-900 underline break-all"
            >
              {BUG_REPORT_EMAIL}
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => show("bug-report")}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold cursor-pointer transition"
        >
          <Bug size={14} aria-hidden="true" />
          <span>{t("Báo lỗi nhanh qua Email")}</span>
        </button>
      </div>
      <div className="profile-menu-items profile-menu-footer">
        <button type="button" onClick={onLogout}><LogOut size={18} />{t("Đăng xuất")}</button>
      </div>
    </div>}
    {view && <AccountDialog key={view} view={view} user={user} onClose={close}
      onChangeView={() => setView("password")} onPasswordChanged={onPasswordChanged} />}
  </div>;
}
