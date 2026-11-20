import {
  amountInputError,
  inspectQuantityInput,
  normalizeAmountInput,
  normalizeQuantityInput,
} from '../../utils/workspaceUi.js';
import { businessToday, parseBusinessDate } from '../../utils/business.js';
import { locale } from '../../locales/i18n.js';
import { canReadSheet, ENTRY_SHEETS } from './schema.js';
import { directoryProfiles, taskWorkspace } from '../users/services/directoryService.js';
import {
  isAccountantSelfOwnedFinance,
  isSaleSelfOwnedOrder,
  resolveAlertAssignmentInfo,
  taskStatusAt,
} from '../operations/services/taskWorkflow.js';
import { resolveOrderOwnership } from '../../utils/orderFulfillment.js';
import {
  saveEntryBatchApi,
} from '../../services/api.js';

export const MAX_ENTRY_ROWS = 200;
export const MONEY_COLUMNS = ['unitPriceVnd', 'netRevenue', 'originalAmount', 'amount'];
export const QUANTITY_COLUMNS = ['orderedQty', 'nhap', 'deliveredQty', 'shippedQty'];
export const PERCENT_COLUMNS = ['onProcessPct', 'packagingPct'];

export const REQUIRED_BY_SHEET = {
  orders: ['poId', 'vendorItemNo', 'vendorNo', 'vendorName', 'category', 'releasedPoDate', 'unit', 'orderedQty'],
  revenue: ['docNo', 'poId', 'customerName', 'recordDate', 'dueDate', 'shippedQty', 'netRevenue', 'basis'],
  receivables: ['docNo', 'customerName', 'originalAmount'],
  payables: ['docNo', 'poId', 'originalAmount'],
  receipts: ['reference', 'date', 'amount'],
  allocations: ['entryReference', 'receiptReference', 'docNo', 'date', 'amount'],
  payments: ['reference', 'docNo', 'date', 'amount'],
  tasks: ['title', 'description', 'deadline'],
};

export { inspectQuantityInput, normalizeQuantityInput };

// Chức năng: Phân tích (parseQuantityInput - Quantity Input) phục vụ xử lý dữ liệu trong service.js
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

// Chức năng: Kiểm tra ô dữ liệu trên Frontend (bao gồm kiểm tra kiểu dữ liệu tiền tệ, số lượng, tỷ lệ %, ngày tháng và trùng Mã PO)
export function inspectEntryCell(columnKey, rawValue, rowValues = {}, context = {}) {
  if (rawValue === null || rawValue === undefined) {
    return { normalized: '', value: null, formatted: '', warning: '', error: '' };
  }
  const isNumericValue = typeof rawValue === 'number';
  const text = String(rawValue).trim();
  if (!text) return { normalized: '', value: null, formatted: '', warning: '', error: '' };

  if (columnKey === 'poId' && context.sheetId === 'orders') {
    const normalizedPo = text.toLowerCase();
    const isUpdateRow = Boolean(String(rowValues.rowId ?? '').trim());
    if (!isUpdateRow && Array.isArray(context.existingOrders)) {
      const dupExisting = context.existingOrders.some(
        item => String(item.poId ?? '').trim().toLowerCase() === normalizedPo
      );
      if (dupExisting) {
        return {
          normalized: text,
          value: text,
          formatted: text,
          warning: '',
          error: `Mã PO "${text}" đã tồn tại trên hệ thống. Không được nhập trùng Mã PO.`,
        };
      }
    }
    if (Array.isArray(context.draftPoCounts)) {
      const count = context.draftPoCounts.filter(po => po === normalizedPo).length;
      if (count > 1) {
        return {
          normalized: text,
          value: text,
          formatted: text,
          warning: '',
          error: `Mã PO "${text}" đang bị lặp lại nhiều lần trong bản nháp.`,
        };
      }
    }
  }

  if (MONEY_COLUMNS.includes(columnKey)) {
    const input = isNumericValue ? rawValue : text;
    const normalized = normalizeAmountInput(input);
    const error = amountInputError(input);
    const value = normalized && !error ? Number(normalized) : null;
    const formatted = value !== null ? `${new Intl.NumberFormat(locale()).format(value)} VND` : '';
    const warning =
      !isNumericValue && !error && /^[1-9]\d{0,2}[.,]\d{3}(?:\s*VND)?$/i.test(text)
        ? `Hệ thống đang hiểu là ${formatted}.`
        : '';
    return { normalized, value, formatted, warning, error };
  }
  if (QUANTITY_COLUMNS.includes(columnKey)) {
    const unit = String(rowValues.unit || '').trim();
    return inspectQuantityInput(isNumericValue ? rawValue : text, {
      allowZero: columnKey !== 'orderedQty',
      unit,
    });
  }
  if (PERCENT_COLUMNS.includes(columnKey)) {
    const cleaned = text
      .replace(/^(\d+(?:[.,]\d+)?)\s*%$/, '$1')
      .replace(/^(\d+),(\d+)$/, '$1.$2');
    const num = isNumericValue ? rawValue : /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
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
  if (['releasedPoDate', 'expectedReceiptDate', 'shipDateEtd', 'etaDate', 'actualShipDate', 'actualDeliveryDate', 'recordDate', 'dueDate', 'date', 'deadline'].includes(columnKey)) {
    const parsed = parseBusinessDate(text);
    if (!parsed) {
      return {
        normalized: text,
        value: null,
        formatted: text,
        warning: '',
        error: 'Ngày không hợp lệ (định dạng chuẩn: DD/MM/YYYY hoặc YYYY-MM-DD).',
      };
    }
    const todayDate = parseBusinessDate(businessToday());
    if (['releasedPoDate', 'actualShipDate', 'actualDeliveryDate', 'recordDate', 'date'].includes(columnKey) && todayDate && parsed > todayDate) {
      return {
        normalized: text,
        value: text,
        formatted: text,
        warning: '',
        error: 'Ngày phát sinh thực tế không được lớn hơn ngày hiện tại.',
      };
    }
  }
  return { normalized: text, value: text, formatted: text, warning: '', error: '' };
}

// Chức năng: Kiểm tra toàn diện danh sách dòng bản nháp ngay trên Frontend trước khi lưu hoặc sau khi tải tệp Excel lên
export function validateDraftRowsFrontend(sheet, draftRows = [], data = {}) {
  const issues = [];
  if (!sheet || !Array.isArray(draftRows)) return issues;
  const requiredKeys = REQUIRED_BY_SHEET[sheet.id] || [];
  const colMap = new Map((sheet.columns || []).map(c => [c.key, c]));
  const existingOrders = Array.isArray(data?.items) ? data.items : [];
  const existingPoSet = new Set(
    existingOrders.map(item => String(item.poId ?? '').trim().toLowerCase()).filter(Boolean)
  );
  const seenDraftPos = new Map();
  const seenDraftDocs = new Map();

  draftRows.forEach((row, index) => {
    const values = row?.values || {};
    const hasAny = Object.values(values).some(v => String(v ?? '').trim() !== '');
    if (!hasAny) return;
    const lineNo = row.line || index + 1;
    const isOrderUpdateRow = sheet.id === 'orders' && Boolean(String(values.rowId ?? '').trim());

    // 1. Kiểm tra các trường bắt buộc
    if (!isOrderUpdateRow) {
      for (const reqKey of requiredKeys) {
        if (!String(values[reqKey] ?? '').trim()) {
          const label = colMap.get(reqKey)?.label || reqKey;
          issues.push({
            line: lineNo,
            message: `Thiếu trường bắt buộc "${label}".`,
          });
        }
      }
    }

    // 2. Kiểm tra trùng Mã PO ở phân hệ Đơn hàng
    if (sheet.id === 'orders' && !isOrderUpdateRow) {
      const poRaw = String(values.poId ?? '').trim();
      if (poRaw) {
        const poKey = poRaw.toLowerCase();
        if (existingPoSet.has(poKey)) {
          issues.push({
            line: lineNo,
            message: `Mã PO "${poRaw}" đã tồn tại trong dữ liệu hiện có. Không được trùng Mã PO.`,
          });
        } else if (seenDraftPos.has(poKey)) {
          issues.push({
            line: lineNo,
            message: `Mã PO "${poRaw}" bị trùng lặp với dòng ${seenDraftPos.get(poKey)} trong bản nháp.`,
          });
        } else {
          seenDraftPos.set(poKey, lineNo);
        }
      }
    }

    // 3. Kiểm tra trùng Số chứng từ ở các bảng tài chính
    if (['revenue', 'receivables', 'payables'].includes(sheet.id)) {
      const docRaw = String(values.docNo ?? '').trim();
      if (docRaw) {
        const docKey = docRaw.toLowerCase();
        const existingDocs = [
          ...(data?.finance?.revenue || []),
          ...(data?.finance?.receivables || []),
          ...(data?.finance?.payables || []),
        ];
        if (existingDocs.some(d => String(d.docNo ?? '').trim().toLowerCase() === docKey)) {
          issues.push({
            line: lineNo,
            message: `Số chứng từ "${docRaw}" đã tồn tại trên hệ thống.`,
          });
        } else if (seenDraftDocs.has(docKey)) {
          issues.push({
            line: lineNo,
            message: `Số chứng từ "${docRaw}" bị trùng lặp với dòng ${seenDraftDocs.get(docKey)} trong bản nháp.`,
          });
        } else {
          seenDraftDocs.set(docKey, lineNo);
        }
      }
    }

    // 4. Kiểm tra kiểu dữ liệu từng ô
    for (const col of sheet.columns || []) {
      if (col.key === 'rowId' || col.hidden) continue;
      const cellVal = values[col.key];
      if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') continue;
      const feedback = inspectEntryCell(col.key, cellVal, values);
      if (feedback.error) {
        issues.push({
          line: lineNo,
          message: `${col.label}: ${feedback.error}`,
        });
      }
    }
  });

  return issues;
}

// Chức năng: Đọc (readEntryRows - Entry Rows) phục vụ xử lý dữ liệu trong service.js
export function readEntryRows(sheet, actor, { items = [], finance = {}, directory = {} } = {}) {
  if (!canReadSheet(actor, sheet)) return [];
  if (sheet.id === 'orders') {
    const profiles = directoryProfiles(directory);
    const tasks = directory?.tasks || [];
    const reminders = directory?.reminders || [];
    return items.map(rawItem => {
      const ownership = resolveOrderOwnership(rawItem);
      const item = { ...rawItem, ...ownership };
      const saleOwned = isSaleSelfOwnedOrder(item);
      const isExecAdmin = item.createdByRole === 'Admin' || item.createdByName === 'Quản trị Demo';
      const roleLabel =
        item.createdByRole === 'Sale'
          ? 'Phòng Sale'
          : item.createdByRole === 'CEO'
            ? 'CEO'
            : '';
      const createdByLabel = isExecAdmin
        ? 'Ban Giám đốc (Sếp)'
        : item.createdByName
          ? `${item.createdByName}${roleLabel ? ` (${roleLabel})` : ''}`
          : saleOwned
            ? 'Nhân viên Sale'
            : 'Ban Giám đốc (Sếp)';
      const assignInfo = resolveAlertAssignmentInfo(
        { id: `order-${item.rowId}`, type: 'orders', reference: item.poId, data: item },
        tasks,
        profiles,
        reminders
      );
      const ownerHandlerLabel = saleOwned
        ? `${item.assignedSaleName || item.createdByName || 'Nhân viên Sale'} (Sale tự nhận đơn)`
        : assignInfo.isAssigned
          ? `${assignInfo.assigneesText}${assignInfo.departmentText ? ` (${assignInfo.departmentText})` : ''}`
          : 'Đơn Sếp tạo · Chờ giao việc';
      return {
        ...item,
        createdByLabel,
        ownerHandlerLabel,
      };
    });
  }
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
  if (['revenue', 'receivables', 'payables'].includes(sheet.id)) {
    const profiles = directoryProfiles(directory);
    const tasks = directory?.tasks || [];
    const reminders = directory?.reminders || [];
    const alertType = sheet.id === 'payables' ? 'payables' : 'receivables';
    return (finance[sheet.id] || []).map(row => {
      const accOwned = isAccountantSelfOwnedFinance(row);
      const isExecAdmin = row.createdByRole === 'Admin' || row.createdByName === 'Quản trị Demo';
      const roleLabel =
        row.createdByRole === 'Accountant'
          ? 'Phòng Kế toán'
          : row.createdByRole === 'CEO'
            ? 'CEO'
            : '';
      const createdByLabel = isExecAdmin
        ? 'Ban Giám đốc (Sếp)'
        : row.createdByName
          ? `${row.createdByName}${roleLabel ? ` (${roleLabel})` : ''}`
          : accOwned
            ? `${row.pic || 'Nhân viên Kế toán'} (Phòng Kế toán)`
            : 'Ban Giám đốc (Sếp)';
      const assignInfo = resolveAlertAssignmentInfo(
        { id: `${alertType}-${row.id}`, type: alertType, reference: row.docNo, data: row },
        tasks,
        profiles,
        reminders
      );
      const ownerHandlerLabel = accOwned
        ? `${row.assignedAccountantName || row.createdByName || row.pic || 'Nhân viên Kế toán'} (Kế toán tự nhận)`
        : assignInfo.isAssigned
          ? `${assignInfo.assigneesText}${assignInfo.departmentText ? ` (${assignInfo.departmentText})` : ''}`
          : 'Chứng từ Sếp tạo · Chờ giao việc';
      return {
        ...row,
        createdByLabel,
        ownerHandlerLabel,
      };
    });
  }
  return finance[sheet.id] || [];
}

// Chức năng: Lưu hàng loạt các dòng dữ liệu từ bảng nháp nhập liệu Excel vào cơ sở dữ liệu chính thức
export async function saveEntryBatch(_actorId, sheetId, drafts) {
  const sheet = ENTRY_SHEETS.find(item => item.id === sheetId);
  if (!sheet || !Array.isArray(drafts) || !drafts.length || drafts.length > MAX_ENTRY_ROWS) {
    throw new Error(`Chọn bảng và nhập từ 1 đến ${MAX_ENTRY_ROWS} dòng.`);
  }
  return saveEntryBatchApi(sheetId, drafts);
}
