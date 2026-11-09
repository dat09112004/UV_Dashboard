import { linkedItems, poReferences } from './recordReferences.js';
import { newRecordId } from './recordId.js';
import { parseBusinessDate, formatBusinessDate, businessToday } from './business.js';

export const FINANCE_STORAGE_KEY = 'uv-finance-workflow-v1';
export const AP_REVIEW = 'Kế toán đang kiểm tra hồ sơ';
export const AP_PENDING = 'Chờ CEO duyệt chi';
export const AP_APPROVED = 'Đã duyệt';
export const AP_RETURNED = 'Yêu cầu bổ sung';
export const AP_SPLIT_REQUIRED = 'Cần tách chứng từ';
export const OPENING_RECEIPT_ID = 'PMT-2026-001';
export const payableVendorCodes = row => String(row.vendorNo || '').split('/').map(code => code.trim()).filter(Boolean);
export const needsPayableSplit = row => payableVendorCodes(row).length > 1;
export const payableWorkflowStatus = row => needsPayableSplit(row) && balance(row) > 0 ? AP_SPLIT_REQUIRED : row.approvalState;
export const payableSplitVendors = (row, items) => {
  const related = linkedItems(row, items);
  return [...new Set(payableVendorCodes(row))].map(code => {
    const lines = related.filter(item => String(item.vendorNo) === code);
    return { code, name: lines[0]?.vendorName, lines };
  });
};
export const financeCustomers = state => [...new Set([...state.revenue, ...state.receivables].map(row => row.customerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
const clone = value => structuredClone(value);
const id = newRecordId;
const text = (value, label) => {
  const result = String(value || '').trim();
  if (!result || result.length > 500) throw new Error(`${label} cần có nội dung, tối đa 500 ký tự.`);
  return result;
};
const money = (value, label, allowZero = false) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1)) throw new Error(`${label} phải là số nguyên VND ${allowZero ? 'không âm' : 'lớn hơn 0'}.`);
  return result;
};
export { businessToday };
const date = (value, label, today, openingDate) => {
  const parsed = parseBusinessDate(value), now = parseBusinessDate(today);
  if (!parsed || !now || parsed > now || (openingDate && parsed < parseBusinessDate(openingDate))) throw new Error(`${label} phải hợp lệ, từ ngày mở dữ liệu đến ngày hiện tại.`);
  return formatBusinessDate(value);
};
const requirePermission = (user, permission, state) => {
  if (!user?.id || user.status !== 'active' || !user.permissions?.includes(permission)) throw new Error('Bạn không có quyền thực hiện thao tác này.');
  if (state.loadIssue) throw new Error('Cần kiểm tra bản lưu tài chính bị lỗi trước khi ghi tiếp.');
  if (state.isPeriodLocked) throw new Error('Kỳ đang khóa, không thể ghi nhận giao dịch.');
};
const balance = debt => Math.max(0, Number(debt.originalAmount) + Number(debt.adjustment || 0) - Number(debt.allocatedPaid));
const event = (state, user, type, reference, detail, amount = null) => {
  state.revision += 1;
  state.audit.push({ id: id('AUD'), type, reference, actorId: user.id, actorName: user.name, occurredAt: new Date().toISOString(), detail, amount });
  return state;
};

export function initialFinanceState(revenue, receivables, payables, openingDate, { includeOpeningReceipt = true } = {}) {
  return {
    version: 1, openingDate, revision: 0, isPeriodLocked: false,
    revenue: clone(revenue), receivables: clone(receivables),
    payables: payables.map(row => ({ ...row, approvedRemaining: row.approvalState === AP_APPROVED ? balance(row) : 0,
      requestAmount: row.approvalState === AP_PENDING ? balance(row) : null, approvalOrigin: 'opening' })),
    // The supplied aggregate has no verified customer/reference. Never guess ownership.
    receipts: includeOpeningReceipt ? [{ id: OPENING_RECEIPT_ID, amount: 25000000, allocatedAmount: 0, customerName: null, currency: 'VND', reference: '', date: '', status: 'unidentified' }] : [],
    allocations: [], payments: [], audit: [], payableSplitSources: [],
  };
}

export function validateFinanceState(state) {
  if (state?.version !== 1 || !parseBusinessDate(state.openingDate) || !Number.isSafeInteger(state.revision) || typeof state.isPeriodLocked !== 'boolean') throw new Error('Dữ liệu tài chính lưu không hợp lệ.');
  for (const key of ['revenue', 'receivables', 'payables', 'receipts', 'allocations', 'payments', 'audit']) {
    if (!Array.isArray(state[key])) throw new Error('Thiếu bảng dữ liệu tài chính.');
    if (new Set(state[key].map(row => row.id)).size !== state[key].length || state[key].some(row => !row.id)) throw new Error('Trùng mã giao dịch.');
  }
  for (const key of ['revenue', 'receivables', 'payables']) if (new Set(state[key].map(row => String(row.docNo).toLowerCase())).size !== state[key].length) throw new Error('Trùng số chứng từ.');
  if (state.payableSplitSources !== undefined) {
    if (!Array.isArray(state.payableSplitSources)) throw new Error('Lịch sử chứng từ gộp không hợp lệ.');
    const documents = [...state.payables, ...state.payableSplitSources];
    if (documents.some(row => !row?.id || !row.docNo) ||
      new Set(documents.map(row => String(row.docNo).toUpperCase())).size !== documents.length) throw new Error('Trùng hoặc thiếu số chứng từ phải trả.');
  }
  for (const row of [...state.receivables, ...state.payables]) {
    const total = money(row.originalAmount, 'Số tiền gốc', true) + money(row.adjustment || 0, 'Điều chỉnh', true);
    if (money(row.allocatedPaid, 'Đã phân bổ', true) > total) throw new Error('Tiền đã phân bổ vượt giá trị chứng từ.');
  }
  for (const row of state.revenue) if (money(row.cashCollected, 'Thực thu', true) > money(row.netRevenue, 'Doanh thu', true)) throw new Error('Thực thu vượt doanh thu chứng từ.');
  for (const row of state.receipts) {
    if (money(row.allocatedAmount, 'Đã phân bổ', true) > money(row.amount, 'Tiền thu') || row.currency !== 'VND') throw new Error('Khoản thu không hợp lệ.');
    if (!row.customerName && row.allocatedAmount > 0) throw new Error('Khoản thu chưa xác định khách hàng đã bị phân bổ.');
  }
  return state;
}

const storage = () => { try { return globalThis.localStorage; } catch { return null; } };
export function loadFinanceState(base, target = storage(), storageKey = FINANCE_STORAGE_KEY) {
  try {
    const raw = target?.getItem(storageKey);
    if (!raw) return clone(base);
    const saved = validateFinanceState(JSON.parse(raw));
    if (saved.openingDate !== base.openingDate) throw new Error('Khác ngày mở dữ liệu.');
    return saved;
  } catch { return { ...clone(base), loadIssue: 'Không thể đọc dữ liệu tài chính đã lưu. Đã mở dữ liệu gốc; kiểm tra bản lưu trước khi nhập tiếp.' }; }
}
export function persistFinanceState(state, target = storage(), storageKey = FINANCE_STORAGE_KEY, expectedRevision = state.revision - 1) {
  validateFinanceState(state);
  if (!target) throw new Error('Không thể lưu dữ liệu trên trình duyệt này.');
  const previous = target.getItem(storageKey);
  const previousRevision = previous ? JSON.parse(previous).revision : 0;
  if (previousRevision !== expectedRevision) throw new Error('Dữ liệu đã thay đổi ở cửa sổ khác. Tải lại trang trước khi thao tác tiếp.');
  target.setItem(storageKey, JSON.stringify(state));
}

export async function saveFinanceState(state, locks = globalThis.navigator?.locks, storageKey = FINANCE_STORAGE_KEY) {
  if (!locks) throw new Error('Cần mở ứng dụng qua HTTPS hoặc localhost bằng trình duyệt hỗ trợ khóa giữa các tab để lưu tài chính.');
  return locks.request(storageKey, () => persistFinanceState(state, undefined, storageKey));
}
export const unallocatedTotal = state => state.receipts.reduce((sum, row) => sum + row.amount - row.allocatedAmount, 0);

export function recordInvoice(state, user, payload, items, today = businessToday()) {
  requirePermission(user, 'revenue.create', state);
  const row = items.find(item => item.rowId === Number(payload.rowId));
  if (!row) throw new Error('Chọn đúng dòng PO và mã hàng hiện có.');
  const docNo = text(payload.docNo, 'Số chứng từ').toUpperCase();
  if ([...state.revenue, ...state.receivables].some(doc => doc.docNo.toUpperCase() === docNo)) throw new Error('Số chứng từ đã tồn tại.');
  const customerName = text(payload.customerName, 'Khách hàng');
  const recordDate = date(payload.recordDate, 'Ngày ghi nhận', today, state.openingDate);
  const dueDate = formatBusinessDate(payload.dueDate);
  if (!parseBusinessDate(payload.dueDate) || parseBusinessDate(dueDate) < parseBusinessDate(recordDate)) throw new Error('Hạn thanh toán phải từ ngày ghi nhận trở đi.');
  const netRevenue = money(payload.netRevenue, 'Doanh thu');
  const shippedQty = Number(payload.shippedQty);
  if (!Number.isFinite(shippedQty) || shippedQty < 0 || String(payload.shippedQty).trim() === '') throw new Error('Số lượng phải không âm; ghi 0 khi ghi nhận theo mốc nghiệm thu.');
  const basis = text(payload.basis, 'Căn cứ ghi nhận');
  const next = clone(state);
  const common = { docNo, customerName, poId: row.poId, poLineId: row.rowId, sku: row.vendorItemNo, category: row.category, currency: 'VND' };
  next.revenue.push({ ...common, id: id('REV'), vendorName: `${row.vendorNo} - ${row.vendorName}`, recordDate, dueDate, shippedQty, netRevenue, cashCollected: 0,
    approvalStatus: 'Đã ghi nhận', basis, alertLevel: 'Đúng hạn', priorityRank: 2, statusNote: basis });
  next.receivables.push({ ...common, id: id('AR'), vendorRef: `${row.vendorNo} - ${row.vendorName}`, dueDate, originalAmount: netRevenue, adjustment: 0, allocatedPaid: 0, remaining: netRevenue, commitmentNote: '' });
  return event(next, user, 'INVOICE_RECORDED', docNo, basis, netRevenue);
}

export function saveReceipt(state, user, payload, today = businessToday()) {
  requirePermission(user, 'receivables.allocate', state);
  const customerName = String(payload.customerName || '').trim();
  if ((payload.id || customerName) && !financeCustomers(state).includes(customerName)) throw new Error('Hãy chọn khách hàng từ danh sách.');
  const reference = text(payload.reference, 'Tham chiếu ngân hàng hoặc phiếu thu');
  const receiptDate = date(payload.date, 'Ngày nhận tiền', today, payload.id === OPENING_RECEIPT_ID ? null : state.openingDate);
  if (state.receipts.some(row => row.reference && row.reference.toLowerCase() === reference.toLowerCase() && row.id !== payload.id)) throw new Error('Tham chiếu khoản thu đã tồn tại.');
  const next = clone(state);
  if (payload.id) {
    const receipt = next.receipts.find(row => row.id === payload.id);
    if (!receipt || receipt.allocatedAmount !== 0 || !['unidentified', 'identified'].includes(receipt.status) ||
      next.allocations.some(row => row.receiptId === receipt.id)) throw new Error('Chỉ sửa đối soát khi khoản thu chưa được phân bổ.');
    const correction = receipt.status === 'identified';
    const detail = correction
      ? `Khách hàng: ${receipt.customerName} → ${customerName} · Tham chiếu: ${receipt.reference} → ${reference} · Ngày nhận: ${receipt.date} → ${receiptDate} · Lý do: ${text(payload.correctionReason, 'Lý do sửa đối soát')}`
      : `Khách hàng: ${customerName}`;
    Object.assign(receipt, { customerName, reference, date: receiptDate, status: 'identified' });
    return event(next, user, correction ? 'RECEIPT_CORRECTED' : 'RECEIPT_IDENTIFIED', reference, detail);
  }
  const amount = money(payload.amount, 'Số tiền nhận');
  next.receipts.push({ id: id('PMT'), customerName: customerName || null, reference, date: receiptDate, amount, allocatedAmount: 0,
    currency: 'VND', status: customerName ? 'identified' : 'unidentified' });
  return event(next, user, 'RECEIPT_RECORDED', reference, `Khách hàng: ${customerName || 'Chưa xác định'}`, amount);
}

export function allocateReceipt(state, user, payload, today = businessToday()) {
  requirePermission(user, 'receivables.allocate', state);
  const next = clone(state);
  const receipt = next.receipts.find(row => row.id === payload.receiptId);
  const debt = next.receivables.find(row => row.id === payload.debtId);
  if (!receipt?.customerName || receipt.status !== 'identified') throw new Error('Cần đối soát và xác định khách hàng của khoản thu trước.');
  if (!debt || debt.customerName !== receipt.customerName || (debt.currency || 'VND') !== receipt.currency) throw new Error('Khoản thu và hóa đơn phải cùng khách hàng, cùng loại tiền.');
  const amount = money(payload.amount, 'Số tiền phân bổ');
  if (amount > receipt.amount - receipt.allocatedAmount || amount > balance(debt)) throw new Error('Số phân bổ vượt số tiền còn lại của khoản thu hoặc hóa đơn.');
  const allocationDate = date(payload.date, 'Ngày phân bổ', today, state.openingDate);
  if (parseBusinessDate(allocationDate) < parseBusinessDate(receipt.date)) throw new Error('Ngày phân bổ không trước ngày nhận tiền.');
  const invoice = next.revenue.find(row => row.docNo === debt.docNo);
  if (!invoice || invoice.customerName !== receipt.customerName || invoice.cashCollected + amount > invoice.netRevenue) throw new Error('Chứng từ doanh thu chưa khớp khoản phải thu.');
  if (parseBusinessDate(allocationDate) < parseBusinessDate(invoice.recordDate)) throw new Error('Ngày phân bổ không được trước ngày ghi nhận hóa đơn.');
  receipt.allocatedAmount += amount;
  debt.allocatedPaid += amount; debt.remaining = balance(debt);
  invoice.cashCollected += amount;
  next.allocations.push({ id: id('ALLOC'), receiptId: receipt.id, debtId: debt.id, docNo: debt.docNo, amount, date: allocationDate });
  return event(next, user, 'RECEIPT_ALLOCATED', debt.docNo, receipt.reference, amount);
}

export function recordPayable(state, user, payload, items) {
  requirePermission(user, 'payables.submit', state);
  const row = items.find(item => item.rowId === Number(payload.rowId));
  if (!row) throw new Error('Chọn đúng dòng PO và mã hàng hiện có.');
  const docNo = text(payload.docNo, 'Số chứng từ').toUpperCase();
  if ([...state.payables, ...(state.payableSplitSources || [])].some(doc => doc.docNo.toUpperCase() === docNo)) {
    throw new Error('Số chứng từ đã tồn tại.');
  }
  const originalAmount = money(payload.originalAmount, 'Số tiền gốc');
  const dueDate = parseBusinessDate(payload.dueDate) ? formatBusinessDate(payload.dueDate) : null;
  if (payload.dueDate && !dueDate) throw new Error('Hạn thanh toán không hợp lệ.');
  const next = clone(state);
  next.payables.push({
    id: id('AP'), docNo, poId: row.poId, poLineId: row.rowId, sku: row.vendorItemNo, category: row.category,
    vendorNo: row.vendorNo, supplierName: row.vendorName, currency: 'VND', originalAmount, adjustment: 0,
    allocatedPaid: 0, remaining: originalAmount, dueDate: dueDate || '—', approvalState: AP_REVIEW,
    approvedRemaining: 0, requestAmount: null, approvalOrigin: 'workflow',
  });
  return event(next, user, 'PAYABLE_RECORDED', docNo, row.vendorName, originalAmount);
}

export function submitPayable(state, user, payload) {
  requirePermission(user, 'payables.submit', state);
  const next = clone(state), row = next.payables.find(p => p.id === payload.id);
  if (!row || ![AP_REVIEW, AP_RETURNED].includes(row.approvalState) || balance(row) <= 0) throw new Error('Hồ sơ không ở trạng thái được phép trình duyệt.');
  if (needsPayableSplit(row)) throw new Error('Cần tách và đối soát chứng từ gộp trước khi trình duyệt.');
  const amount = money(payload.amount, 'Số tiền đề nghị');
  if (amount > balance(row)) throw new Error('Số tiền đề nghị vượt công nợ còn lại.');
  if (!parseBusinessDate(payload.dueDate)) throw new Error('Bổ sung hạn thanh toán hợp lệ trước khi trình.');
  Object.assign(row, { requestedDueDate: formatBusinessDate(payload.dueDate), requestAmount: amount, requestNote: text(payload.note, 'Nội dung đề nghị'), requestedBy: user.id,
    approvalState: AP_PENDING, approvedRemaining: 0, reviewNote: '', approvalOrigin: 'workflow' });
  return event(next, user, 'PAYABLE_SUBMITTED', row.docNo, row.requestNote, amount);
}

export function splitPayable(state, user, payload, items) {
  requirePermission(user, 'payables.submit', state);
  const source = state.payables.find(row => row.id === payload.id);
  if (!source || !needsPayableSplit(source) || balance(source) <= 0) throw new Error('Hồ sơ không còn đủ điều kiện tách.');
  if (state.payments.some(row => row.payableId === source.id)) throw new Error('Cần đối soát riêng vì hồ sơ gộp đã có giao dịch chi được ghi nhận.');
  const vendors = payableSplitVendors(source, items);
  if (vendors.length < 2 || vendors.some(vendor => !vendor.lines.length)) throw new Error('Chưa xác định được PO tương ứng cho từng nhà cung cấp.');
  const note = text(payload.note, 'Căn cứ tách và đối soát');
  const sourceHistory = state.payableSplitSources || [];
  const usedDocs = new Set([...state.payables, ...sourceHistory].map(row => row.docNo.toUpperCase()));
  const parts = vendors.map(({ code, name, lines }) => {
    const part = payload.parts?.[code];
    const docNo = text(part?.docNo, 'Số chứng từ riêng').toUpperCase();
    if (usedDocs.has(docNo)) throw new Error('Số chứng từ riêng phải khác nhau và chưa được sử dụng.');
    usedDocs.add(docNo);
    const originalAmount = money(part.originalAmount, 'Số tiền gốc');
    const adjustment = money(part.adjustment || 0, 'Điều chỉnh', true);
    const allocatedPaid = money(part.allocatedPaid || 0, 'Số đã trả', true);
    if (!Number.isSafeInteger(originalAmount + adjustment) || allocatedPaid > originalAmount + adjustment) throw new Error('Số đã trả của từng nhà cung cấp không được vượt số tiền phải trả.');
    const dueDate = part.dueDate ? formatBusinessDate(part.dueDate) : '—';
    if (part.dueDate && !parseBusinessDate(part.dueDate)) throw new Error('Hạn thanh toán của nhà cung cấp không hợp lệ.');
    const poIds = [...new Set(lines.map(line => line.poId))];
    return { id: id('AP'), docNo, vendorNo: code, supplierName: name, category: source.category,
      poId: poIds.join(' / '), poIds, ...(lines.length === 1 ? { poLineId: lines[0].rowId } : {}),
      sku: [...new Set(lines.map(line => line.vendorItemNo))].join(' · '), dueDate,
      originalAmount, adjustment, allocatedPaid, remaining: originalAmount + adjustment - allocatedPaid,
      approvalState: AP_REVIEW, approvalOrigin: 'split', approvedRemaining: 0, requestAmount: null,
      splitSourceDocNo: source.docNo, pic: source.pic };
  });
  for (const key of ['originalAmount', 'adjustment', 'allocatedPaid']) {
    if (parts.reduce((sum, row) => sum + row[key], 0) !== (source[key] || 0)) {
      throw new Error('Tổng tiền gốc, điều chỉnh và số đã trả phải khớp chứng từ gộp.');
    }
  }
  const next = clone(state);
  next.payables.splice(next.payables.findIndex(row => row.id === source.id), 1, ...parts);
  next.payableSplitSources = [...(next.payableSplitSources || []), { ...source, splitInto: parts.map(row => row.docNo).join(' · ') }];
  return event(next, user, 'PAYABLE_SPLIT', source.docNo, `${parts.map(row => row.docNo).join(' · ')}. Căn cứ: ${note}`, balance(source));
}

export function reviewPayable(state, user, payload, today = businessToday()) {
  requirePermission(user, 'payables.approve', state);
  if (typeof payload.approve !== 'boolean') throw new Error('Kết quả duyệt phải là giá trị đúng hoặc sai.');
  const next = clone(state), row = next.payables.find(p => p.id === payload.id);
  if (!row || row.approvalState !== AP_PENDING || !(row.requestAmount > 0) || row.requestAmount > balance(row)) throw new Error('Chỉ duyệt đề nghị đang chờ CEO, với số tiền còn hiệu lực.');
  if (payload.approve && needsPayableSplit(row)) throw new Error('Cần tách và đối soát chứng từ gộp trước khi duyệt.');
  if (payload.approve && row.requestedBy === user.id) throw new Error('Người lập đề nghị không được tự duyệt.');
  const reviewNote = text(payload.note, 'Ý kiến xử lý');
  Object.assign(row, { approvalState: payload.approve ? AP_APPROVED : AP_RETURNED, approvedRemaining: payload.approve ? row.requestAmount : 0, reviewedBy: user.id, reviewedDate: date(today, 'Ngày duyệt', today, state.openingDate), reviewedAt: new Date().toISOString(), reviewNote, ...(payload.approve && row.requestedDueDate ? { dueDate: row.requestedDueDate } : {}) });
  return event(next, user, payload.approve ? 'PAYABLE_APPROVED' : 'PAYABLE_RETURNED', row.docNo, reviewNote, row.requestAmount);
}

export function recordPayablePayment(state, user, payload, today = businessToday()) {
  requirePermission(user, 'payables.record-payment', state);
  const next = clone(state), row = next.payables.find(p => p.id === payload.id);
  if (!row || row.approvalState !== AP_APPROVED) throw new Error('Chứng từ chưa được CEO duyệt chi.');
  if (needsPayableSplit(row)) throw new Error('Chứng từ gộp nhiều nhà cung cấp cần được tách và đối soát trước khi ghi nhận chi.');
  const amount = money(payload.amount, 'Số tiền chi');
  if (amount > balance(row) || amount > row.approvedRemaining) throw new Error('Số tiền chi vượt dư nợ hoặc hạn mức đã duyệt còn lại.');
  const reference = text(payload.reference, 'Tham chiếu chi tiền');
  if (next.payments.some(p => p.reference.toLowerCase() === reference.toLowerCase())) throw new Error('Tham chiếu chi tiền đã được ghi nhận.');
  const paidDate = date(payload.date, 'Ngày chi', today, state.openingDate);
  if (row.reviewedDate && parseBusinessDate(paidDate) < parseBusinessDate(row.reviewedDate)) throw new Error('Ngày chi không được trước ngày duyệt đề nghị.');
  row.allocatedPaid += amount; row.remaining = balance(row); row.approvedRemaining -= amount;
  if (row.approvedRemaining === 0 && row.remaining > 0) row.approvalState = AP_REVIEW;
  next.payments.push({ id: id('PAY'), payableId: row.id, docNo: row.docNo, amount, date: paidDate, reference, approvedBy: row.reviewedBy || 'opening' });
  return event(next, user, 'PAYABLE_PAID', row.docNo, reference, amount);
}


export function itemFinancialSummary(item, state) {
  const related = rows => rows.filter(row => linkedItems(row, [item]).length > 0);
  const ar = related(state.receivables), ap = related(state.payables);
  return { revenue: related(state.revenue).reduce((sum, row) => sum + row.netRevenue, 0),
    receivables: ar.reduce((sum, row) => sum + balance(row), 0), payables: ap.reduce((sum, row) => sum + balance(row), 0),
    grouped: ap.some(row => poReferences(row).length > 1) };
}
