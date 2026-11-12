import { locale } from '../locales/i18n.js';
import { parseBusinessDate, dateInputValue, formatBusinessDate } from './business.js';
import { newRecordId } from './recordId.js';
import { normalizeQuantityInput } from './workspaceUi.js';
import { updateOrderProgressApi } from '../services/api.js';

const DAY = 86400000;
export const TRACKING_STORAGE_KEY = 'uv-order-tracking-api';

export const EMPTY_ORDER_TRACKING = Object.freeze({
  orderedQty: null,
  deliveredQty: null,
  unit: '',
  expectedReceiptDate: '',
  actualDeliveryDate: '',
});

const numberOrNull = value => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const normalized = normalizeQuantityInput(value);
  return normalized === null ? Number.NaN : normalized === '' ? null : Number(normalized);
};

export const formatQuantity = value =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat(locale(), { maximumFractionDigits: 3 }).format(value);

export const formatPercent = value =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value) + '%';

const ratio = (value, total) =>
  value === null || !Number.isFinite(total) || total <= 0 ? null : (value / total) * 100;

export function getFulfillment(item, reportDate, { includeReceiptRisk = true } = {}) {
  const orderedQty = numberOrNull(item.orderedQty);
  const receivedQty = numberOrNull(item.nhap);
  const deliveredQty = numberOrNull(item.deliveredQty);
  const receivedPct = ratio(receivedQty, orderedQty);
  const deliveredPct = ratio(deliveredQty, orderedQty);
  const receivedComplete = orderedQty > 0 && receivedQty !== null && receivedQty >= orderedQty;
  const deliveredComplete = orderedQty > 0 && deliveredQty !== null && deliveredQty >= orderedQty;
  const receiptDate = parseBusinessDate(item.expectedReceiptDate);
  const deliveryDate = parseBusinessDate(item.etaDate);
  const actualDeliveryDate = parseBusinessDate(item.actualDeliveryDate);
  const today = parseBusinessDate(reportDate);
  const remainingReceipt =
    orderedQty > 0 && receivedQty !== null ? Math.max(0, orderedQty - receivedQty) : null;
  const waitingForReceipt =
    receivedQty === 0 || remainingReceipt > 0 || (item.inboundOnly && receivedQty === null);
  const daysUntilReceipt = receiptDate && today ? (receiptDate - today) / DAY : null;
  const lateReceiptDays = waitingForReceipt && daysUntilReceipt < 0 ? -daysUntilReceipt : 0;
  const lateDeliveryDays =
    deliveryDate && today && !deliveredComplete
      ? Math.max(0, Math.floor((today - deliveryDate) / DAY))
      : 0;
  const deliveryDueToday =
    !deliveredComplete && Boolean(deliveryDate && today && deliveryDate.getTime() === today.getTime());

  let label =
    orderedQty === null
      ? 'Chưa có SL đặt'
      : receivedQty !== null && receivedQty > 0
        ? receivedComplete
          ? deliveredQty === null
            ? 'Đủ hàng, chưa xác nhận giao'
            : 'Đủ hàng, chờ giao'
          : 'Đã về một phần'
        : receivedQty === null
          ? 'Chưa xác nhận nhập kho'
          : 'Chờ hàng về';

  if (!includeReceiptRisk) label = deliveredQty === 0 ? 'Chưa giao' : 'Chưa đủ xác nhận giao';
  let tone = orderedQty === null ? 'neutral' : 'normal';
  if (deliveredQty > 0 && !deliveredComplete) {
    label = orderedQty === null ? 'Đã ghi nhận giao, thiếu SL đặt' : 'Đang giao một phần';
    tone = orderedQty === null ? 'warning' : 'normal';
  }
  if (deliveredComplete) {
    label = actualDeliveryDate ? 'Đã giao đủ' : 'Đã giao đủ, thiếu ngày xác nhận';
    tone = actualDeliveryDate ? 'normal' : 'warning';
  } else if (lateDeliveryDays > 0) {
    label =
      deliveredQty === null || orderedQty === null
        ? `Quá ETA ${lateDeliveryDays} ngày, chưa xác nhận đủ giao`
        : `Trễ giao ${lateDeliveryDays} ngày`;
    tone = 'critical';
  } else if (includeReceiptRisk && lateReceiptDays > 0) {
    label =
      receivedQty === null
        ? `Quá hạn nhận hàng ${lateReceiptDays} ngày, chưa xác nhận nhập kho`
        : `Trễ hàng về ${lateReceiptDays} ngày`;
    tone = 'critical';
  } else if (deliveryDueToday) {
    label = 'Đến hạn giao vào ngày theo dõi';
    tone = 'critical';
  } else if (
    orderedQty > 0 &&
    deliveryDate &&
    today &&
    deliveryDate > today &&
    (deliveryDate - today) / DAY <= 3
  ) {
    label = 'Sắp đến hạn giao';
    tone = 'warning';
  } else if (includeReceiptRisk && item.inboundOnly && waitingForReceipt && daysUntilReceipt === 0) {
    label = 'Đến hạn nhận hàng vào ngày theo dõi';
    tone = 'critical';
  } else if (
    includeReceiptRisk &&
    item.inboundOnly &&
    waitingForReceipt &&
    daysUntilReceipt > 0 &&
    daysUntilReceipt <= 7
  ) {
    label = 'Sắp đến hạn nhận hàng';
    tone = 'warning';
  }

  return {
    orderedQty,
    receivedQty,
    deliveredQty,
    receivedPct,
    deliveredPct,
    receivedComplete,
    deliveredComplete,
    lateReceiptDays,
    lateDeliveryDays,
    waitingForReceipt,
    daysUntilReceipt,
    deliveryDueToday,
    label,
    tone,
    isReleased: Boolean(parseBusinessDate(item.releasedPoDate)),
    remainingReceipt,
    remainingDelivery:
      orderedQty > 0 && deliveredQty !== null ? Math.max(0, orderedQty - deliveredQty) : null,
  };
}

export function validateTracking(item, values, reportDate) {
  const orderedQty = numberOrNull(values.orderedQty);
  const deliveredQty = numberOrNull(values.deliveredQty);
  const receivedQty = numberOrNull(values.nhap);
  const unit = String(values.unit || '').trim();
  for (const value of [orderedQty, deliveredQty, receivedQty]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error('Số lượng phải là số hợp lệ, không âm.');
    }
  }
  if (orderedQty === 0) throw new Error('Số lượng đặt phải lớn hơn 0; để trống nếu chưa xác định.');
  if (receivedQty === null && !item.inboundOnly) {
    throw new Error('Cần nhập số lượng đã về kho, nhập 0 nếu chưa về.');
  }
  if (orderedQty !== null && !unit) throw new Error('Cần bổ sung đơn vị tính khi nhập số lượng đặt.');
  if (unit.length > 24) throw new Error('Đơn vị tính tối đa 24 ký tự.');
  if (orderedQty !== null && receivedQty > orderedQty) {
    throw new Error('Số đã về kho không được vượt số lượng đặt.');
  }
  if (orderedQty !== null && deliveredQty !== null && deliveredQty > orderedQty) {
    throw new Error('Số đã giao khách không được vượt số lượng đặt.');
  }
  const safeReceivedQty = receivedQty ?? 0;
  if (deliveredQty !== null && deliveredQty > safeReceivedQty + Number(item.tonDau || 0)) {
    throw new Error('Số đã giao vượt hàng có thể giao: tồn đầu + số đã về kho.');
  }
  const date = (value, label) => {
    if (!value || value === '—') return '';
    if (!parseBusinessDate(value)) throw new Error(`${label} không hợp lệ.`);
    return formatBusinessDate(value);
  };
  const expectedReceiptDate = date(values.expectedReceiptDate, 'Ngày dự kiến về kho');
  const actualShipDate = date(values.actualShipDate, 'Ngày xuất thực tế');
  const actualDeliveryDate = date(values.actualDeliveryDate, 'Ngày giao xác nhận');
  const eta = parseBusinessDate(values.etaDate);
  const released = parseBusinessDate(item.releasedPoDate);
  if (expectedReceiptDate && eta && parseBusinessDate(expectedReceiptDate) > eta) {
    throw new Error('Ngày dự kiến về kho không được sau ETA giao khách.');
  }
  if (reportDate && deliveredQty > 0 && (orderedQty === null || !actualDeliveryDate)) {
    throw new Error('Cần số lượng đặt và ngày giao xác nhận khi có số lượng đã giao.');
  }
  if (actualShipDate && reportDate && parseBusinessDate(actualShipDate) > parseBusinessDate(reportDate)) {
    throw new Error('Ngày xuất thực tế không được sau ngày hiện tại.');
  }
  if (actualShipDate && released && parseBusinessDate(actualShipDate) < released) {
    throw new Error('Ngày xuất thực tế không được trước ngày phát hành PO.');
  }
  if (expectedReceiptDate && released && parseBusinessDate(expectedReceiptDate) < released) {
    throw new Error('Ngày về dự kiến không được trước ngày phát hành PO.');
  }
  if (
    actualDeliveryDate &&
    actualShipDate &&
    parseBusinessDate(actualDeliveryDate) < parseBusinessDate(actualShipDate)
  ) {
    throw new Error('Ngày giao xác nhận không được trước ngày xuất thực tế.');
  }
  if (actualDeliveryDate && !(deliveredQty > 0)) {
    throw new Error('Cần có số lượng giao khách lớn hơn 0 khi ghi ngày giao xác nhận.');
  }
  if (
    actualDeliveryDate &&
    reportDate &&
    parseBusinessDate(actualDeliveryDate) > parseBusinessDate(reportDate)
  ) {
    throw new Error('Ngày giao xác nhận không được sau ngày theo dõi.');
  }
  if (actualDeliveryDate && released && parseBusinessDate(actualDeliveryDate) < released) {
    throw new Error('Ngày giao xác nhận không được trước ngày phát hành PO.');
  }
  return {
    orderedQty,
    deliveredQty,
    nhap: receivedQty,
    unit,
    expectedReceiptDate,
    actualDeliveryDate,
    actualShipDate,
  };
}

export function matchesFulfillment(item, filter, reportDate) {
  const state = getFulfillment(item, reportDate, { includeReceiptRisk: filter !== 'late' });
  switch (filter) {
    case 'ordered':
      return state.isReleased;
    case 'arrived':
      return state.receivedQty > 0;
    case 'partial_receipt':
      return state.receivedQty > 0 && state.receivedPct !== null && !state.receivedComplete;
    case 'full_receipt':
      return state.receivedComplete;
    case 'not_received':
      return state.receivedQty === 0;
    case 'partial_delivery':
      return state.deliveredQty > 0 && !state.deliveredComplete;
    case 'delivered':
      return state.deliveredComplete;
    case 'unknown_delivery':
      return state.deliveredQty === null;
    case 'late':
      return state.tone === 'critical';
    case 'missing':
      return state.orderedQty === null || state.deliveredQty === null;
    default:
      return true;
  }
}

export function fulfillmentSummary(items, reportDate) {
  const states = items.map(item => getFulfillment(item, reportDate));
  return {
    released: states.filter(s => s.isReleased).length,
    arrived: states.filter(s => s.receivedQty > 0).length,
    delivered: states.filter(s => s.deliveredComplete).length,
    partial: states.filter(s => s.deliveredQty > 0 && !s.deliveredComplete).length,
    unconfirmed: states.filter(s => s.deliveredQty === null).length,
    missing: states.filter(s => s.orderedQty === null || s.deliveredQty === null).length,
  };
}

export function loadTrackedItems(items = []) {
  return (items || []).map(item => ({
    ...EMPTY_ORDER_TRACKING,
    ...item,
    manualPriorityRank: item.manualPriorityRank ?? item.priorityRank ?? 2,
    manualAlertReason: item.manualAlertReason || item.alertReason || '',
    trackingHistory: item.trackingHistory || [],
    trackingVersion: item.trackingVersion ?? null,
  }));
}

export async function saveTrackedItem(rowId, payload) {
  const res = await updateOrderProgressApi(rowId, payload);
  return res.item;
}

export { dateInputValue };

export function updateProgressRecord(item, user, values, today) {
  if (!user?.permissions?.includes('orders.update') || user.status !== 'active') {
    throw new Error('Bạn không có quyền cập nhật tiến độ.');
  }
  const reason = String(values.changeReason || '').trim();
  if (!reason || reason.length > 500) {
    throw new Error('Cần lý do cập nhật, tối đa 500 ký tự.');
  }
  const resolvedValues = { ...values };
  if (values.progressMode === 'today') {
    const addNhap = numberOrNull(values.nhapToday !== undefined ? values.nhapToday : values.nhap);
    const addDelivered = numberOrNull(
      values.deliveredToday !== undefined ? values.deliveredToday : values.deliveredQty
    );
    if (addNhap !== null && (!Number.isFinite(addNhap) || addNhap < 0)) {
      throw new Error('Số lượng phải là số hợp lệ, không âm.');
    }
    if (addDelivered !== null && (!Number.isFinite(addDelivered) || addDelivered < 0)) {
      throw new Error('Số lượng phải là số hợp lệ, không âm.');
    }
    resolvedValues.nhap = addNhap === null ? item.nhap : Number(item.nhap || 0) + addNhap;
    resolvedValues.deliveredQty =
      addDelivered === null ? item.deliveredQty : Number(item.deliveredQty || 0) + addDelivered;
  }
  const pctValue = raw => {
    if (raw === '' || raw === null || raw === undefined) return null;
    const cleaned = String(raw)
      .trim()
      .replace(/^(\d+(?:[.,]\d+)?)\s*%$/, '$1')
      .replace(/^(\d+),(\d+)$/, '$1.$2');
    return Number(cleaned);
  };
  const onProcessPct = item.inboundOnly
    ? pctValue(resolvedValues.onProcessPct)
    : Number(pctValue(resolvedValues.onProcessPct) ?? Number.NaN);
  const packagingPct = item.inboundOnly
    ? pctValue(resolvedValues.packagingPct)
    : Number(pctValue(resolvedValues.packagingPct) ?? Number.NaN);
  if (
    [onProcessPct, packagingPct].some(n => n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) ||
    (packagingPct !== null && (onProcessPct === null || packagingPct > onProcessPct))
  ) {
    throw new Error('Tỷ lệ đóng gói không vượt tỷ lệ sản xuất; tỷ lệ từ 0 đến 100.');
  }
  const etd = parseBusinessDate(resolvedValues.shipDateEtd);
  const eta = parseBusinessDate(resolvedValues.etaDate);
  const released = parseBusinessDate(item.releasedPoDate);
  for (const raw of [resolvedValues.shipDateEtd, resolvedValues.etaDate]) {
    if (raw && raw !== '—' && !parseBusinessDate(raw)) {
      throw new Error('Lịch ETD hoặc ETA không hợp lệ.');
    }
  }
  if ((etd && eta && eta < etd) || (released && etd && etd < released)) {
    throw new Error('ETD không trước PO; ETA không trước ETD.');
  }
  const rank =
    resolvedValues.manualPriorityRank === undefined
      ? (item.manualPriorityRank ?? item.priorityRank ?? 2)
      : Number(resolvedValues.manualPriorityRank);
  if (![0, 1, 2].includes(rank)) throw new Error('Mức cảnh báo thủ công không hợp lệ.');
  if (!['CEO', 'Admin'].includes(user.role) && rank > (item.manualPriorityRank ?? item.priorityRank ?? 2)) {
    throw new Error('Chỉ CEO được hạ mức cảnh báo thủ công.');
  }
  const tracking = validateTracking(item, resolvedValues, today);
  const labels = ['Báo động đỏ', 'Cần xử lý', 'Đúng hạn'];
  const history = {
    id: newRecordId('PROGRESS'),
    actorId: user.id,
    actorName: user.name,
    time: new Date().toISOString(),
    reason,
    before: {
      onProcessPct: item.onProcessPct,
      packagingPct: item.packagingPct,
      receivedQty: item.nhap,
      deliveredQty: item.deliveredQty,
    },
    after: {
      onProcessPct,
      packagingPct,
      receivedQty: tracking.nhap,
      deliveredQty: tracking.deliveredQty,
    },
  };
  return {
    ...item,
    ...tracking,
    onProcessPct,
    packagingPct,
    shipDateEtd: formatBusinessDate(resolvedValues.shipDateEtd),
    etaDate: formatBusinessDate(resolvedValues.etaDate),
    manualPriorityRank: rank,
    manualAlertReason:
      rank !== (item.manualPriorityRank ?? item.priorityRank)
        ? reason
        : item.manualAlertReason || item.alertReason || reason,
    priorityRank: rank,
    alertLevel: labels[rank],
    lastUpdateDate: formatBusinessDate(today),
    lastUpdateTime: new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()),
    trackingHistory: [...(item.trackingHistory || []), history].slice(-100),
  };
}
