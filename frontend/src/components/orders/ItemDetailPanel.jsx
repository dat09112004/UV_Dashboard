import { locale, phrase, t } from '../../locales/i18n.js';
import React, { useEffect, useRef, useState } from 'react';
import { ShoppingBag, PackageCheck, Truck, CalendarDays } from 'lucide-react';
import { getFulfillment, formatQuantity, formatPercent, dateInputValue } from '../../utils/orderFulfillment.js';
import { formatMoney, formatDate } from '../../utils/dashboardMetrics.js';
import { businessToday } from '../../utils/financeWorkflow.js';
import { parseBusinessDate } from '../../utils/business.js';
import { computeProjectedProgress } from '../../utils/workspaceUi.js';
import { QuantityProgress } from './FulfillmentTable.jsx';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';
import { formatMoneyInputHint } from '../finance/MoneyField.jsx';

// Chức năng: Cửa sổ chi tiết dòng đơn hàng PO: đối chiếu tài chính (Doanh thu/AR/AP), lịch sử cập nhật và biểu mẫu sửa tiến độ
export default function ItemDetailPanel({
  item, reportDate, canEdit, readOnlyReason = '', canLowerAlerts, financials, showFinancials = true, isSaving, serverError = '', onSubmit, onClose,
  tasks = [], accounts = [], reminders = [], onRemindAlert,
}) {
  const state = getFulfillment(item, reportDate);
  const formRef = useRef(null);
  const [progressMode, setProgressMode] = useState('cumulative');
  const [orderedInput, setOrderedInput] = useState(item.orderedQty != null ? String(item.orderedQty) : '');
  const [unitInput, setUnitInput] = useState(item.unit || '');
  const [nhapInput, setNhapInput] = useState(item.nhap != null ? String(item.nhap) : '');
  const [deliveredInput, setDeliveredInput] = useState(item.deliveredQty != null ? String(item.deliveredQty) : '');
  const [expectedReceiptDate, setExpectedReceiptDate] = useState(() => dateInputValue(item.expectedReceiptDate));
  const [actualDeliveryDate, setActualDeliveryDate] = useState(() => dateInputValue(item.actualDeliveryDate));
  const [shipDateEtd, setShipDateEtd] = useState(() => dateInputValue(item.shipDateEtd));
  const [actualShipDate, setActualShipDate] = useState(() => dateInputValue(item.actualShipDate));
  const [etaDate, setEtaDate] = useState(() => dateInputValue(item.etaDate));
  const [customerName, setCustomerName] = useState(item.customerName || '');
  const [unitPriceInput, setUnitPriceInput] = useState(item.unitPriceVnd != null ? String(item.unitPriceVnd) : '');
  const [salePriceInput, setSalePriceInput] = useState(item.saleUnitPriceVnd != null ? String(item.saleUnitPriceVnd) : '');
  const [onProcessPct, setOnProcessPct] = useState(item.onProcessPct != null ? String(item.onProcessPct) : '0');
  const [packagingPct, setPackagingPct] = useState(item.packagingPct != null ? String(item.packagingPct) : '0');
  const [changeReason, setChangeReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [productionOpen, setProductionOpen] = useState(false);
  const lastSyncedKeyRef = useRef(`${item.rowId}:${item.trackingVersion ?? ''}`);

  // Chức năng: Tự động làm mới ô nhập sau khi lưu thành công (reset ô Nhập thêm hôm nay về trống để không bị cộng dồn lại chính số vừa lưu)
  useEffect(() => {
    const nextKey = `${item.rowId}:${item.trackingVersion ?? ''}`;
    if (lastSyncedKeyRef.current === nextKey) return;
    lastSyncedKeyRef.current = nextKey;
    setOrderedInput(item.orderedQty != null ? String(item.orderedQty) : '');
    setUnitInput(item.unit || '');
    setNhapInput(progressMode === 'today' ? '' : (item.nhap != null ? String(item.nhap) : ''));
    setDeliveredInput(progressMode === 'today' ? '' : (item.deliveredQty != null ? String(item.deliveredQty) : ''));
    setExpectedReceiptDate(dateInputValue(item.expectedReceiptDate));
    setActualDeliveryDate(dateInputValue(item.actualDeliveryDate));
    setShipDateEtd(dateInputValue(item.shipDateEtd));
    setActualShipDate(dateInputValue(item.actualShipDate));
    setEtaDate(dateInputValue(item.etaDate));
    setCustomerName(item.customerName || '');
    setUnitPriceInput(item.unitPriceVnd != null ? String(item.unitPriceVnd) : '');
    setSalePriceInput(item.saleUnitPriceVnd != null ? String(item.saleUnitPriceVnd) : '');
    setOnProcessPct(item.onProcessPct != null ? String(item.onProcessPct) : '0');
    setPackagingPct(item.packagingPct != null ? String(item.packagingPct) : '0');
    setChangeReason('');
    setReasonTouched(false);
    setSubmitError('');
  }, [item, progressMode]);

  // Chức năng: Xử lý nghiệp vụ (switchMode - Mode) phục vụ xử lý dữ liệu trong ItemDetailPanel.jsx
  const switchMode = nextMode => {
    if (nextMode === progressMode) return;
    setProgressMode(nextMode);
    if (nextMode === 'today') {
      setNhapInput('');
      setDeliveredInput('');
    } else {
      setNhapInput(item.nhap != null ? String(item.nhap) : '');
      setDeliveredInput(item.deliveredQty != null ? String(item.deliveredQty) : '');
    }
  };

  const projection = computeProjectedProgress(
    item,
    { mode: progressMode, nhapInput, deliveredInput, orderedInput },
  );

  const todayDate = parseBusinessDate(reportDate || businessToday());
  const releasedDate = parseBusinessDate(item.releasedPoDate);
  const parsedReceipt = parseBusinessDate(expectedReceiptDate);
  const parsedActualShip = parseBusinessDate(actualShipDate);
  const parsedActualDelivery = parseBusinessDate(actualDeliveryDate);
  const parsedEtd = parseBusinessDate(shipDateEtd);
  const parsedEta = parseBusinessDate(etaDate);

  const unitError = projection.orderedQty !== null && !String(unitInput || '').trim()
    ? 'Cần bổ sung đơn vị tính khi nhập số lượng đặt.'
    : String(unitInput || '').trim().length > 24
      ? 'Đơn vị tính tối đa 24 ký tự.' : '';

  const receiptDateError = parsedReceipt && parsedEta && parsedReceipt > parsedEta
    ? 'Ngày dự kiến về kho không được sau ETA giao khách.'
    : parsedReceipt && releasedDate && parsedReceipt < releasedDate
      ? 'Ngày về dự kiến không được trước ngày phát hành PO.' : '';

  const actualShipError = parsedActualShip && todayDate && parsedActualShip > todayDate
    ? 'Ngày xuất thực tế không được sau ngày hiện tại.'
    : parsedActualShip && releasedDate && parsedActualShip < releasedDate
      ? 'Ngày xuất thực tế không được trước ngày phát hành PO.' : '';

  const actualDeliveryError = (projection.projectedDelivered ?? 0) > 0 && !actualDeliveryDate
    ? 'Cần số lượng đặt và ngày giao xác nhận khi có số lượng đã giao.'
    : parsedActualDelivery && !(projection.projectedDelivered > 0)
      ? 'Cần có số lượng giao khách lớn hơn 0 khi ghi ngày giao xác nhận.'
      : parsedActualDelivery && parsedActualShip && parsedActualDelivery < parsedActualShip
        ? 'Ngày giao xác nhận không được trước ngày xuất thực tế.'
        : parsedActualDelivery && todayDate && parsedActualDelivery > todayDate
          ? 'Ngày giao xác nhận không được sau ngày theo dõi.'
          : parsedActualDelivery && releasedDate && parsedActualDelivery < releasedDate
            ? 'Ngày giao xác nhận không được trước ngày phát hành PO.' : '';

  const etdError = parsedEtd && releasedDate && parsedEtd < releasedDate
    ? 'ETD không trước PO; ETA không trước ETD.' : '';
  const etaError = parsedEtd && parsedEta && parsedEta < parsedEtd
    ? 'ETD không trước PO; ETA không trước ETD.' : '';

  const numOnProcess = onProcessPct === '' ? null : Number(onProcessPct);
  const numPackaging = packagingPct === '' ? null : Number(packagingPct);
  const onProcessError = !item.inboundOnly && (numOnProcess === null || !Number.isFinite(numOnProcess) || numOnProcess < 0 || numOnProcess > 100)
    ? 'Tỷ lệ sản xuất từ 0 đến 100%.' : '';
  const packagingError = !item.inboundOnly && (numPackaging === null || !Number.isFinite(numPackaging) || numPackaging < 0 || numPackaging > 100)
    ? 'Tỷ lệ đóng gói từ 0 đến 100%.'
    : numPackaging !== null && (numOnProcess === null || numPackaging > numOnProcess)
      ? 'Tỷ lệ đóng gói không vượt tỷ lệ sản xuất; tỷ lệ từ 0 đến 100.' : '';

  const reasonError = reasonTouched && !String(changeReason || '').trim()
    ? 'Cần lý do cập nhật, tối đa 500 ký tự.' : '';

  // Chức năng: Xử lý sự kiện (handleSubmit - Submit) phục vụ xử lý dữ liệu trong ItemDetailPanel.jsx
  const parsedImportPrice = Number(String(unitPriceInput || '').replace(/[.,\s]/g, '')) || 0;
  const parsedSalePrice = Number(String(salePriceInput || '').replace(/[.,\s]/g, '')) || 0;
  const projectedApVnd = (projection.projectedReceived ?? 0) > 0 && parsedImportPrice > 0
    ? Math.round((projection.projectedReceived ?? 0) * parsedImportPrice) : 0;
  const projectedArVnd = (projection.projectedDelivered ?? 0) > 0 && parsedSalePrice > 0
    ? Math.round((projection.projectedDelivered ?? 0) * parsedSalePrice) : 0;
  const projectedCogsVnd = (projection.projectedDelivered ?? 0) > 0 && parsedImportPrice > 0
    ? Math.round((projection.projectedDelivered ?? 0) * parsedImportPrice) : 0;
  const projectedActualRevVnd = projectedArVnd - projectedCogsVnd;
  const salePriceError = (projection.projectedDelivered ?? 0) > 0 && !(parsedSalePrice > 0)
    ? 'Vui lòng nhập Đơn giá bán ra cho khách (VND) lớn hơn 0 khi giao hàng.' : '';
  const salePriceWarning = (projection.projectedDelivered ?? 0) > 0 && parsedSalePrice > 0 && parsedImportPrice > 0 && parsedSalePrice <= parsedImportPrice
    ? 'Cảnh báo: Đơn giá bán ra đang nhỏ hơn hoặc bằng đơn giá nhập kho (lãi gộp <= 0).' : '';
  const customerError = (projection.projectedDelivered ?? 0) > 0 && !String(customerName || '').trim()
    ? 'Vui lòng nhập tên Khách hàng / Bên nhận khi có số lượng giao khách để ghi nhận Doanh thu và Công nợ phải thu.' : '';

  const handleSubmit = event => {
    setReasonTouched(true);
    const firstError =
      projection.orderedInspect.error ||
      unitError ||
      projection.nhapInspect.error ||
      projection.deliveredInspect.error ||
      customerError ||
      salePriceError ||
      receiptDateError ||
      actualShipError ||
      actualDeliveryError ||
      etdError ||
      etaError ||
      onProcessError ||
      packagingError ||
      (!String(changeReason || '').trim() ? 'Cần nhập lý do cập nhật tiến độ trước khi lưu.' : '');
    if (firstError) {
      event.preventDefault();
      if (onProcessError || packagingError) setProductionOpen(true);
      setSubmitError(firstError);
      return;
    }
    setSubmitError('');
    onSubmit(event);
  };

  const alertObj = { id: `order-${item.rowId}`, type: 'orders', reference: item.poId, label: item.vendorItemNo, status: item.alertLabel, data: item };
  const isSaleOwned = item.ownerType === 'sale_self_owned' || item.createdByRole === 'Sale';
  return <div className="item-detail-panel">
    <section className={`item-detail-notice ${item.priorityRank === 0 ? 'critical' : item.priorityRank === 1 ? 'warning' : 'normal'}`}>
      <div><strong>{t(item.alertLevel)}</strong>{item.lastUpdateDate && <span>{t("Cập nhật: ")}{item.lastUpdateDate} {t(item.lastUpdateTime)}</span>}</div>
      <p>{t(item.alertLabel)}</p>
      <AlertAssignmentLine
        alertRef={{ id: alertObj.id, type: 'orders', reference: item.poId, data: item }}
        tasks={tasks}
        accounts={accounts}
        reminders={reminders}
        canRemind={Boolean(onRemindAlert && item.priorityRank === 0)}
        onRemind={() => onRemindAlert?.(alertObj)}
      />
    </section>
    {canEdit && <button type="button" className="item-edit-shortcut" onClick={() => { formRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); formRef.current?.querySelector('input:not([type=hidden])')?.focus({ preventScroll: true }); }}>{t("Cập nhật tiến độ ")}<span aria-hidden="true">↓</span></button>}
    {item.totalValueVnd != null && <div className="item-business-summary">
      <span>{t('Mã nhóm hàng')} <b>{item.category}</b></span>
      <span>{t('Giá nhập kho')} <b>{formatMoney(item.unitPriceVnd)} / {item.unit}</b></span>
      {item.saleUnitPriceVnd > 0 && <span>{t('Giá bán ra')} <b>{formatMoney(item.saleUnitPriceVnd)} / {item.unit}</b></span>}
      <span>{t('Giá trị PO')} <b>{formatMoney(item.totalValueVnd)}</b></span>
      <span>{t('Người tạo đơn')} <b>{(item.createdByRole === 'Admin' || item.createdByName === 'Quản trị Demo' ? 'Ban Giám đốc' : (item.createdByName || (isSaleOwned ? 'Nhân viên Sale' : 'Ban Giám đốc')))}</b></span>
      <span>{t('Người đảm nhận')} <b>{isSaleOwned ? `${item.assignedSaleName || item.createdByName || 'Phòng Sale'} (${t('Sale tự nhận')})` : t('Theo phân công Giao việc')}</b></span>
    </div>}
    <section className="fulfillment-stages" aria-label={t("Tiến độ nhập và giao của mã hàng")}>
      <div className="fulfillment-stage"><div className="stage-heading"><ShoppingBag size={20} /><strong>{t("Đã đặt hàng")}</strong></div><div className="stage-quantity">{formatQuantity(state.orderedQty)}<small> {item.unit}</small></div><span>{t(state.isReleased ? `PO phát hành ${formatDate(item.releasedPoDate)}` : 'Chưa có ngày phát hành PO')}</span>{state.orderedQty === null && <small className="stage-missing">{t("Cần bổ sung số lượng đặt")}</small>}</div>
      <div className="fulfillment-stage"><div className="stage-heading"><PackageCheck size={20} /><strong>{t("Đã về kho")}</strong></div><QuantityProgress label={t("Tỷ lệ đã về kho")} quantity={state.receivedQty} percent={state.receivedPct} unit={item.unit} tone={state.lateReceiptDays ? 'critical' : 'normal'} /><span>{t("Còn về: ")}{formatQuantity(state.remainingReceipt)} {item.unit}</span></div>
      <div className="fulfillment-stage"><div className="stage-heading"><Truck size={20} /><strong>{t("Đã giao khách")}</strong></div><QuantityProgress label={t("Tỷ lệ đã giao khách")} quantity={state.deliveredQty} percent={state.deliveredPct} unit={item.unit} tone={state.tone} /><span>{t(state.deliveredQty === null ? 'Chưa có xác nhận số lượng giao' : `Còn giao: ${formatQuantity(state.remainingDelivery)} ${item.unit}`)}</span></div>
    </section>
    <section className="item-delivery-dates"><CalendarDays size={19} /><div><span>{t("Dự kiến về kho")}</span><strong>{formatDate(item.expectedReceiptDate)}</strong></div><div><span>{t("Thời gian dự kiến xuất hàng (ETD)")}</span><strong>{formatDate(item.shipDateEtd)}</strong></div><div><span>{t("Thời gian dự kiến đến (ETA)")}</span><strong>{formatDate(item.etaDate)}</strong></div><div><span>{t("Giao xác nhận gần nhất")}</span><strong>{formatDate(item.actualDeliveryDate)}</strong></div><span className={`fulfillment-status ${state.tone}`}>{t(state.label)}</span></section>
    <div className="item-business-summary"><span>{t("Tồn đầu ")}<b>{formatQuantity(item.tonDau)} {item.unit}</b></span><span>{t("Số bán ")}<b>{formatQuantity(item.ban)} {item.unit}</b></span><span>{t("Sản xuất ")}<b>{formatPercent(item.onProcessPct)}</b>{t(" · Đóng gói ")}<b>{formatPercent(item.packagingPct)}</b></span>{showFinancials && <><span>{t("Doanh thu ")}<b>{formatMoney(financials.revenue)}</b></span><span>{t("Phải thu liên quan ")}<b>{formatMoney(financials.receivables)}</b></span><span>{t(financials.grouped ? 'Phải trả trên CT gộp' : 'Phải trả liên quan')} <b>{formatMoney(financials.payables)}</b></span></>}</div>
    {!canEdit && readOnlyReason && <div className="entry-warnings" role="status" style={{ marginTop: 12 }}><strong>{t('Chế độ chỉ xem')}:</strong> {readOnlyReason}</div>}
    {canEdit ? <form ref={formRef} className="item-progress-form" noValidate onSubmit={handleSubmit}>
      <div className="item-form-heading">
        <div>
          <h4>{t('Cập nhật số lượng lũy kế & lịch giao')}</h4>
          <span>{t(item.vendorName)} · {item.countryOfOrigin}</span>
        </div>
        <div className="segmented-control progress-mode-switch" role="group" aria-label={t('Cách nhập số lượng tiến độ')}>
          <button type="button" aria-pressed={progressMode === 'today'} onClick={() => switchMode('today')}>{t('Nhập thêm hôm nay')}</button>
          <button type="button" aria-pressed={progressMode === 'cumulative'} onClick={() => switchMode('cumulative')}>{t('Cập nhật tổng lũy kế')}</button>
        </div>
      </div>
      <fieldset disabled={isSaving}>
        <input type="hidden" name="orderedQty" value={projection.orderedQty ?? ''} />
        <input type="hidden" name="nhap" value={projection.projectedReceived ?? ''} />
        <input type="hidden" name="deliveredQty" value={projection.projectedDelivered ?? ''} />
        <h5 className="form-section-title">{t("Số lượng hàng")}</h5>
        <div className="item-form-grid">
          <label>{t("Số lượng đặt")}
            <input type="text" inputMode="decimal" value={orderedInput} onChange={e => setOrderedInput(e.target.value)} />
            {projection.orderedInspect.error && <small className="field-hint is-error" role="alert">{t(projection.orderedInspect.error)}</small>}
            {!projection.orderedInspect.error && projection.orderedInspect.warning && <small className="field-hint is-warning">{t(projection.orderedInspect.warning)}</small>}
          </label>
          <label>{t("Đơn vị tính")}{projection.orderedQty !== null && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="unit" value={unitInput} onChange={e => setUnitInput(e.target.value)} maxLength={24} />
            {unitError && <small className="field-hint is-error" role="alert">{t(unitError)}</small>}
          </label>
          <label>
            {t(progressMode === 'today' ? 'Nhập thêm về kho hôm nay' : 'Đã về kho (lũy kế)')}
            {!item.inboundOnly && progressMode === 'cumulative' && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input
              type="text"
              inputMode="decimal"
              required={!item.inboundOnly && progressMode === 'cumulative'}
              value={nhapInput}
              onChange={e => setNhapInput(e.target.value)}
            />
            {projection.nhapInspect.error && <small className="field-hint is-error" role="alert">{t(projection.nhapInspect.error)}</small>}
            {!projection.nhapInspect.error && projection.nhapInspect.warning && <small className="field-hint is-warning">{t(projection.nhapInspect.warning)}</small>}
            {!projection.nhapInspect.error && progressMode === 'today' && (
              <small className="field-hint">
                {`${t('Đã về kho trước đó:')} ${formatQuantity(state.receivedQty ?? 0)} · ${t('Còn có thể nhập thêm tối đa:')} ${formatQuantity(Math.max(0, (projection.orderedQty ?? 0) - (state.receivedQty ?? 0)))} · ${phrase('Tổng sau lưu: §', formatQuantity(projection.projectedReceived ?? 0))}`}
              </small>
            )}
          </label>
          <label>
            {t(progressMode === 'today' ? 'Giao thêm cho khách hôm nay' : 'Đã giao khách (lũy kế)')}
            <input
              type="text"
              inputMode="decimal"
              value={deliveredInput}
              onChange={e => setDeliveredInput(e.target.value)}
            />
            {projection.deliveredInspect.error && <small className="field-hint is-error" role="alert">{t(projection.deliveredInspect.error)}</small>}
            {!projection.deliveredInspect.error && projection.deliveredInspect.warning && <small className="field-hint is-warning">{t(projection.deliveredInspect.warning)}</small>}
            {!projection.deliveredInspect.error && progressMode === 'today' && (
              <small className="field-hint">
                {phrase('Tổng sau lưu: §', formatQuantity(projection.projectedDelivered ?? 0))}
              </small>
            )}
          </label>
          <label>
            {t('Đơn giá nhập kho từ NCC (VND)')}
            <input
              name="unitPriceVnd"
              type="text"
              inputMode="numeric"
              value={unitPriceInput}
              onChange={e => setUnitPriceInput(e.target.value)}
            />
            {formatMoneyInputHint(unitPriceInput) && <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoneyInputHint(unitPriceInput)}</small>}
            <small className="field-hint">{t('Tính Công nợ phải trả NCC khi nhập kho.')}</small>
          </label>
          <label>
            {t('Đơn giá bán ra cho khách (VND)')}{(projection.projectedDelivered ?? 0) > 0 && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input
              name="saleUnitPriceVnd"
              type="text"
              inputMode="numeric"
              value={salePriceInput}
              onChange={e => setSalePriceInput(e.target.value)}
            />
            {!salePriceError && formatMoneyInputHint(salePriceInput) && <small className="field-hint" style={{ color: '#1558c9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoneyInputHint(salePriceInput)}</small>}
            {salePriceError && <small className="field-hint is-error" role="alert">{t(salePriceError)}</small>}
            {!salePriceError && salePriceWarning && <small className="field-hint is-warning">{t(salePriceWarning)}</small>}
          </label>
          <label className="workflow-wide">
            {t('Khách hàng / Bên nhận giao hàng')}{(projection.projectedDelivered ?? 0) > 0 && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input
              name="customerName"
              value={customerName}
              maxLength={255}
              onChange={e => setCustomerName(e.target.value)}
            />
            {customerError && <small className="field-hint is-error" role="alert">{t(customerError)}</small>}
          </label>
          {showFinancials && (projectedApVnd > 0 || projectedArVnd > 0) && (
            <div className="workflow-wide p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap gap-4 justify-between">
              <span>{t('Phải trả NCC (Nhập kho):')} <strong className="text-slate-900">{formatMoney(projectedApVnd)}</strong></span>
              <span>{t('Phải thu khách (Bán ra):')} <strong className="text-blue-700">{formatMoney(projectedArVnd)}</strong></span>
              <span>{t('Doanh thu thực tế (Bán ra − Vốn nhập):')} <strong className={projectedActualRevVnd >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatMoney(projectedActualRevVnd)}</strong></span>
            </div>
          )}
        </div>
        <details className="production-edit" open><summary>{t("Lịch xuất và giao hàng")}</summary><div className="item-form-grid">
          <label>{t("Dự kiến về kho")}
            <input name="expectedReceiptDate" type="date" value={expectedReceiptDate} onChange={e => setExpectedReceiptDate(e.target.value)} />
            {receiptDateError && <small className="field-hint is-error" role="alert">{t(receiptDateError)}</small>}
          </label>
          <label>{t("Ngày giao xác nhận gần nhất")}{(projection.projectedDelivered ?? 0) > 0 && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="actualDeliveryDate" type="date" max={businessToday()} value={actualDeliveryDate} onChange={e => setActualDeliveryDate(e.target.value)} />
            {actualDeliveryError && <small className="field-hint is-error" role="alert">{t(actualDeliveryError)}</small>}
          </label>
          <label>{t("Thời gian dự kiến xuất hàng (ETD)")}
            <input name="shipDateEtd" type="date" value={shipDateEtd} onChange={e => setShipDateEtd(e.target.value)} />
            {etdError && <small className="field-hint is-error" role="alert">{t(etdError)}</small>}
          </label>
          <label>{t("Ngày xuất thực tế")}
            <input name="actualShipDate" type="date" max={businessToday()} value={actualShipDate} onChange={e => setActualShipDate(e.target.value)} />
            {actualShipError && <small className="field-hint is-error" role="alert">{t(actualShipError)}</small>}
          </label>
          <label>{t("Thời gian dự kiến đến (ETA)")}
            <input name="etaDate" type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} />
            {etaError && <small className="field-hint is-error" role="alert">{t(etaError)}</small>}
          </label>
        </div></details>
        <details className="production-edit" open={productionOpen} onToggle={e => setProductionOpen(e.currentTarget.open)}><summary>{t("Sản xuất & cảnh báo thủ công")}</summary><div className="item-form-grid">
          <label>{t("Sản xuất (%)")}{!item.inboundOnly && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="onProcessPct" type="number" min="0" max="100" step="0.1" required={!item.inboundOnly} value={onProcessPct} onChange={e => setOnProcessPct(e.target.value)} />
            {onProcessError && <small className="field-hint is-error" role="alert">{t(onProcessError)}</small>}
          </label>
          <label>{t("Đóng gói (%)")}{!item.inboundOnly && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="packagingPct" type="number" min="0" max="100" step="0.1" required={!item.inboundOnly} value={packagingPct} onChange={e => setPackagingPct(e.target.value)} />
            {packagingError && <small className="field-hint is-error" role="alert">{t(packagingError)}</small>}
          </label>
          <label>{t("Số bán trên dữ liệu gốc")}<input value={item.ban ?? ''} readOnly disabled /></label>
          <label>{t("Cảnh báo thủ công")}<select name={canLowerAlerts ? "manualPriorityRank" : undefined} disabled={!canLowerAlerts} defaultValue={item.manualPriorityRank ?? item.priorityRank ?? 2}>{['Báo động đỏ', 'Cần xử lý', 'Đúng hạn'].map((label, rank) => <option key={rank} value={rank} disabled={!canLowerAlerts && rank > (item.manualPriorityRank ?? item.priorityRank)}>{t(label)}</option>)}</select></label>
        </div></details>
        <label className="update-reason">{t("Lý do cập nhật")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="changeReason" required maxLength={500} value={changeReason} onChange={e => { setChangeReason(e.target.value); setReasonTouched(true); }} onBlur={() => setReasonTouched(true)} />
          {reasonError && <small className="field-hint is-error" role="alert">{t(reasonError)}</small>}
        </label>
      </fieldset>
      {(submitError || serverError) && <div className="workspace-error" role="alert" style={{ marginTop: 12 }}><span>{t(submitError || serverError)}</span></div>}
      <div className="item-form-footer"><button type="button" onClick={onClose} disabled={isSaving}>{t("Đóng")}</button><button className="primary" type="submit" disabled={isSaving}>{t(isSaving ? 'Đang lưu…' : 'Lưu cập nhật')}</button></div>
    </form> : <div className="workflow-footer"><button type="button" onClick={onClose}>{t("Đóng")}</button></div>}
    {item.trackingHistory?.length > 0 && <details className="workflow-history"><summary>{t("Lịch sử cập nhật tiến độ")}</summary><ul>{item.trackingHistory.slice(-8).reverse().map(row => <li key={row.id}><strong>{row.actorName === 'Quản trị Demo' || row.actorName === 'Admin' ? t('Ban Giám đốc') : row.actorName}</strong> · {new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.time))}<br />{t(row.reason)}</li>)}</ul></details>}
  </div>;
}
