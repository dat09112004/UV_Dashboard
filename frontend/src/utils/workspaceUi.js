import { locale } from '../locales/i18n.js';
import { AP_REVIEW, AP_PENDING, AP_APPROVED, AP_RETURNED, needsPayableSplit } from './financeWorkflow.js';
import { isExecutiveRole } from './roles.js';

export function payableAction(row, role, canSplit = true) {
  if (!(row.originalAmount + (row.adjustment || 0) - row.allocatedPaid > 0)) return null;
  const grouped = needsPayableSplit(row);
  if (grouped && !canSplit) return null;
  const isExec = isExecutiveRole(role);
  if (isExec && row.approvalState === AP_PENDING) return { type: 'REVIEW_AP', label: grouped ? 'Yêu cầu tách hồ sơ' : 'Xem đề nghị' };
  if (role !== 'Accountant' && !isExec) return null;
  if (grouped) return { type: 'SPLIT_AP', label: 'Tách chứng từ' };
  if ([AP_REVIEW, AP_RETURNED].includes(row.approvalState)) return { type: 'SUBMIT_AP', label: 'Lập đề nghị chi' };
  if (row.approvalState === AP_APPROVED) return { type: 'PAY_AP', label: 'Ghi nhận đã chi' };
  return null;
}

export function alertDestination(alert, role, canSplit = true) {
  if (alert.type === 'orders') return { type: 'ITEM_DETAIL', data: alert.data };
  if (alert.type === 'payables') {
    const action = payableAction(alert.data, role, canSplit);
    if (action?.type === 'REVIEW_AP' || action?.type === 'SPLIT_AP') return { type: action.type, data: alert.data };
  }
  return { type: 'DEBT_DETAIL', debtType: alert.type, data: alert.data };
}

export function normalizeAmountInput(value) {
  const text = String(value ?? '').trim().replace(/\s*VND\s*$/i, '');
  if (!text) return '';
  // Accept plain digits and familiar thousands separators; never turn a minus
  // sign, decimal fraction or exponent into a different positive amount.
  if (/^\d+$/.test(text)) return text.replace(/^0+(?=\d)/, '');
  if (/^\d{1,3}([. ,]\d{3})+$/.test(text)) return text.replace(/[. ,]/g, '').replace(/^0+(?=\d)/, '');
  return null;
}

export function amountInputError(value, max) {
  const normalized = normalizeAmountInput(value);
  if (normalized === null) return 'Nhập số tiền nguyên VND, ví dụ 25.000.000.';
  if (normalized === '') return '';
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 1) return 'Số tiền phải lớn hơn 0 và nằm trong phạm vi cho phép.';
  if (Number.isFinite(max) && number > max) return `Số tiền không được vượt ${new Intl.NumberFormat(locale()).format(max)} VND.`;
  return '';
}

const formatQtyValue = value => value === null || value === undefined || !Number.isFinite(value)
  ? ''
  : new Intl.NumberFormat(locale(), { maximumFractionDigits: 3 }).format(value);

export function inspectQuantityInput(value, { allowZero = true, max, unit = '' } = {}) {
  if (value === null || value === undefined) {
    return { raw: '', normalized: '', value: null, formatted: '', warning: '', error: '' };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return { raw: String(value), normalized: null, value: null, formatted: '', warning: '',
        error: 'Số phải không âm; dùng dấu chấm tách hàng nghìn (ví dụ 1.000) hoặc dấu phẩy cho phần thập phân (ví dụ 1,5).' };
    }
    const formatted = formatQtyValue(value) + (unit ? ` ${unit}` : '');
    const error = !allowZero && value <= 0 ? 'Số lượng đặt phải lớn hơn 0.' :
      Number.isFinite(max) && value > max ? `Số lượng không được vượt ${formatQtyValue(max)}${unit ? ` ${unit}` : ''}.` : '';
    return { raw: String(value), normalized: String(value), value, formatted, warning: '', error };
  }
  const text = String(value).trim();
  if (!text) return { raw: '', normalized: '', value: null, formatted: '', warning: '', error: '' };

  let normalized = null;
  let warning = '';

  if (/^\d+$/.test(text)) {
    normalized = text.replace(/^0+(?=\d)/, '');
  } else if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(text) || /^[1-9]\d{0,2}(?:,\d{3})+$/.test(text) || /^[1-9]\d{0,2}(?: \d{3})+$/.test(text)) {
    normalized = text.replace(/[. ,]/g, '');
    if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(text)) {
      const parsed = Number(normalized);
      warning = `Hệ thống đang hiểu "${text}" là ${formatQtyValue(parsed)}${unit ? ` ${unit}` : ''} (dấu tách hàng nghìn). Nếu muốn nhập số lẻ thập phân, hãy dùng dấu phẩy (ví dụ 1,5).`;
    }
  } else if (/^[1-9]\d{0,2}(?:\.\d{3})+,\d{1,3}$/.test(text)) {
    normalized = String(Number(text.replace(/\./g, '').replace(',', '.')));
  } else if (/^[1-9]\d{0,2}(?:,\d{3})+\.\d{1,3}$/.test(text)) {
    normalized = String(Number(text.replace(/,/g, '')));
  } else if (/^[1-9]\d*[.,]\d{1,2}$/.test(text) && text.endsWith('0')) {
    return {
      raw: text, normalized: null, value: null, formatted: '', warning: '',
      error: 'Cách viết số có chữ số 0 ở cuối dễ gây nhầm với hàng nghìn (ví dụ 1.000). Hãy nhập số nguyên hoặc đủ 3 chữ số hàng nghìn.',
    };
  } else if (/^\d+,\d{1,3}$/.test(text) && !/^[1-9]\d{0,2},\d{3}$/.test(text)) {
    normalized = String(Number(text.replace(',', '.')));
  } else if (/^\d+\.\d{1,3}$/.test(text) && !/^[1-9]\d{0,2}\.\d{3}$/.test(text)) {
    normalized = String(Number(text));
  }

  if (normalized === null || !Number.isFinite(Number(normalized)) || Number(normalized) < 0) {
    return {
      raw: text, normalized: null, value: null, formatted: '', warning: '',
      error: 'Số phải không âm; dùng dấu chấm tách hàng nghìn (ví dụ 1.000) hoặc dấu phẩy cho phần thập phân (ví dụ 1,5).',
    };
  }

  const num = Number(normalized);
  const formatted = formatQtyValue(num) + (unit ? ` ${unit}` : '');
  const error = !allowZero && num <= 0 ? 'Số lượng đặt phải lớn hơn 0.' :
    Number.isFinite(max) && num > max ? `Số lượng không được vượt ${formatQtyValue(max)}${unit ? ` ${unit}` : ''}.` : '';
  return { raw: text, normalized: String(num), value: num, formatted, warning, error };
}

export function normalizeQuantityInput(value) {
  const result = inspectQuantityInput(value);
  return result.normalized;
}

export function quantityInputError(value, options = {}) {
  return inspectQuantityInput(value, options).error;
}

export function computeProjectedProgress(item, { mode = 'cumulative', nhapInput = '', deliveredInput = '', orderedInput } = {}) {
  const unit = item?.unit || '';
  const orderedInspect = orderedInput !== undefined && String(orderedInput).trim() !== ''
    ? inspectQuantityInput(orderedInput, { allowZero: false, unit })
    : { value: item?.orderedQty ?? null, error: '', warning: '', formatted: formatQtyValue(item?.orderedQty) };
  const orderedQty = orderedInspect.value ?? item?.orderedQty ?? null;
  const currentReceived = item?.nhap ?? null;
  const currentDelivered = item?.deliveredQty ?? null;
  const openingStock = Number(item?.tonDau || 0);

  const nhapInspect = inspectQuantityInput(nhapInput, { allowZero: true, unit });
  const deliveredInspect = inspectQuantityInput(deliveredInput, { allowZero: true, unit });

  const isDelta = mode === 'today';
  const projectedReceived = nhapInspect.value === null
    ? (isDelta ? currentReceived : null)
    : isDelta ? Number(currentReceived || 0) + nhapInspect.value : nhapInspect.value;
  const projectedDelivered = deliveredInspect.value === null
    ? (isDelta ? currentDelivered : null)
    : isDelta ? Number(currentDelivered || 0) + deliveredInspect.value : deliveredInspect.value;

  let nhapError = nhapInspect.error;
  if (!nhapError && projectedReceived !== null && orderedQty !== null && projectedReceived > orderedQty) {
    nhapError = `Tổng về kho dự kiến (${formatQtyValue(projectedReceived)}) vượt số lượng đặt (${formatQtyValue(orderedQty)}).`;
  }
  let deliveredError = deliveredInspect.error;
  if (!deliveredError && projectedDelivered !== null) {
    if (orderedQty !== null && projectedDelivered > orderedQty) {
      deliveredError = `Tổng đã giao dự kiến (${formatQtyValue(projectedDelivered)}) vượt số lượng đặt (${formatQtyValue(orderedQty)}).`;
    } else if (projectedDelivered > Number(projectedReceived || 0) + openingStock) {
      deliveredError = `Tổng đã giao dự kiến (${formatQtyValue(projectedDelivered)}) vượt hàng có thể giao (${formatQtyValue(Number(projectedReceived || 0) + openingStock)}).`;
    }
  }

  return {
    mode,
    unit,
    orderedQty,
    currentReceived,
    currentDelivered,
    projectedReceived,
    projectedDelivered,
    nhapInspect: { ...nhapInspect, error: nhapError },
    deliveredInspect: { ...deliveredInspect, error: deliveredError },
    orderedInspect,
  };
}

const SECONDARY_NAV_IDS = new Set(['data-entry', 'users', 'tasks', 'assignments', 'reminders']);

export function splitNavigationItems(items, viewportWidth = 1440) {
  if (!Array.isArray(items) || items.length <= 5 || viewportWidth >= 1460) {
    return { primary: items || [], overflow: [] };
  }
  const primaryLimit = viewportWidth < 1100 ? 4 : 5;
  const primary = [];
  const overflow = [];
  for (const item of items) {
    if (!SECONDARY_NAV_IDS.has(item.id) && primary.length < primaryLimit) primary.push(item);
    else overflow.push(item);
  }
  while (primary.length < primaryLimit && overflow.length > 0) {
    primary.push(overflow.shift());
  }
  if (overflow.length === 1 && primary.length < items.length) {
    primary.push(overflow.shift());
  }
  return { primary, overflow };
}

const GUIDE_STORAGE_PREFIX = 'uv-page-guide-v1';
const memoryGuideState = new Map();
const guideKey = (userId, section) => `${GUIDE_STORAGE_PREFIX}:${userId || 'anon'}:${section || 'overview'}`;

export function readPageGuideDismissed(userId, section, storage = globalThis.localStorage) {
  const key = guideKey(userId, section);
  try {
    const val = storage?.getItem(key);
    if (val !== null && val !== undefined) return val === '1';
  } catch { /* Fall back to memory map. */ }
  return memoryGuideState.get(key) === true;
}

export function storePageGuideDismissed(userId, section, dismissed, storage = globalThis.localStorage) {
  const key = guideKey(userId, section);
  memoryGuideState.set(key, Boolean(dismissed));
  try {
    if (dismissed) storage?.setItem(key, '1');
    else storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}
