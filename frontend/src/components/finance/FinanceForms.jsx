import { locale, phrase, t } from '../../locales/i18n.js';
import React, { useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { businessToday, financeCustomers, needsPayableSplit, OPENING_RECEIPT_ID, payableSplitVendors } from '../../utils/financeWorkflow.js';
import { dateInputValue } from '../../utils/business.js';
import { formatMoney, formatDate } from '../../utils/dashboardMetrics.js';
import { inspectQuantityInput } from '../../utils/workspaceUi.js';
import MoneyField from './MoneyField.jsx';

const ALLOCATION_GUIDE_KEY = 'uv-allocation-guide-dismissed-v1';
const readAllocationGuideDismissed = () => {
  try { return globalThis.localStorage?.getItem(ALLOCATION_GUIDE_KEY) === '1'; } catch { return false; }
};
const storeAllocationGuideDismissed = dismissed => {
  try {
    if (dismissed) globalThis.localStorage?.setItem(ALLOCATION_GUIDE_KEY, '1');
    else globalThis.localStorage?.removeItem?.(ALLOCATION_GUIDE_KEY);
  } catch { /* Ignore storage restrictions. */ }
};

const values = event => { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget)); };
function Footer({ onClose, label, disabled = false }) { return <div className="workflow-footer"><button type="button" onClick={onClose}>{t("Hủy")}</button><button className="primary" type="submit" disabled={disabled}>{t(label)}</button></div>; }

export function InvoiceForm({ finance, items, onAction, onClose }) {
  const [shippedInput, setShippedInput] = useState('');
  const qtyInspect = inspectQuantityInput(shippedInput, { allowZero: true });
  return <form className="workflow-form" onSubmit={event => {
    if (qtyInspect.error || qtyInspect.value === null) { event.preventDefault(); return; }
    onAction('invoice', { ...values(event), shippedQty: qtyInspect.normalized });
  }}>
    <div className="workflow-grid">
      <label>{t("Số hóa đơn")} <span className="required-mark" aria-hidden="true">*</span><input name="docNo" required maxLength={64} autoComplete="off" /></label>
      <label>{t("Khách hàng")} <span className="required-mark" aria-hidden="true">*</span><input name="customerName" required maxLength={200} list="invoice-customers" /><datalist id="invoice-customers">{[...new Set(finance.revenue.map(r => r.customerName))].map(name => <option key={name} value={name}>{t(name)}</option>)}</datalist></label>
      <label className="workflow-wide">{t("Dòng PO và mã hàng")} <span className="required-mark" aria-hidden="true">*</span><select name="rowId" required defaultValue=""><option value="" disabled>{t("Chọn PO và mã hàng")}</option>{items.map(item => <option key={item.rowId} value={item.rowId}>{item.poId} · {t(item.vendorItemNo)} · {t(item.vendorName)}</option>)}</select></label>
      <label>{t("Ngày ghi nhận")} <span className="required-mark" aria-hidden="true">*</span><input name="recordDate" type="date" required min={dateInputValue(finance.openingDate) || undefined} max={businessToday()} defaultValue={businessToday()} /></label>
      <label>{t("Hạn thanh toán")} <span className="required-mark" aria-hidden="true">*</span><input name="dueDate" type="date" required /></label>
      <label>{t("Số lượng trên chứng từ")} <span className="required-mark" aria-hidden="true">*</span>
        <input type="text" inputMode="decimal" required value={shippedInput} onChange={e => setShippedInput(e.target.value)} placeholder={t("Ví dụ: 1.000 hoặc 0")} />
        <input type="hidden" name="shippedQty" value={qtyInspect.normalized ?? ''} />
        {qtyInspect.error && <small className="field-hint is-error" role="alert">{t(qtyInspect.error)}</small>}
        {!qtyInspect.error && qtyInspect.warning && <small className="field-hint is-warning">{t(qtyInspect.warning)}</small>}
        {!qtyInspect.error && qtyInspect.value !== null && <small className="field-hint">{phrase('Hệ thống hiểu: §', qtyInspect.formatted)}</small>}
      </label>
      <MoneyField name="netRevenue" label={t("Doanh thu thuần")} />
      <label className="workflow-wide">{t("Căn cứ ghi nhận")} <span className="required-mark" aria-hidden="true">*</span><textarea name="basis" required maxLength={500} placeholder={t("Hóa đơn, biên bản nghiệm thu hoặc chứng từ đối chiếu")} /></label>
    </div><Footer onClose={onClose} label={t("Ghi nhận doanh thu và phải thu")} />
  </form>;
}

/**
 * Biểu mẫu Thêm mới / Cập nhật Công nợ phải thu (Accounts Receivable CRUD)
 */
export function ReceivableCrudForm({ mode = 'create', row = null, finance, items = [], onAction, onClose }) {
  const isEdit = mode === 'edit' && Boolean(row);
  const [selectedRowId, setSelectedRowId] = useState(() => (row?.poLineId ? String(row.poLineId) : ''));
  const matchedOrder = items.find(it => String(it.rowId) === String(selectedRowId));
  const customers = finance ? financeCustomers(finance) : [];
  const hasAllocated = Number(row?.allocatedPaid || 0) > 0;

  return <form className="workflow-form" onSubmit={event => {
    const formVals = values(event);
    const payload = {
      ...(isEdit ? { id: row.id } : {}),
      docNo: formVals.docNo,
      customerName: formVals.customerName,
      ...(formVals.rowId ? { rowId: Number(formVals.rowId) } : {
        poId: formVals.poId,
        sku: formVals.sku,
        category: formVals.category,
        vendorRef: formVals.vendorRef,
      }),
      dueDate: formVals.dueDate,
      originalAmount: formVals.originalAmount,
      ...(formVals.adjustment !== undefined && formVals.adjustment !== '' ? { adjustment: formVals.adjustment } : {}),
      commitmentNote: formVals.commitmentNote || '',
    };
    onAction(isEdit ? 'update-receivable' : 'create-receivable', payload);
  }}>
    <div className="workflow-grid">
      <label>{t("Số chứng từ phải thu")} <span className="required-mark" aria-hidden="true">*</span>
        <input name="docNo" required maxLength={64} defaultValue={row?.docNo || ''} readOnly={hasAllocated} autoComplete="off" />
      </label>
      <label>{t("Khách hàng")} <span className="required-mark" aria-hidden="true">*</span>
        <input name="customerName" required maxLength={200} defaultValue={row?.customerName || ''} readOnly={hasAllocated} list="ar-crud-customers" />
        <datalist id="ar-crud-customers">{customers.map(name => <option key={name} value={name}>{t(name)}</option>)}</datalist>
      </label>
      <label className="workflow-wide">{t("Liên kết dòng PO & mã hàng (tuỳ chọn)")}
        <select name="rowId" value={selectedRowId} onChange={e => setSelectedRowId(e.target.value)}>
          <option value="">{t("-- Nhập thủ công thông tin PO bên dưới hoặc chọn dòng PO --")}</option>
          {items.map(item => <option key={item.rowId} value={item.rowId}>{item.poId} · {t(item.vendorItemNo)} · {t(item.vendorName)}</option>)}
        </select>
      </label>
      {!selectedRowId && <>
        <label>{t("Mã PO tham chiếu")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="poId" required maxLength={64} defaultValue={row?.poId || matchedOrder?.poId || ''} placeholder="VD: UV-Intl-3500001" />
        </label>
        <label>{t("Mã hàng / Nội dung")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="sku" required maxLength={120} defaultValue={row?.sku || matchedOrder?.vendorItemNo || ''} placeholder={t("Tên hoặc mã mặt hàng")} />
        </label>
        <label>{t("Ngành hàng")}
          <input name="category" maxLength={120} defaultValue={row?.category || matchedOrder?.category || 'Garment'} />
        </label>
        <label>{t("Nhà cung cấp liên quan")}
          <input name="vendorRef" maxLength={200} defaultValue={row?.vendorRef || ''} placeholder="VD: 15090 - CONG TY TNHH..." />
        </label>
      </>}
      <label>{t("Hạn thanh toán")} <span className="required-mark" aria-hidden="true">*</span>
        <input name="dueDate" type="date" required defaultValue={dateInputValue(row?.dueDate) || businessToday()} />
      </label>
      <MoneyField name="originalAmount" label={t("Số tiền phải thu gốc")} defaultValue={row?.originalAmount || ''} />
      {isEdit && <MoneyField name="adjustment" label={t("Tiền điều chỉnh (bỏ trống nếu 0)")} defaultValue={row?.adjustment || ''} required={false} />}
      <label className="workflow-wide">{t("Ghi chú / Cam kết thanh toán")}
        <textarea name="commitmentNote" maxLength={500} defaultValue={row?.commitmentNote || ''} placeholder={t("Ghi chú tiến độ thu hồi công nợ hoặc cam kết của khách hàng")} />
      </label>
    </div>
    <Footer onClose={onClose} label={t(isEdit ? "Lưu cập nhật phải thu" : "Tạo khoản phải thu")} />
  </form>;
}

/**
 * Biểu mẫu Thêm mới / Cập nhật Công nợ phải trả (Accounts Payable CRUD)
 */
export function PayableCrudForm({ mode = 'create', row = null, items = [], onAction, onClose }) {
  const isEdit = mode === 'edit' && Boolean(row);
  const [selectedRowId, setSelectedRowId] = useState(() => (row?.poLineId ? String(row.poLineId) : ''));
  const hasPaid = Number(row?.allocatedPaid || 0) > 0;

  return <form className="workflow-form" onSubmit={event => {
    const formVals = values(event);
    const payload = {
      ...(isEdit ? { id: row.id } : {}),
      docNo: formVals.docNo,
      ...(formVals.rowId ? { rowId: Number(formVals.rowId) } : {
        poId: formVals.poId,
        vendorNo: formVals.vendorNo,
        supplierName: formVals.supplierName,
        sku: formVals.sku,
        category: formVals.category,
      }),
      dueDate: formVals.dueDate,
      originalAmount: formVals.originalAmount,
      ...(formVals.adjustment !== undefined && formVals.adjustment !== '' ? { adjustment: formVals.adjustment } : {}),
      requestNote: formVals.requestNote || '',
    };
    onAction(isEdit ? 'update-payable' : 'payable', payload);
  }}>
    <div className="workflow-grid">
      <label>{t("Số chứng từ phải trả")} <span className="required-mark" aria-hidden="true">*</span>
        <input name="docNo" required maxLength={64} defaultValue={row?.docNo || ''} readOnly={hasPaid} autoComplete="off" />
      </label>
      <label>{t("Hạn thanh toán")}
        <input name="dueDate" type="date" defaultValue={dateInputValue(row?.dueDate) || businessToday()} />
      </label>
      <label className="workflow-wide">{t("Liên kết dòng PO & nhà cung cấp")}
        <select name="rowId" value={selectedRowId} onChange={e => setSelectedRowId(e.target.value)}>
          <option value="">{t("-- Nhập thủ công nhà cung cấp bên dưới hoặc chọn từ danh sách PO --")}</option>
          {items.map(item => <option key={item.rowId} value={item.rowId}>{item.poId} · {t(item.vendorItemNo)} · {item.vendorNo} - {t(item.vendorName)}</option>)}
        </select>
      </label>
      {!selectedRowId && <>
        <label>{t("Mã nhà cung cấp")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="vendorNo" required maxLength={120} defaultValue={row?.vendorNo || ''} placeholder="VD: 15090" />
        </label>
        <label>{t("Tên nhà cung cấp")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="supplierName" required maxLength={255} defaultValue={row?.supplierName || ''} placeholder="VD: CONG TY TNHH..." />
        </label>
        <label>{t("Mã PO tham chiếu")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="poId" required maxLength={255} defaultValue={row?.poId || ''} placeholder="VD: UV-Intl-3500001" />
        </label>
        <label>{t("Mã hàng / Nội dung")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="sku" required maxLength={255} defaultValue={row?.sku || ''} placeholder={t("Tên hoặc mã mặt hàng")} />
        </label>
        <label className="workflow-wide">{t("Ngành hàng")}
          <input name="category" maxLength={120} defaultValue={row?.category || 'Garment'} />
        </label>
      </>}
      <MoneyField name="originalAmount" label={t("Số tiền phải trả gốc")} defaultValue={row?.originalAmount || ''} />
      {isEdit && <MoneyField name="adjustment" label={t("Tiền điều chỉnh (bỏ trống nếu 0)")} defaultValue={row?.adjustment || ''} required={false} />}
      <label className="workflow-wide">{t("Ghi chú hồ sơ công nợ phải trả")}
        <textarea name="requestNote" maxLength={500} defaultValue={row?.requestNote || ''} placeholder={t("Ghi chú đối chiếu công nợ nhà cung cấp hoặc điều khoản thanh toán")} />
      </label>
    </div>
    <Footer onClose={onClose} label={t(isEdit ? "Lưu cập nhật phải trả" : "Tạo khoản phải trả")} />
  </form>;
}

export function ReceiptWorkspace({ finance, onAction, onClose, initialDebtId }) {
  const targetDebt = finance.receivables.find(row => row.id === initialDebtId);
  const receipts = targetDebt ? finance.receipts.filter(row =>
    row.status === 'unidentified' || row.customerName === targetDebt.customerName) : finance.receipts;
  const [receiptId, setReceiptId] = useState(() => (targetDebt ? finance.receipts.find(r => r.customerName === targetDebt.customerName && r.amount > r.allocatedAmount) : finance.receipts.find(r => r.amount > r.allocatedAmount))?.id || 'new');
  const receipt = receipts.find(row => row.id === receiptId);
  const customers = targetDebt ? [targetDebt.customerName] : financeCustomers(finance);
  const [correcting, setCorrecting] = useState(false);
  const [hideAllocationGuide, setHideAllocationGuide] = useState(readAllocationGuideDismissed);
  const canCorrect = receipt?.status === 'identified' && receipt.allocatedAmount === 0 && !finance.allocations.some(row => row.receiptId === receipt.id);
  const debts = finance.receivables.filter(row => row.customerName === receipt?.customerName && (!initialDebtId || row.id === initialDebtId) && row.originalAmount + (row.adjustment || 0) - row.allocatedPaid > 0);
  const [debtId, setDebtId] = useState(initialDebtId || '');
  const selectedDebt = debts.find(row => row.id === debtId) || debts.find(row => row.id === initialDebtId) || debts[0];
  const limit = Math.min(receipt ? receipt.amount - receipt.allocatedAmount : 0, selectedDebt ? selectedDebt.originalAmount + (selectedDebt.adjustment || 0) - selectedDebt.allocatedPaid : 0);
  const receiptForm = async event => {
    const payload = values(event);
    if (targetDebt) payload.customerName = targetDebt.customerName;
    if (receipt) payload.id = receipt.id;
    const next = await onAction('receipt', payload, false);
    if (next && Array.isArray(next.receipts)) {
      const reference = String(payload.reference ?? '').trim().toLowerCase();
      const savedReceipt = next.receipts.find(row => row.id === receipt?.id ||
        String(row.reference ?? '').toLowerCase() === reference);
      setReceiptId(savedReceipt?.id ?? 'new');
      setDebtId('');
      setCorrecting(false);
    }
  };
  return <div className="workflow-form">
    {targetDebt && <p className="workflow-context"><strong>{targetDebt.docNo}</strong> · {t(targetDebt.customerName)}</p>}
    <div className="allocation-explainer">
      {hideAllocationGuide ? (
        <button type="button" className="row-detail-button guide-reopen-button" onClick={() => { setHideAllocationGuide(false); storeAllocationGuideDismissed(false); }}>
          <HelpCircle size={15} aria-hidden="true" />{t('Xem lại giải thích “Phân bổ”')}
        </button>
      ) : (
        <div className="page-guide-card" role="note">
          <div>
            <strong>{t('Giải thích nhanh “Phân bổ”:')}</strong>{' '}
            <span>{t('Tiền khách chuyển về tài khoản được giữ ở Khoản thu chưa phân bổ trước. “Phân bổ” là bước gắn số tiền đã thu đó vào đúng hóa đơn của khách hàng để trừ dư nợ phải thu và cộng vào thực thu của hóa đơn.')}</span>
          </div>
          <button type="button" className="row-detail-button" onClick={() => { setHideAllocationGuide(true); storeAllocationGuideDismissed(true); }}>{t('Đã hiểu')}</button>
        </div>
      )}
    </div>
    <ol className="workflow-steps" aria-label={t("Các bước xử lý tiền thu")}><li className="is-done">{t("Chọn khoản thu")}</li><li className={!receipt || receipt.status === 'unidentified' ? 'is-current' : 'is-done'}>{t("Xác định khách hàng")}</li><li className={receipt?.status === 'identified' ? 'is-current' : ''}>{t("Phân bổ hóa đơn")}</li></ol>
    <label>{t("Khoản thu")}<select value={receipt?.id || 'new'} onChange={event => { setReceiptId(event.target.value); setDebtId(''); setCorrecting(false); }}>
      {receipts.map(row => <option key={row.id} value={row.id}>{row.reference || row.id} · {t(row.customerName || 'Chưa xác định khách hàng')}{t(" · Còn ")}{formatMoney(row.amount - row.allocatedAmount)}</option>)}<option value="new">{t("Ghi nhận khoản thu mới")}</option>
    </select></label>
    {receipt && <p className="workflow-summary">{t("Đã nhận ")}{formatMoney(receipt.amount)}{t(" · Đã phân bổ ")}{formatMoney(receipt.allocatedAmount)}</p>}
    {canCorrect && !correcting && <button type="button" className="row-detail-button" onClick={() => setCorrecting(true)}>{t("Sửa đối soát")}</button>}
    {(!receipt || receipt.status === 'unidentified' || correcting) ? <form onSubmit={receiptForm} key={receiptId}>
      <h4>{t(correcting ? 'Sửa đối soát khoản thu' : receipt ? 'Đối soát khoản thu' : 'Ghi nhận tiền đã nhận')}</h4>
      <div className="workflow-grid">
        <label>{t("Khách hàng")}{Boolean(receipt) && <> <span className="required-mark" aria-hidden="true">*</span></>}{targetDebt ? <input value={t(targetDebt.customerName)} readOnly /> :
          <select name="customerName" required={Boolean(receipt)} defaultValue={customers.includes(receipt?.customerName) ? receipt.customerName : ''}>
            <option value="">{t(receipt ? 'Chọn khách hàng' : 'Chưa xác định khách hàng')}</option>
            {customers.map(name => <option key={name} value={name}>{t(name)}</option>)}
          </select>}</label>
        <label>{t("Tham chiếu ngân hàng hoặc phiếu thu")} <span className="required-mark" aria-hidden="true">*</span><input name="reference" required maxLength={120} defaultValue={receipt?.reference || ''} /></label>
        <label>{t("Ngày nhận tiền")} <span className="required-mark" aria-hidden="true">*</span><input name="date" type="date" required max={businessToday()} min={receipt?.id === OPENING_RECEIPT_ID ? undefined : dateInputValue(finance.openingDate) || undefined} defaultValue={dateInputValue(receipt?.date) || businessToday()} /></label>
        {!receipt && <MoneyField name="amount" label={t("Số tiền đã nhận")} />}
        {correcting && <label className="workflow-wide">{t("Lý do sửa đối soát")} <span className="required-mark" aria-hidden="true">*</span><textarea name="correctionReason" required maxLength={500} /></label>}
      </div><Footer onClose={onClose} label={t(correcting ? 'Lưu đối soát đã sửa' : receipt ? 'Xác nhận đối soát' : 'Lưu khoản thu')} />
    </form> : <form key={receiptId} onSubmit={event => {
      const payload = values(event);
      if (selectedDebt && limit > 0) onAction('allocate', { ...payload, debtId: selectedDebt.id, receiptId: receipt.id });
    }}>
      <h4>{t("Phân bổ vào hóa đơn cùng khách hàng")}</h4>
      <div className="workflow-grid">
        <label className="workflow-wide">{t("Hóa đơn phải thu")} <span className="required-mark" aria-hidden="true">*</span><select name="debtId" required value={selectedDebt?.id || ''} onChange={event => setDebtId(event.target.value)}>{!debts.length && <option value="">{t("Không có hóa đơn còn dư nợ cùng khách hàng")}</option>}{debts.map(row => <option key={row.id} value={row.id}>{row.docNo}{t(" · Còn ")}{formatMoney(row.originalAmount + (row.adjustment || 0) - row.allocatedPaid)}</option>)}</select></label>
        <MoneyField name="amount" label={t("Số tiền phân bổ")} max={limit} key={`${receiptId}-${selectedDebt?.id}-${limit}`} defaultValue={limit || ''} />
        <label>{t("Ngày phân bổ")} <span className="required-mark" aria-hidden="true">*</span><input name="date" type="date" required min={[dateInputValue(finance.openingDate), dateInputValue(receipt.date), dateInputValue(finance.revenue.find(row => row.docNo === selectedDebt?.docNo)?.recordDate)].filter(Boolean).sort().at(-1)} max={businessToday()} defaultValue={businessToday()} /></label>
      </div><p className="workflow-summary">{t("Tối đa được phân bổ ")}{formatMoney(limit)}{t(". Khoản thu chưa phân bổ không cộng vào thực thu của hóa đơn.")}</p><Footer onClose={onClose} label={t("Xác nhận phân bổ")} disabled={!selectedDebt || limit <= 0} />
    </form>}
    <FinanceHistory entries={finance.audit.filter(row => row.type.startsWith('RECEIPT'))} />
  </div>;
}

export function PayableForm({ type, row, onAction, onClose, actorId, actorRole }) {
  const remaining = row.originalAmount + (row.adjustment || 0) - row.allocatedPaid;
  const action = type === 'SUBMIT_AP' ? 'submit' : type === 'REVIEW_AP' ? 'review' : 'pay';
  const reviewDecisionRef = useRef(null);
  const submitModeRef = useRef(null);
  const [decisionError, setDecisionError] = useState('');
  const isCeo = actorRole === 'CEO' || (!actorRole && actorId === 'user-ceo');
  const selfApprovalBlocked = Boolean(row.requestedBy && row.requestedBy === actorId && !isCeo);
  return <form className="workflow-form" onSubmit={event => {
    const submitterVal = event.nativeEvent?.submitter?.value;
    if (action === 'review') {
      const explicitDecision = submitterVal ?? reviewDecisionRef.current;
      reviewDecisionRef.current = null;
      // QA07 Fix: Bắt buộc lựa chọn tường minh 'approve' hoặc 'return'; chặn implicit submit không rõ nút bấm
      if (explicitDecision !== 'approve' && explicitDecision !== 'return') {
        event.preventDefault();
        setDecisionError('Vui lòng bấm rõ nút "Duyệt đề nghị" hoặc "Yêu cầu bổ sung".');
        return;
      }
      const approve = explicitDecision === 'approve';
      if (approve && (needsPayableSplit(row) || selfApprovalBlocked)) {
        event.preventDefault();
        return;
      }
      setDecisionError('');
      onAction(action, { ...values(event), id: row.id, approve });
      return;
    }
    const explicitMode = submitterVal ?? submitModeRef.current;
    submitModeRef.current = null;
    const approveDirectly = action === 'submit' && isCeo && explicitMode === 'approve_direct';
    onAction(action, { ...values(event), id: row.id, ...(approveDirectly ? { approveDirectly: true } : {}) });
  }}>
    <p className="workflow-summary"><strong>{row.docNo} · {t(row.supplierName)}</strong><br />{t("Còn phải trả ")}{formatMoney(remaining)} · {t(row.approvalState)}</p>
    {needsPayableSplit(row) && <p className="workflow-callout">{t("Kế toán cần tách và đối soát chứng từ trước khi CEO duyệt chi.")}</p>}
    {action === 'submit' && <div className="workflow-grid"><MoneyField name="amount" label={t("Số tiền đề nghị")} max={remaining} defaultValue={remaining} /><label>{t("Hạn thanh toán đề nghị")} <span className="required-mark" aria-hidden="true">*</span><input name="dueDate" type="date" required defaultValue={dateInputValue(row.dueDate)} /></label><label className="workflow-wide">{t("Nội dung đề nghị")} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={500} /></label></div>}
    {action === 'review' && <><p className="review-amount">{t("Đề nghị ")}<strong>{formatMoney(row.requestAmount)}</strong>{t(" · Hạn đề nghị ")}{formatDate(row.requestedDueDate || row.dueDate)}</p><p>{t(row.requestNote || 'Hồ sơ chờ duyệt được chuyển từ dữ liệu mở đầu.')}</p>{selfApprovalBlocked && <p className="workflow-callout">{t('Người lập đề nghị không được tự duyệt.')}</p>}<label>{t("Ý kiến xử lý")} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={500} onChange={() => { if (decisionError) setDecisionError(''); }} /></label>{decisionError && <small className="field-hint is-error" role="alert">{t(decisionError)}</small>}<div className="workflow-footer"><button type="button" onClick={onClose}>{t("Hủy")}</button><button type="submit" name="reviewDecision" value="return" onClick={() => { reviewDecisionRef.current = 'return'; }}>{t("Yêu cầu bổ sung")}</button><button className="primary" type="submit" name="reviewDecision" value="approve" onClick={() => { reviewDecisionRef.current = 'approve'; }} disabled={needsPayableSplit(row) || selfApprovalBlocked}>{t("Duyệt đề nghị")}</button></div></>}
    {action === 'pay' && <div className="workflow-grid"><MoneyField name="amount" label={t("Số tiền đã chi")} max={Math.min(remaining, row.approvedRemaining)} /><label>{t("Ngày chi")} <span className="required-mark" aria-hidden="true">*</span><input name="date" type="date" required min={dateInputValue(row.reviewedDate) || undefined} max={businessToday()} defaultValue={businessToday()} /></label><label className="workflow-wide">{t("Tham chiếu ngân hàng hoặc phiếu chi")} <span className="required-mark" aria-hidden="true">*</span><input name="reference" required maxLength={120} /></label><p className="workflow-summary workflow-wide">{t("Hạn mức được duyệt còn lại ")}{formatMoney(row.approvedRemaining)}{t(". Ghi nhận sau khi có chứng từ chi tiền.")}</p></div>}
    {action === 'submit' && isCeo && <div className="workflow-footer"><button type="button" onClick={onClose}>{t("Hủy")}</button><button type="submit" name="submitMode" value="submit" onClick={() => { submitModeRef.current = 'submit'; }}>{t("Trình CEO duyệt")}</button><button className="primary" type="submit" name="submitMode" value="approve_direct" onClick={() => { submitModeRef.current = 'approve_direct'; }} disabled={needsPayableSplit(row)}>{t("Duyệt đề nghị")}</button></div>}
    {action === 'submit' && !isCeo && <Footer onClose={onClose} label={t("Trình CEO duyệt")} />}
    {action === 'pay' && <Footer onClose={onClose} label={t("Ghi nhận khoản đã chi")} />}
  </form>;
}

export function SplitPayableForm({ row, items, onAction, onClose }) {
  const vendors = payableSplitVendors(row, items);
  const missing = vendors.some(vendor => !vendor.lines.length);
  return <form className="workflow-form" onSubmit={event => {
    const input = values(event);
    const parts = Object.fromEntries(vendors.map(({ code }) => [code, {
      docNo: input[`docNo-${code}`], dueDate: input[`dueDate-${code}`], originalAmount: input[`original-${code}`],
      adjustment: input[`adjustment-${code}`], allocatedPaid: input[`paid-${code}`],
    }]));
    onAction('split', { id: row.id, parts, note: input.note });
  }}>
    <p className="workflow-summary"><strong>{row.docNo}</strong><br />{t("Tiền gốc ")}{formatMoney(row.originalAmount)}{t(" · Điều chỉnh ")}{formatMoney(row.adjustment)}{t(" · Đã trả ")}{formatMoney(row.allocatedPaid)}</p>
    <p>{t("Nhập số liệu đã đối chiếu cho từng nhà cung cấp. Chứng từ mới sẽ được trình duyệt riêng.")}</p>
    {missing ? <p className="workflow-callout">{t("Thiếu dữ liệu PO để xác định nhà cung cấp cho chứng từ này.")}</p> : vendors.map(({ code, name, lines }) => <fieldset key={code}>
      <legend className="font-semibold">{code} · {t(name)}</legend>
      <p className="mb-2 text-xs text-slate-600">{[...new Set(lines.map(line => line.poId))].join(' · ')}</p>
      <div className="workflow-grid">
        <label>{t("Số chứng từ riêng")} <span className="required-mark" aria-hidden="true">*</span><input name={`docNo-${code}`} required maxLength={64} /></label>
        <label>{t("Hạn thanh toán đã xác minh")}<input name={`dueDate-${code}`} type="date" /></label>
        <MoneyField name={`original-${code}`} label={t("Số tiền gốc")} max={row.originalAmount} />
        {row.adjustment > 0 && <MoneyField name={`adjustment-${code}`} label={t("Tiền điều chỉnh (bỏ trống nếu 0)")} max={row.adjustment} required={false} />}
        {row.allocatedPaid > 0 && <MoneyField name={`paid-${code}`} label={t("Số đã trả (bỏ trống nếu 0)")} max={row.allocatedPaid} required={false} />}
      </div>
    </fieldset>)}
    <label>{t("Căn cứ tách và đối soát")} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={500} /></label>
    <Footer onClose={onClose} label={t("Lưu chứng từ đã tách")} disabled={missing} />
  </form>;
}

export function FinanceHistory({ entries }) {
  if (!entries.length) return null;
  return <details className="workflow-history"><summary>{t("Lịch sử xử lý gần đây")}</summary><ul>{entries.slice(-12).reverse().map(row => <li key={row.id}><strong>{t(({
    INVOICE_RECORDED: 'Ghi nhận doanh thu',
    RECEIVABLE_CREATED: 'Tạo công nợ phải thu',
    RECEIVABLE_UPDATED: 'Cập nhật phải thu',
    RECEIVABLE_DELETED: 'Xóa phải thu',
    RECEIPT_IDENTIFIED: 'Đối soát khoản thu',
    RECEIPT_CORRECTED: 'Sửa đối soát khoản thu',
    RECEIPT_RECORDED: 'Ghi nhận khoản thu',
    RECEIPT_ALLOCATED: 'Phân bổ tiền thu',
    PAYABLE_RECORDED: 'Ghi nhận phải trả',
    PAYABLE_UPDATED: 'Cập nhật phải trả',
    PAYABLE_DELETED: 'Xóa phải trả',
    PAYABLE_SUBMITTED: 'Trình đề nghị chi',
    PAYABLE_APPROVED: 'Duyệt chi',
    PAYABLE_RETURNED: 'Yêu cầu bổ sung',
    PAYABLE_PAID: 'Ghi nhận đã chi',
    PAYABLE_SPLIT: 'Tách chứng từ gộp',
  })[row.type] || row.type)}</strong> · {row.reference} · {row.actorName} · {new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.occurredAt))}<br />{t(row.detail)}{row.amount !== null && ` · ${formatMoney(row.amount)}`}</li>)}</ul></details>;
}
