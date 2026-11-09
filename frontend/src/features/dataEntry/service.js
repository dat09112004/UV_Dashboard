import { amountInputError, inspectQuantityInput, normalizeAmountInput, normalizeQuantityInput } from '../../utils/workspaceUi.js';
import { locale } from '../../locales/i18n.js';
import { canOpenSection } from '../../utils/roles.js';
import { businessToday, dateInputValue, formatBusinessDate } from '../../utils/business.js';
import { loadTrackedItems, persistTrackedBatch, updateProgressRecord } from '../../utils/orderFulfillment.js';
import { allocateReceipt, loadFinanceState, persistFinanceState, recordInvoice, recordPayable, recordPayablePayment, saveReceipt } from '../../utils/financeWorkflow.js';
import { applyDirectoryAction, DIRECTORY_KEY, directoryProfiles, readDirectory, taskWorkspace } from '../users/services/demoDirectory.js';
import { taskStatusAt } from '../operations/services/taskWorkflow.js';
import { DEMO_ORDERS, DEMO_FINANCE_BASE, DEMO_TRACKING_KEY, DEMO_FINANCE_KEY } from '../../mock/bm41Scenarios.js';
import { canReadSheet, canWriteSheet, ENTRY_SHEETS } from './schema.js';

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
    throw new Error(inspected.error || 'Số phải không âm; dùng dấu chấm tách hàng nghìn (ví dụ 1.000) hoặc dấu phẩy cho phần thập phân (ví dụ 1,5).');
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
    const warning = !error && /^[1-9]\d{0,2}[.,]\d{3}(?:\s*VND)?$/i.test(text)
      ? `Hệ thống đang hiểu là ${formatted}.`
      : '';
    return { normalized, value, formatted, warning, error };
  }
  if (QUANTITY_COLUMNS.includes(columnKey)) {
    const unit = String(rowValues.unit || '').trim();
    return inspectQuantityInput(text, { allowZero: columnKey !== 'orderedQty', unit });
  }
  if (PERCENT_COLUMNS.includes(columnKey)) {
    const cleaned = text.replace(/^(\d+(?:[.,]\d+)?)\s*%$/, '$1').replace(/^(\d+),(\d+)$/, '$1.$2');
    const num = /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      return { normalized: null, value: null, formatted: '', warning: '', error: 'Tỷ lệ phải từ 0 đến 100%.' };
    }
    return { normalized: String(num), value: num, formatted: `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(num)}%`, warning: '', error: '' };
  }
  return { normalized: text, value: text, formatted: text, warning: '', error: '' };
}

const findRef = (rows, key, ref) => ref ? rows.find(row => String(row[key] ?? '').toLowerCase() === ref.toLowerCase()) : undefined;
const requireText = (value, max = 160) => {
  if (!value || value.length > max) throw new Error('Thiếu nội dung bắt buộc hoặc vượt độ dài cho phép.');
  return value;
};
const decimal = (value, optional = false) => {
  if (optional && value === '') return null;
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Số phải không âm; dùng dấu chấm cho phần thập phân.');
  return Number(value);
};
const rowNumber = value => {
  const id = decimal(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Mã dòng PO phải là số nguyên dương.');
  return id;
};

function resolveOrder(items, row) {
  if (row.rowId) {
    const item = items.find(item => item.rowId === rowNumber(row.rowId));
    if (!item || (row.poId && item.poId.toLowerCase() !== row.poId.toLowerCase())) throw new Error('Mã dòng PO không khớp dữ liệu hiện có.');
    return item;
  }
  if (!row.poId) return undefined;
  const matches = items.filter(item => item.poId.toLowerCase() === row.poId.toLowerCase() &&
    (!row.vendorItemNo || item.vendorItemNo.toLowerCase() === row.vendorItemNo.toLowerCase()));
  if (matches.length > 1) throw new Error('PO có nhiều dòng. Hãy điền mã dòng PO để chọn chính xác.');
  return matches[0];
}

export function readEntryRows(sheet, actor, { items, finance, directory }) {
  if (!canReadSheet(actor, sheet)) return [];
  if (sheet.id === 'orders') return items;
  if (sheet.id === 'tasks') {
    return taskWorkspace(directory, actor).tasks.map(task => ({
      ...task, assigneeEmail: directoryProfiles(directory).find(account => account.id === task.assigneeId)?.email,
      status: taskStatusAt(task),
    }));
  }
  if (sheet.id === 'allocations') {
    return finance.allocations.map(row => ({
      ...row, entryReference: row.entryReference ?? row.id,
      receiptReference: finance.receipts.find(receipt => receipt.id === row.receiptId)?.reference,
    }));
  }
  return finance[sheet.id] || [];
}

function updateOrder(items, actor, row, today, nextId, progressMode) {
  const target = resolveOrder(items, row);
  let base = target;
  if (!base) {
    const released = dateInputValue(row.releasedPoDate);
    if (!released || released > today) throw new Error('Ngày phát hành PO phải hợp lệ và không sau ngày hiện tại.');
    const orderedQty = parseQuantityInput(row.orderedQty, { allowZero: false });
    if (orderedQty <= 0) throw new Error('Số lượng đặt phải lớn hơn 0.');
    const unitPriceVnd = decimal(row.unitPriceVnd, true);
    const totalValueVnd = unitPriceVnd === null ? null : Math.round(unitPriceVnd * orderedQty);
    if (totalValueVnd !== null && !Number.isSafeInteger(totalValueVnd)) throw new Error('Giá trị PO vượt phạm vi cho phép.');
    base = {
      rowId: nextId, poId: requireText(row.poId), vendorItemNo: requireText(row.vendorItemNo),
      vendorNo: requireText(row.vendorNo), vendorName: requireText(row.vendorName), category: requireText(row.category),
      countryOfOrigin: row.countryOfOrigin, releasedPoDate: formatBusinessDate(released), inboundOnly: true,
      unitPriceVnd, totalValueVnd, orderedQty, unit: requireText(row.unit, 24), tonDau: 0,
    };
  }
  const trackingFields = ['unit', 'orderedQty', 'nhap', 'deliveredQty', 'onProcessPct', 'packagingPct',
    'expectedReceiptDate', 'shipDateEtd', 'etaDate', 'actualShipDate', 'actualDeliveryDate'];
  const changes = Object.fromEntries(trackingFields.filter(key => row[key] && row[key] !== '—').map(key => [key, row[key]]));
  for (const key of ['orderedQty', 'nhap', 'deliveredQty']) {
    if (Object.hasOwn(changes, key)) changes[key] = parseQuantityInput(changes[key], { allowZero: key !== 'orderedQty' });
  }
  for (const key of ['onProcessPct', 'packagingPct']) {
    if (Object.hasOwn(changes, key)) changes[key] = decimal(changes[key]);
  }
  if (target) {
    for (const key of ['poId', 'vendorItemNo', 'vendorNo', 'vendorName', 'category', 'countryOfOrigin', 'releasedPoDate', 'unitPriceVnd']) {
      const normalize = key === 'releasedPoDate' ? dateInputValue :
        key === 'unitPriceVnd' ? value => normalizeAmountInput(value) ?? String(value ?? '').trim() :
        value => String(value ?? '').trim().toLowerCase();
      if (row[key] && row[key] !== '—' && normalize(row[key]) !== normalize(target[key])) {
        throw new Error('Thông tin gốc của PO đã tồn tại. Chỉ cập nhật các cột tiến độ.');
      }
    }
  }
  const item = updateProgressRecord(base, actor, {
    ...base, ...changes, ...(target && progressMode === 'today' ? { progressMode: 'today' } : {}),
    changeReason: row.changeReason || 'Nhập liệu Excel',
  }, today);
  if (!target || (changes.orderedQty !== undefined && changes.orderedQty !== target.orderedQty)) {
    // Persist the purchase value for imported POs from their original quantity.
    item.totalValueVnd = base.totalValueVnd;
  }
  return { item, isNew: !target };
}

function applyFinanceRow(sheet, finance, actor, row, items, today) {
  switch (sheet.id) {
    case 'revenue':
    case 'payables': {
      const order = resolveOrder(items, row);
      const payload = { ...row, rowId: order?.rowId };
      return sheet.id === 'revenue' ? recordInvoice(finance, actor, payload, items, today)
        : recordPayable(finance, actor, payload, items);
    }
    case 'receipts':
      return saveReceipt(finance, actor, row, today);
    case 'allocations': {
      const entryReference = requireText(row.entryReference);
      if (findRef(finance.allocations, 'entryReference', entryReference) || findRef(finance.allocations, 'id', entryReference)) {
        throw new Error('Mã lần phân bổ đã tồn tại.');
      }
      const receipt = findRef(finance.receipts, 'reference', row.receiptReference);
      const debt = findRef(finance.receivables, 'docNo', row.docNo);
      const next = allocateReceipt(finance, actor, { ...row, receiptId: receipt?.id, debtId: debt?.id }, today);
      next.allocations.at(-1).entryReference = entryReference;
      return next;
    }
    case 'payments': {
      const debt = findRef(finance.payables, 'docNo', row.docNo);
      return recordPayablePayment(finance, actor, { ...row, id: debt?.id }, today);
    }
    default:
      throw new Error('Bảng này chỉ dùng để xem và xuất dữ liệu.');
  }
}

async function applyTaskRow(directory, actor, row, now) {
  if (Boolean(row.department) === Boolean(row.assigneeEmail)) throw new Error('Chọn một email hoặc một phòng ban cho mỗi công việc.');
  const assignee = findRef(directoryProfiles(directory), 'email', row.assigneeEmail);
  const department = { sale: 'Sale', accountant: 'Accountant', 'kế toán': 'Accountant', 'phòng sale': 'Sale',
    'phòng kế toán': 'Accountant', sales: 'Sale', accounting: 'Accountant' }[row.department.toLowerCase()];
  const bool = row.requiresFile.toLowerCase();
  if (!['', '0', '1', 'true', 'false', 'có', 'không', 'yes', 'no'].includes(bool)) throw new Error('Yêu cầu tệp kết quả phải là Có hoặc Không.');
  if (directory.tasks.some(task => task.assignerId === actor.id && task.title.toLowerCase() === row.title.toLowerCase() &&
    dateInputValue(task.deadline) === dateInputValue(row.deadline) &&
    (department ? task.department === department : !task.department && task.assigneeId === assignee?.id))) {
    throw new Error('Công việc này đã được giao với cùng hạn và người nhận.');
  }
  return applyDirectoryAction(directory, actor.id, 'create-task', { ...row, assigneeId: assignee?.id, department,
    scope: row.department ? 'department' : 'person', requiresFile: ['1', 'true', 'có', 'yes'].includes(bool) }, now);
}

export async function saveEntryBatch(actorId, sheetId, drafts, {
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, now = new Date(), orderBaseline,
} = {}) {
  if (!storage || !locks) throw new Error('Cần mở bản thử nghiệm qua HTTPS hoặc localhost.');
  const sheet = ENTRY_SHEETS.find(item => item.id === sheetId);
  if (!sheet || !Array.isArray(drafts) || !drafts.length || drafts.length > MAX_ENTRY_ROWS) throw new Error('Chọn bảng và nhập từ 1 đến 500 dòng.');
  const key = sheetId === 'tasks' ? DIRECTORY_KEY : sheetId === 'orders' ? DEMO_TRACKING_KEY : DEMO_FINANCE_KEY;
  return locks.request(DIRECTORY_KEY, async () => {
    let directory = readDirectory(storage);
    const actor = directoryProfiles(directory).find(user => user.id === actorId);
    if (!canOpenSection(actor, 'data-entry') || !canWriteSheet(actor, sheet)) throw new Error('Bạn không có quyền nhập dữ liệu cho bảng này.');
    const commit = async () => {
      const items = loadTrackedItems(DEMO_ORDERS, storage, DEMO_TRACKING_KEY);
      let finance = loadFinanceState(DEMO_FINANCE_BASE, storage, DEMO_FINANCE_KEY);
      const financeRevision = finance.revision;
      const today = businessToday(now);
      const orderChanges = [];
      const orderIds = new Set();
      const lookup = [...items];
      const issues = [];
      const warnings = [];
      let nextId = items.reduce((max, row) => Math.max(max, row.rowId), 0);
      for (const [index, draft] of drafts.entries()) {
        const row = Object.fromEntries(sheet.columns.map(({ key }) => [key, String(draft.values?.[key] ?? '').trim()]));
        if (!Object.values(row).some(Boolean)) continue;
        const line = draft.line || index + 1;
        try {
          for (const column of sheet.columns) if (column.type === 'number' && row[column.key]) {
            const { key } = column;
            if (MONEY_COLUMNS.includes(key)) {
              const amount = normalizeAmountInput(row[key]);
              if (!amount || !Number.isSafeInteger(Number(amount)) || Number(amount) < 1) {
                throw new Error('Nhập số tiền nguyên VND, ví dụ 25.000.000.');
              }
              row[key] = amount;
            } else if (PERCENT_COLUMNS.includes(key)) {
              row[key] = row[key].replace(/^(\d+(?:[.,]\d+)?)\s*%$/, '$1').replace(/^(\d+),(\d+)$/, '$1.$2');
              decimal(row[key]);
            } else if (QUANTITY_COLUMNS.includes(key)) {
              const inspected = inspectQuantityInput(row[key], { allowZero: key !== 'orderedQty', unit: row.unit });
              if (inspected.error || inspected.normalized === null) {
                throw new Error(inspected.error || 'Số phải không âm; dùng dấu chấm tách hàng nghìn (ví dụ 1.000) hoặc dấu phẩy cho phần thập phân (ví dụ 1,5).');
              }
              if (inspected.warning) warnings.push({ line, key, message: inspected.warning });
              row[key] = inspected.normalized;
            } else {
              decimal(row[column.key]);
            }
          }
          if (sheetId === 'orders') {
            const change = updateOrder(lookup, actor, row, today, nextId + 1, draft.progressMode);
            const original = orderBaseline && resolveOrder(orderBaseline, row);
            const version = change.item.trackingVersion ?? null;
            const staleBaseline = orderBaseline && (original?.rowId !== (change.isNew ? undefined : change.item.rowId) ||
              (original?.trackingVersion ?? null) !== version);
            if (staleBaseline || (Object.hasOwn(draft, 'expectedVersion') &&
              (change.isNew || draft.expectedVersion !== version))) {
              throw new Error('Dòng PO đã được cập nhật ở cửa sổ khác. Bản nhập của bạn chưa được lưu. Hãy đối chiếu dữ liệu mới, bỏ bản nháp cũ rồi nhập lại.');
            }
            if (orderIds.has(change.item.rowId)) throw new Error('Một dòng PO xuất hiện nhiều lần trong lô nhập.');
            orderIds.add(change.item.rowId);
            orderChanges.push(change);
            if (change.isNew) { lookup.push(change.item); nextId += 1; }
          } else if (sheetId === 'tasks') directory = await applyTaskRow(directory, actor, row, now);
          else finance = applyFinanceRow(sheet, finance, actor, row, items, today);
        } catch (error) {
          issues.push({ line, message: error.message });
        }
      }
      if (issues.length) return { issues, ...(warnings.length && { warnings }) };
      if (sheetId === 'orders' && orderChanges.length) {
        if (!persistTrackedBatch(orderChanges, storage, key)) throw new Error('Không thể lưu dữ liệu trên trình duyệt này.');
        return { items: loadTrackedItems(DEMO_ORDERS, storage, key), ...(warnings.length && { warnings }) };
      }
      if (sheetId === 'tasks' && drafts.some(draft => Object.values(draft.values || {}).some(value => String(value ?? '').trim()))) {
        storage.setItem(key, JSON.stringify(directory));
        return { directory, ...(warnings.length && { warnings }) };
      }
      if (finance.revision > financeRevision) {
        persistFinanceState(finance, storage, key, financeRevision);
        return { finance, ...(warnings.length && { warnings }) };
      }
      throw new Error('Chưa có dòng dữ liệu để lưu.');
    };
    return key === DIRECTORY_KEY ? commit() : locks.request(key, commit);
  });
}
