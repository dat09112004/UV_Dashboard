import React, { useState } from 'react';
import { ArrowLeftRight, Info } from 'lucide-react';
import { t } from '../../locales/i18n.js';
import { formatMoney } from '../../utils/dashboardMetrics.js';

// Chức năng: Cửa sổ chọn kế toán nhận chuyển giao và nhập lý do chuyển giao hồ sơ công nợ (chỉ chuyển quyền sau khi bên nhận xác nhận)
export default function TransferDebtForm({
  row,
  debtType,
  currentUserId,
  accounts = [],
  onSubmit,
  onClose,
}) {
  const isAr = debtType === 'receivables';
  const candidates = (accounts || []).filter(
    u => u.role === 'Accountant' && u.status === 'active' && u.id !== currentUserId
  );
  const [toUserId, setToUserId] = useState(candidates[0]?.id || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Chức năng: Kiểm tra hợp lệ và gửi yêu cầu chuyển giao công việc sang kế toán khác
  const handleSubmit = async event => {
    event.preventDefault();
    if (!toUserId) {
      setError(t('Vui lòng chọn kế toán nhận chuyển giao.'));
      return;
    }
    if (!String(reason || '').trim()) {
      setError(t('Vui lòng nhập lý do chuyển giao công việc.'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(debtType, row, { toUserId, reason: reason.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4 p-1" onSubmit={handleSubmit} noValidate>
      {/* Khung tóm tắt thông tin chứng từ cần chuyển giao */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t('Số chứng từ')}
          </span>
          <strong className="text-sm font-bold text-slate-900 mt-0.5 block">
            {row?.docNo || '—'}
          </strong>
          {row?.poId && <span className="text-xs text-slate-500">{row.poId}</span>}
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t(isAr ? 'Khách hàng' : 'Nhà cung cấp')}
          </span>
          <strong className="text-sm font-semibold text-slate-800 mt-0.5 block">
            {t(row?.customerName || row?.supplierName || '—')}
          </strong>
        </div>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t(isAr ? 'Còn phải thu' : 'Còn phải trả')}
          </span>
          <strong className="text-sm font-bold text-[#102542] font-mono mt-0.5 block">
            {formatMoney(row?.remaining ?? row?.originalAmount ?? 0)}
          </strong>
        </div>
      </div>

      {/* Thông báo cơ chế xác nhận 2 chiều */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-3 text-xs leading-relaxed" role="status">
        <Info size={16} className="shrink-0 mt-0.5 text-[#1558C9]" />
        <div>
          <strong>{t('Cơ chế xác nhận 2 chiều')}:</strong>{' '}
          {t('Sau khi bạn gửi yêu cầu, hồ sơ vẫn thuộc bạn phụ trách cho đến khi kế toán được chọn bấm Xác nhận nhận chuyển giao.')}
        </div>
      </div>

      {/* Khu vực nhập liệu chính */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="transfer-recipient-select" className="block text-xs font-bold text-slate-700">
            {t('Chuyển cho kế toán nào')} <span className="text-rose-600">*</span>
          </label>
          <select
            id="transfer-recipient-select"
            value={toUserId}
            onChange={e => setToUserId(e.target.value)}
            disabled={submitting || candidates.length === 0}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#1558C9] focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {candidates.length === 0 && (
              <option value="">{t('Hiện chưa có tài khoản Kế toán khác đang hoạt động')}</option>
            )}
            {candidates.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name}{acc.title ? ` · ${acc.title}` : ''}
              </option>
            ))}
          </select>
          {candidates.length === 0 && (
            <p className="text-xs text-amber-700">
              {t('Cần có ít nhất 2 tài khoản Phòng Kế toán đang hoạt động mới có thể chuyển giao chéo.')}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="transfer-reason-input" className="block text-xs font-bold text-slate-700">
              {t('Lý do chuyển giao')} <span className="text-rose-600">*</span>
            </label>
            <span className="text-[11px] text-slate-400">{reason.length}/500</span>
          </div>
          <textarea
            id="transfer-reason-input"
            rows={4}
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={500}
            disabled={submitting}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#1558C9] focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          {t('Hủy')}
        </button>
        <button
          type="submit"
          disabled={submitting || candidates.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1558C9] text-white text-sm font-semibold hover:bg-[#102542] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <ArrowLeftRight size={15} />
          <span>{t(submitting ? 'Đang gửi…' : 'Gửi yêu cầu chuyển giao')}</span>
        </button>
      </div>
    </form>
  );
}
