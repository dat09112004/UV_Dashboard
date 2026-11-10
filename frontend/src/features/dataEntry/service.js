import {
  amountInputError,
  inspectQuantityInput,
  normalizeAmountInput,
  normalizeQuantityInput,
} from '../../utils/workspaceUi.js';
import { locale } from '../../locales/i18n.js';
import { canReadSheet, ENTRY_SHEETS } from './schema.js';
import { directoryProfiles, taskWorkspace } from '../users/services/demoDirectory.js';
import { taskStatusAt } from '../operations/services/taskWorkflow.js';
import {
  fetchBootstrapApi,
  fetchFinanceStateApi,
  fetchOrdersApi,
  saveEntryBatchApi,
} from '../../services/api.js';

export const MAX_ENTRY_ROWS = 500;
export const MONEY_COLUMNS = ['unitPriceVnd', 'netRevenue', 'originalAmount', 'amount'];
export const QUANTITY_COLUMNS = ['orderedQty', 'nhap', 'deliveredQty', 'shippedQty'];
export const PERCENT_COLUMNS = ['onProcessPct', 'packagingPct'];

export { inspectQuantityInput, normalizeQuantityInput };

export function parseQuantityInput(value, { optional = false, allowZero = true } = {}) {
  const text = String(value ?? '').trim();
  if (optional && text === '') return null;
  const inspected = inspectQuantityInput(value, { allowZero });
  if (inspected.error || inspected.value === null) {
    throw new Error(
      inspected.error ||
        'Số phải không âm; dùng dấu chấm tách hàng nghìn (ví dụ 1.000) hoặc dấu phẩy cho phần thập phân (ví dụ 1,5).'
    );
  }
  return inspected.value;
}

export function inspectEntryCell(columnKey, rawValue, rowValues = {}) {
  const text = String(rawValue ?? '').trim();
  if (!text) return { normalized: '', value: null, formatted: '', warning: '', error: '' };
  if (MONEY_COLUMNS.includes(columnKey)) {
    const normalized = normalizeAmountInput(text);
    const error = amountInputError(text);
    const value = normalized && !error ? Number(normalized) : null;
    const formatted = value !== null ? `${new Intl.NumberFormat(locale()).format(value)} VND` : '';
    const warning =
      !error && /^[1-9]\d{0,2}[.,]\d{3}(?:\s*VND)?$/i.test(text)
        ? `Hệ thống đang hiểu là ${formatted}.`
        : '';
    return { normalized, value, formatted, warning, error };
  }
  if (QUANTITY_COLUMNS.includes(columnKey)) {
    const unit = String(rowValues.unit || '').trim();
    return inspectQuantityInput(text, { allowZero: columnKey !== 'orderedQty', unit });
  }
  if (PERCENT_COLUMNS.includes(columnKey)) {
    const cleaned = text
      .replace(/^(\d+(?:[.,]\d+)?)\s*%$/, '$1')
      .replace(/^(\d+),(\d+)$/, '$1.$2');
    const num = /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      return {
        normalized: null,
        value: null,
        formatted: '',
        warning: '',
        error: 'Tỷ lệ phải từ 0 đến 100%.',
      };
    }
    return {
      normalized: String(num),
      value: num,
      formatted: `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(num)}%`,
      warning: '',
      error: '',
    };
  }
  return { normalized: text, value: text, formatted: text, warning: '', error: '' };
}

export function readEntryRows(sheet, actor, { items = [], finance = {}, directory = {} } = {}) {
  if (!canReadSheet(actor, sheet)) return [];
  if (sheet.id === 'orders') return items;
  if (sheet.id === 'tasks') {
    const profiles = directoryProfiles(directory);
    return taskWorkspace(directory, actor, profiles).tasks.map(task => ({
      ...task,
      assigneeEmail: profiles.find(account => account.id === task.assigneeId)?.email,
      status: taskStatusAt(task),
    }));
  }
  if (sheet.id === 'allocations') {
    return (finance.allocations || []).map(row => ({
      ...row,
      entryReference: row.entryReference ?? row.id,
      receiptReference: (finance.receipts || []).find(receipt => receipt.id === row.receiptId)?.reference,
    }));
  }
  return finance[sheet.id] || [];
}

/**
 * Lưu lô nhập liệu Excel (tối đa 500 dòng) trực tiếp lên Backend API (/api/v1/data-entry/sheets/:sheetId/batch).
 * Đã loại bỏ hoàn toàn DEMO_ORDERS và DEMO_FINANCE_BASE khỏi Frontend.
 */
export async function saveEntryBatch(_actorId, sheetId, drafts, { orderBaseline, now } = {}) {
  const sheet = ENTRY_SHEETS.find(item => item.id === sheetId);
  if (!sheet || !Array.isArray(drafts) || !drafts.length || drafts.length > MAX_ENTRY_ROWS) {
    throw new Error('Chọn bảng và nhập từ 1 đến 500 dòng.');
  }

  const result = await saveEntryBatchApi(sheetId, drafts, { orderBaseline, now });
  if (result.issues?.length) {
    return result;
  }

  if (sheetId === 'orders') {
    const ordersData = await fetchOrdersApi();
    return {
      items: ordersData.items || result.items || [],
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }
  if (sheetId === 'tasks') {
    const directory = await fetchBootstrapApi();
    return {
      directory,
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }
  const finance = await fetchFinanceStateApi();
  return {
    finance: finance || result.finance,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  };
}
