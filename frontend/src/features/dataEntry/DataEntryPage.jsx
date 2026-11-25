import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Save, Trash2, Upload, FilePlus2, RefreshCw, UserCheck, Table2, Truck, PackageCheck } from 'lucide-react';
import { locale, phrase, t } from '../../locales/i18n.js';
import { useDebouncedValue } from '../../hooks/useDebounce.js';
import { useProgressivePagination } from '../../hooks/useProgressivePagination.js';
import ProgressivePaginationBar from '../../components/common/ProgressivePaginationBar.jsx';
import FormWindowDialog from '../../components/common/FormWindowDialog.jsx';
import { canActorEditOrder } from '../../utils/ownershipAccess.js';
import { formatMoneyInputHint } from '../../components/finance/MoneyField.jsx';
import { createCustomerDeliveryApi } from '../../services/api.js';
import { businessToday, dateInputValue, parseBusinessDate } from '../../utils/business.js';
import { formatQuantity } from '../../utils/orderFulfillment.js';
import { computeProjectedProgress } from '../../utils/workspaceUi.js';
import { ENTRY_SHEETS, canReadSheet, canWriteSheet, visibleSheetColumns } from './schema.js';
import {
  inspectEntryCell,
  MAX_ENTRY_ROWS,
  readEntryRows,
  REQUIRED_BY_SHEET,
  validateDraftRowsFrontend,
} from './service.js';
import { clipboardRows, entryDraftIsTemporary, readEntryDraft, storeEntryDraft } from './drafts.js';
import { downloadEntryWorkbook, entrySheetName, openEntryWorkbook, readEntrySheet } from './workbook.js';

// Chức năng: Xử lý nghiệp vụ (blankRow - Row) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
const blankRow = () => ({ values: {} });
// Chức năng: Kiểm tra sự tồn tại của (hasValues - Values) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
const hasValues = row => Object.values(row.values).some(value => String(value ?? '').trim());

// Chức năng: Chuẩn hóa hiển thị thông báo lỗi dòng để không lặp "Dòng 2 · Dòng 2:"
function formatIssueLineMessage(issue) {
  const rawMsg = String(issue?.message ?? '').trim();
  const translated = t(rawMsg);
  if (/^(Dòng|Row)\s+\d+\s*[:·]/i.test(translated)) {
    return translated;
  }
  return issue?.line ? `${phrase('Dòng §', issue.line)} · ${translated}` : translated;
}

// Chức năng: Thành phần giao diện (React Component CellFeedback) hiển thị và xử lý tương tác người dùng trong DataEntryPage.jsx
function CellFeedback({ columnKey, value, rowValues, context }) {
  const feedback = inspectEntryCell(columnKey, value, rowValues, context);
  if (!feedback.error && !feedback.warning) return null;
  if (feedback.error) return <small className="field-hint is-error" role="alert">{t(feedback.error)}</small>;
  if (feedback.warning) return <small className="field-hint is-warning">{t(feedback.warning)}</small>;
  return null;
}

// Chức năng: Thành phần giao diện (React Component QuickCreateOrderForm) hiển thị và xử lý tương tác người dùng trong DataEntryPage.jsx
function QuickCreateOrderForm({ actor, existingItems, pending, onSaveDirect, onStageDraft, onClose }) {
  const today = businessToday();
  const categories = [...new Set(existingItems.map(item => item.category).filter(Boolean))];
  const isSaleCreator = actor?.role === 'Sale';
  const [values, setValues] = useState({
    poId: '', vendorItemNo: '', vendorNo: '', vendorName: '', category: categories[0] || '',
    countryOfOrigin: '', releasedPoDate: today, unit: 'pcs', orderedQty: '', nhap: '', unitPriceVnd: '',
    expectedReceiptDate: '', etaDate: '', changeReason: 'Tạo đơn hàng mới',
  });
  const [touched, setTouched] = useState({});
  const qtyFeedback = inspectEntryCell('orderedQty', values.orderedQty, values);
  const priceFeedback = inspectEntryCell('unitPriceVnd', values.unitPriceVnd, values);
  const releasedParsed = parseBusinessDate(values.releasedPoDate);
  const todayParsed = parseBusinessDate(today);
  const receiptParsed = parseBusinessDate(values.expectedReceiptDate);
  const etaParsed = parseBusinessDate(values.etaDate);

  const normalizedPoId = values.poId.trim().toLowerCase();
  const isDuplicatePoId = Boolean(
    normalizedPoId &&
    (existingItems || []).some(item => String(item.poId ?? '').trim().toLowerCase() === normalizedPoId)
  );

  const errors = {
    poId: !values.poId.trim()
      ? 'Cần nhập mã PO.'
      : isDuplicatePoId
        ? `Mã PO "${values.poId.trim()}" đã tồn tại trong dữ liệu hiện có. Không được trùng Mã PO.`
        : '',
    vendorItemNo: !values.vendorItemNo.trim() ? 'Cần nhập mã hàng hoặc tên hàng.' : '',
    vendorNo: !values.vendorNo.trim() ? 'Cần nhập mã nhà cung cấp.' : '',
    vendorName: !values.vendorName.trim() ? 'Cần nhập tên nhà cung cấp.' : '',
    category: !values.category.trim() ? 'Cần nhập ngành hàng.' : '',
    releasedPoDate: !releasedParsed || (todayParsed && releasedParsed > todayParsed) ? 'Ngày phát hành PO phải hợp lệ và không sau ngày hiện tại.' : '',
    unit: !values.unit.trim() ? 'Cần nhập đơn vị tính.' : values.unit.trim().length > 24 ? 'Đơn vị tính tối đa 24 ký tự.' : '',
    orderedQty: !String(values.orderedQty).trim() ? 'Cần nhập số lượng đặt.' : qtyFeedback.error,
    unitPriceVnd: priceFeedback.error,
    expectedReceiptDate: receiptParsed && releasedParsed && receiptParsed < releasedParsed
      ? 'Ngày về dự kiến không được trước ngày phát hành PO.'
      : receiptParsed && etaParsed && receiptParsed > etaParsed
        ? 'Ngày dự kiến về kho không được sau ETA giao khách.' : '',
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const projectedTotalVnd = qtyFeedback.value !== null && priceFeedback.value !== null
    ? Math.round(qtyFeedback.value * priceFeedback.value)
    : null;

  // Chức năng: Xử lý nghiệp vụ (submitForm - Form) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const submitForm = (event, mode) => {
    event.preventDefault();
    setTouched({ poId: true, vendorItemNo: true, vendorNo: true, vendorName: true, category: true, releasedPoDate: true, unit: true, orderedQty: true, unitPriceVnd: true, expectedReceiptDate: true });
    if (hasErrors) return;
    const enrichedPayload = {
      ...values,
      createdById: actor?.id || null,
      createdByName: actor?.name || 'Hệ thống',
      createdByRole: actor?.role || 'CEO',
      createdByEmail: actor?.email || '',
      assignedSaleId: isSaleCreator ? (actor?.id || null) : null,
      assignedSaleName: isSaleCreator ? (actor?.name || null) : null,
      ownerType: isSaleCreator ? 'sale_self_owned' : 'executive_created',
    };
    if (mode === 'draft') onStageDraft(enrichedPayload);
    else onSaveDirect(enrichedPayload);
  };

  // Chức năng: Xử lý nghiệp vụ (showErr - Err) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const showErr = key => (touched[key] || (key === 'poId' && isDuplicatePoId)) && errors[key];

  return <form className="workflow-form entry-quick-form" onSubmit={event => submitForm(event, 'save')}>
    <div
      className={`flex flex-wrap items-center gap-2 px-3 py-2 mb-2 rounded-lg border text-xs ${
        isSaleCreator
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : 'bg-sky-50 border-sky-200 text-sky-900'
      }`}
      data-order-creator-role={actor?.role || 'CEO'}
      role="status"
    >
      <UserCheck size={15} className="shrink-0" />
      {isSaleCreator ? (
        <span>
          <strong>{t('Người Sale tạo & tự động nhận đơn hàng:')}</strong>{' '}
          <b>{actor?.name}</b> ({t('Phòng Sale')})
        </span>
      ) : (
        <span>
          <strong>{t('Người tạo đơn hàng (Ban Giám đốc):')}</strong>{' '}
          <b>{actor?.role === 'Admin' ? t('Ban Giám đốc') : actor?.name}</b>
        </span>
      )}
    </div>
    <fieldset disabled={pending} className="item-form-grid">
      <label>{t('Mã PO')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.poId} onChange={e => { setValues(prev => ({ ...prev, poId: e.target.value })); setTouched(p => ({ ...p, poId: true })); }} onBlur={() => setTouched(p => ({ ...p, poId: true }))} />
        {showErr('poId') && <small className="field-hint is-error" role="alert">{t(errors.poId)}</small>}
      </label>
      <label>{t('Mã hàng')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.vendorItemNo} onChange={e => { setValues(prev => ({ ...prev, vendorItemNo: e.target.value })); setTouched(p => ({ ...p, vendorItemNo: true })); }} onBlur={() => setTouched(p => ({ ...p, vendorItemNo: true }))} />
        {showErr('vendorItemNo') && <small className="field-hint is-error" role="alert">{t(errors.vendorItemNo)}</small>}
      </label>
      <label>{t('Mã nhà cung cấp')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.vendorNo} onChange={e => { setValues(prev => ({ ...prev, vendorNo: e.target.value })); setTouched(p => ({ ...p, vendorNo: true })); }} onBlur={() => setTouched(p => ({ ...p, vendorNo: true }))} />
        {showErr('vendorNo') && <small className="field-hint is-error" role="alert">{t(errors.vendorNo)}</small>}
      </label>
      <label>{t('Nhà cung cấp')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.vendorName} onChange={e => { setValues(prev => ({ ...prev, vendorName: e.target.value })); setTouched(p => ({ ...p, vendorName: true })); }} onBlur={() => setTouched(p => ({ ...p, vendorName: true }))} />
        {showErr('vendorName') && <small className="field-hint is-error" role="alert">{t(errors.vendorName)}</small>}
      </label>
      <label>{t('Ngành hàng')} <span className="required-mark" aria-hidden="true">*</span>
        <input list="entry-po-categories" value={values.category} onChange={e => { setValues(prev => ({ ...prev, category: e.target.value })); setTouched(p => ({ ...p, category: true })); }} onBlur={() => setTouched(p => ({ ...p, category: true }))} />
        <datalist id="entry-po-categories">{categories.map(cat => <option key={cat} value={cat} />)}</datalist>
        {showErr('category') && <small className="field-hint is-error" role="alert">{t(errors.category)}</small>}
      </label>
      <label>{t('Ngày phát hành PO')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="date" max={today} value={values.releasedPoDate} onChange={e => { setValues(prev => ({ ...prev, releasedPoDate: e.target.value })); setTouched(p => ({ ...p, releasedPoDate: true })); }} onBlur={() => setTouched(p => ({ ...p, releasedPoDate: true }))} />
        {showErr('releasedPoDate') && <small className="field-hint is-error" role="alert">{t(errors.releasedPoDate)}</small>}
      </label>
      <label>{t('SL đặt')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="text" inputMode="decimal" value={values.orderedQty} onChange={e => { setValues(prev => ({ ...prev, orderedQty: e.target.value })); setTouched(p => ({ ...p, orderedQty: true })); }} onBlur={() => setTouched(p => ({ ...p, orderedQty: true }))} />
        {showErr('orderedQty') && <small className="field-hint is-error" role="alert">{t(errors.orderedQty)}</small>}
        {!errors.orderedQty && qtyFeedback.warning && <small className="field-hint is-warning">{t(qtyFeedback.warning)}</small>}
      </label>
      <label>{t('Đơn vị')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.unit} maxLength={24} onChange={e => { setValues(prev => ({ ...prev, unit: e.target.value })); setTouched(p => ({ ...p, unit: true })); }} onBlur={() => setTouched(p => ({ ...p, unit: true }))} />
        {showErr('unit') && <small className="field-hint is-error" role="alert">{t(errors.unit)}</small>}
      </label>
      <label>{t('Đơn giá nhập kho (VND)')}
        <input type="text" inputMode="numeric" value={values.unitPriceVnd} onChange={e => { setValues(prev => ({ ...prev, unitPriceVnd: e.target.value })); setTouched(p => ({ ...p, unitPriceVnd: true })); }} onBlur={() => setTouched(p => ({ ...p, unitPriceVnd: true }))} />
        {!showErr('unitPriceVnd') && formatMoneyInputHint(values.unitPriceVnd) && <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoneyInputHint(values.unitPriceVnd)}</small>}
        {showErr('unitPriceVnd') && <small className="field-hint is-error" role="alert">{t(errors.unitPriceVnd)}</small>}
      </label>
      <label>{t('SL đã nhập kho')}
        <input type="text" inputMode="decimal" value={values.nhap} onChange={e => setValues(prev => ({ ...prev, nhap: e.target.value }))} />
        <small className="field-hint">{t('Khi nhập kho > 0, hệ thống tự động tạo Công nợ phải trả cho Nhà cung cấp.')}</small>
      </label>
      <label>{t('Xuất xứ')}
        <input value={values.countryOfOrigin} onChange={e => setValues(prev => ({ ...prev, countryOfOrigin: e.target.value }))} />
      </label>
      <label>{t('Dự kiến về kho')}
        <input type="date" value={values.expectedReceiptDate} onChange={e => { setValues(prev => ({ ...prev, expectedReceiptDate: e.target.value })); setTouched(p => ({ ...p, expectedReceiptDate: true })); }} onBlur={() => setTouched(p => ({ ...p, expectedReceiptDate: true }))} />
        {showErr('expectedReceiptDate') && <small className="field-hint is-error" role="alert">{t(errors.expectedReceiptDate)}</small>}
      </label>
      <label>{t('Thời gian dự kiến đến (ETA)')}
        <input type="date" value={values.etaDate} onChange={e => setValues(prev => ({ ...prev, etaDate: e.target.value }))} />
      </label>
    </fieldset>
    {projectedTotalVnd !== null && <div className="projected-total-banner" role="status">
      <span>{t('Giá trị PO:')} <b>{new Intl.NumberFormat(locale()).format(projectedTotalVnd)} VND</b></span>
    </div>}
    <div className="workflow-footer">
      <button type="button" onClick={onClose} disabled={pending}>{t('Hủy')}</button>
      <button type="button" className="row-detail-button" disabled={pending} onClick={e => submitForm(e, 'draft')}>{t('Đưa vào bản nháp')}</button>
      <button type="submit" className="primary" disabled={pending}>{t('Lưu đơn hàng')}</button>
    </div>
  </form>;
}

// Chức năng: Thành phần giao diện (React Component QuickUpdateProgressForm) hiển thị và xử lý tương tác người dùng trong DataEntryPage.jsx
function QuickUpdateProgressForm({ existingItems, initialOrder, pending, onSaveDirect, onStageDraft, onClose }) {
  const [selectedRowId, setSelectedRowId] = useState(() => String(initialOrder?.rowId || existingItems[0]?.rowId || ''));
  const target = existingItems.find(item => String(item.rowId) === String(selectedRowId)) || existingItems[0];
  const [updateTab, setUpdateTab] = useState('inbound');
  const [progressMode, setProgressMode] = useState('today');
  const [nhapInput, setNhapInput] = useState('');
  const [deliveredInput, setDeliveredInput] = useState('');
  const [customerName, setCustomerName] = useState(() => target?.customerName || '');
  const [unitPriceVnd, setUnitPriceVnd] = useState(() => target?.unitPriceVnd != null ? String(target.unitPriceVnd) : '');
  const [saleUnitPriceVnd, setSaleUnitPriceVnd] = useState(() => target?.saleUnitPriceVnd != null ? String(target.saleUnitPriceVnd) : '');
  const [expectedReceiptDate, setExpectedReceiptDate] = useState(() => dateInputValue(target?.expectedReceiptDate));
  const [actualDeliveryDate, setActualDeliveryDate] = useState(() => dateInputValue(target?.actualDeliveryDate));
  const [shipDateEtd, setShipDateEtd] = useState(() => dateInputValue(target?.shipDateEtd));
  const [etaDate, setEtaDate] = useState(() => dateInputValue(target?.etaDate));
  const [onProcessPct, setOnProcessPct] = useState(() => target?.onProcessPct != null ? String(target.onProcessPct) : '');
  const [packagingPct, setPackagingPct] = useState(() => target?.packagingPct != null ? String(target.packagingPct) : '');
  const [changeReason, setChangeReason] = useState('');
  const [touched, setTouched] = useState({});

  // Chức năng: Xử lý nghiệp vụ (selectTarget - Target) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const selectTarget = nextRowId => {
    setSelectedRowId(nextRowId);
    const nextOrder = existingItems.find(item => String(item.rowId) === String(nextRowId));
    if (!nextOrder) return;
    setNhapInput(progressMode === 'cumulative' && nextOrder.nhap != null ? String(nextOrder.nhap) : '');
    setDeliveredInput(progressMode === 'cumulative' && nextOrder.deliveredQty != null ? String(nextOrder.deliveredQty) : '');
    setCustomerName(nextOrder.customerName || '');
    setUnitPriceVnd(nextOrder.unitPriceVnd != null ? String(nextOrder.unitPriceVnd) : '');
    setSaleUnitPriceVnd(nextOrder.saleUnitPriceVnd != null ? String(nextOrder.saleUnitPriceVnd) : '');
    setExpectedReceiptDate(dateInputValue(nextOrder.expectedReceiptDate));
    setActualDeliveryDate(dateInputValue(nextOrder.actualDeliveryDate));
    setShipDateEtd(dateInputValue(nextOrder.shipDateEtd));
    setEtaDate(dateInputValue(nextOrder.etaDate));
    setOnProcessPct(nextOrder.onProcessPct != null ? String(nextOrder.onProcessPct) : '');
    setPackagingPct(nextOrder.packagingPct != null ? String(nextOrder.packagingPct) : '');
  };

  // Chức năng: Xử lý nghiệp vụ (switchMode - Mode) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const switchMode = nextMode => {
    if (nextMode === progressMode) return;
    setProgressMode(nextMode);
    if (nextMode === 'today') {
      setNhapInput('');
      setDeliveredInput('');
    } else if (target) {
      setNhapInput(target.nhap != null ? String(target.nhap) : '');
      setDeliveredInput(target.deliveredQty != null ? String(target.deliveredQty) : '');
    }
  };

  const projection = computeProjectedProgress(target, { mode: progressMode, nhapInput, deliveredInput });
  const deliveryError = (projection.projectedDelivered ?? 0) > 0 && !actualDeliveryDate
    ? 'Cần ngày giao xác nhận khi có số lượng đã giao.' : '';
  const reasonError = !changeReason.trim() ? 'Cần nhập lý do cập nhật.' : '';
  const hasErrors = Boolean(!target || projection.nhapInspect.error || projection.deliveredInspect.error || deliveryError || reasonError);

  // Chức năng: Xây dựng (buildPayload - Payload) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const buildPayload = () => ({
    rowId: String(target.rowId),
    poId: target.poId,
    customerName: customerName.trim(),
    unitPriceVnd,
    saleUnitPriceVnd,
    orderedQty: target.orderedQty != null ? String(target.orderedQty) : '',
    unit: target.unit || '',
    nhap: projection.projectedReceived != null ? String(projection.projectedReceived) : '',
    deliveredQty: projection.projectedDelivered != null ? String(projection.projectedDelivered) : '',
    onProcessPct,
    packagingPct,
    expectedReceiptDate,
    shipDateEtd,
    etaDate,
    actualDeliveryDate,
    changeReason: changeReason.trim(),
  });

  // Chức năng: Xử lý nghiệp vụ (submitForm - Form) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const submitForm = (event, mode) => {
    event.preventDefault();
    setTouched({ nhap: true, delivered: true, actualDeliveryDate: true, changeReason: true });
    if (hasErrors) return;
    const payload = buildPayload();
    if (mode === 'draft') onStageDraft(payload, target.trackingVersion ?? null);
    else onSaveDirect(payload, target.trackingVersion ?? null);
  };

  return <form className="workflow-form entry-quick-form" onSubmit={event => submitForm(event, 'save')}>
    <div className="entry-quick-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="order-view-tabs" role="tablist" aria-label={t('Chọn biểu mẫu cập nhật')}>
        <button type="button" role="tab" aria-selected={updateTab === 'inbound'} aria-pressed={updateTab === 'inbound'} onClick={() => setUpdateTab('inbound')}>
          <PackageCheck size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />{t('1. Nhập hàng (Về kho)')}
        </button>
        <button type="button" role="tab" aria-selected={updateTab === 'outbound'} aria-pressed={updateTab === 'outbound'} onClick={() => setUpdateTab('outbound')}>
          <Truck size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />{t('2. Giao hàng đi (Cho khách)')}
        </button>
      </div>
      <div className="segmented-control progress-mode-switch" role="group" aria-label={t('Cách nhập số lượng tiến độ')}>
        <button type="button" aria-pressed={progressMode === 'today'} onClick={() => switchMode('today')}>{t('Nhập thêm hôm nay')}</button>
        <button type="button" aria-pressed={progressMode === 'cumulative'} onClick={() => switchMode('cumulative')}>{t('Cập nhật tổng lũy kế')}</button>
      </div>
    </div>
    <fieldset disabled={pending} className="item-form-grid">
      <label className="workflow-wide">{t('Đơn hàng PO cần cập nhật')} <span className="required-mark" aria-hidden="true">*</span>
        <select value={selectedRowId} onChange={e => selectTarget(e.target.value)}>
          {existingItems.map(item => <option key={item.rowId} value={item.rowId}>
            {item.poId} · {t(item.vendorItemNo)} ({t('Đặt')}: {formatQuantity(item.orderedQty)} {item.unit})
          </option>)}
        </select>
      </label>
      {updateTab === 'inbound' ? <>
        <label>
          {t(progressMode === 'today' ? 'Nhập thêm về kho hôm nay' : 'SL đã về kho (lũy kế)')}
          {!target?.inboundOnly && progressMode === 'cumulative' && <> <span className="required-mark" aria-hidden="true">*</span></>}
          <input
            type="text"
            inputMode="decimal"
            value={nhapInput}
            onChange={e => { setNhapInput(e.target.value); setTouched(p => ({ ...p, nhap: true })); }}
          />
          {projection.nhapInspect.error && <small className="field-hint is-error" role="alert">{t(projection.nhapInspect.error)}</small>}
          {!projection.nhapInspect.error && projection.nhapInspect.warning && <small className="field-hint is-warning">{t(projection.nhapInspect.warning)}</small>}
        </label>
        <label>{t('Đơn giá nhập kho (VND)')}
          <input type="text" inputMode="numeric" value={unitPriceVnd} onChange={e => setUnitPriceVnd(e.target.value)} />
          {formatMoneyInputHint(unitPriceVnd) && <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoneyInputHint(unitPriceVnd)}</small>}
        </label>
        <label>{t('Dự kiến về kho')}
          <input type="date" value={expectedReceiptDate} onChange={e => setExpectedReceiptDate(e.target.value)} />
        </label>
        <label>{t('Sản xuất (%)')}
          <input type="number" min="0" max="100" step="0.1" value={onProcessPct} onChange={e => setOnProcessPct(e.target.value)} />
        </label>
        <label>{t('Đóng gói (%)')}
          <input type="number" min="0" max="100" step="0.1" value={packagingPct} onChange={e => setPackagingPct(e.target.value)} />
        </label>
      </> : <>
        <label>
          {t(progressMode === 'today' ? 'Giao thêm cho khách hôm nay' : 'SL đã giao khách (lũy kế)')}
          <input
            type="text"
            inputMode="decimal"
            value={deliveredInput}
            onChange={e => { setDeliveredInput(e.target.value); setTouched(p => ({ ...p, delivered: true })); }}
          />
          {projection.deliveredInspect.error && <small className="field-hint is-error" role="alert">{t(projection.deliveredInspect.error)}</small>}
          {!projection.deliveredInspect.error && projection.deliveredInspect.warning && <small className="field-hint is-warning">{t(projection.deliveredInspect.warning)}</small>}
        </label>
        <label>{t('Đơn giá bán ra (VND)')}
          <input type="text" inputMode="numeric" value={saleUnitPriceVnd} onChange={e => setSaleUnitPriceVnd(e.target.value)} />
          {formatMoneyInputHint(saleUnitPriceVnd) && <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoneyInputHint(saleUnitPriceVnd)}</small>}
        </label>
        <label className="workflow-wide">{t('Khách hàng / Bên nhận giao hàng')}{(projection.projectedDelivered ?? 0) > 0 && <> <span className="required-mark" aria-hidden="true">*</span></>}
          <input value={customerName} maxLength={255} onChange={e => setCustomerName(e.target.value)} />
        </label>
        <label>{t('Ngày giao xác nhận')}{(projection.projectedDelivered ?? 0) > 0 && <> <span className="required-mark" aria-hidden="true">*</span></>}
          <input type="date" max={businessToday()} value={actualDeliveryDate} onChange={e => { setActualDeliveryDate(e.target.value); setTouched(p => ({ ...p, actualDeliveryDate: true })); }} />
          {touched.actualDeliveryDate && deliveryError && <small className="field-hint is-error" role="alert">{t(deliveryError)}</small>}
        </label>
        <label>{t('Thời gian dự kiến xuất hàng (ETD)')}
          <input type="date" value={shipDateEtd} onChange={e => setShipDateEtd(e.target.value)} />
        </label>
        <label>{t('Thời gian dự kiến đến (ETA)')}
          <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} />
        </label>
      </>}
      <label className="workflow-wide">{t('Lý do cập nhật')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={changeReason} maxLength={500} onChange={e => { setChangeReason(e.target.value); setTouched(p => ({ ...p, changeReason: true })); }} />
        {touched.changeReason && reasonError && <small className="field-hint is-error" role="alert">{t(reasonError)}</small>}
      </label>
    </fieldset>
    <div className="workflow-footer">
      <button type="button" onClick={onClose} disabled={pending}>{t('Hủy')}</button>
      <button type="button" className="row-detail-button" disabled={pending} onClick={e => submitForm(e, 'draft')}>{t('Đưa vào bản nháp')}</button>
      <button type="submit" className="primary" disabled={pending}>{t('Lưu cập nhật')}</button>
    </div>
  </form>;
}


// Chức năng: Form 2 riêng biệt — Tạo Đơn giao hàng cho Khách hàng lấy từ hàng đã nhập kho, tự động phát sinh Công nợ phải thu (AR) cho khách hàng đó
function CustomerDeliveryForm({ existingItems, onCreated, onClose }) {
  const today = businessToday();
  const availableOrders = (existingItems || []).filter(item => {
    const avail = Number(item.tonDau || 0) + Number(item.nhap || 0) - Number(item.deliveredQty || 0);
    return avail > 0;
  });
  const pool = availableOrders.length > 0 ? availableOrders : (existingItems || []);
  const [selectedRowId, setSelectedRowId] = useState(() => String(pool[0]?.rowId || ''));
  const target = pool.find(item => String(item.rowId) === String(selectedRowId)) || pool[0] || null;
  const availableStock = target
    ? Math.max(0, Number(target.tonDau || 0) + Number(target.nhap || 0) - Number(target.deliveredQty || 0))
    : 0;
  const [customerName, setCustomerName] = useState('');
  const [deliveredQty, setDeliveredQty] = useState('');
  const [saleUnitPriceVnd, setSaleUnitPriceVnd] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const parsedQty = Number(String(deliveredQty || '').replace(/,/g, '.').trim()) || 0;
  const parsedPrice = Number(String(saleUnitPriceVnd || '').replace(/[.,\s]/g, '')) || 0;
  const totalSaleVnd = parsedQty > 0 && parsedPrice > 0 ? Math.round(parsedQty * parsedPrice) : 0;

  const handleSubmit = async event => {
    event.preventDefault();
    if (!target) { setFormError('Chưa có đơn hàng nhập kho nào để xuất giao.'); return; }
    if (!customerName.trim()) { setFormError('Vui lòng nhập tên Khách hàng nhận hàng.'); return; }
    if (!(parsedQty > 0)) { setFormError('Số lượng giao phải lớn hơn 0.'); return; }
    if (parsedQty > availableStock) { setFormError(`Số lượng giao vượt quá tồn kho khả dụng (${availableStock} ${target.unit || ''}).`); return; }
    if (!(parsedPrice > 0)) { setFormError('Vui lòng nhập Đơn giá bán ra (VND) lớn hơn 0.'); return; }
    setFormError('');
    setSaving(true);
    try {
      const res = await createCustomerDeliveryApi({
        rowId: target.rowId,
        customerName: customerName.trim(),
        deliveredQty: parsedQty,
        saleUnitPriceVnd: parsedPrice,
        deliveryDate,
        dueDate,
        note: note.trim(),
      });
      onCreated?.(res);
    } catch (err) {
      setFormError(err?.message || 'Không thể tạo đơn giao hàng.');
    } finally {
      setSaving(false);
    }
  };

  return <form className="workflow-form entry-quick-form" noValidate onSubmit={handleSubmit}>
    <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900 mb-3">
      {t('Đơn giao hàng xuất bán từ kho cho Khách hàng sẽ tự động tạo Công nợ phải thu (AR) cho khách hàng đó. Doanh thu thực tế do Kế toán ghi nhận sau khi đủ cả Phải thu và Phải trả.')}
    </div>
    <fieldset disabled={saving} className="item-form-grid">
      <label className="workflow-wide">{t('Chọn đơn hàng nhập kho (PO)')} <span className="required-mark" aria-hidden="true">*</span>
        <select value={selectedRowId} onChange={e => setSelectedRowId(e.target.value)}>
          {pool.map(item => {
            const avail = Math.max(0, Number(item.tonDau || 0) + Number(item.nhap || 0) - Number(item.deliveredQty || 0));
            return <option key={item.rowId} value={item.rowId}>
              {item.poId} · {t(item.vendorItemNo)} ({t('NCC')}: {t(item.vendorName)} · {t('Khả dụng')}: {formatQuantity(avail)} {item.unit})
            </option>;
          })}
        </select>
      </label>
      <label className="workflow-wide">{t('Khách hàng')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={customerName} maxLength={255} onChange={e => setCustomerName(e.target.value)} />
      </label>
      <label>{t('Số lượng giao khách')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="text" inputMode="decimal" value={deliveredQty} onChange={e => setDeliveredQty(e.target.value)} />
        <small className="field-hint">{t('Tồn kho có thể giao:')} <b>{formatQuantity(availableStock)} {target?.unit || ''}</b></small>
      </label>
      <label>{t('Đơn giá bán ra (VND)')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="text" inputMode="numeric" value={saleUnitPriceVnd} onChange={e => setSaleUnitPriceVnd(e.target.value)} />
        {formatMoneyInputHint(saleUnitPriceVnd) && <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoneyInputHint(saleUnitPriceVnd)}</small>}
      </label>
      <label>{t('Ngày giao hàng')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="date" max={today} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
      </label>
      <label>{t('Hạn thanh toán khách hàng')}
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
      </label>
      <label className="workflow-wide">{t('Ghi chú giao hàng')}
        <input value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
      </label>
    </fieldset>
    {totalSaleVnd > 0 && <div className="projected-total-banner" role="status">
      <span>{t('Giá trị đơn giao hàng (Công nợ phải thu):')} <b>{new Intl.NumberFormat(locale()).format(totalSaleVnd)} VND</b></span>
    </div>}
    {formError && <div className="workspace-error" role="alert" style={{ marginTop: 10 }}><span>{t(formError)}</span></div>}
    <div className="workflow-footer">
      <button type="button" onClick={onClose} disabled={saving}>{t('Hủy')}</button>
      <button type="submit" className="primary" disabled={saving}>{t(saving ? 'Đang lưu…' : 'Tạo đơn giao hàng')}</button>
    </div>
  </form>;
}

// Chức năng: Trang Đơn hàng & Nhập liệu: toàn bộ các chức năng nhập dữ liệu (Thêm đơn hàng, Cập nhật tiến độ, Tải Excel, Bản nháp bảng tính) đều mở ở chế độ Cửa sổ (Modal Window) chuẩn responsive, ẩn Mã dòng (rowId), kiểm tra trùng Mã PO và nối tiếp Excel vào dữ liệu hiện có
export default function DataEntryPage({ actor, data, onSave, onDeliveryCreated, tasks = [], accounts = [] }) {
  const sheets = ENTRY_SHEETS.filter(sheet => canReadSheet(actor, sheet));
  const [draft, setDraft] = useState(() => readEntryDraft(actor.id));
  const [selectedId, setSelectedId] = useState(() =>
    (sheets.find(item => draft.sheets[item.id] && canWriteSheet(actor, item)) ||
      sheets.find(item => canWriteSheet(actor, item)) || sheets[0])?.id);
  const [editing, setEditing] = useState(false);
  const [temporary, setTemporary] = useState(() => entryDraftIsTemporary(actor.id) && Object.keys(draft.sheets).length > 0);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [message, setMessage] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [worksheetId, setWorksheetId] = useState(null);
  const [year, setYear] = useState('');
  const [quickMode, setQuickMode] = useState(null);
  const [quickTargetOrder, setQuickTargetOrder] = useState(null);
  const fileInput = useRef(null);
  const sheet = sheets.find(item => item.id === selectedId) || sheets[0];

  useEffect(() => {
    if (!temporary) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [temporary]);

  const writable = sheet ? canWriteSheet(actor, sheet) : false;
  const canEdit = writable && editing;
  const rows = useMemo(() => sheet ? draft.sheets[sheet.id] || [blankRow()] : [blankRow()], [sheet, draft.sheets]);
  const draftRowCount = rows.filter(hasValues).length;
  const canEditExisting = Boolean(sheet && writable && sheet.id === 'orders');

  // Ẩn cột Mã dòng (rowId) trên cả bảng Dữ liệu hiện có, Bản nháp nhập liệu và Tệp mẫu, nhưng giữ nguyên đầy đủ tất cả các cột dữ liệu khác
  const readColumns = useMemo(
    () => (sheet ? visibleSheetColumns([...sheet.columns, ...(sheet.extra || [])]) : []),
    [sheet]
  );
  const draftColumns = useMemo(
    () => (sheet ? visibleSheetColumns(sheet.columns) : []),
    [sheet]
  );
  const requiredCols = new Set(sheet ? REQUIRED_BY_SHEET[sheet.id] || [] : []);

  const draftPoCounts = useMemo(
    () =>
      rows
        .filter(hasValues)
        .map(r => String(r.values?.poId ?? '').trim().toLowerCase())
        .filter(Boolean),
    [rows]
  );
  const cellValidationContext = useMemo(
    () => ({
      sheetId: sheet?.id,
      existingOrders: data?.items || [],
      draftPoCounts,
    }),
    [sheet?.id, data?.items, draftPoCounts]
  );

  const existing = sheet
    ? readEntryRows(sheet, actor, data).filter(row => !debouncedQuery ||
        readColumns.some(col => String(row[col.key] ?? '').toLowerCase().includes(debouncedQuery.trim().toLowerCase())))
    : [];

  // Phân trang & tải trước 1 phần + tải dần khi lướt xuống cho bảng dữ liệu hiện có
  const pagination = useProgressivePagination(existing, {
    sectionKey: `data-entry-${sheet?.id || 'none'}`,
    initialChunkSize: 10,
    stepSize: 10,
    pageSize: 20,
    resetDeps: [sheet?.id, debouncedQuery, existing.length],
  });
  const pagedExisting = pagination.visibleItems;

  if (!sheet) return <section className="analytics-card management-panel"><h2>{t('Đơn hàng')}</h2><p>{t('Bạn chưa được cấp quyền xem bảng dữ liệu nào.')}</p></section>;

  // Chức năng: Thiết lập (setRows - Rows) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const setRows = rows => {
    const next = { ...draft, sheets: { ...draft.sheets } };
    const hasDraft = rows.some(hasValues);
    if (hasDraft || rows.length > 1) next.sheets[sheet.id] = rows;
    else delete next.sheets[sheet.id];
    if (sheet.id === 'orders') {
      next.orderBaseline = hasDraft ? draft.orderBaseline ??
        data.items.map(({ rowId, poId, vendorItemNo, trackingVersion }) =>
          ({ rowId, poId, vendorItemNo, trackingVersion })) : null;
    }
    setDraft(next);
    setTemporary(!storeEntryDraft(actor.id, next) && Object.keys(next.sheets).length > 0);
  };
  // Chức năng: Làm sạch (clearFeedback - Feedback) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const clearFeedback = () => { setMessage(''); setIssues([]); setWarnings([]); };
  // Chức năng: Xử lý nghiệp vụ (changeCell - Cell) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const changeCell = (index, key, value) => {
    setRows(rows.map((row, i) => i === index ? { ...row, values: { ...row.values, [key]: value } } : row));
    clearFeedback();
  };
  // Chức năng: Xử lý nghiệp vụ (editOrder - Order) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const editOrder = order => {
    clearFeedback();
    setQuickTargetOrder(order);
    setQuickMode('update-progress');
  };
  // Chức năng: Xử lý nghiệp vụ (pasteCells - Cells) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const pasteCells = (event, rowIndex, columnIndex) => {
    const text = event.clipboardData.getData('text');
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const pasted = clipboardRows(text);
    if (rowIndex + pasted.length > MAX_ENTRY_ROWS || pasted.some(line => columnIndex + line.length > draftColumns.length)) {
      setIssues([{ message: `Vùng dán vượt phạm vi bảng hoặc giới hạn ${MAX_ENTRY_ROWS} dòng.` }]);
      return;
    }
    const next = Array.from({ length: Math.max(rows.length, rowIndex + pasted.length) }, (_, index) => rows[index] || blankRow());
    pasted.forEach((line, index) => {
      const row = next[rowIndex + index];
      next[rowIndex + index] = { ...row, values: { ...row.values,
        ...Object.fromEntries(line.map((value, offset) => [draftColumns[columnIndex + offset].key, value])) } };
    });
    setRows(next);
    clearFeedback();
  };
  // Chức năng: Chạy tác vụ (run - run) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const run = async operation => {
    clearFeedback();
    setPending(true);
    try { await operation(); }
    catch (error) { setIssues([{ message: error.message }]); }
    finally { setPending(false); }
  };
  // Chức năng: Xử lý nghiệp vụ (stageFile - File) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const stageFile = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    run(async () => {
      const book = await openEntryWorkbook(file);
      setImportFile({ book, name: file.name });
      setWorksheetId((book.getWorksheet(entrySheetName(sheet)) || book.getWorksheet(sheet.name) ||
        book.getWorksheet(entrySheetName(sheet, 'en')) || book.worksheets[0]).id);
    });
  };
  // Chức năng: Nạp dữ liệu từ tệp Excel vào Bản nháp nhập liệu (xóa rowId cũ từ Excel để nối tiếp vào dữ liệu hiện có khi Lưu)
  const loadPreview = () => run(async () => {
    const rawImported = readEntrySheet(importFile.book.getWorksheet(Number(worksheetId)), sheet, MAX_ENTRY_ROWS, year);
    const cleanedImported = rawImported.map(item => {
      const nextValues = { ...(item.values || {}) };
      delete nextValues.rowId;
      return { line: item.line, values: nextValues };
    });
    const current = rows.filter(hasValues);
    if (current.length + cleanedImported.length > MAX_ENTRY_ROWS) {
      throw new Error(`Chọn bảng và nhập từ 1 đến ${MAX_ENTRY_ROWS} dòng.`);
    }
    const mergedDraftRows = [...current, ...cleanedImported];
    setRows(mergedDraftRows);
    setImportFile(null);
    setEditing(true);
    const feIssues = validateDraftRowsFrontend(sheet, mergedDraftRows, data);
    if (feIssues.length > 0) {
      setIssues(feIssues);
    }
    setMessage(`Đã thêm ${cleanedImported.length} dòng vào bản nháp. Kiểm tra rồi bấm Lưu dữ liệu để nối tiếp vào dữ liệu hiện có.`);
  });
  // Chức năng: Kiểm tra lỗi Frontend rồi Lưu các dòng trong bản nháp nối tiếp vào dữ liệu hiện có
  const save = () => run(async () => {
    const activeRows = rows.filter(hasValues);
    const feIssues = validateDraftRowsFrontend(sheet, activeRows, data);
    if (feIssues.length > 0) {
      setIssues(feIssues);
      return;
    }
    const sanitizedRows = activeRows.map(row => {
      if (row.expectedVersion !== undefined) return row;
      const cleanValues = { ...(row.values || {}) };
      delete cleanValues.rowId;
      return { ...row, values: cleanValues };
    });
    const result = await onSave(sheet.id, sanitizedRows, sheet.id === 'orders' ? draft.orderBaseline : undefined);
    if (result.warnings?.length) setWarnings(result.warnings);
    if (result.issues?.length) { setIssues(result.issues); return; }
    setRows([blankRow()]);
    setEditing(false);
    setMessage('Đã lưu dữ liệu từ bản nháp nối tiếp vào dữ liệu hiện có và cập nhật các phân hệ liên quan.');
  });
  // Chức năng: Lưu (saveQuickRow - Quick Row) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const saveQuickRow = (values, expectedVersion) => run(async () => {
    const entry = expectedVersion !== undefined ? { expectedVersion, values } : { values };
    const result = await onSave('orders', [entry]);
    if (result.warnings?.length) setWarnings(result.warnings);
    if (result.issues?.length) { setIssues(result.issues); return; }
    setQuickMode(null);
    setQuickTargetOrder(null);
    setMessage('Đã lưu dữ liệu và cập nhật các phân hệ liên quan.');
  });
  // Chức năng: Xử lý nghiệp vụ (stageQuickRow - Quick Row) phục vụ xử lý dữ liệu trong DataEntryPage.jsx
  const stageQuickRow = (values, expectedVersion) => {
    const current = rows.filter(hasValues);
    if (current.length >= MAX_ENTRY_ROWS) {
      setIssues([{ message: `Chọn bảng và nhập từ 1 đến ${MAX_ENTRY_ROWS} dòng.` }]);
      return;
    }
    const entry = expectedVersion !== undefined ? { expectedVersion, values } : { values };
    setRows([...current, entry]);
    setQuickMode(null);
    setQuickTargetOrder(null);
    setEditing(true);
    setMessage('Đã thêm 1 dòng vào bản nháp. Kiểm tra rồi bấm Lưu dữ liệu.');
  };

  return <section className="analytics-card management-panel entry-workspace" aria-busy={pending}>
    <div className="entry-header-row">
      <div className="entry-heading">
        <h1>{t('Đơn hàng & Dữ liệu Nghiệp vụ')}</h1>
      </div>
      <nav className="workflow-filter-tabs entry-tabs" aria-label={t('Bảng dữ liệu')}>
        {sheets.map(item => <button type="button" key={item.id} aria-pressed={item.id === sheet.id} disabled={pending}
          onClick={() => {
            setSelectedId(item.id);
            setImportFile(null);
            setQuickMode(null);
            setEditing(false);
            setQuery('');
            clearFeedback();
          }}>{t(item.label)}</button>)}
      </nav>
    </div>

    <div className="entry-toolbar">
      <button className="row-detail-button" type="button" aria-pressed={!canEdit && !quickMode} disabled={pending} onClick={() => { setEditing(false); setQuickMode(null); clearFeedback(); }}>{t('Dữ liệu hiện có')} ({existing.length})</button>
      {writable && (
        <button className="row-detail-button" type="button" aria-pressed={canEdit} disabled={pending} onClick={() => { setEditing(true); setQuickMode(null); clearFeedback(); }}>
          <Table2 size={15} />
          <span>{t('Bản nháp nhập liệu')}{draftRowCount > 0 ? ` (${draftRowCount})` : ''}</span>
        </button>
      )}
      {writable && sheet.id === 'orders' && <>
        <button className="row-primary-button" type="button" aria-pressed={quickMode === 'create-order'} disabled={pending}
          onClick={() => { setQuickMode('create-order'); clearFeedback(); }}>
          <FilePlus2 size={15} />{t('Đơn nhập hàng NCC')}
        </button>
        <button className="row-primary-button" type="button" aria-pressed={quickMode === 'create-delivery'} disabled={pending}
          onClick={() => { setQuickMode('create-delivery'); clearFeedback(); }}>
          <Truck size={15} />{t('Đơn giao hàng đi')}
        </button>
        <button className="row-detail-button" type="button" aria-pressed={quickMode === 'update-progress'} disabled={pending}
          onClick={() => { setQuickTargetOrder(data.items[0] || null); setQuickMode('update-progress'); clearFeedback(); }}>
          <RefreshCw size={15} />{t('Cập nhật tiến độ')}
        </button>
      </>}
      <input type="search" aria-label={t('Tìm trong bảng')} value={query} onChange={event => setQuery(event.target.value)} />
      <div className="entry-file-actions">
        {writable && <>
          <input hidden type="file" accept=".xlsx" ref={fileInput} onChange={stageFile} />
          <button className="row-detail-button" type="button" disabled={pending} onClick={() => fileInput.current.click()}><Upload size={15} />{t('Tải Excel lên')}</button>
          <button className="row-detail-button" type="button" disabled={pending} onClick={() => run(() => downloadEntryWorkbook(sheet, draftColumns, []))}><Download size={15} />{t('Tệp mẫu')}</button>
        </>}
        <button className="row-detail-button" type="button" disabled={pending} onClick={() => run(() => downloadEntryWorkbook(sheet, readColumns, existing))}><Download size={15} />{t('Xuất Excel')}</button>
      </div>
    </div>

    {/* Cửa sổ 1: Thêm đơn hàng PO mới */}
    <FormWindowDialog
      open={writable && sheet.id === 'orders' && quickMode === 'create-order'}
      title={t('Thêm đơn hàng mới (PO)')}
      subtitle={t('Kiểm tra Mã PO duy nhất · Nhập trực tiếp hoặc đưa vào bản nháp')}
      size="lg"
      busy={pending}
      onClose={() => setQuickMode(null)}
    >
      {issues.length > 0 && <div role="alert" className="entry-errors"><strong>{t('Chưa thể lưu hoặc nhập dữ liệu')}</strong>
        <ul>{issues.map((issue, index) => <li key={index}>{formatIssueLineMessage(issue)}</li>)}</ul>
      </div>}
      <QuickCreateOrderForm
        actor={actor}
        existingItems={data.items}
        pending={pending}
        onSaveDirect={values => saveQuickRow(values)}
        onStageDraft={values => stageQuickRow(values)}
        onClose={() => setQuickMode(null)}
      />
    </FormWindowDialog>

    {/* Cửa sổ 1b: Tạo Đơn giao hàng đi cho Khách hàng (tự động phát sinh Công nợ phải thu AR) */}
    <FormWindowDialog
      open={writable && sheet.id === 'orders' && quickMode === 'create-delivery'}
      title={t('Tạo đơn giao hàng đi (Giao khách)')}
      subtitle={t('Xuất hàng từ tồn kho PO cho khách hàng · Tự động tạo Công nợ phải thu (AR)')}
      size="lg"
      busy={pending}
      onClose={() => setQuickMode(null)}
    >
      <CustomerDeliveryForm
        existingItems={data.items}
        onCreated={res => {
          setQuickMode(null);
          setMessage(`Đã tạo phiếu giao hàng đi ${res?.delivery?.deliveryNo || ''} và tự động đồng bộ Công nợ phải thu.`);
          onDeliveryCreated?.(res);
        }}
        onClose={() => setQuickMode(null)}
      />
    </FormWindowDialog>

    {/* Cửa sổ 2: Cập nhật tiến độ theo đơn hàng */}
    <FormWindowDialog
      open={writable && sheet.id === 'orders' && quickMode === 'update-progress'}
      title={t('Cập nhật tiến độ theo đơn hàng')}
      subtitle={quickTargetOrder ? `${quickTargetOrder.poId} · ${quickTargetOrder.vendorName}` : 'Đơn hàng PO'}
      size="lg"
      busy={pending}
      onClose={() => setQuickMode(null)}
    >
      {issues.length > 0 && <div role="alert" className="entry-errors"><strong>{t('Chưa thể lưu hoặc nhập dữ liệu')}</strong>
        <ul>{issues.map((issue, index) => <li key={index}>{formatIssueLineMessage(issue)}</li>)}</ul>
      </div>}
      <QuickUpdateProgressForm
        key={quickTargetOrder?.rowId || 'default'}
        existingItems={data.items}
        initialOrder={quickTargetOrder}
        pending={pending}
        onSaveDirect={(values, version) => saveQuickRow(values, version)}
        onStageDraft={(values, version) => stageQuickRow(values, version)}
        onClose={() => setQuickMode(null)}
      />
    </FormWindowDialog>

    {/* Cửa sổ 3: Tải tệp Excel vào bản nháp */}
    <FormWindowDialog
      open={Boolean(importFile && writable)}
      title={t('Tải tệp Excel vào bản nháp')}
      subtitle={importFile?.name || ''}
      size="md"
      busy={pending}
      onClose={() => setImportFile(null)}
    >
      {importFile && (
        <div className="workflow-form">
          {issues.length > 0 && <div role="alert" className="entry-errors"><strong>{t('Chưa thể lưu hoặc nhập dữ liệu')}</strong>
            <ul>{issues.map((issue, index) => <li key={index}>{formatIssueLineMessage(issue)}</li>)}</ul>
          </div>}
          <fieldset disabled={pending} className="item-form-grid">
            <label className="workflow-wide">
              {t('Tệp Excel đã chọn')}
              <input value={importFile.name} readOnly disabled />
            </label>
            <label>
              {t('Trang tính')}
              <select value={worksheetId} disabled={pending} onChange={event => setWorksheetId(event.target.value)}>
                {importFile.book.worksheets.map(tab => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
              </select>
            </label>
            <label>
              {t('Năm cho ngày thiếu năm')}
              <input inputMode="numeric" maxLength={4} value={year} onChange={event => setYear(event.target.value)} />
            </label>
          </fieldset>
          <div className="workflow-footer">
            <button type="button" disabled={pending} onClick={() => setImportFile(null)}>{t('Hủy')}</button>
            <button className="primary" type="button" disabled={pending} onClick={loadPreview}>{t('Đưa vào bản nháp')}</button>
          </div>
        </div>
      )}
    </FormWindowDialog>

    {/* Cửa sổ 4: Bản nháp nhập liệu bảng tính (Nhập dòng trực tiếp hoặc tải/dán từ Excel rồi lưu nối tiếp vào dữ liệu hiện có) */}
    <FormWindowDialog
      open={canEdit}
      title={`${t('Bản nháp nhập liệu')} · ${t(sheet.label)}`}
      subtitle={t('Kiểm tra dữ liệu trong bản nháp rồi bấm Lưu dữ liệu để nối tiếp vào dữ liệu hiện có')}
      size="xl"
      busy={pending}
      onClose={() => setEditing(false)}
    >
      <div className="space-y-3">
        {message && <p role="status" className="management-note">{message}</p>}
        {warnings.length > 0 && <div role="status" className="entry-warnings">
          <strong>{t('Lưu ý định dạng số đã được hệ thống quy đổi:')}</strong>
          <ul>{warnings.map((warn, idx) => <li key={idx}>{formatIssueLineMessage(warn)}</li>)}</ul>
        </div>}
        {issues.length > 0 && <div role="alert" className="entry-errors"><strong>{t('Chưa thể lưu hoặc nhập dữ liệu')}</strong>
          <ul>{issues.map((issue, index) => <li key={index}>{formatIssueLineMessage(issue)}</li>)}</ul>
        </div>}
        <div className="table-scroll entry-table-frame">
          <table className="management-table entry-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                {draftColumns.map(col => (
                  <th key={col.key} scope="col">
                    {t(col.label)}
                    {requiredCols.has(col.key) && <span className="required-mark" aria-hidden="true"> *</span>}
                  </th>
                ))}
                <th scope="col">{t('Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <th scope="row">{row.line || index + 1}</th>
                  {draftColumns.map((col, columnIndex) => (
                    <td key={col.key}>
                      <input
                        disabled={pending}
                        aria-label={`${t(col.label)} · ${index + 1}`}
                        inputMode={col.type === 'number' ? 'decimal' : undefined}
                        value={row.values[col.key] ?? ''}
                        onPaste={event => pasteCells(event, index, columnIndex)}
                        onChange={event => changeCell(index, col.key, event.target.value)}
                      />
                      <CellFeedback
                        columnKey={col.key}
                        value={row.values[col.key]}
                        rowValues={row.values}
                        context={cellValidationContext}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="row-detail-button"
                      type="button"
                      disabled={pending}
                      aria-label={t('Xóa dòng bản nháp')}
                      onClick={() => {
                        setRows(rows.length > 1 ? rows.filter((_, i) => i !== index) : [blankRow()]);
                        clearFeedback();
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="entry-footer">
          <span>{phrase('§ dòng trong bản nháp (sẽ nối tiếp vào dữ liệu hiện có khi lưu)', rows.filter(hasValues).length)}</span>
          <button type="button" className="row-detail-button" disabled={pending} onClick={() => fileInput.current.click()}>
            <Upload size={15} />{t('Tải thêm Excel vào nháp')}
          </button>
          <button type="button" className="row-detail-button" disabled={pending} onClick={() => run(() => downloadEntryWorkbook(sheet, draftColumns, []))}>
            <Download size={15} />{t('Tệp mẫu chuẩn kiểu dữ liệu')}
          </button>
          <button type="button" className="row-detail-button" disabled={pending || rows.length >= MAX_ENTRY_ROWS} onClick={() => setRows([...rows, blankRow()])}>
            <Plus size={15} />{t('Thêm dòng')}
          </button>
          {rows.some(hasValues) && (
            <button
              type="button"
              className="row-detail-button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t('Bỏ toàn bộ bản nháp của bảng này?'))) {
                  setRows([blankRow()]);
                  clearFeedback();
                }
              }}
            >
              {t('Bỏ bản nháp')}
            </button>
          )}
          <button type="button" className="row-detail-button" disabled={pending} onClick={() => setEditing(false)}>
            {t('Đóng cửa sổ')}
          </button>
          <button type="button" className="row-primary-button" disabled={pending || !rows.some(hasValues)} onClick={save}>
            <Save size={15} />{t('Lưu dữ liệu')}
          </button>
        </div>
      </div>
    </FormWindowDialog>

    {message && <p role="status" className="management-note">{message}</p>}
    {warnings.length > 0 && !canEdit && <div role="status" className="entry-warnings">
      <strong>{t('Lưu ý định dạng số đã được hệ thống quy đổi:')}</strong>
      <ul>{warnings.map((warn, idx) => <li key={idx}>{formatIssueLineMessage(warn)}</li>)}</ul>
    </div>}
    {issues.length > 0 && !canEdit && !quickMode && !importFile && <div role="alert" className="entry-errors"><strong>{t('Chưa thể lưu hoặc nhập dữ liệu')}</strong>
      <ul>{issues.map((issue, index) => <li key={index}>{formatIssueLineMessage(issue)}</li>)}</ul>
    </div>}
    <div className="table-scroll entry-table-frame">
      <table className="management-table entry-table"><thead><tr><th scope="col">#</th>{canEditExisting && <th scope="col">{t('Thao tác')}</th>}
        {readColumns.map(col => <th key={col.key} scope="col">{t(col.label)}</th>)}
      </tr></thead><tbody>
        {pagedExisting.map((row, index) => <tr key={row.id || row.rowId || index}><th scope="row">{pagination.pageStartIndex + index + 1}</th>
          {canEditExisting && (() => {
            const rawItem = (data.items || []).find(it => String(it.rowId) === String(row.rowId) || (row.poId && it.poId === row.poId));
            const rowAccess = canActorEditOrder(actor, rawItem || row, tasks, accounts);
            return <td>{rowAccess.allowed ? <button className="row-detail-button" type="button" disabled={pending} onClick={() => editOrder(row)}>{t('Sửa tiến độ')}</button> : <span className="text-xs font-semibold text-slate-500" title={`${t('Phụ trách:')} ${rowAccess.ownerLabel}`}>{t('Chỉ xem')}</span>}</td>;
          })()}
          {readColumns.map(col => <td key={col.key}>{row[col.key] === null || row[col.key] === undefined || row[col.key] === '' ? '—' : typeof row[col.key] === 'boolean' ? t(row[col.key] ? 'Có' : 'Không') : t(String(row[col.key]))}</td>)}
        </tr>)}
      </tbody></table>
      {existing.length === 0 && <p className="management-note">{t('Không có dữ liệu theo bộ lọc')}</p>}
    </div>
    {existing.length > 0 && <ProgressivePaginationBar pagination={pagination} itemUnit="dòng dữ liệu" />}
  </section>;
}
