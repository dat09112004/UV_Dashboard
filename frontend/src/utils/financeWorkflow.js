import { linkedItems, poReferences } from './recordReferences.js';
import { newRecordId } from './recordId.js';
import { parseBusinessDate, formatBusinessDate, businessToday } from './business.js';

export const AP_REVIEW = 'Kế toán đang kiểm tra hồ sơ';
export const AP_PENDING = 'Chờ CEO duyệt chi';
export const AP_APPROVED = 'Đã duyệt';
export const AP_RETURNED = 'Yêu cầu bổ sung';
export const AP_SPLIT_REQUIRED = 'Cần tách chứng từ';
export const OPENING_RECEIPT_ID = 'PMT-2026-001';
export const MAX_BUSINESS_MONEY_VND = 1_000_000_000_000;

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
const text = (value, label, maxLen = 500) => {
  const result = String(value || '').trim();
  if (!result || result.length > maxLen) throw new Error(`${label} cần có nội dung, tối đa ${maxLen} ký tự.`);
  return result;
};
const money = (value, label, allowZero = false) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1) || result > MAX_BUSINESS_MONEY_VND) {
    throw new Error(`${label} phải là số nguyên VND ${allowZero ? 'không âm' : 'lớn hơn 0'}.`);
  }
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
const requireAnyPermission = (user, permissions, state) => {
  if (!user?.id || user.status !== 'active' || !permissions.some(p => user.permissions?.includes(p))) {
    throw new Error('Bạn không có quyền thực hiện thao tác này.');
  }
  if (state.loadIssue) throw new Error('Cần kiểm tra bản lưu tài chính bị lỗi trước khi ghi tiếp.');
  if (state.isPeriodLocked) throw new Error('Kỳ đang khóa, không thể ghi nhận giao dịch.');
};
const balance = debt => Math.max(0, Number(debt.originalAmount) + Number(debt.adjustment || 0) - Number(debt.allocatedPaid));
const event = (state, user, type, reference, detail, amount = null) => {
  state.revision += 1;
  state.audit.push({ id: id('AUD'), type, reference, actorId: user.id, actorName: user.name, occurredAt: new Date().toISOString(), detail, amount });
  return state;
};

export function initialFinanceState(revenue, receivables, payables, openingDate) {
  return {
    version: 1, openingDate, revision: 0, isPeriodLocked: false,
    revenue: clone(revenue), receivables: clone(receivables),
    payables: payables.map(row => ({ ...row, approvedRemaining: row.approvalState === AP_APPROVED ? balance(row) : 0,
      requestAmount: row.approvalState === AP_PENDING ? balance(row) : null, approvalOrigin: 'opening' })),
    receipts: [],
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

export const unallocatedTotal = state => state.receipts.reduce((sum, row) => sum + row.amount - row.allocatedAmount, 0);

export function recordInvoice(state, user, payload, items, today = businessToday()) {
  requirePermission(user, 'revenue.create', state);
  const row = items.find(item => item.rowId === Number(payload.rowId));
  if (!row) throw new Error('Chọn đúng dòng PO và mã hàng hiện có.');
  const docNo = text(payload.docNo, 'Số chứng từ').toUpperCase();
  if ((state.revenue || []).some(doc => doc.docNo.toUpperCase() === docNo)) throw new Error('Số chứng từ đã tồn tại.');
  const existingArByDoc = (state.receivables || []).find(doc => doc.docNo.toUpperCase() === docNo);
  const existingArById = payload.linkedArId ? (state.receivables || []).find(doc => doc.id === payload.linkedArId) : null;
  const targetUnlinkedAr = existingArById || (existingArByDoc && ((existingArByDoc.poLineId && Number(existingArByDoc.poLineId) === Number(row.rowId)) || existingArByDoc.poId === row.poId) && !(state.revenue || []).some(inv => inv.docNo.toUpperCase() === existingArByDoc.docNo.toUpperCase()) ? existingArByDoc : null);
  if (existingArByDoc && !targetUnlinkedAr) throw new Error('Số chứng từ đã tồn tại.');
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
  const linkedAr = targetUnlinkedAr ? next.receivables.find(r => r.id === targetUnlinkedAr.id) : null;
  const initialCashCollected = linkedAr ? Math.min(netRevenue, Number(linkedAr.allocatedPaid || 0)) : 0;
  next.revenue.push({ ...common, id: id('REV'), vendorName: `${row.vendorNo} - ${row.vendorName}`, recordDate, dueDate, shippedQty, netRevenue, cashCollected: initialCashCollected,
    approvalStatus: 'Đã ghi nhận', basis, alertLevel: 'Đúng hạn', priorityRank: 2, statusNote: basis });
  if (linkedAr) {
    Object.assign(linkedAr, {
      ...common,
      vendorRef: `${row.vendorNo} - ${row.vendorName}`,
      dueDate,
      originalAmount: netRevenue,
      remaining: Math.max(0, netRevenue + Number(linkedAr.adjustment || 0) - Number(linkedAr.allocatedPaid || 0)),
      commitmentNote: linkedAr.commitmentNote || basis,
    });
  } else {
    next.receivables.push({ ...common, id: id('AR'), vendorRef: `${row.vendorNo} - ${row.vendorName}`, dueDate, originalAmount: netRevenue, adjustment: 0, allocatedPaid: 0, remaining: netRevenue, commitmentNote: '' });
  }
  return event(next, user, 'INVOICE_RECORDED', docNo, basis, netRevenue);
}

export function createReceivable(state, user, payload, items = []) {
  requireAnyPermission(user, ['receivables.allocate', 'revenue.create'], state);
  const docNo = text(payload.docNo, 'Số chứng từ phải thu', 64).toUpperCase();
  if ((state.receivables || []).some(doc => doc.docNo.toUpperCase() === docNo)) {
    throw new Error('Số chứng từ phải thu đã tồn tại.');
  }
  const matchedOrder =
    (payload.rowId ? items.find(item => item.rowId === Number(payload.rowId)) : null) ||
    (payload.poId ? items.find(item => item.poId === String(payload.poId).trim()) : null);
  const customerName = text(payload.customerName, 'Khách hàng', 255);
  const poId = matchedOrder?.poId || text(payload.poId || 'PO-CONG-NO', 'Mã PO tham chiếu', 64);
  const poLineId = matchedOrder ? matchedOrder.rowId : null;
  const sku = matchedOrder?.vendorItemNo || String(payload.sku || 'Tổng hợp theo PO').trim().slice(0, 120);
  const fallbackCategory = items.find(item => item?.category)?.category || 'Chưa phân loại';
  const category = String(matchedOrder?.category || payload.category || fallbackCategory).trim().slice(0, 120);
  const defaultVendorRef = matchedOrder ? `${matchedOrder.vendorNo} - ${matchedOrder.vendorName}` : 'Đối tác Uyên Vũ';
  const vendorRef = String(payload.vendorRef || defaultVendorRef).trim().slice(0, 255);
  const originalAmount = money(payload.originalAmount, 'Số tiền phải thu gốc');
  const adjustment = money(payload.adjustment || 0, 'Điều chỉnh', true);
  if (!Number.isSafeInteger(originalAmount + adjustment) || originalAmount + adjustment > MAX_BUSINESS_MONEY_VND) {
    throw new Error('Tổng giá trị phải thu vượt hạn mức cho phép.');
  }
  let dueDate = '—';
  if (payload.dueDate && String(payload.dueDate).trim() !== '' && String(payload.dueDate).trim() !== '—') {
    if (!parseBusinessDate(payload.dueDate)) throw new Error('Hạn thanh toán không hợp lệ.');
    dueDate = formatBusinessDate(payload.dueDate);
  }
  const commitmentNote = String(payload.commitmentNote || '').trim().slice(0, 500);
  const remaining = originalAmount + adjustment;
  const next = clone(state);
  next.receivables.push({
    id: id('AR'),
    docNo,
    poId,
    poLineId,
    customerName,
    vendorRef,
    sku,
    category,
    currency: 'VND',
    dueDate,
    originalAmount,
    adjustment,
    allocatedPaid: 0,
    remaining,
    commitmentNote,
  });
  const wantSyncRev = payload.syncRevenue === true || payload.syncRevenue === 'true' || payload.syncRevenue === 'on';
  if (wantSyncRev && !(next.revenue || []).some(r => r.docNo.toUpperCase() === docNo)) {
    const revDate = payload.recordDate && parseBusinessDate(payload.recordDate) ? formatBusinessDate(payload.recordDate) : formatBusinessDate(businessToday());
    const revQty = Number.isFinite(Number(payload.shippedQty)) && Number(payload.shippedQty) >= 0
      ? Number(payload.shippedQty)
      : Number(matchedOrder?.deliveredQty ?? matchedOrder?.nhap ?? matchedOrder?.orderedQty ?? 0);
    const revBasis = commitmentNote || `Đồng bộ doanh thu & phải thu PO ${poId} - ${sku}`;
    next.revenue.push({
      id: id('REV'),
      docNo,
      customerName,
      poId,
      poLineId,
      sku,
      category,
      currency: 'VND',
      vendorName: vendorRef,
      recordDate: revDate,
      dueDate: dueDate === '—' ? revDate : dueDate,
      shippedQty: revQty,
      netRevenue: remaining,
      cashCollected: 0,
      approvalStatus: 'Đã ghi nhận',
      basis: revBasis,
      alertLevel: 'Đúng hạn',
      priorityRank: 2,
      statusNote: revBasis,
    });
  }
  return event(next, user, 'RECEIVABLE_CREATED', docNo, commitmentNote || `Khách hàng: ${customerName} · PO: ${poId}`, remaining);
}

export function updateReceivable(state, user, payload, items = []) {
  requireAnyPermission(user, ['receivables.allocate', 'revenue.create'], state);
  const next = clone(state);
  const row = next.receivables.find(r => r.id === payload.id);
  if (!row) throw new Error('Không tìm thấy khoản phải thu cần cập nhật.');
  const hasLinkedInvoice = (next.revenue || []).some(
    inv => inv.docNo && inv.docNo.toUpperCase() === row.docNo.toUpperCase()
  );
  if (payload.docNo !== undefined) {
    const nextDocNo = text(payload.docNo, 'Số chứng từ phải thu', 64).toUpperCase();
    if (next.receivables.some(r => r.id !== row.id && r.docNo.toUpperCase() === nextDocNo)) {
      throw new Error('Số chứng từ phải thu đã tồn tại.');
    }
    if (nextDocNo !== row.docNo.toUpperCase()) {
      if (row.allocatedPaid > 0) {
        throw new Error('Không thể đổi số chứng từ khi khoản phải thu đã có phân bổ tiền thu.');
      }
      if (hasLinkedInvoice) {
        throw new Error('Không thể đổi số chứng từ của khoản phải thu đã gắn với hóa đơn doanh thu.');
      }
    }
    row.docNo = nextDocNo;
  }
  if (payload.customerName !== undefined) {
    const nextCustomer = text(payload.customerName, 'Khách hàng', 255);
    if (nextCustomer !== row.customerName) {
      if (row.allocatedPaid > 0) {
        throw new Error('Không thể đổi khách hàng khi khoản phải thu đã được phân bổ tiền thu.');
      }
      if (hasLinkedInvoice) {
        throw new Error('Không thể đổi khách hàng của khoản phải thu đã gắn với hóa đơn doanh thu.');
      }
    }
    row.customerName = nextCustomer;
  }
  if (payload.unlinkPo === true) {
    if (hasLinkedInvoice || row.allocatedPaid > 0) {
      throw new Error('Không thể gỡ liên kết PO khi khoản phải thu đã gắn với hóa đơn hoặc đã phân bổ tiền thu.');
    }
    row.poLineId = null;
  } else if (payload.rowId !== undefined && payload.rowId !== '' && payload.rowId !== null) {
    const matchedOrder = items.find(item => item.rowId === Number(payload.rowId));
    if (!matchedOrder) {
      throw new Error('Không tìm thấy dòng PO được chọn.');
    }
    if (hasLinkedInvoice && Number(matchedOrder.rowId) !== Number(row.poLineId)) {
      throw new Error('Không thể đổi dòng PO của khoản phải thu đã gắn với hóa đơn doanh thu.');
    }
    row.poId = matchedOrder.poId;
    row.poLineId = matchedOrder.rowId;
    row.sku = matchedOrder.vendorItemNo;
    row.category = matchedOrder.category;
    row.vendorRef = `${matchedOrder.vendorNo} - ${matchedOrder.vendorName}`.slice(0, 255);
  } else {
    if (payload.poId !== undefined) {
      const nextPoId = text(payload.poId, 'Mã PO', 64);
      if (hasLinkedInvoice && nextPoId !== row.poId) {
        throw new Error('Không thể đổi mã PO của khoản phải thu đã gắn với hóa đơn doanh thu.');
      }
      row.poId = nextPoId;
    }
    if (payload.sku !== undefined) {
      const nextSku = text(payload.sku, 'Mã hàng', 120);
      if (hasLinkedInvoice && nextSku !== row.sku) {
        throw new Error('Không thể đổi mã hàng của khoản phải thu đã gắn với hóa đơn doanh thu.');
      }
      row.sku = nextSku;
    }
    if (payload.category !== undefined) row.category = text(payload.category, 'Ngành hàng', 120);
    if (payload.vendorRef !== undefined) row.vendorRef = text(payload.vendorRef, 'Tham chiếu NCC', 255);
  }
  if (payload.dueDate !== undefined) {
    const rawDue = String(payload.dueDate || '').trim();
    if (!rawDue || rawDue === '—') row.dueDate = '—';
    else {
      if (!parseBusinessDate(rawDue)) throw new Error('Hạn thanh toán không hợp lệ.');
      row.dueDate = formatBusinessDate(rawDue);
    }
  }
  const nextOriginal = payload.originalAmount !== undefined ? money(payload.originalAmount, 'Số tiền phải thu gốc') : row.originalAmount;
  const nextAdjustment = payload.adjustment !== undefined ? money(payload.adjustment, 'Điều chỉnh', true) : Number(row.adjustment || 0);
  if (hasLinkedInvoice) {
    if (nextOriginal !== row.originalAmount) {
      throw new Error('Không thể đổi số tiền phải thu gốc của khoản phải thu đã gắn với hóa đơn doanh thu.');
    }
    if (nextAdjustment !== Number(row.adjustment || 0)) {
      throw new Error('Không thể điều chỉnh chênh lệch tiền trên khoản phải thu đã gắn với hóa đơn doanh thu.');
    }
  }
  const total = nextOriginal + nextAdjustment;
  if (!Number.isSafeInteger(total) || total > MAX_BUSINESS_MONEY_VND) {
    throw new Error('Tổng giá trị phải thu vượt hạn mức cho phép.');
  }
  if (total < row.allocatedPaid) {
    throw new Error('Tổng phải thu sau điều chỉnh không được nhỏ hơn số tiền đã phân bổ.');
  }
  row.originalAmount = nextOriginal;
  row.adjustment = nextAdjustment;
  row.remaining = total - row.allocatedPaid;
  if (payload.commitmentNote !== undefined) {
    row.commitmentNote = String(payload.commitmentNote || '').trim().slice(0, 500);
  }
  return event(next, user, 'RECEIVABLE_UPDATED', row.docNo, row.commitmentNote || `Cập nhật phải thu ${row.customerName}`, row.remaining);
}

export function deleteReceivable(state, user, payload) {
  requireAnyPermission(user, ['receivables.allocate', 'revenue.create'], state);
  const next = clone(state);
  const index = next.receivables.findIndex(r => r.id === payload.id);
  if (index < 0) throw new Error('Không tìm thấy khoản phải thu cần xóa.');
  const row = next.receivables[index];
  if (row.allocatedPaid > 0 || (next.allocations || []).some(a => a.debtId === row.id || a.docNo === row.docNo)) {
    throw new Error('Không thể xóa khoản phải thu đã có giao dịch phân bổ tiền thu.');
  }
  next.receivables.splice(index, 1);
  return event(next, user, 'RECEIVABLE_DELETED', row.docNo, `Xóa chứng từ phải thu ${row.docNo} (${row.customerName})`, row.originalAmount);
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
  const invoice = next.revenue.find(row => String(row.docNo || '').toUpperCase() === String(debt.docNo || '').toUpperCase()) ||
    next.revenue.find(row => row.customerName === receipt.customerName && ((debt.poLineId && Number(row.poLineId) === Number(debt.poLineId)) || (debt.poId && row.poId === debt.poId)) && row.cashCollected + amount <= row.netRevenue);
  if (invoice) {
    if (invoice.customerName !== receipt.customerName || invoice.cashCollected + amount > invoice.netRevenue) throw new Error('Chứng từ doanh thu chưa khớp khoản phải thu.');
    if (parseBusinessDate(allocationDate) < parseBusinessDate(invoice.recordDate)) throw new Error('Ngày phân bổ không được trước ngày ghi nhận hóa đơn.');
    invoice.cashCollected += amount;
  }
  receipt.allocatedAmount += amount;
  debt.allocatedPaid += amount; debt.remaining = balance(debt);
  next.allocations.push({ id: id('ALLOC'), receiptId: receipt.id, debtId: debt.id, docNo: debt.docNo, amount, date: allocationDate });
  return event(next, user, 'RECEIPT_ALLOCATED', debt.docNo, receipt.reference, amount);
}

export function recordPayable(state, user, payload, items = []) {
  requireAnyPermission(user, ['payables.submit', 'payables.approve'], state);
  const matchedRow =
    (payload.rowId ? items.find(item => item.rowId === Number(payload.rowId)) : null) ||
    (payload.poId && !payload.supplierName ? items.find(item => item.poId === String(payload.poId).trim()) : null);
  if (payload.rowId && !matchedRow) throw new Error('Chọn đúng dòng PO và mã hàng hiện có.');
  const docNo = text(payload.docNo, 'Số chứng từ', 64).toUpperCase();
  if ([...state.payables, ...(state.payableSplitSources || [])].some(doc => doc.docNo.toUpperCase() === docNo)) {
    throw new Error('Số chứng từ đã tồn tại.');
  }
  const originalAmount = money(payload.originalAmount, 'Số tiền gốc');
  const adjustment = money(payload.adjustment || 0, 'Điều chỉnh', true);
  const rawDue = payload.dueDate && String(payload.dueDate).trim() !== '—' ? String(payload.dueDate).trim() : '';
  const dueDate = rawDue && parseBusinessDate(rawDue) ? formatBusinessDate(rawDue) : null;
  if (rawDue && !dueDate) throw new Error('Hạn thanh toán không hợp lệ.');
  const poId = matchedRow?.poId || text(payload.poId || 'PO-NCC', 'Mã PO', 255);
  const poLineId = matchedRow ? matchedRow.rowId : null;
  const sku = matchedRow?.vendorItemNo || String(payload.sku || 'Tổng hợp theo PO').trim().slice(0, 255);
  const fallbackApCategory = items.find(item => item?.category)?.category || 'Chưa phân loại';
  const category = String(matchedRow?.category || payload.category || fallbackApCategory).trim().slice(0, 120);
  const vendorNo = matchedRow?.vendorNo || text(payload.vendorNo || 'NCC', 'Mã nhà cung cấp', 120);
  const supplierName = matchedRow?.vendorName || text(payload.supplierName || 'Nhà cung cấp', 'Nhà cung cấp', 255);
  const requestNote = payload.requestNote ? String(payload.requestNote).trim().slice(0, 500) : undefined;
  const remaining = originalAmount + adjustment;
  const next = clone(state);
  next.payables.push({
    id: id('AP'), docNo, poId, poLineId, sku, category,
    vendorNo, supplierName, currency: 'VND', originalAmount, adjustment,
    allocatedPaid: 0, remaining, dueDate: dueDate || '—', approvalState: AP_REVIEW,
    approvedRemaining: 0, requestAmount: null,
    ...(requestNote ? { requestNote } : {}),
    approvalOrigin: 'workflow',
  });
  return event(next, user, 'PAYABLE_RECORDED', docNo, supplierName, remaining);
}

export function updatePayable(state, user, payload, items = []) {
  requireAnyPermission(user, ['payables.submit', 'payables.approve'], state);
  const next = clone(state);
  const row = next.payables.find(p => p.id === payload.id);
  if (!row) throw new Error('Không tìm thấy khoản phải trả cần cập nhật.');
  const prevSnapshot = {
    docNo: row.docNo,
    vendorNo: row.vendorNo,
    supplierName: row.supplierName,
    poId: row.poId,
    poLineId: row.poLineId ?? null,
    sku: row.sku,
    dueDate: row.dueDate,
    originalAmount: row.originalAmount,
    adjustment: Number(row.adjustment || 0),
    approvalState: row.approvalState,
  };
  if (payload.docNo !== undefined) {
    const nextDocNo = text(payload.docNo, 'Số chứng từ phải trả', 64).toUpperCase();
    if ([...next.payables, ...(next.payableSplitSources || [])].some(p => p.id !== row.id && p.docNo.toUpperCase() === nextDocNo)) {
      throw new Error('Số chứng từ phải trả đã tồn tại.');
    }
    if (nextDocNo !== row.docNo && row.allocatedPaid > 0) {
      throw new Error('Không thể đổi số chứng từ khi khoản phải trả đã có giao dịch chi tiền.');
    }
    row.docNo = nextDocNo;
  }
  if (payload.rowId !== undefined && payload.rowId !== '' && payload.rowId !== null) {
    const matchedRow = items.find(item => item.rowId === Number(payload.rowId));
    if (!matchedRow) {
      throw new Error('Không tìm thấy dòng PO được chọn.');
    }
    row.poId = matchedRow.poId;
    row.poLineId = matchedRow.rowId;
    row.sku = matchedRow.vendorItemNo;
    row.category = matchedRow.category;
    row.vendorNo = matchedRow.vendorNo;
    row.supplierName = matchedRow.vendorName;
  } else {
    if (payload.supplierName !== undefined) row.supplierName = text(payload.supplierName, 'Nhà cung cấp', 255);
    if (payload.vendorNo !== undefined) row.vendorNo = text(payload.vendorNo, 'Mã nhà cung cấp', 120);
    if (payload.poId !== undefined) row.poId = text(payload.poId, 'Mã PO', 255);
    if (payload.sku !== undefined) row.sku = text(payload.sku, 'Mã hàng', 255);
    if (payload.category !== undefined) row.category = text(payload.category, 'Ngành hàng', 120);
  }
  if (payload.dueDate !== undefined) {
    const rawDue = String(payload.dueDate || '').trim();
    if (!rawDue || rawDue === '—') row.dueDate = '—';
    else {
      if (!parseBusinessDate(rawDue)) throw new Error('Hạn thanh toán không hợp lệ.');
      row.dueDate = formatBusinessDate(rawDue);
    }
  }
  const nextOriginal = payload.originalAmount !== undefined ? money(payload.originalAmount, 'Số tiền phải trả gốc') : row.originalAmount;
  const nextAdjustment = payload.adjustment !== undefined ? money(payload.adjustment, 'Điều chỉnh', true) : Number(row.adjustment || 0);
  const total = nextOriginal + nextAdjustment;
  if (!Number.isSafeInteger(total) || total > MAX_BUSINESS_MONEY_VND) {
    throw new Error('Tổng giá trị phải trả vượt hạn mức cho phép.');
  }
  if (total < row.allocatedPaid) {
    throw new Error('Tổng phải trả sau điều chỉnh không được nhỏ hơn số tiền đã chi.');
  }
  row.originalAmount = nextOriginal;
  row.adjustment = nextAdjustment;
  row.remaining = total - row.allocatedPaid;

  const criticalChanged =
    row.docNo !== prevSnapshot.docNo ||
    row.vendorNo !== prevSnapshot.vendorNo ||
    row.supplierName !== prevSnapshot.supplierName ||
    row.poId !== prevSnapshot.poId ||
    (row.poLineId ?? null) !== prevSnapshot.poLineId ||
    row.sku !== prevSnapshot.sku ||
    row.dueDate !== prevSnapshot.dueDate ||
    row.originalAmount !== prevSnapshot.originalAmount ||
    row.adjustment !== prevSnapshot.adjustment;

  if (criticalChanged && row.allocatedPaid > 0 && (
    row.docNo !== prevSnapshot.docNo ||
    row.vendorNo !== prevSnapshot.vendorNo ||
    row.supplierName !== prevSnapshot.supplierName ||
    row.poId !== prevSnapshot.poId ||
    (row.poLineId ?? null) !== prevSnapshot.poLineId ||
    row.sku !== prevSnapshot.sku ||
    row.originalAmount !== prevSnapshot.originalAmount
  )) {
    throw new Error('Không thể đổi thông tin gốc (nhà cung cấp, PO, mã hàng, số tiền gốc) khi chứng từ đã phát sinh chi tiền.');
  }

  let approvalResetNote = '';
  if (criticalChanged && [AP_APPROVED, AP_PENDING].includes(prevSnapshot.approvalState)) {
    row.approvalState = AP_REVIEW;
    row.approvedRemaining = 0;
    row.requestAmount = null;
    row.requestedBy = undefined;
    row.requestedDueDate = undefined;
    row.reviewedBy = undefined;
    row.reviewedDate = undefined;
    row.reviewedAt = undefined;
    row.reviewNote = undefined;
    approvalResetNote = ' (Đã hủy hiệu lực duyệt cũ do thay đổi thông tin trọng yếu, cần trình duyệt lại)';
  } else if (row.approvedRemaining > row.remaining) {
    row.approvedRemaining = row.remaining;
  }
  if (payload.requestNote !== undefined) {
    row.requestNote = String(payload.requestNote || '').trim().slice(0, 500) || undefined;
  }
  return event(next, user, 'PAYABLE_UPDATED', row.docNo, `${row.requestNote || `Cập nhật phải trả ${row.supplierName}`}${approvalResetNote}`.slice(0, 500), row.remaining);
}

export function deletePayable(state, user, payload) {
  requireAnyPermission(user, ['payables.submit', 'payables.approve'], state);
  const next = clone(state);
  const index = next.payables.findIndex(p => p.id === payload.id);
  if (index < 0) throw new Error('Không tìm thấy khoản phải trả cần xóa.');
  const row = next.payables[index];
  if (row.allocatedPaid > 0 || (next.payments || []).some(p => p.payableId === row.id || p.docNo === row.docNo)) {
    throw new Error('Không thể xóa khoản phải trả đã phát sinh giao dịch chi tiền.');
  }
  next.payables.splice(index, 1);
  return event(next, user, 'PAYABLE_DELETED', row.docNo, `Xóa chứng từ phải trả ${row.docNo} (${row.supplierName})`, row.originalAmount);
}

export function submitPayable(state, user, payload, today = businessToday()) {
  requirePermission(user, 'payables.submit', state);
  const next = clone(state), row = next.payables.find(p => p.id === payload.id);
  if (!row || ![AP_REVIEW, AP_RETURNED].includes(row.approvalState) || balance(row) <= 0) throw new Error('Hồ sơ không ở trạng thái được phép trình duyệt.');
  if (needsPayableSplit(row)) throw new Error('Cần tách và đối soát chứng từ gộp trước khi trình duyệt.');
  const amount = money(payload.amount, 'Số tiền đề nghị');
  if (amount > balance(row)) throw new Error('Số tiền đề nghị vượt công nợ còn lại.');
  if (!parseBusinessDate(payload.dueDate)) throw new Error('Bổ sung hạn thanh toán hợp lệ trước khi trình.');
  const formattedDue = formatBusinessDate(payload.dueDate);
  const cleanNote = text(payload.note, 'Nội dung đề nghị');
  if (payload.approveDirectly === true && user.role === 'CEO') {
    requirePermission(user, 'payables.approve', state);
    Object.assign(row, {
      requestedDueDate: formattedDue,
      dueDate: formattedDue,
      requestAmount: amount,
      requestNote: cleanNote,
      requestedBy: user.id,
      approvalState: AP_APPROVED,
      approvedRemaining: amount,
      reviewedBy: user.id,
      reviewedDate: date(today, 'Ngày duyệt', today, state.openingDate),
      reviewedAt: new Date().toISOString(),
      reviewNote: cleanNote,
      approvalOrigin: 'workflow',
    });
    return event(next, user, 'PAYABLE_APPROVED', row.docNo, cleanNote, amount);
  }
  Object.assign(row, { requestedDueDate: formattedDue, requestAmount: amount, requestNote: cleanNote, requestedBy: user.id,
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
  if (payload.approve && row.requestedBy === user.id && user.role !== 'CEO') throw new Error('Người lập đề nghị không được tự duyệt.');
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

export function receivableForAllocation(row, customerName) {
  if (!row) return false;
  const remaining = Number(row.originalAmount || 0) + Number(row.adjustment || 0) - Number(row.allocatedPaid || 0);
  if (remaining <= 0) return false;
  if (!customerName) return true;
  return row.customerName === customerName;
}
