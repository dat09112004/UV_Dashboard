import { locale, phrase, t } from '../../locales/i18n.js';
import React, { useRef, useState } from 'react';
import { ShoppingBag, PackageCheck, Truck, CalendarDays } from 'lucide-react';
import { getFulfillment, formatQuantity, formatPercent, dateInputValue } from '../../utils/orderFulfillment.js';
import { formatMoney, formatDate } from '../../utils/dashboardMetrics.js';
import { businessToday } from '../../utils/financeWorkflow.js';
import { parseBusinessDate } from '../../utils/business.js';
import { computeProjectedProgress } from '../../utils/workspaceUi.js';
import { QuantityProgress } from './FulfillmentTable.jsx';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';

export default function ItemDetailPanel({
  item, reportDate, canEdit, canLowerAlerts, financials, isSaving, onSubmit, onClose,
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
  const [onProcessPct, setOnProcessPct] = useState(item.onProcessPct != null ? String(item.onProcessPct) : '');
  const [packagingPct, setPackagingPct] = useState(item.packagingPct != null ? String(item.packagingPct) : '');
  const [changeReason, setChangeReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

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
    { ...item, unit: unitInput || item.unit },
    { mode: progressMode, nhapInput, deliveredInput, orderedInput },
  );

  const unitError = projection.orderedQty !== null && !unitInput.trim()
    ? 'Cần bổ sung đơn vị tính khi nhập số lượng đặt.'
    : unitInput.trim().length > 24 ? 'Đơn vị tính tối đa 24 ký tự.' : '';

  const releasedDate = parseBusinessDate(item.releasedPoDate);
  const etdParsed = parseBusinessDate(shipDateEtd);
  const etaParsed = parseBusinessDate(etaDate);
  const receiptParsed = parseBusinessDate(expectedReceiptDate);
  const shipParsed = parseBusinessDate(actualShipDate);
  const deliveryParsed = parseBusinessDate(actualDeliveryDate);
  const todayParsed = parseBusinessDate(businessToday());

  const receiptDateError = receiptParsed && releasedDate && receiptParsed < releasedDate
    ? 'Ngày về dự kiến không được trước ngày phát hành PO.'
    : receiptParsed && etaParsed && receiptParsed > etaParsed
      ? 'Ngày dự kiến về kho không được sau ETA giao khách.' : '';
  const etdError = etdParsed && releasedDate && etdParsed < releasedDate
    ? 'ETD không được trước ngày phát hành PO.' : '';
  const etaError = etaParsed && etdParsed && etaParsed < etdParsed
    ? 'ETA không được trước ETD.' : '';
  const actualShipError = shipParsed && todayParsed && shipParsed > todayParsed
    ? 'Ngày xuất thực tế không được sau ngày hiện tại.'
    : shipParsed && releasedDate && shipParsed < releasedDate
      ? 'Ngày xuất thực tế không được trước ngày phát hành PO.' : '';
  const actualDeliveryError = (projection.projectedDelivered ?? 0) > 0 && !actualDeliveryDate
    ? 'Cần ngày giao xác nhận khi có số lượng đã giao.'
    : deliveryParsed && !(projection.projectedDelivered > 0)
      ? 'Cần có số lượng giao khách lớn hơn 0 khi ghi ngày giao xác nhận.'
      : deliveryParsed && shipParsed && deliveryParsed < shipParsed
        ? 'Ngày giao xác nhận không được trước ngày xuất thực tế.'
        : deliveryParsed && todayParsed && deliveryParsed > todayParsed
          ? 'Ngày giao xác nhận không được sau ngày theo dõi.' : '';

  const numOnProcess = onProcessPct.trim() === '' ? null : Number(onProcessPct.replace(',', '.'));
  const numPackaging = packagingPct.trim() === '' ? null : Number(packagingPct.replace(',', '.'));
  const onProcessError = numOnProcess !== null && (!Number.isFinite(numOnProcess) || numOnProcess < 0 || numOnProcess > 100)
    ? 'Tỷ lệ sản xuất phải từ 0 đến 100%.' : '';
  const packagingError = numPackaging !== null && (!Number.isFinite(numPackaging) || numPackaging < 0 || numPackaging > 100)
    ? 'Tỷ lệ đóng gói phải từ 0 đến 100%.'
    : numPackaging !== null && (numOnProcess === null || numPackaging > numOnProcess)
      ? 'Tỷ lệ đóng gói không được vượt tỷ lệ sản xuất.' : '';
  const reasonError = reasonTouched && !changeReason.trim() ? 'Cần nhập lý do cập nhật.' : '';

  const hasFieldErrors = Boolean(
    projection.orderedInspect.error || unitError || projection.nhapInspect.error || projection.deliveredInspect.error ||
    receiptDateError || etdError || etaError || actualShipError || actualDeliveryError || onProcessError || packagingError
  );

  const handleSubmit = event => {
    setReasonTouched(true);
    if (!changeReason.trim() || hasFieldErrors) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  };

  const alertObj = { id: `order-${item.rowId}`, type: 'orders', reference: item.poId, label: item.vendorItemNo, status: item.alertLabel, data: item };

  return <div className="item-detail-content" key={item.trackingHistory?.at(-1)?.id || item.rowId}>
    <section className={`item-detail-notice ${item.priorityRank === 0 ? 'critical' : item.priorityRank === 1 ? 'warning' : 'normal'}`}>
      <div><strong>{t(item.alertLevel)}</strong>{item.lastUpdateDate && <span>{t("Cập nhật: ")}{item.lastUpdateDate} {t(item.lastUpdateTime)}</span>}</div>
      <p>{t(item.alertLabel)}</p>
      {item.priorityRank === 0 && (
        <AlertAssignmentLine
          alertRef={{ id: alertObj.id, type: 'orders', reference: item.poId }}
          tasks={tasks}
          accounts={accounts}
          reminders={reminders}
          canRemind={Boolean(onRemindAlert)}
          onRemind={() => onRemindAlert?.(alertObj)}
        />
      )}
    </section>
    {canEdit && <button type="button" className="item-edit-shortcut" onClick={() => { formRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); formRef.current?.querySelector('input:not([type=hidden])')?.focus({ preventScroll: true }); }}>{t("Cập nhật tiến độ ")}<span aria-hidden="true">↓</span></button>}
    {item.totalValueVnd != null && <div className="item-business-summary"><span>{t('Mã nhóm hàng BM41')} <b>{item.category}</b></span><span>{t('Đơn giá đặt')} <b>{formatMoney(item.unitPriceVnd)} / {item.unit}</b></span><span>{t('Giá trị PO theo BM41')} <b>{formatMoney(item.totalValueVnd)}</b></span></div>}
    <section className="fulfillment-stages" aria-label={t("Tiến độ nhập và giao của mã hàng")}>
      <div className="fulfillment-stage"><div className="stage-heading"><ShoppingBag size={20} /><strong>{t("Đã đặt hàng")}</strong></div><div className="stage-quantity">{formatQuantity(state.orderedQty)}<small> {item.unit}</small></div><span>{t(state.isReleased ? `PO phát hành ${formatDate(item.releasedPoDate)}` : 'Chưa có ngày phát hành PO')}</span>{state.orderedQty === null && <small className="stage-missing">{t("Cần bổ sung số lượng đặt")}</small>}</div>
      <div className="fulfillment-stage"><div className="stage-heading"><PackageCheck size={20} /><strong>{t("Đã về kho")}</strong></div><QuantityProgress label={t("Tỷ lệ đã về kho")} quantity={state.receivedQty} percent={state.receivedPct} unit={item.unit} tone={state.lateReceiptDays ? 'critical' : 'normal'} /><span>{t("Còn về: ")}{formatQuantity(state.remainingReceipt)} {item.unit}</span></div>
      <div className="fulfillment-stage"><div className="stage-heading"><Truck size={20} /><strong>{t("Đã giao khách")}</strong></div><QuantityProgress label={t("Tỷ lệ đã giao khách")} quantity={state.deliveredQty} percent={state.deliveredPct} unit={item.unit} tone={state.tone} /><span>{t(state.deliveredQty === null ? 'Chưa có xác nhận số lượng giao' : `Còn giao: ${formatQuantity(state.remainingDelivery)} ${item.unit}`)}</span></div>
    </section>
    <section className="item-delivery-dates"><CalendarDays size={19} /><div><span>{t("Dự kiến về kho")}</span><strong>{formatDate(item.expectedReceiptDate)}</strong></div><div><span>{t("Xuất dự kiến (ETD)")}</span><strong>{formatDate(item.shipDateEtd)}</strong></div><div><span>{t("Giao dự kiến (ETA)")}</span><strong>{formatDate(item.etaDate)}</strong></div><div><span>{t("Giao xác nhận gần nhất")}</span><strong>{formatDate(item.actualDeliveryDate)}</strong></div><span className={`fulfillment-status ${state.tone}`}>{t(state.label)}</span></section>
    <div className="item-business-summary"><span>{t("Tồn đầu ")}<b>{formatQuantity(item.tonDau)} {item.unit}</b></span><span>{t("Số bán ")}<b>{formatQuantity(item.ban)} {item.unit}</b></span><span>{t("Sản xuất ")}<b>{formatPercent(item.onProcessPct)}</b>{t(" · Đóng gói ")}<b>{formatPercent(item.packagingPct)}</b></span><span>{t("Doanh thu ")}<b>{formatMoney(financials.revenue)}</b></span><span>{t("Phải thu liên quan ")}<b>{formatMoney(financials.receivables)}</b></span><span>{t(financials.grouped ? 'Phải trả trên CT gộp' : 'Phải trả liên quan')} <b>{formatMoney(financials.payables)}</b></span></div>
    {canEdit ? <form ref={formRef} className="item-progress-form" onSubmit={handleSubmit}>
      <div className="item-form-heading">
        <div>
          <h4>{t('Cập nhật số lượng lũy kế & lịch giao')}</h4>
          <span>{t(item.vendorName)} · {item.countryOfOrigin} · {t('Các trường có dấu * là bắt buộc')}</span>
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
            <input type="text" inputMode="decimal" value={orderedInput} onChange={e => setOrderedInput(e.target.value)} placeholder={t("Ví dụ: 10.000")} />
            {projection.orderedInspect.error && <small className="field-hint is-error" role="alert">{t(projection.orderedInspect.error)}</small>}
            {!projection.orderedInspect.error && projection.orderedInspect.warning && <small className="field-hint is-warning">{t(projection.orderedInspect.warning)}</small>}
            {!projection.orderedInspect.error && projection.orderedInspect.value !== null && <small className="field-hint">{phrase('Hệ thống hiểu: §', projection.orderedInspect.formatted)}</small>}
          </label>
          <label>{t("Đơn vị tính")}{projection.orderedQty !== null && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="unit" value={unitInput} onChange={e => setUnitInput(e.target.value)} maxLength={24} placeholder="PCS, m, kg…" />
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
              placeholder={t(progressMode === 'today' ? 'Nhập số nhận thêm hôm nay (ví dụ: 500)' : 'Chưa xác nhận')}
            />
            {projection.nhapInspect.error && <small className="field-hint is-error" role="alert">{t(projection.nhapInspect.error)}</small>}
            {!projection.nhapInspect.error && projection.nhapInspect.warning && <small className="field-hint is-warning">{t(projection.nhapInspect.warning)}</small>}
            {!projection.nhapInspect.error && <small className="field-hint">
              {progressMode === 'today'
                ? phrase('Hiện tại: § · Tổng dự kiến sau lưu: §', formatQuantity(item.nhap ?? 0), formatQuantity(projection.projectedReceived ?? 0))
                : projection.projectedReceived !== null
                  ? phrase('Hệ thống hiểu / Tổng sau lưu: §', `${formatQuantity(projection.projectedReceived)} ${unitInput || item.unit || ''}`.trim())
                  : t('Có thể nhập số nguyên hoặc dấu chấm tách hàng nghìn (ví dụ 1.000).')}
            </small>}
          </label>
          <label>
            {t(progressMode === 'today' ? 'Giao thêm cho khách hôm nay' : 'Đã giao khách (lũy kế)')}
            <input
              type="text"
              inputMode="decimal"
              value={deliveredInput}
              onChange={e => setDeliveredInput(e.target.value)}
              placeholder={t(progressMode === 'today' ? 'Nhập số giao thêm hôm nay (ví dụ: 500)' : 'Chưa xác nhận')}
            />
            {projection.deliveredInspect.error && <small className="field-hint is-error" role="alert">{t(projection.deliveredInspect.error)}</small>}
            {!projection.deliveredInspect.error && projection.deliveredInspect.warning && <small className="field-hint is-warning">{t(projection.deliveredInspect.warning)}</small>}
            {!projection.deliveredInspect.error && <small className="field-hint">
              {progressMode === 'today'
                ? phrase('Hiện tại: § · Tổng dự kiến sau lưu: §', formatQuantity(item.deliveredQty ?? 0), formatQuantity(projection.projectedDelivered ?? 0))
                : projection.projectedDelivered !== null
                  ? phrase('Hệ thống hiểu / Tổng sau lưu: §', `${formatQuantity(projection.projectedDelivered)} ${unitInput || item.unit || ''}`.trim())
                  : t('Để trống nếu chưa xác nhận giao khách.')}
            </small>}
          </label>
        </div>
        <div className="projected-total-banner" role="status">
          <strong>{t('Tổng dự kiến sau lưu:')}</strong>
          <span>{t('Đã về kho:')} <b>{formatQuantity(projection.projectedReceived)} / {formatQuantity(projection.orderedQty)} {unitInput || item.unit}</b></span>
          <span>{t('Đã giao khách:')} <b>{formatQuantity(projection.projectedDelivered)} / {formatQuantity(projection.orderedQty)} {unitInput || item.unit}</b></span>
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
          <label>{t("Xuất dự kiến (ETD)")}
            <input name="shipDateEtd" type="date" value={shipDateEtd} onChange={e => setShipDateEtd(e.target.value)} />
            {etdError && <small className="field-hint is-error" role="alert">{t(etdError)}</small>}
          </label>
          <label>{t("Ngày xuất thực tế")}
            <input name="actualShipDate" type="date" max={businessToday()} value={actualShipDate} onChange={e => setActualShipDate(e.target.value)} />
            {actualShipError && <small className="field-hint is-error" role="alert">{t(actualShipError)}</small>}
          </label>
          <label>{t("Giao dự kiến (ETA)")}
            <input name="etaDate" type="date" value={etaDate} onChange={e => setEtaDate(e.target.value)} />
            {etaError && <small className="field-hint is-error" role="alert">{t(etaError)}</small>}
          </label>
        </div></details>
        <details className="production-edit"><summary>{t("Sản xuất & cảnh báo thủ công")}</summary><div className="item-form-grid">
          <label>{t("Sản xuất (%)")}{!item.inboundOnly && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="onProcessPct" type="number" min="0" max="100" step="0.1" required={!item.inboundOnly} value={onProcessPct} onChange={e => setOnProcessPct(e.target.value)} />
            {onProcessError && <small className="field-hint is-error" role="alert">{t(onProcessError)}</small>}
          </label>
          <label>{t("Đóng gói (%)")}{!item.inboundOnly && <> <span className="required-mark" aria-hidden="true">*</span></>}
            <input name="packagingPct" type="number" min="0" max="100" step="0.1" required={!item.inboundOnly} value={packagingPct} onChange={e => setPackagingPct(e.target.value)} />
            {packagingError && <small className="field-hint is-error" role="alert">{t(packagingError)}</small>}
          </label>
          <label>{t("Số bán trên dữ liệu gốc")}<input value={item.ban ?? ''} readOnly disabled /></label>
          <label>{t("Cảnh báo thủ công")}<select name="manualPriorityRank" defaultValue={item.manualPriorityRank ?? item.priorityRank}>{['Báo động đỏ', 'Cần xử lý', 'Đúng hạn'].map((label, rank) => <option key={rank} value={rank} disabled={!canLowerAlerts && rank > (item.manualPriorityRank ?? item.priorityRank)}>{t(label)}</option>)}</select></label>
        </div></details>
        <label className="update-reason">{t("Lý do cập nhật")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="changeReason" required maxLength={500} value={changeReason} onChange={e => { setChangeReason(e.target.value); setReasonTouched(true); }} onBlur={() => setReasonTouched(true)} placeholder={t("Ví dụ: Đã nhận thêm 500 hàng theo phiếu nhập…")} />
          {reasonError && <small className="field-hint is-error" role="alert">{t(reasonError)}</small>}
        </label>
      </fieldset>
      <div className="item-form-footer"><button type="button" onClick={onClose} disabled={isSaving}>{t("Đóng")}</button><button className="primary" type="submit" disabled={isSaving}>{t(isSaving ? 'Đang lưu…' : 'Lưu cập nhật')}</button></div>
    </form> : <div className="workflow-footer"><button type="button" onClick={onClose}>{t("Đóng")}</button></div>}
    {item.trackingHistory?.length > 0 && <details className="workflow-history"><summary>{t("Lịch sử cập nhật tiến độ")}</summary><ul>{item.trackingHistory.slice(-8).reverse().map(row => <li key={row.id}><strong>{row.actorName}</strong> · {new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.time))}<br />{t(row.reason)}</li>)}</ul></details>}
  </div>;
}
