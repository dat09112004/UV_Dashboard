import React, { useEffect, useRef, useState } from 'react';
import { Download, Plus, Save, Trash2, Upload, FilePlus2, RefreshCw } from 'lucide-react';
import { locale, phrase, t } from '../../locales/i18n.js';
import { businessToday, dateInputValue, parseBusinessDate } from '../../utils/business.js';
import { formatQuantity } from '../../utils/orderFulfillment.js';
import { computeProjectedProgress } from '../../utils/workspaceUi.js';
import { ENTRY_SHEETS, canReadSheet, canWriteSheet } from './schema.js';
import { inspectEntryCell, MAX_ENTRY_ROWS, readEntryRows } from './service.js';
import { clipboardRows, entryDraftIsTemporary, readEntryDraft, storeEntryDraft } from './drafts.js';
import { downloadEntryWorkbook, entrySheetName, openEntryWorkbook, readEntrySheet } from './workbook.js';

const blankRow = () => ({ values: {} });
const hasValues = row => Object.values(row.values).some(value => String(value ?? '').trim());
const REQUIRED_BY_SHEET = {
  orders: ['poId', 'vendorItemNo', 'vendorNo', 'vendorName', 'category', 'releasedPoDate', 'unit', 'orderedQty'],
  revenue: ['docNo', 'customerName', 'recordDate', 'dueDate', 'shippedQty', 'netRevenue', 'basis'],
  payables: ['docNo', 'originalAmount'],
  receipts: ['reference', 'date', 'amount'],
  allocations: ['entryReference', 'receiptReference', 'docNo', 'date', 'amount'],
  payments: ['reference', 'docNo', 'date', 'amount'],
  tasks: ['title', 'description', 'deadline'],
};

function CellFeedback({ columnKey, value, rowValues }) {
  const feedback = inspectEntryCell(columnKey, value, rowValues);
  if (!feedback.error && !feedback.warning && !feedback.formatted) return null;
  if (feedback.error) return <small className="field-hint is-error" role="alert">{t(feedback.error)}</small>;
  if (feedback.warning) return <small className="field-hint is-warning">{t(feedback.warning)}</small>;
  if (['orderedQty', 'nhap', 'deliveredQty', 'shippedQty', 'unitPriceVnd', 'netRevenue', 'originalAmount', 'amount'].includes(columnKey)) {
    return <small className="field-hint">{phrase('Hệ thống hiểu: §', feedback.formatted)}</small>;
  }
  return null;
}

function QuickCreateOrderForm({ existingItems, pending, onSaveDirect, onStageDraft, onClose }) {
  const today = businessToday();
  const categories = [...new Set(existingItems.map(item => item.category).filter(Boolean))];
  const [values, setValues] = useState({
    poId: '', vendorItemNo: '', vendorNo: '', vendorName: '', category: categories[0] || '',
    countryOfOrigin: '', releasedPoDate: today, unit: 'pcs', orderedQty: '', unitPriceVnd: '',
    expectedReceiptDate: '', etaDate: '', changeReason: 'Tạo đơn hàng mới',
  });
  const [touched, setTouched] = useState({});
  const update = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setTouched(prev => ({ ...prev, [key]: true }));
  };
  const qtyFeedback = inspectEntryCell('orderedQty', values.orderedQty, values);
  const priceFeedback = inspectEntryCell('unitPriceVnd', values.unitPriceVnd, values);
  const releasedParsed = parseBusinessDate(values.releasedPoDate);
  const todayParsed = parseBusinessDate(today);
  const receiptParsed = parseBusinessDate(values.expectedReceiptDate);
  const etaParsed = parseBusinessDate(values.etaDate);

  const errors = {
    poId: !values.poId.trim() ? 'Cần nhập mã PO.' : '',
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

  const submitForm = (event, mode) => {
    event.preventDefault();
    setTouched({ poId: true, vendorItemNo: true, vendorNo: true, vendorName: true, category: true, releasedPoDate: true, unit: true, orderedQty: true, unitPriceVnd: true, expectedReceiptDate: true });
    if (hasErrors) return;
    if (mode === 'draft') onStageDraft(values);
    else onSaveDirect(values);
  };

  const showErr = key => touched[key] && errors[key];

  return <form className="workflow-form entry-quick-form" onSubmit={event => submitForm(event, 'save')}>
    <div className="entry-quick-header">
      <div>
        <h3>{t('Thêm đơn hàng mới (PO)')}</h3>
        <p className="management-note">{t('Chỉ hiển thị các trường tạo PO cần thiết. Trường có dấu * là bắt buộc.')}</p>
      </div>
      <button type="button" className="row-detail-button" onClick={onClose}>{t('Đóng biểu mẫu')}</button>
    </div>
    <fieldset disabled={pending} className="item-form-grid">
      <label>{t('Mã PO')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.poId} onChange={e => update('poId', e.target.value)} onBlur={() => setTouched(p => ({ ...p, poId: true }))} placeholder="UV-Intl-3500010" />
        {showErr('poId') && <small className="field-hint is-error" role="alert">{t(errors.poId)}</small>}
      </label>
      <label>{t('Mã hàng')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.vendorItemNo} onChange={e => update('vendorItemNo', e.target.value)} onBlur={() => setTouched(p => ({ ...p, vendorItemNo: true }))} placeholder={t('Tên hoặc mã mặt hàng')} />
        {showErr('vendorItemNo') && <small className="field-hint is-error" role="alert">{t(errors.vendorItemNo)}</small>}
      </label>
      <label>{t('Mã nhà cung cấp')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.vendorNo} onChange={e => update('vendorNo', e.target.value)} onBlur={() => setTouched(p => ({ ...p, vendorNo: true }))} placeholder="15090" />
        {showErr('vendorNo') && <small className="field-hint is-error" role="alert">{t(errors.vendorNo)}</small>}
      </label>
      <label>{t('Nhà cung cấp')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.vendorName} onChange={e => update('vendorName', e.target.value)} onBlur={() => setTouched(p => ({ ...p, vendorName: true }))} placeholder={t('Tên nhà cung cấp')} />
        {showErr('vendorName') && <small className="field-hint is-error" role="alert">{t(errors.vendorName)}</small>}
      </label>
      <label>{t('Ngành hàng')} <span className="required-mark" aria-hidden="true">*</span>
        <input list="entry-po-categories" value={values.category} onChange={e => update('category', e.target.value)} onBlur={() => setTouched(p => ({ ...p, category: true }))} />
        <datalist id="entry-po-categories">{categories.map(cat => <option key={cat} value={cat} />)}</datalist>
        {showErr('category') && <small className="field-hint is-error" role="alert">{t(errors.category)}</small>}
      </label>
      <label>{t('Ngày phát hành PO')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="date" max={today} value={values.releasedPoDate} onChange={e => update('releasedPoDate', e.target.value)} onBlur={() => setTouched(p => ({ ...p, releasedPoDate: true }))} />
        {showErr('releasedPoDate') && <small className="field-hint is-error" role="alert">{t(errors.releasedPoDate)}</small>}
      </label>
      <label>{t('SL đặt')} <span className="required-mark" aria-hidden="true">*</span>
        <input type="text" inputMode="decimal" value={values.orderedQty} onChange={e => update('orderedQty', e.target.value)} onBlur={() => setTouched(p => ({ ...p, orderedQty: true }))} placeholder={t('Ví dụ: 1.000')} />
        {showErr('orderedQty') && <small className="field-hint is-error" role="alert">{t(errors.orderedQty)}</small>}
        {!errors.orderedQty && qtyFeedback.warning && <small className="field-hint is-warning">{t(qtyFeedback.warning)}</small>}
        {!errors.orderedQty && qtyFeedback.formatted && <small className="field-hint">{phrase('Hệ thống hiểu: §', qtyFeedback.formatted)}</small>}
      </label>
      <label>{t('Đơn vị')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={values.unit} maxLength={24} onChange={e => update('unit', e.target.value)} onBlur={() => setTouched(p => ({ ...p, unit: true }))} placeholder="pcs, kg, m…" />
        {showErr('unit') && <small className="field-hint is-error" role="alert">{t(errors.unit)}</small>}
      </label>
      <label>{t('Đơn giá VND')}
        <input type="text" inputMode="numeric" value={values.unitPriceVnd} onChange={e => update('unitPriceVnd', e.target.value)} onBlur={() => setTouched(p => ({ ...p, unitPriceVnd: true }))} placeholder={t('Ví dụ: 1.600')} />
        {showErr('unitPriceVnd') && <small className="field-hint is-error" role="alert">{t(errors.unitPriceVnd)}</small>}
        {!errors.unitPriceVnd && priceFeedback.formatted && <small className="field-hint">{phrase('Hệ thống hiểu: §', priceFeedback.formatted)}</small>}
      </label>
      <label>{t('Xuất xứ')}
        <input value={values.countryOfOrigin} onChange={e => update('countryOfOrigin', e.target.value)} placeholder="VIETNAM" />
      </label>
      <label>{t('Dự kiến về kho')}
        <input type="date" value={values.expectedReceiptDate} onChange={e => update('expectedReceiptDate', e.target.value)} onBlur={() => setTouched(p => ({ ...p, expectedReceiptDate: true }))} />
        {showErr('expectedReceiptDate') && <small className="field-hint is-error" role="alert">{t(errors.expectedReceiptDate)}</small>}
      </label>
      <label>{t('ETA')}
        <input type="date" value={values.etaDate} onChange={e => update('etaDate', e.target.value)} />
      </label>
    </fieldset>
    {(qtyFeedback.value !== null || projectedTotalVnd !== null) && <div className="projected-total-banner" role="status">
      <strong>{t('Kiểm tra trước khi lưu:')}</strong>
      {qtyFeedback.value !== null && <span>{t('SL đặt hệ thống hiểu:')} <b>{formatQuantity(qtyFeedback.value)} {values.unit}</b></span>}
      {projectedTotalVnd !== null && <span>{t('Giá trị PO dự kiến:')} <b>{new Intl.NumberFormat(locale()).format(projectedTotalVnd)} VND</b></span>}
    </div>}
    <div className="workflow-footer">
      <button type="button" onClick={onClose} disabled={pending}>{t('Hủy')}</button>
      <button type="button" className="row-detail-button" disabled={pending} onClick={e => submitForm(e, 'draft')}>{t('Đưa vào bản nháp')}</button>
      <button type="submit" className="primary" disabled={pending}>{t('Lưu đơn hàng')}</button>
    </div>
  </form>;
}

function QuickUpdateProgressForm({ existingItems, initialOrder, pending, onSaveDirect, onStageDraft, onClose }) {
  const [selectedRowId, setSelectedRowId] = useState(() => String(initialOrder?.rowId || existingItems[0]?.rowId || ''));
  const target = existingItems.find(item => String(item.rowId) === String(selectedRowId)) || existingItems[0];
  const [progressMode, setProgressMode] = useState('today');
  const [nhapInput, setNhapInput] = useState('');
  const [deliveredInput, setDeliveredInput] = useState('');
  const [expectedReceiptDate, setExpectedReceiptDate] = useState(() => dateInputValue(target?.expectedReceiptDate));
  const [actualDeliveryDate, setActualDeliveryDate] = useState(() => dateInputValue(target?.actualDeliveryDate));
  const [shipDateEtd, setShipDateEtd] = useState(() => dateInputValue(target?.shipDateEtd));
  const [etaDate, setEtaDate] = useState(() => dateInputValue(target?.etaDate));
  const [onProcessPct, setOnProcessPct] = useState(() => target?.onProcessPct != null ? String(target.onProcessPct) : '');
  const [packagingPct, setPackagingPct] = useState(() => target?.packagingPct != null ? String(target.packagingPct) : '');
  const [changeReason, setChangeReason] = useState('');
  const [touched, setTouched] = useState({});

  const selectTarget = nextRowId => {
    setSelectedRowId(nextRowId);
    const nextOrder = existingItems.find(item => String(item.rowId) === String(nextRowId));
    if (!nextOrder) return;
    setNhapInput(progressMode === 'cumulative' && nextOrder.nhap != null ? String(nextOrder.nhap) : '');
    setDeliveredInput(progressMode === 'cumulative' && nextOrder.deliveredQty != null ? String(nextOrder.deliveredQty) : '');
    setExpectedReceiptDate(dateInputValue(nextOrder.expectedReceiptDate));
    setActualDeliveryDate(dateInputValue(nextOrder.actualDeliveryDate));
    setShipDateEtd(dateInputValue(nextOrder.shipDateEtd));
    setEtaDate(dateInputValue(nextOrder.etaDate));
    setOnProcessPct(nextOrder.onProcessPct != null ? String(nextOrder.onProcessPct) : '');
    setPackagingPct(nextOrder.packagingPct != null ? String(nextOrder.packagingPct) : '');
  };

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

  const buildPayload = () => ({
    rowId: String(target.rowId),
    poId: target.poId,
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

  const submitForm = (event, mode) => {
    event.preventDefault();
    setTouched({ nhap: true, delivered: true, actualDeliveryDate: true, changeReason: true });
    if (hasErrors) return;
    const payload = buildPayload();
    if (mode === 'draft') onStageDraft(payload, target.trackingVersion ?? null);
    else onSaveDirect(payload, target.trackingVersion ?? null);
  };

  return <form className="workflow-form entry-quick-form" onSubmit={event => submitForm(event, 'save')}>
    <div className="entry-quick-header">
      <div>
        <h3>{t('Cập nhật tiến độ theo đơn hàng')}</h3>
        <p className="management-note">{t('Chọn đơn hàng và cách nhập số lượng. Trường có dấu * là bắt buộc.')}</p>
      </div>
      <div className="segmented-control progress-mode-switch" role="group" aria-label={t('Cách nhập số lượng tiến độ')}>
        <button type="button" aria-pressed={progressMode === 'today'} onClick={() => switchMode('today')}>{t('Nhập thêm hôm nay')}</button>
        <button type="button" aria-pressed={progressMode === 'cumulative'} onClick={() => switchMode('cumulative')}>{t('Cập nhật tổng lũy kế')}</button>
      </div>
      <button type="button" className="row-detail-button" onClick={onClose}>{t('Đóng biểu mẫu')}</button>
    </div>
    <fieldset disabled={pending} className="item-form-grid">
      <label className="workflow-wide">{t('Dòng PO cần cập nhật')} <span className="required-mark" aria-hidden="true">*</span>
        <select value={selectedRowId} onChange={e => selectTarget(e.target.value)}>
          {existingItems.map(item => <option key={item.rowId} value={item.rowId}>
            #{item.rowId} · {item.poId} · {t(item.vendorItemNo)} ({t('Đặt')}: {formatQuantity(item.orderedQty)} {item.unit})
          </option>)}
        </select>
      </label>
      <label>
        {t(progressMode === 'today' ? 'Nhập thêm về kho hôm nay' : 'SL đã về kho (lũy kế)')}
        {!target?.inboundOnly && progressMode === 'cumulative' && <> <span className="required-mark" aria-hidden="true">*</span></>}
        <input
          type="text"
          inputMode="decimal"
          value={nhapInput}
          onChange={e => { setNhapInput(e.target.value); setTouched(p => ({ ...p, nhap: true })); }}
          placeholder={t(progressMode === 'today' ? 'Ví dụ: 1.000' : 'Nhập tổng lũy kế')}
        />
        {projection.nhapInspect.error && <small className="field-hint is-error" role="alert">{t(projection.nhapInspect.error)}</small>}
        {!projection.nhapInspect.error && projection.nhapInspect.warning && <small className="field-hint is-warning">{t(projection.nhapInspect.warning)}</small>}
        {!projection.nhapInspect.error && <small className="field-hint">
          {phrase('Hiện tại: § · Tổng dự kiến sau lưu: §', formatQuantity(target?.nhap ?? 0), formatQuantity(projection.projectedReceived ?? 0))}
        </small>}
      </label>
      <label>
        {t(progressMode === 'today' ? 'Giao thêm cho khách hôm nay' : 'SL đã giao khách (lũy kế)')}
        <input
          type="text"
          inputMode="decimal"
          value={deliveredInput}
          onChange={e => { setDeliveredInput(e.target.value); setTouched(p => ({ ...p, delivered: true })); }}
          placeholder={t(progressMode === 'today' ? 'Ví dụ: 500' : 'Nhập tổng đã giao')}
        />
        {projection.deliveredInspect.error && <small className="field-hint is-error" role="alert">{t(projection.deliveredInspect.error)}</small>}
        {!projection.deliveredInspect.error && projection.deliveredInspect.warning && <small className="field-hint is-warning">{t(projection.deliveredInspect.warning)}</small>}
        {!projection.deliveredInspect.error && <small className="field-hint">
          {phrase('Hiện tại: § · Tổng dự kiến sau lưu: §', formatQuantity(target?.deliveredQty ?? 0), formatQuantity(projection.projectedDelivered ?? 0))}
        </small>}
      </label>
      <label>{t('Dự kiến về kho')}
        <input type="date" value={expectedReceiptDate} onChange={e => setExpectedReceiptDate(e.target.value)} />
      </label>
      <label>{t('Ngày giao xác nhận')}{(projection.projectedDelivered ?? 0) > 0 && <> <span className="required-mark" aria-hidden="true">*</span></>}
        <input type="date" max={businessToday()} value={actualDeliveryDate} onChange={e => { setActualDeliveryDate(e.target.value); setTouched(p => ({ ...p, actualDeliveryDate: true })); }} />
        {touched.actualDeliveryDate && deliveryError && <small className="field-hint is-error" role="alert">{t(deliveryError)}</small>}
      </label>
      <label>{t('ETD')}
        <input type="date" value={shipDateEtd} onChange={e => setShipDateEtd(e.target.value)} />
      </label>
      <label>{t('ETA')}
        <input type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} />
      </label>
      <label>{t('Sản xuất (%)')}
        <input type="number" min="0" max="100" step="0.1" value={onProcessPct} onChange={e => setOnProcessPct(e.target.value)} />
      </label>
      <label>{t('Đóng gói (%)')}
        <input type="number" min="0" max="100" step="0.1" value={packagingPct} onChange={e => setPackagingPct(e.target.value)} />
      </label>
      <label className="workflow-wide">{t('Lý do cập nhật')} <span className="required-mark" aria-hidden="true">*</span>
        <input value={changeReason} maxLength={500} onChange={e => { setChangeReason(e.target.value); setTouched(p => ({ ...p, changeReason: true })); }} placeholder={t('Ví dụ: Nhập kho đợt 2 theo phiếu NK-02…')} />
        {touched.changeReason && reasonError && <small className="field-hint is-error" role="alert">{t(reasonError)}</small>}
      </label>
    </fieldset>
    <div className="projected-total-banner" role="status">
      <strong>{t('Tổng dự kiến sau lưu:')}</strong>
      <span>{t('SL đặt:')} <b>{formatQuantity(target?.orderedQty)} {target?.unit}</b></span>
      <span>{t('Đã về kho:')} <b>{formatQuantity(projection.projectedReceived)} {target?.unit}</b></span>
      <span>{t('Đã giao khách:')} <b>{formatQuantity(projection.projectedDelivered)} {target?.unit}</b></span>
    </div>
    <div className="workflow-footer">
      <button type="button" onClick={onClose} disabled={pending}>{t('Hủy')}</button>
      <button type="button" className="row-detail-button" disabled={pending} onClick={e => submitForm(e, 'draft')}>{t('Đưa vào bản nháp')}</button>
      <button type="submit" className="primary" disabled={pending}>{t('Lưu cập nhật')}</button>
    </div>
  </form>;
}

export default function DataEntryPage({ actor, data, onSave }) {
  const sheets = ENTRY_SHEETS.filter(sheet => canReadSheet(actor, sheet));
  const [draft, setDraft] = useState(() => readEntryDraft(actor.id));
  const [selectedId, setSelectedId] = useState(() =>
    (sheets.find(item => draft.sheets[item.id] && canWriteSheet(actor, item)) ||
      sheets.find(item => canWriteSheet(actor, item)) || sheets[0])?.id);
  const [editing, setEditing] = useState(() => Boolean(draft.sheets[selectedId]));
  const [temporary, setTemporary] = useState(() => entryDraftIsTemporary(actor.id) && Object.keys(draft.sheets).length > 0);
  const [query, setQuery] = useState('');
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

  if (!sheet) return <section className="analytics-card management-panel"><h2>{t('Nhập liệu Excel')}</h2><p>{t('Bạn chưa được cấp quyền xem bảng dữ liệu nào.')}</p></section>;

  const writable = canWriteSheet(actor, sheet);
  const canEdit = writable && editing;
  const rows = draft.sheets[sheet.id] || [blankRow()];
  const canEditExisting = writable && !canEdit && sheet.id === 'orders';
  const columns = canEdit ? sheet.columns : [...sheet.columns, ...(sheet.extra || [])];
  const requiredCols = new Set(REQUIRED_BY_SHEET[sheet.id] || []);
  const existing = readEntryRows(sheet, actor, data).filter(row => !query ||
    columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(query.trim().toLowerCase())));
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
  const clearFeedback = () => { setMessage(''); setIssues([]); setWarnings([]); };
  const changeCell = (index, key, value) => {
    setRows(rows.map((row, i) => i === index ? { ...row, values: { ...row.values, [key]: value } } : row));
    clearFeedback();
  };
  const editOrder = order => {
    const current = rows.filter(hasValues);
    const present = current.some(row => String(row.values.rowId ?? '') === String(order.rowId));
    if (!present && current.length >= MAX_ENTRY_ROWS) {
      setIssues([{ message: 'Chọn bảng và nhập từ 1 đến 500 dòng.' }]);
      return;
    }
    const fields = ['rowId', 'poId', 'orderedQty', 'unit', 'nhap', 'deliveredQty', 'onProcessPct', 'packagingPct',
      'expectedReceiptDate', 'shipDateEtd', 'etaDate', 'actualShipDate', 'actualDeliveryDate'];
    if (!present) setRows([...current, { expectedVersion: order.trackingVersion ?? null, values: Object.fromEntries(fields.map(key => [key, order[key] ?? ''])) }]);
    clearFeedback();
    setQuickTargetOrder(order);
    setQuickMode('update-progress');
  };
  const pasteCells = (event, rowIndex, columnIndex) => {
    const text = event.clipboardData.getData('text');
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const pasted = clipboardRows(text);
    if (rowIndex + pasted.length > MAX_ENTRY_ROWS || pasted.some(line => columnIndex + line.length > columns.length)) {
      setIssues([{ message: 'Vùng dán vượt phạm vi bảng hoặc giới hạn 500 dòng.' }]);
      return;
    }
    const next = Array.from({ length: Math.max(rows.length, rowIndex + pasted.length) }, (_, index) => rows[index] || blankRow());
    pasted.forEach((line, index) => {
      const row = next[rowIndex + index];
      next[rowIndex + index] = { ...row, values: { ...row.values,
        ...Object.fromEntries(line.map((value, offset) => [columns[columnIndex + offset].key, value])) } };
    });
    setRows(next);
    clearFeedback();
  };
  const run = async operation => {
    clearFeedback();
    setPending(true);
    try { await operation(); }
    catch (error) { setIssues([{ message: error.message }]); }
    finally { setPending(false); }
  };
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
  const loadPreview = () => run(async () => {
    const next = readEntrySheet(importFile.book.getWorksheet(Number(worksheetId)), sheet, MAX_ENTRY_ROWS, year);
    const current = rows.filter(hasValues);
    if (current.length + next.length > MAX_ENTRY_ROWS) throw new Error('Chọn bảng và nhập từ 1 đến 500 dòng.');
    setRows([...current, ...next]);
    setImportFile(null);
    setEditing(true);
    setMessage(phrase('Đã thêm § dòng vào bản nháp. Kiểm tra rồi bấm Lưu dữ liệu.', next.length));
  });
  const save = () => run(async () => {
    const result = await onSave(sheet.id, rows.filter(hasValues), sheet.id === 'orders' ? draft.orderBaseline : undefined);
    if (result.warnings?.length) setWarnings(result.warnings);
    if (result.issues?.length) { setIssues(result.issues); return; }
    setRows([blankRow()]);
    setEditing(false);
    setMessage(t('Đã lưu dữ liệu và cập nhật các phân hệ liên quan.'));
  });
  const saveQuickRow = (values, expectedVersion) => run(async () => {
    const entry = expectedVersion !== undefined ? { expectedVersion, values } : { values };
    const result = await onSave('orders', [entry]);
    if (result.warnings?.length) setWarnings(result.warnings);
    if (result.issues?.length) { setIssues(result.issues); return; }
    setQuickMode(null);
    setQuickTargetOrder(null);
    setMessage(t('Đã lưu dữ liệu và cập nhật các phân hệ liên quan.'));
  });
  const stageQuickRow = (values, expectedVersion) => {
    const current = rows.filter(hasValues);
    if (current.length >= MAX_ENTRY_ROWS) {
      setIssues([{ message: 'Chọn bảng và nhập từ 1 đến 500 dòng.' }]);
      return;
    }
    const entry = expectedVersion !== undefined ? { expectedVersion, values } : { values };
    setRows([...current, entry]);
    setQuickMode(null);
    setQuickTargetOrder(null);
    setEditing(true);
    setMessage(phrase('Đã thêm § dòng vào bản nháp. Kiểm tra rồi bấm Lưu dữ liệu.', 1));
  };

  return <section className="analytics-card management-panel entry-workspace" aria-busy={pending}>
    <div className="entry-heading"><div><h1>{t('Nhập liệu Excel')}</h1>
      <p>{t('Chọn bảng, dùng biểu mẫu gọn theo từng việc hoặc tải Excel vào bản nháp để kiểm tra trước khi lưu.')}</p></div></div>
    <nav className="workflow-filter-tabs entry-tabs" aria-label={t('Bảng dữ liệu')}>
      {sheets.map(item => <button type="button" key={item.id} aria-pressed={item.id === sheet.id} disabled={pending}
        onClick={() => { setSelectedId(item.id); setImportFile(null); setQuickMode(null); setQuery(''); clearFeedback(); }}>{t(item.label)}</button>)}
    </nav>
    <div className="entry-toolbar">
      <button className="row-detail-button" type="button" aria-pressed={!canEdit && !quickMode} disabled={pending} onClick={() => { setEditing(false); setQuickMode(null); clearFeedback(); }}>{t('Dữ liệu hiện có')}</button>
      {writable && <button className="row-detail-button" type="button" aria-pressed={canEdit && !quickMode} disabled={pending} onClick={() => { setEditing(true); setQuickMode(null); clearFeedback(); }}>{t('Bản nháp nhập liệu')}</button>}
      {writable && sheet.id === 'orders' && <>
        <button className="row-primary-button" type="button" aria-pressed={quickMode === 'create-order'} disabled={pending}
          onClick={() => { setQuickMode(quickMode === 'create-order' ? null : 'create-order'); clearFeedback(); }}>
          <FilePlus2 size={15} />{t('Thêm đơn hàng')}
        </button>
        <button className="row-detail-button" type="button" aria-pressed={quickMode === 'update-progress'} disabled={pending}
          onClick={() => { setQuickTargetOrder(data.items[0] || null); setQuickMode(quickMode === 'update-progress' ? null : 'update-progress'); clearFeedback(); }}>
          <RefreshCw size={15} />{t('Cập nhật tiến độ')}
        </button>
      </>}
      {!canEdit && <input type="search" aria-label={t('Tìm trong bảng')} placeholder={t('Tìm trong bảng')} value={query} onChange={event => setQuery(event.target.value)} />}
      <div className="entry-file-actions">
        {writable && <>
          <input hidden type="file" accept=".xlsx" ref={fileInput} onChange={stageFile} />
          <button className="row-detail-button" type="button" disabled={pending} onClick={() => fileInput.current.click()}><Upload size={15} />{t('Tải Excel lên')}</button>
          <button className="row-detail-button" type="button" disabled={pending} onClick={() => run(() => downloadEntryWorkbook(sheet, sheet.columns, []))}><Download size={15} />{t('Tệp mẫu')}</button>
        </>}
        <button className="row-detail-button" type="button" disabled={pending} onClick={() => run(() => downloadEntryWorkbook(sheet, columns, canEdit ? rows.filter(hasValues).map(row => row.values) : existing))}><Download size={15} />{t('Xuất Excel')}</button>
      </div>
    </div>
    {!writable && <p className="management-note">{t(sheet.id === 'receivables' ? 'Công nợ phải thu được tạo từ doanh thu và cập nhật qua phân bổ thu.' : 'Bảng này chỉ dùng để xem và xuất dữ liệu.')}</p>}
    {writable && sheet.id === 'orders' && quickMode === 'create-order' && (
      <QuickCreateOrderForm
        existingItems={data.items}
        pending={pending}
        onSaveDirect={values => saveQuickRow(values)}
        onStageDraft={values => stageQuickRow(values)}
        onClose={() => setQuickMode(null)}
      />
    )}
    {writable && sheet.id === 'orders' && quickMode === 'update-progress' && (
      <QuickUpdateProgressForm
        key={quickTargetOrder?.rowId || 'default'}
        existingItems={data.items}
        initialOrder={quickTargetOrder}
        pending={pending}
        onSaveDirect={(values, version) => saveQuickRow(values, version)}
        onStageDraft={(values, version) => stageQuickRow(values, version)}
        onClose={() => setQuickMode(null)}
      />
    )}
    {importFile && writable && <div className="entry-import">
      <strong>{importFile.name}</strong>
      <label>{t('Trang tính')} <select value={worksheetId} disabled={pending} onChange={event => setWorksheetId(event.target.value)}>
        {importFile.book.worksheets.map(tab => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
      </select></label>
      <label>{t('Năm cho ngày thiếu năm')} <input inputMode="numeric" maxLength={4} value={year} onChange={event => setYear(event.target.value)} placeholder="2026" /></label>
      <button className="row-primary-button" type="button" disabled={pending} onClick={loadPreview}>{t('Đưa vào bản nháp')}</button>
      <button className="row-detail-button" type="button" disabled={pending} onClick={() => setImportFile(null)}>{t('Hủy')}</button>
    </div>}
    {temporary && <p role="status" className="management-note">{t('Trình duyệt chỉ giữ bản nháp đến khi tải lại hoặc đóng thẻ. Hãy lưu dữ liệu trước khi rời đi.')}</p>}
    {message && <p role="status" className="management-note">{message}</p>}
    {warnings.length > 0 && <div role="status" className="entry-warnings">
      <strong>{t('Lưu ý định dạng số đã được hệ thống quy đổi:')}</strong>
      <ul>{warnings.map((warn, idx) => <li key={idx}>{warn.line ? phrase('Dòng §', warn.line) + ' · ' : ''}{t(warn.message)}</li>)}</ul>
    </div>}
    {issues.length > 0 && <div role="alert" className="entry-errors"><strong>{t('Chưa thể lưu hoặc nhập dữ liệu')}</strong>
      <ul>{issues.map((issue, index) => <li key={index}>{issue.line ? phrase('Dòng §', issue.line) + ' · ' : ''}{t(issue.message)}</li>)}</ul>
    </div>}
    <div className="table-scroll entry-table-frame">
      <table className="management-table entry-table"><thead><tr><th scope="col">#</th>{canEditExisting && <th scope="col">{t('Thao tác')}</th>}
        {columns.map(col => <th key={col.key} scope="col">{t(col.label)}{canEdit && requiredCols.has(col.key) && <span className="required-mark" aria-hidden="true"> *</span>}</th>)}{canEdit && <th scope="col">{t('Thao tác')}</th>}
      </tr></thead><tbody>
        {canEdit ? rows.map((row, index) => <tr key={index}><th scope="row">{row.line || index + 1}</th>
          {columns.map((col, columnIndex) => <td key={col.key}>
            <input disabled={pending} aria-label={`${t(col.label)} · ${index + 1}`}
              inputMode={col.type === 'number' ? 'decimal' : undefined} placeholder={col.type === 'date' ? 'YYYY-MM-DD' : undefined}
              value={row.values[col.key] ?? ''} onPaste={event => pasteCells(event, index, columnIndex)}
              onChange={event => changeCell(index, col.key, event.target.value)} />
            <CellFeedback columnKey={col.key} value={row.values[col.key]} rowValues={row.values} />
          </td>)}
          <td><button className="row-detail-button" type="button" disabled={pending} aria-label={t('Xóa dòng bản nháp')}
            onClick={() => { setRows(rows.length > 1 ? rows.filter((_, i) => i !== index) : [blankRow()]); clearFeedback(); }}><Trash2 size={15} /></button></td>
        </tr>) : existing.map((row, index) => <tr key={row.id || row.rowId || index}><th scope="row">{index + 1}</th>
          {canEditExisting && <td><button className="row-detail-button" type="button" disabled={pending} onClick={() => editOrder(row)}>{t('Sửa tiến độ')}</button></td>}
          {columns.map(col => <td key={col.key}>{row[col.key] === null || row[col.key] === undefined || row[col.key] === '' ? '—' : typeof row[col.key] === 'boolean' ? t(row[col.key] ? 'Có' : 'Không') : t(String(row[col.key]))}</td>)}
        </tr>)}
      </tbody></table>
      {!canEdit && existing.length === 0 && <p className="management-note">{t('Không có dữ liệu theo bộ lọc')}</p>}
    </div>
    {canEdit && <div className="entry-footer">
      <span>{phrase('§ dòng trong bản nháp', rows.filter(hasValues).length)}</span>
      <button type="button" className="row-detail-button" disabled={pending || rows.length >= MAX_ENTRY_ROWS} onClick={() => setRows([...rows, blankRow()])}><Plus size={15} />{t('Thêm dòng')}</button>
      {rows.some(hasValues) && <button type="button" className="row-detail-button" disabled={pending}
        onClick={() => { if (window.confirm(t('Bỏ toàn bộ bản nháp của bảng này?'))) { setRows([blankRow()]); clearFeedback(); } }}>
        {t('Bỏ bản nháp')}
      </button>}
      <button type="button" className="row-primary-button" disabled={pending || !rows.some(hasValues)} onClick={save}><Save size={15} />{t('Lưu dữ liệu')}</button>
    </div>}
  </section>;
}
