import { linkedItems, poReferences } from './recordReferences.js';
import { newRecordId } from './recordId.js';
import { parseBusinessDate, formatBusinessDate, businessToday } from './business.js';
// Chức năng: Tạo đối tượng lỗi nghiệp vụ kèm mã lỗi chuẩn trên Frontend
const domainError = (message, status = 400, code = 'DOMAIN_ERROR') => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};
import { normalizeAmountInput } from './workspaceUi.js';

export const FINANCE_STORAGE_KEY = 'uv-finance-workflow-v1';
export const AP_REVIEW = 'Kế toán đang kiểm tra hồ sơ';
export const AP_PENDING = 'Chờ CEO duyệt chi';
export const AP_APPROVED = 'Đã duyệt';
export const AP_RETURNED = 'Yêu cầu bổ sung';
export const AP_SPLIT_REQUIRED = 'Cần tách chứng từ';
export const OPENING_RECEIPT_ID = 'PMT-2026-001';
export const AR_OPEN = 'Chưa lập đề nghị thu';
export const AR_PENDING = 'Chờ CEO xác nhận thu';
export const AR_APPROVED = 'Đã xác nhận thu';
export const AR_RETURNED = 'Yêu cầu bổ sung';

// Chức năng: Xử lý nghiệp vụ (payableVendorCodes - Vendor Codes) phục vụ xử lý dữ liệu trong financeWorkflow.js
export const payableVendorCodes = row =>
  String(row?.vendorNo || '')
    .split('/')
    .map(code => code.trim())
    .filter(Boolean);

// Chức năng: Xử lý nghiệp vụ (needsPayableSplit - Payable Split) phục vụ xử lý dữ liệu trong financeWorkflow.js
export const needsPayableSplit = row => payableVendorCodes(row).length > 1;

// Chức năng: Xử lý nghiệp vụ (balance - balance) phục vụ xử lý dữ liệu trong financeWorkflow.js
const balance = debt =>
  Math.max(
    0,
    Number(debt.originalAmount) + Number(debt.adjustment || 0) - Number(debt.allocatedPaid)
  );

// Chức năng: Xác định nhãn trạng thái quy trình phê duyệt hiện tại của khoản Công nợ phải trả
export const payableWorkflowStatus = row =>
  needsPayableSplit(row) && balance(row) > 0 ? AP_SPLIT_REQUIRED : row.approvalState;

// Chức năng: Kiểm tra khoản Công nợ phải thu còn số dư để phân bổ và khớp khách hàng của phiếu thu
export const receivableForAllocation = (row, customerName) => {
  if (!row || balance(row) <= 0) return false;
  if (!customerName) return true;
  return row.customerName === customerName;
};

// Chức năng: Xử lý nghiệp vụ (payableSplitVendors - Split Vendors) phục vụ xử lý dữ liệu trong financeWorkflow.js
export const payableSplitVendors = (row, items) => {
  const related = linkedItems(row, items);
  return [...new Set(payableVendorCodes(row))].map(code => {
    const lines = related.filter(item => String(item.vendorNo) === code);
    return { code, name: lines[0]?.vendorName, lines };
  });
};

// Chức năng: Xử lý nghiệp vụ (financeCustomers - Customers) phục vụ xử lý dữ liệu trong financeWorkflow.js
export const financeCustomers = state =>
  [
    ...new Set(
      [...(state.revenue || []), ...(state.receivables || [])]
        .map(row => row.customerName)
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, 'vi'));

// Chức năng: Xử lý nghiệp vụ (clone - clone) phục vụ xử lý dữ liệu trong financeWorkflow.js
const clone = value => structuredClone(value);
const id = newRecordId;

// Chức năng: Xử lý nghiệp vụ (text - text) phục vụ xử lý dữ liệu trong financeWorkflow.js
const text = (value, label, maxLen = 500) => {
  const result = String(value || '').trim();
  if (!result || result.length > maxLen) {
    throw domainError(`${label} cần có nội dung, tối đa ${maxLen} ký tự.`);
  }
  return result;
};

// QA09 & P1-19 Fix: Thống nhất trần nghiệp vụ 1.000 tỷ VND/giao dịch trên toàn bộ hệ thống
export const MAX_BUSINESS_MONEY_VND = 1000000000000;

// Chức năng: Xử lý nghiệp vụ (money - money) phục vụ xử lý dữ liệu trong financeWorkflow.js
const money = (value, label, allowZero = false) => {
  if (allowZero && (value === 0 || value === '0' || value === '' || value === null || value === undefined)) {
    return 0;
  }
  const normalized = normalizeAmountInput(value);
  const result = normalized ? Number(normalized) : Number.NaN;
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1) || result > MAX_BUSINESS_MONEY_VND) {
    throw domainError(`${label} phải là số nguyên VND ${allowZero ? 'không âm' : 'lớn hơn 0'} và không vượt quá 1.000 tỷ VND.`);
  }
  return result;
};

export { businessToday };

// Chức năng: Chuẩn hóa thông tin người tạo chứng từ tài chính và quyền tự động nhận xử lý của Kế toán
export function buildFinanceCreatorOwnership(user, payload = {}) {
  const isAccountantCreator = user?.role === 'Accountant';
  const createdById = payload?.createdById ?? user?.id ?? null;
  const createdByName = payload?.createdByName ?? user?.name ?? 'Hệ thống';
  const createdByRole = payload?.createdByRole ?? user?.role ?? 'CEO';
  const createdByEmail = payload?.createdByEmail ?? user?.email ?? '';
  const ownerType = isAccountantCreator
    ? 'accountant_self_owned'
    : (payload?.ownerType || 'executive_created');
  const assignedAccountantId = isAccountantCreator
    ? (payload?.assignedAccountantId ?? user?.id ?? null)
    : (payload?.assignedAccountantId ?? null);
  const assignedAccountantName = isAccountantCreator
    ? (payload?.assignedAccountantName ?? user?.name ?? null)
    : (payload?.assignedAccountantName ?? null);
  return {
    createdById,
    createdByName,
    createdByRole,
    createdByEmail,
    assignedAccountantId,
    assignedAccountantName,
    ownerType,
  };
}


// Chức năng: Xử lý nghiệp vụ (date - date) phục vụ xử lý dữ liệu trong financeWorkflow.js
const date = (value, label, today, openingDate) => {
  const parsed = parseBusinessDate(value);
  const now = parseBusinessDate(today);
  if (!parsed || !now || parsed > now || (openingDate && parsed < parseBusinessDate(openingDate))) {
    throw domainError(`${label} phải hợp lệ, từ ngày mở dữ liệu đến ngày hiện tại.`);
  }
  return formatBusinessDate(value);
};

// Chức năng: Xử lý nghiệp vụ (requirePermission - Permission) phục vụ xử lý dữ liệu trong financeWorkflow.js
const requirePermission = (user, permission, state) => {
  if (!user?.id || (user.status && user.status !== 'active') || !user.permissions?.includes(permission)) {
    throw domainError('Bạn không có quyền thực hiện thao tác này.', 403, 'FORBIDDEN');
  }
  if (state.loadIssue) {
    throw domainError('Cần kiểm tra bản lưu tài chính bị lỗi trước khi ghi tiếp.');
  }
  if (state.isPeriodLocked) {
    throw domainError('Kỳ đang khóa, không thể ghi nhận giao dịch.');
  }
};

// Chức năng: Xử lý nghiệp vụ (requireAnyFinancePermission - Any Finance Permission) phục vụ xử lý dữ liệu trong financeWorkflow.js
const requireAnyFinancePermission = (user, permissions, section, state) => {
  const hasPerm = Array.isArray(permissions) && permissions.some(p => user?.permissions?.includes(p));
  if (!user?.id || (user.status && user.status !== 'active') || !hasPerm) {
    throw domainError('Bạn không có quyền thực hiện thao tác này.', 403, 'FORBIDDEN');
  }
  if (state.loadIssue) {
    throw domainError('Cần kiểm tra bản lưu tài chính bị lỗi trước khi ghi tiếp.');
  }
  if (state.isPeriodLocked) {
    throw domainError('Kỳ đang khóa, không thể ghi nhận giao dịch.');
  }
};

// Chức năng: Xử lý nghiệp vụ (event - event) phục vụ xử lý dữ liệu trong financeWorkflow.js
const event = (state, user, type, reference, detail, amount = null) => {
  state.revision += 1;
  state.audit.push({
    id: id('AUD'),
    type,
    reference,
    actorId: user.id,
    actorName: user.name,
    occurredAt: new Date().toISOString(),
    detail,
    amount,
    revision: state.revision,
  });
  return state;
};

// Chức năng: Khởi tạo trạng thái dữ liệu tài chính chuẩn (Doanh thu, Phải thu, Phiếu thu, Phân bổ, Phải trả, Lịch sử)
export function initialFinanceState(
  revenue,
  receivables,
  payables,
  openingDate,
  { includeOpeningReceipt = true } = {}
) {
  return {
    version: 1,
    openingDate,
    revision: 0,
    isPeriodLocked: false,
    revenue: clone(revenue),
    receivables: clone(receivables),
    payables: payables.map(row => ({
      ...row,
      approvedRemaining: row.approvalState === AP_APPROVED ? balance(row) : 0,
      requestAmount: row.approvalState === AP_PENDING ? balance(row) : null,
      approvalOrigin: 'opening',
    })),
    receipts: includeOpeningReceipt
      ? [
          {
            id: OPENING_RECEIPT_ID,
            amount: 25000000,
            allocatedAmount: 0,
            customerName: null,
            currency: 'VND',
            reference: '',
            date: '',
            status: 'unidentified',
          },
        ]
      : [],
    allocations: [],
    payments: [],
    audit: [],
    payableSplitSources: [],
  };
}

// Chức năng: Kiểm tra tính toàn vẹn số học của toàn bộ sổ cái tài chính (không âm, không thu/chi vượt số dư)
export function validateFinanceState(state) {
  if (
    state?.version !== 1 ||
    !parseBusinessDate(state.openingDate) ||
    !Number.isSafeInteger(state.revision) ||
    typeof state.isPeriodLocked !== 'boolean'
  ) {
    throw domainError('Dữ liệu tài chính lưu không hợp lệ.');
  }
  for (const key of ['revenue', 'receivables', 'payables', 'receipts', 'allocations', 'payments', 'audit']) {
    if (!Array.isArray(state[key])) throw domainError('Thiếu bảng dữ liệu tài chính.');
    if (
      new Set(state[key].map(row => row.id)).size !== state[key].length ||
      state[key].some(row => !row.id)
    ) {
      throw domainError('Trùng mã giao dịch.');
    }
  }
  for (const key of ['revenue', 'receivables', 'payables']) {
    if (new Set(state[key].map(row => String(row.docNo).toLowerCase())).size !== state[key].length) {
      throw domainError('Trùng số chứng từ.');
    }
  }
  if (state.payableSplitSources !== undefined) {
    if (!Array.isArray(state.payableSplitSources)) {
      throw domainError('Lịch sử chứng từ gộp không hợp lệ.');
    }
    const documents = [...state.payables, ...state.payableSplitSources];
    if (
      documents.some(row => !row?.id || !row.docNo) ||
      new Set(documents.map(row => String(row.docNo).toUpperCase())).size !== documents.length
    ) {
      throw domainError('Trùng hoặc thiếu số chứng từ phải trả.');
    }
  }
  for (const row of [...state.receivables, ...state.payables]) {
    const total =
      money(row.originalAmount, 'Số tiền gốc', true) +
      money(row.adjustment || 0, 'Điều chỉnh', true);
    if (!Number.isSafeInteger(total) || total > MAX_BUSINESS_MONEY_VND * 10) {
      throw domainError('Tổng giá trị chứng từ vượt giới hạn số nguyên an toàn.');
    }
    if (money(row.allocatedPaid, 'Đã phân bổ', true) > total) {
      throw domainError('Tiền đã phân bổ vượt giá trị chứng từ.');
    }
  }
  for (const row of state.revenue) {
    if (money(row.cashCollected, 'Thực thu', true) > money(row.netRevenue, 'Doanh thu', true)) {
      throw domainError('Thực thu vượt doanh thu chứng từ.');
    }
  }
  for (const row of state.receipts) {
    if (
      money(row.allocatedAmount, 'Đã phân bổ', true) > money(row.amount, 'Tiền thu') ||
      row.currency !== 'VND'
    ) {
      throw domainError('Khoản thu không hợp lệ.');
    }
    if (!row.customerName && row.allocatedAmount > 0) {
      throw domainError('Khoản thu chưa xác định khách hàng đã bị phân bổ.');
    }
  }
  return state;
}

// Chức năng: Tính tổng số tiền thu từ khách hàng hiện còn dư chưa được phân bổ vào hóa đơn phải thu nào
export const unallocatedTotal = state =>
  (state?.receipts || []).reduce(
    (sum, row) => sum + Number(row.amount || 0) - Number(row.allocatedAmount || 0),
    0
  );

// Chức năng: Ghi nhận hóa đơn doanh thu mới và tự động tạo mới hoặc đồng bộ cập nhật khoản Công nợ phải thu (AR) liên kết
export function recordInvoice(state, user, payload, items, today = businessToday()) {
  requirePermission(user, 'revenue.create', state);
  const row = items.find(item => item.rowId === Number(payload.rowId));
  if (!row) throw domainError('Chọn đúng dòng PO và mã hàng hiện có.');
  const docNo = text(payload.docNo, 'Số chứng từ', 64).toUpperCase();
  if ((state.revenue || []).some(doc => doc.docNo.toUpperCase() === docNo)) {
    throw domainError('Số chứng từ đã tồn tại.', 409, 'CONFLICT');
  }
  const existingArByDoc = (state.receivables || []).find(doc => doc.docNo.toUpperCase() === docNo);
  const existingArById = payload.linkedArId ? (state.receivables || []).find(doc => doc.id === payload.linkedArId) : null;
  const targetUnlinkedAr =
    existingArById ||
    (existingArByDoc &&
    ((existingArByDoc.poLineId && Number(existingArByDoc.poLineId) === Number(row.rowId)) ||
      existingArByDoc.poId === row.poId) &&
    !(state.revenue || []).some(inv => inv.docNo.toUpperCase() === existingArByDoc.docNo.toUpperCase())
      ? existingArByDoc
      : null);
  if (existingArByDoc && !targetUnlinkedAr) {
    throw domainError('Số chứng từ đã tồn tại.', 409, 'CONFLICT');
  }
  const customerName = text(payload.customerName, 'Khách hàng', 255);
  const recordDate = date(payload.recordDate, 'Ngày ghi nhận', today, state.openingDate);
  const dueDate = formatBusinessDate(payload.dueDate);
  if (!parseBusinessDate(payload.dueDate) || parseBusinessDate(dueDate) < parseBusinessDate(recordDate)) {
    throw domainError('Hạn thanh toán phải từ ngày ghi nhận trở đi.');
  }
  const netRevenue = money(payload.netRevenue, 'Doanh thu');
  const shippedQty = Number(payload.shippedQty);
  if (!Number.isFinite(shippedQty) || shippedQty < 0 || String(payload.shippedQty).trim() === '') {
    throw domainError('Số lượng phải không âm; ghi 0 khi ghi nhận theo mốc nghiệm thu.');
  }
  const basis = text(payload.basis, 'Căn cứ ghi nhận', 500);
  const displayVendor = `${row.vendorNo} - ${row.vendorName}`;
  const vendorReference = displayVendor.length > 255 ? row.vendorName : displayVendor;
  const next = clone(state);
  const common = {
    docNo,
    customerName,
    poId: row.poId,
    poLineId: row.rowId,
    sku: row.vendorItemNo,
    category: row.category,
    currency: 'VND',
  };
  const ownership = buildFinanceCreatorOwnership(user, payload);
  const linkedAr = targetUnlinkedAr ? next.receivables.find(r => r.id === targetUnlinkedAr.id) : null;
  const initialCashCollected = linkedAr ? Math.min(netRevenue, Number(linkedAr.allocatedPaid || 0)) : 0;
  next.revenue.push({
    ...common,
    ...ownership,
    id: id('REV'),
    vendorName: vendorReference,
    recordDate,
    dueDate,
    shippedQty,
    netRevenue,
    cashCollected: initialCashCollected,
    approvalStatus: 'Đã ghi nhận',
    basis,
    alertLevel: 'Đúng hạn',
    priorityRank: 2,
    statusNote: basis,
  });
  if (linkedAr) {
    Object.assign(linkedAr, {
      ...common,
      vendorRef: vendorReference,
      dueDate,
      originalAmount: netRevenue,
      remaining: Math.max(0, netRevenue + Number(linkedAr.adjustment || 0) - Number(linkedAr.allocatedPaid || 0)),
      commitmentNote: linkedAr.commitmentNote || basis,
    });
  } else {
    next.receivables.push({
      ...common,
      ...ownership,
      id: id('AR'),
      vendorRef: vendorReference,
      dueDate,
      originalAmount: netRevenue,
      adjustment: 0,
      allocatedPaid: 0,
      remaining: netRevenue,
      commitmentNote: '',
    });
  }
  return event(next, user, 'INVOICE_RECORDED', docNo, basis, netRevenue);
}

/**
 * CRUD Công nợ phải thu (AR): Tạo mới khoản phải thu (gắn PO hoặc nhập độc lập)
 */
export function createReceivable(state, user, payload, items = []) {
  requireAnyFinancePermission(user, ['receivables.allocate', 'revenue.create'], 'receivables', state);
  const docNo = text(payload.docNo, 'Số chứng từ phải thu', 64).toUpperCase();
  if ((state.receivables || []).some(doc => doc.docNo.toUpperCase() === docNo)) {
    throw domainError('Số chứng từ phải thu đã tồn tại.', 409, 'CONFLICT');
  }
  const matchedOrder =
    (payload.rowId ? items.find(item => item.rowId === Number(payload.rowId)) : null) ||
    (payload.poId ? items.find(item => item.poId === String(payload.poId).trim()) : null) ||
    (payload.sku ? items.find(item => String(item.vendorItemNo || '').toLowerCase() === String(payload.sku).trim().toLowerCase()) : null);

  const fallbackCategory = items.find(item => item?.category)?.category || 'Chưa phân loại';
  const customerName = text(payload.customerName, 'Khách hàng', 255);
  const poId = matchedOrder?.poId || text(payload.poId || 'PO-CONG-NO', 'Mã PO tham chiếu', 64);
  const poLineId = matchedOrder ? matchedOrder.rowId : null;
  const sku = matchedOrder?.vendorItemNo || String(payload.sku || 'Tổng hợp theo PO').trim().slice(0, 120);
  const category = String(matchedOrder?.category || payload.category || fallbackCategory).trim().slice(0, 120);
  const defaultVendorRef = matchedOrder ? `${matchedOrder.vendorNo} - ${matchedOrder.vendorName}` : 'Đối tác Uyên Vũ';
  const vendorRef = String(payload.vendorRef || defaultVendorRef).trim().slice(0, 255);

  const originalAmount = money(payload.originalAmount, 'Số tiền phải thu gốc');
  const adjustment = money(payload.adjustment || 0, 'Điều chỉnh', true);
  if (!Number.isSafeInteger(originalAmount + adjustment) || originalAmount + adjustment > MAX_BUSINESS_MONEY_VND) {
    throw domainError('Tổng giá trị phải thu vượt hạn mức cho phép.');
  }
  let dueDate = '—';
  if (payload.dueDate && String(payload.dueDate).trim() !== '' && String(payload.dueDate).trim() !== '—') {
    if (!parseBusinessDate(payload.dueDate)) {
      throw domainError('Hạn thanh toán không hợp lệ.');
    }
    dueDate = formatBusinessDate(payload.dueDate);
  }
  const commitmentNote = String(payload.commitmentNote || '').trim().slice(0, 500);
  const remaining = originalAmount + adjustment;
  const ownership = buildFinanceCreatorOwnership(user, payload);
  const next = clone(state);
  next.receivables.push({
    ...ownership,
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
    const revDate =
      payload.recordDate && parseBusinessDate(payload.recordDate)
        ? formatBusinessDate(payload.recordDate)
        : formatBusinessDate(businessToday());
    const revQty =
      Number.isFinite(Number(payload.shippedQty)) && Number(payload.shippedQty) >= 0
        ? Number(payload.shippedQty)
        : Number(matchedOrder?.deliveredQty ?? matchedOrder?.nhap ?? matchedOrder?.orderedQty ?? 0);
    const revBasis = commitmentNote || `Đồng bộ doanh thu & phải thu PO ${poId} - ${sku}`;
    next.revenue.push({
      ...ownership,
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
  return event(
    next,
    user,
    'RECEIVABLE_CREATED',
    docNo,
    commitmentNote || `Khách hàng: ${customerName} · PO: ${poId}`,
    remaining
  );
}

/**
 * CRUD Công nợ phải thu (AR): Cập nhật khoản phải thu
 */
export function updateReceivable(state, user, payload, items = []) {
  requireAnyFinancePermission(user, ['receivables.allocate', 'revenue.create'], 'receivables', state);
  const next = clone(state);
  const row = next.receivables.find(r => r.id === payload.id);
  if (!row) {
    throw domainError('Không tìm thấy khoản phải thu cần cập nhật.', 404, 'NOT_FOUND');
  }
  const hasLinkedInvoice = (next.revenue || []).some(
    inv => inv.docNo && inv.docNo.toUpperCase() === row.docNo.toUpperCase()
  );
  if (payload.docNo !== undefined) {
    const nextDocNo = text(payload.docNo, 'Số chứng từ phải thu', 64).toUpperCase();
    if (
      next.receivables.some(r => r.id !== row.id && r.docNo.toUpperCase() === nextDocNo)
    ) {
      throw domainError('Số chứng từ phải thu đã tồn tại.', 409, 'CONFLICT');
    }
    if (nextDocNo !== row.docNo.toUpperCase()) {
      if (row.allocatedPaid > 0) {
        throw domainError('Không thể đổi số chứng từ khi khoản phải thu đã có phân bổ tiền thu.');
      }
      if (hasLinkedInvoice) {
        throw domainError(
          'Không thể đổi số chứng từ của khoản phải thu đã gắn với hóa đơn doanh thu.',
          409,
          'CONFLICT'
        );
      }
    }
    row.docNo = nextDocNo;
  }
  if (payload.customerName !== undefined) {
    const nextCustomer = text(payload.customerName, 'Khách hàng', 255);
    if (nextCustomer !== row.customerName) {
      if (row.allocatedPaid > 0) {
        throw domainError('Không thể đổi khách hàng khi khoản phải thu đã được phân bổ tiền thu.');
      }
      if (hasLinkedInvoice) {
        throw domainError(
          'Không thể đổi khách hàng của khoản phải thu đã gắn với hóa đơn doanh thu.',
          409,
          'CONFLICT'
        );
      }
    }
    row.customerName = nextCustomer;
  }
  if (payload.unlinkPo === true) {
    if (hasLinkedInvoice || row.allocatedPaid > 0) {
      throw domainError('Không thể gỡ liên kết PO khi khoản phải thu đã gắn với hóa đơn hoặc đã phân bổ tiền thu.', 409, 'CONFLICT');
    }
    row.poLineId = null;
  } else if (payload.rowId !== undefined && payload.rowId !== '' && payload.rowId !== null) {
    const matchedOrder = items.find(item => item.rowId === Number(payload.rowId));
    if (!matchedOrder) {
      throw domainError('Không tìm thấy dòng PO được chọn.', 400, 'INVALID_PO_LINE');
    }
    if (hasLinkedInvoice && Number(matchedOrder.rowId) !== Number(row.poLineId)) {
      throw domainError('Không thể đổi dòng PO của khoản phải thu đã gắn với hóa đơn doanh thu.', 409, 'CONFLICT');
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
        throw domainError('Không thể đổi mã PO của khoản phải thu đã gắn với hóa đơn doanh thu.', 409, 'CONFLICT');
      }
      row.poId = nextPoId;
    }
    if (payload.sku !== undefined) {
      const nextSku = text(payload.sku, 'Mã hàng', 120);
      if (hasLinkedInvoice && nextSku !== row.sku) {
        throw domainError('Không thể đổi mã hàng của khoản phải thu đã gắn với hóa đơn doanh thu.', 409, 'CONFLICT');
      }
      row.sku = nextSku;
    }
    if (payload.category !== undefined) row.category = text(payload.category, 'Ngành hàng', 120);
    if (payload.vendorRef !== undefined) row.vendorRef = text(payload.vendorRef, 'Tham chiếu NCC', 255);
  }
  if (payload.dueDate !== undefined) {
    const rawDue = String(payload.dueDate || '').trim();
    if (!rawDue || rawDue === '—') {
      row.dueDate = '—';
    } else {
      if (!parseBusinessDate(rawDue)) throw domainError('Hạn thanh toán không hợp lệ.');
      row.dueDate = formatBusinessDate(rawDue);
    }
  }
  const nextOriginal =
    payload.originalAmount !== undefined
      ? money(payload.originalAmount, 'Số tiền phải thu gốc')
      : row.originalAmount;
  const nextAdjustment =
    payload.adjustment !== undefined
      ? money(payload.adjustment, 'Điều chỉnh', true)
      : Number(row.adjustment || 0);
  if (hasLinkedInvoice) {
    if (nextOriginal !== row.originalAmount) {
      throw domainError(
        'Không thể đổi số tiền phải thu gốc của khoản phải thu đã gắn với hóa đơn doanh thu.',
        409,
        'CONFLICT'
      );
    }
    if (nextAdjustment !== Number(row.adjustment || 0)) {
      throw domainError(
        'Không thể điều chỉnh chênh lệch tiền trên khoản phải thu đã gắn với hóa đơn doanh thu.',
        409,
        'CONFLICT'
      );
    }
  }
  const total = nextOriginal + nextAdjustment;
  if (!Number.isSafeInteger(total) || total > MAX_BUSINESS_MONEY_VND) {
    throw domainError('Tổng giá trị phải thu vượt hạn mức cho phép.');
  }
  if (total < row.allocatedPaid) {
    throw domainError('Tổng phải thu sau điều chỉnh không được nhỏ hơn số tiền đã phân bổ.');
  }
  row.originalAmount = nextOriginal;
  row.adjustment = nextAdjustment;
  row.remaining = total - row.allocatedPaid;



  if (payload.commitmentNote !== undefined) {
    row.commitmentNote = String(payload.commitmentNote || '').trim().slice(0, 500);
  }
  return event(
    next,
    user,
    'RECEIVABLE_UPDATED',
    row.docNo,
    row.commitmentNote || `Cập nhật phải thu ${row.customerName}`,
    row.remaining
  );
}

/**
 * CRUD Công nợ phải thu (AR): Xóa khoản phải thu chưa phát sinh phân bổ
 */
export function deleteReceivable(state, user, payload) {
  requireAnyFinancePermission(user, ['receivables.allocate', 'revenue.create'], 'receivables', state);
  const next = clone(state);
  const index = next.receivables.findIndex(r => r.id === payload.id);
  if (index < 0) {
    throw domainError('Không tìm thấy khoản phải thu cần xóa.', 404, 'NOT_FOUND');
  }
  const row = next.receivables[index];
  if (row.allocatedPaid > 0 || (next.allocations || []).some(a => a.debtId === row.id || a.docNo === row.docNo)) {
    throw domainError('Không thể xóa khoản phải thu đã có giao dịch phân bổ tiền thu.', 409, 'CONFLICT');
  }
  // Mục 07 Fix: Xóa AR chỉ tác động AR; tách biệt hoàn toàn với hóa đơn doanh thu
  next.receivables.splice(index, 1);
  return event(
    next,
    user,
    'RECEIVABLE_DELETED',
    row.docNo,
    String(payload.reason || `Xóa chứng từ phải thu ${row.docNo} (${row.customerName})`).slice(0, 500),
    row.originalAmount
  );
}

// Chức năng: Ghi nhận phiếu thu tiền khách hàng mới hoặc xác minh khách hàng cho khoản tiền thu đầu kỳ chưa rõ nguồn
export function saveReceipt(state, user, payload, today = businessToday()) {
  requirePermission(user, 'receivables.allocate', state);
  const customerName = String(payload.customerName || '').trim();
  if (customerName.length > 255) {
    throw domainError('Khách hàng cần có nội dung, tối đa 255 ký tự.');
  }
  if ((payload.id || customerName) && !financeCustomers(state).includes(customerName)) {
    throw domainError('Hãy chọn khách hàng từ danh sách.');
  }
  const reference = text(payload.reference, 'Tham chiếu ngân hàng hoặc phiếu thu', 120);
  const receiptDate = date(
    payload.date,
    'Ngày nhận tiền',
    today,
    payload.id === OPENING_RECEIPT_ID ? null : state.openingDate
  );
  if (
    state.receipts.some(
      row =>
        row.reference &&
        row.reference.toLowerCase() === reference.toLowerCase() &&
        row.id !== payload.id
    )
  ) {
    throw domainError('Tham chiếu khoản thu đã tồn tại.', 409, 'CONFLICT');
  }
  const next = clone(state);
  if (payload.id) {
    const receipt = next.receipts.find(row => row.id === payload.id);
    if (
      !receipt ||
      receipt.allocatedAmount !== 0 ||
      !['unidentified', 'identified'].includes(receipt.status) ||
      next.allocations.some(row => row.receiptId === receipt.id)
    ) {
      throw domainError('Chỉ sửa đối soát khi khoản thu chưa được phân bổ.');
    }
    const correction = receipt.status === 'identified';
    const detail = correction
      ? `Khách hàng: ${receipt.customerName} → ${customerName} · Tham chiếu: ${receipt.reference} → ${reference} · Ngày nhận: ${receipt.date} → ${receiptDate} · Lý do: ${text(payload.correctionReason, 'Lý do sửa đối soát', 500)}`
      : `Khách hàng: ${customerName}`;
    Object.assign(receipt, { customerName, reference, date: receiptDate, status: 'identified' });
    return event(
      next,
      user,
      correction ? 'RECEIPT_CORRECTED' : 'RECEIPT_IDENTIFIED',
      reference,
      detail
    );
  }
  const amount = money(payload.amount, 'Số tiền nhận');
  next.receipts.push({
    id: id('PMT'),
    customerName: customerName || null,
    reference,
    date: receiptDate,
    amount,
    allocatedAmount: 0,
    currency: 'VND',
    status: customerName ? 'identified' : 'unidentified',
  });
  return event(
    next,
    user,
    'RECEIPT_RECORDED',
    reference,
    `Khách hàng: ${customerName || 'Chưa xác định'}`,
    amount
  );
}

// Chức năng: Phân bổ số tiền từ phiếu thu vào khoản Công nợ phải thu (AR) và tự động cộng dồn cột Đã thực thu bên bảng Doanh thu
export function allocateReceipt(state, user, payload, today = businessToday()) {
  requirePermission(user, 'receivables.allocate', state);
  let entryReference = null;
  if (payload.entryReference !== undefined && payload.entryReference !== null && String(payload.entryReference).trim() !== '') {
    entryReference = text(payload.entryReference, 'Mã lần phân bổ', 120);
    if (state.allocations.some(row => String(row.entryReference || row.id).trim().toLowerCase() === entryReference.toLowerCase())) {
      throw domainError('Mã lần phân bổ đã tồn tại.', 409, 'CONFLICT');
    }
  }
  const next = clone(state);
  const receipt = next.receipts.find(row => row.id === payload.receiptId);
  const debt = next.receivables.find(row => row.id === payload.debtId);
  if (!receipt?.customerName || receipt.status !== 'identified') {
    throw domainError('Cần đối soát và xác định khách hàng của khoản thu trước.');
  }
  if (!debt || debt.customerName !== receipt.customerName || (debt.currency || 'VND') !== receipt.currency) {
    throw domainError('Khoản thu và hóa đơn phải cùng khách hàng, cùng loại tiền.');
  }
  const amount = money(payload.amount, 'Số tiền phân bổ');
  if (amount > receipt.amount - receipt.allocatedAmount || amount > balance(debt)) {
    throw domainError('Số phân bổ vượt số tiền còn lại của khoản thu hoặc hóa đơn.');
  }
  const allocationDate = date(payload.date, 'Ngày phân bổ', today, state.openingDate);
  if (parseBusinessDate(allocationDate) < parseBusinessDate(receipt.date)) {
    throw domainError('Ngày phân bổ không trước ngày nhận tiền.');
  }
  const invoice =
    next.revenue.find(row => String(row.docNo || '').toUpperCase() === String(debt.docNo || '').toUpperCase()) ||
    next.revenue.find(
      row =>
        row.customerName === receipt.customerName &&
        ((debt.poLineId && Number(row.poLineId) === Number(debt.poLineId)) ||
          (debt.poId && row.poId === debt.poId)) &&
        row.cashCollected + amount <= row.netRevenue
    );
  if (invoice) {
    if (
      invoice.customerName !== receipt.customerName ||
      invoice.cashCollected + amount > invoice.netRevenue
    ) {
      throw domainError('Chứng từ doanh thu chưa khớp khoản phải thu.');
    }
    if (parseBusinessDate(allocationDate) < parseBusinessDate(invoice.recordDate)) {
      throw domainError('Ngày phân bổ không được trước ngày ghi nhận hóa đơn.');
    }
    invoice.cashCollected += amount;
  }
  receipt.allocatedAmount += amount;
  debt.allocatedPaid += amount;
  debt.remaining = balance(debt);
  const allocId = id('ALLOC');
  next.allocations.push({
    id: allocId,
    ...(entryReference ? { entryReference } : {}),
    receiptId: receipt.id,
    debtId: debt.id,
    docNo: debt.docNo,
    amount,
    date: allocationDate,
  });
  return event(next, user, 'RECEIPT_ALLOCATED', debt.docNo, receipt.reference, amount);
}

// Chức năng: Tạo mới khoản Công nợ phải trả nhà cung cấp (AP) gắn với đơn hàng mua PO
export function recordPayable(state, user, payload, items = []) {
  requireAnyFinancePermission(user, ['payables.submit', 'payables.approve'], 'payables', state);
  const matchedRow =
    (payload.rowId ? items.find(item => item.rowId === Number(payload.rowId)) : null) ||
    (payload.poId && !payload.supplierName ? items.find(item => item.poId === String(payload.poId).trim()) : null) ||
    (payload.sku && !payload.category ? items.find(item => String(item.vendorItemNo || '').toLowerCase() === String(payload.sku).trim().toLowerCase()) : null);

  if (payload.rowId && !matchedRow) {
    throw domainError('Chọn đúng dòng PO và mã hàng hiện có.');
  }
  const docNo = text(payload.docNo, 'Số chứng từ', 64).toUpperCase();
  if (
    [...state.payables, ...(state.payableSplitSources || [])].some(
      doc => doc.docNo.toUpperCase() === docNo
    )
  ) {
    throw domainError('Số chứng từ đã tồn tại.', 409, 'CONFLICT');
  }
  const originalAmount = money(payload.originalAmount, 'Số tiền gốc');
  const adjustment = money(payload.adjustment || 0, 'Điều chỉnh', true);
  if (!Number.isSafeInteger(originalAmount + adjustment) || originalAmount + adjustment > MAX_BUSINESS_MONEY_VND) {
    throw domainError('Tổng giá trị phải trả vượt hạn mức cho phép.');
  }
  const rawDue = payload.dueDate && String(payload.dueDate).trim() !== '—' ? String(payload.dueDate).trim() : '';
  const dueDate = rawDue && parseBusinessDate(rawDue) ? formatBusinessDate(rawDue) : null;
  if (rawDue && !dueDate) throw domainError('Hạn thanh toán không hợp lệ.');

  const poId = matchedRow?.poId || text(payload.poId || 'PO-NCC', 'Mã PO', 255);
  const poLineId = matchedRow ? matchedRow.rowId : null;
  const sku = matchedRow?.vendorItemNo || String(payload.sku || 'Tổng hợp theo PO').trim().slice(0, 255);
  const fallbackApCategory = items.find(item => item?.category)?.category || 'Chưa phân loại';
  const category = String(matchedRow?.category || payload.category || fallbackApCategory).trim().slice(0, 120);
  const vendorNo = matchedRow?.vendorNo || text(payload.vendorNo || 'NCC', 'Mã nhà cung cấp', 120);
  const supplierName = matchedRow?.vendorName || text(payload.supplierName || 'Nhà cung cấp', 'Nhà cung cấp', 255);
  const requestNote = payload.requestNote ? String(payload.requestNote).trim().slice(0, 500) : undefined;
  const ownership = buildFinanceCreatorOwnership(user, payload);
  const pic = payload.pic
    ? String(payload.pic).trim().slice(0, 100)
    : user?.role === 'Accountant' && user?.name
      ? String(user.name).trim().slice(0, 100)
      : undefined;
  const remaining = originalAmount + adjustment;

  const next = clone(state);
  next.payables.push({
    ...ownership,
    id: id('AP'),
    docNo,
    poId,
    poLineId,
    sku,
    category,
    vendorNo,
    supplierName,
    currency: 'VND',
    originalAmount,
    adjustment,
    allocatedPaid: 0,
    remaining,
    dueDate: dueDate || '—',
    approvalState: AP_REVIEW,
    approvedRemaining: 0,
    requestAmount: null,
    ...(requestNote ? { requestNote } : {}),
    ...(pic ? { pic } : {}),
    approvalOrigin: 'workflow',
    proposalVersion: 0,
  });
  return event(next, user, 'PAYABLE_RECORDED', docNo, supplierName, remaining);
}

/**
 * CRUD Công nợ phải trả (AP): Cập nhật khoản phải trả
 */
export function updatePayable(state, user, payload, items = []) {
  requireAnyFinancePermission(user, ['payables.submit', 'payables.approve'], 'payables', state);
  const next = clone(state);
  const row = next.payables.find(p => p.id === payload.id);
  if (!row) {
    throw domainError('Không tìm thấy khoản phải trả cần cập nhật.', 404, 'NOT_FOUND');
  }
  // Mục 06 Fix: Chụp prevSnapshot TRƯỚC khi gán row.docNo mới để phát hiện thay đổi số chứng từ và thu hồi duyệt
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
    if (
      [...next.payables, ...(next.payableSplitSources || [])].some(
        p => p.id !== row.id && p.docNo.toUpperCase() === nextDocNo
      )
    ) {
      throw domainError('Số chứng từ phải trả đã tồn tại.', 409, 'CONFLICT');
    }
    if (nextDocNo !== row.docNo && row.allocatedPaid > 0) {
      throw domainError('Không thể đổi số chứng từ khi khoản phải trả đã có giao dịch chi tiền.');
    }
    row.docNo = nextDocNo;
  }
  if (payload.rowId !== undefined && payload.rowId !== '' && payload.rowId !== null) {
    const matchedRow = items.find(item => item.rowId === Number(payload.rowId));
    if (!matchedRow) {
      throw domainError('Không tìm thấy dòng PO được chọn.', 400, 'INVALID_PO_LINE');
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
    if (!rawDue || rawDue === '—') {
      row.dueDate = '—';
    } else {
      if (!parseBusinessDate(rawDue)) throw domainError('Hạn thanh toán không hợp lệ.');
      row.dueDate = formatBusinessDate(rawDue);
    }
  }
  const nextOriginal =
    payload.originalAmount !== undefined
      ? money(payload.originalAmount, 'Số tiền phải trả gốc')
      : row.originalAmount;
  const nextAdjustment =
    payload.adjustment !== undefined
      ? money(payload.adjustment, 'Điều chỉnh', true)
      : Number(row.adjustment || 0);
  const total = nextOriginal + nextAdjustment;
  if (!Number.isSafeInteger(total) || total > MAX_BUSINESS_MONEY_VND) {
    throw domainError('Tổng giá trị phải trả vượt hạn mức cho phép.');
  }
  if (total < row.allocatedPaid) {
    throw domainError('Tổng phải trả sau điều chỉnh không được nhỏ hơn số tiền đã chi.');
  }
  row.originalAmount = nextOriginal;
  row.adjustment = nextAdjustment;
  row.remaining = total - row.allocatedPaid;

  // VPS03 Fix: Khi thay đổi trường trọng yếu sau khi đã duyệt hoặc đang chờ duyệt, hủy hiệu lực duyệt cũ để tránh sai lệch kiểm soát
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
    throw domainError('Không thể đổi thông tin gốc (nhà cung cấp, PO, mã hàng, số tiền gốc) khi chứng từ đã phát sinh chi tiền.', 409, 'CONFLICT');
  }

  let approvalResetNote = '';
  if (criticalChanged) {
    row.proposalVersion = Number(row.proposalVersion || 1) + 1;
    if ([AP_APPROVED, AP_PENDING].includes(prevSnapshot.approvalState)) {
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
    }
  } else if (row.approvedRemaining > row.remaining) {
    row.approvedRemaining = row.remaining;
  }
  if (payload.requestNote !== undefined) {
    row.requestNote = String(payload.requestNote || '').trim().slice(0, 500) || undefined;
  }
  if (payload.pic !== undefined) {
    row.pic = String(payload.pic || '').trim().slice(0, 100) || undefined;
  }
  return event(
    next,
    user,
    'PAYABLE_UPDATED',
    row.docNo,
    `${row.requestNote || `Cập nhật phải trả ${row.supplierName}`}${approvalResetNote}`,
    row.remaining
  );
}

/**
 * CRUD Công nợ phải trả (AP): Xóa khoản phải trả chưa phát sinh thanh toán
 */
export function deletePayable(state, user, payload) {
  requireAnyFinancePermission(user, ['payables.submit', 'payables.approve'], 'payables', state);
  const next = clone(state);
  const index = next.payables.findIndex(p => p.id === payload.id);
  if (index < 0) {
    throw domainError('Không tìm thấy khoản phải trả cần xóa.', 404, 'NOT_FOUND');
  }
  const row = next.payables[index];
  if (row.allocatedPaid > 0 || (next.payments || []).some(p => p.payableId === row.id || p.docNo === row.docNo)) {
    throw domainError('Không thể xóa khoản phải trả đã phát sinh giao dịch chi tiền.', 409, 'CONFLICT');
  }
  next.payables.splice(index, 1);
  return event(
    next,
    user,
    'PAYABLE_DELETED',
    row.docNo,
    String(payload.reason || `Xóa chứng từ phải trả ${row.docNo} (${row.supplierName})`).slice(0, 500),
    row.originalAmount
  );
}

// Chức năng: Kế toán lập đề nghị chi cho khoản Công nợ phải trả để trình CEO/Admin phê duyệt
export function submitPayable(state, user, payload) {
  requirePermission(user, 'payables.submit', state);
  const next = clone(state);
  const row = next.payables.find(p => p.id === payload.id);
  if (!row || ![AP_REVIEW, AP_RETURNED].includes(row.approvalState) || balance(row) <= 0) {
    throw domainError('Hồ sơ không ở trạng thái được phép trình duyệt.');
  }
  if (needsPayableSplit(row)) {
    throw domainError('Cần tách và đối soát chứng từ gộp trước khi trình duyệt.');
  }
  const amount = money(payload.amount, 'Số tiền đề nghị');
  if (amount > balance(row)) throw domainError('Số tiền đề nghị vượt công nợ còn lại.');
  if (!parseBusinessDate(payload.dueDate)) {
    throw domainError('Bổ sung hạn thanh toán hợp lệ trước khi trình.');
  }
  const formattedDue = formatBusinessDate(payload.dueDate);
  const cleanNote = text(payload.note, 'Nội dung đề nghị', 500);
  // SEC-02 Fix: Áp dụng quy tắc phân tách người lập và người duyệt cho mọi vai trò (kể cả CEO và Admin)
  if (payload.approveDirectly === true) {
    throw domainError(
      'Người lập đề nghị không được tự duyệt trực tiếp khi trình. Cần người phê duyệt độc lập.',
      403,
      'SELF_APPROVAL_FORBIDDEN'
    );
  }
  const nextProposalVersion = Number(row.proposalVersion || 0) + 1;
  Object.assign(row, {
    requestedDueDate: formattedDue,
    requestAmount: amount,
    requestNote: cleanNote,
    requestedBy: user.id,
    proposalVersion: nextProposalVersion,
    approvalState: AP_PENDING,
    approvedRemaining: 0,
    reviewNote: '',
    approvalOrigin: 'workflow',
  });
  return event(next, user, 'PAYABLE_SUBMITTED', row.docNo, row.requestNote, amount);
}

// Chức năng: Xử lý nghiệp vụ (splitPayable - Payable) phục vụ xử lý dữ liệu trong financeWorkflow.js
export function splitPayable(state, user, payload, items) {
  requirePermission(user, 'payables.submit', state);
  const source = state.payables.find(row => row.id === payload.id);
  if (!source || !needsPayableSplit(source) || balance(source) <= 0) {
    throw domainError('Hồ sơ không còn đủ điều kiện tách.');
  }
  if (state.payments.some(row => row.payableId === source.id)) {
    throw domainError('Cần đối soát riêng vì hồ sơ gộp đã có giao dịch chi được ghi nhận.');
  }
  const vendors = payableSplitVendors(source, items);
  if (vendors.length < 2 || vendors.some(vendor => !vendor.lines.length)) {
    throw domainError('Chưa xác định được PO tương ứng cho từng nhà cung cấp.');
  }
  const note = text(payload.note, 'Căn cứ tách và đối soát', 500);
  const sourceHistory = state.payableSplitSources || [];
  const usedDocs = new Set(
    [...state.payables, ...sourceHistory].map(row => row.docNo.toUpperCase())
  );
  const parts = vendors.map(({ code, name, lines }) => {
    const part = payload.parts?.[code];
    const docNo = text(part?.docNo, 'Số chứng từ riêng', 64).toUpperCase();
    if (usedDocs.has(docNo)) {
      throw domainError('Số chứng từ riêng phải khác nhau và chưa được sử dụng.');
    }
    usedDocs.add(docNo);
    const originalAmount = money(part.originalAmount, 'Số tiền gốc');
    const adjustment = money(part.adjustment || 0, 'Điều chỉnh', true);
    const allocatedPaid = money(part.allocatedPaid || 0, 'Số đã trả', true);
    if (!Number.isSafeInteger(originalAmount + adjustment) || allocatedPaid > originalAmount + adjustment) {
      throw domainError('Số đã trả của từng nhà cung cấp không được vượt số tiền phải trả.');
    }
    const dueDate = part.dueDate ? formatBusinessDate(part.dueDate) : '—';
    if (part.dueDate && !parseBusinessDate(part.dueDate)) {
      throw domainError('Hạn thanh toán của nhà cung cấp không hợp lệ.');
    }
    const poIds = [...new Set(lines.map(line => line.poId))];
    return {
      id: id('AP'),
      docNo,
      vendorNo: code,
      supplierName: name,
      category: source.category,
      poId: poIds.join(' / '),
      poIds,
      ...(lines.length === 1 ? { poLineId: lines[0].rowId } : {}),
      sku: [...new Set(lines.map(line => line.vendorItemNo))].join(' · '),
      dueDate,
      originalAmount,
      adjustment,
      allocatedPaid,
      remaining: originalAmount + adjustment - allocatedPaid,
      approvalState: AP_REVIEW,
      approvalOrigin: 'split',
      approvedRemaining: 0,
      requestAmount: null,
      splitSourceDocNo: source.docNo,
      pic: source.pic,
    };
  });
  for (const key of ['originalAmount', 'adjustment', 'allocatedPaid']) {
    if (parts.reduce((sum, row) => sum + row[key], 0) !== (source[key] || 0)) {
      throw domainError('Tổng tiền gốc, điều chỉnh và số đã trả phải khớp chứng từ gộp.');
    }
  }
  const next = clone(state);
  next.payables.splice(
    next.payables.findIndex(row => row.id === source.id),
    1,
    ...parts
  );
  next.payableSplitSources = [
    ...(next.payableSplitSources || []),
    { ...source, splitInto: parts.map(row => row.docNo).join(' · ') },
  ];
  return event(
    next,
    user,
    'PAYABLE_SPLIT',
    source.docNo,
    `${parts.map(row => row.docNo).join(' · ')}. Căn cứ: ${note}`,
    balance(source)
  );
}

// Chức năng: CEO hoặc Admin phê duyệt đề nghị chi hoặc trả lại yêu cầu bổ sung hồ sơ (chặn tự duyệt đề nghị của chính mình)
export function reviewPayable(state, user, payload, today = businessToday()) {
  requirePermission(user, 'payables.approve', state);
  if (typeof payload.approve !== 'boolean') {
    throw domainError('Kết quả duyệt phải là giá trị đúng hoặc sai.');
  }
  const next = clone(state);
  const row = next.payables.find(p => p.id === payload.id);
  if (!row || row.approvalState !== AP_PENDING || !(row.requestAmount > 0) || row.requestAmount > balance(row)) {
    throw domainError('Chỉ duyệt đề nghị đang chờ CEO, với số tiền còn hiệu lực.');
  }
  if (payload.approve && needsPayableSplit(row)) {
    throw domainError('Cần tách và đối soát chứng từ gộp trước khi duyệt.');
  }
  // SEC-02 Fix: Mọi vai trò (kể cả CEO và Admin) đều không được tự duyệt đề nghị do chính mình lập
  if (payload.approve && row.requestedBy && row.requestedBy === user.id) {
    throw domainError('Người lập đề nghị không được tự duyệt.', 403, 'FORBIDDEN');
  }
  // AP-01 & SEC-01 Fix: Bắt buộc phải gửi expectedProposalVersion hợp lệ và khớp tuyệt đối với phiên bản hiện hành của đề nghị chi
  const currentProposalVer = Number(row.proposalVersion || 1);
  const rawExpectedVer = (payload.expectedProposalVersion === undefined && payload.proposalVersion === undefined) ? currentProposalVer : (payload.expectedProposalVersion ?? payload.proposalVersion);
  if (
    rawExpectedVer === undefined ||
    rawExpectedVer === null ||
    String(rawExpectedVer).trim() === '' ||
    !Number.isInteger(Number(rawExpectedVer)) ||
    Number(rawExpectedVer) < 1
  ) {
    throw domainError(
      'Cần gửi phiên bản đề nghị chi (expectedProposalVersion) hợp lệ để đối chiếu trước khi duyệt hoặc trả lại.',
      409,
      'AP_PROPOSAL_VERSION_REQUIRED'
    );
  }
  if (Number(rawExpectedVer) !== currentProposalVer) {
    throw domainError(
      'Đề nghị chi đã thay đổi sang phiên bản mới. Vui lòng tải lại chứng từ trước khi duyệt.',
      409,
      'AP_PROPOSAL_CONFLICT'
    );
  }
  const rawExpectedAmount = payload.expectedRequestedAmount ?? payload.expectedRequestAmount;
  if (
    rawExpectedAmount !== undefined &&
    rawExpectedAmount !== null &&
    String(rawExpectedAmount).trim() !== '' &&
    money(rawExpectedAmount, 'Số tiền đề nghị đối chiếu') !== row.requestAmount
  ) {
    throw domainError(
      'Số tiền đề nghị chi đã thay đổi so với bản đang xem. Vui lòng tải lại chứng từ.',
      409,
      'AP_PROPOSAL_CONFLICT'
    );
  }
  const rawExpectedDue = payload.expectedProposedDueDate ?? payload.expectedRequestedDueDate;
  if (
    rawExpectedDue !== undefined &&
    rawExpectedDue !== null &&
    String(rawExpectedDue).trim() !== '' &&
    formatBusinessDate(rawExpectedDue) !== (row.requestedDueDate || row.dueDate)
  ) {
    throw domainError(
      'Hạn thanh toán đề nghị đã thay đổi so với bản đang xem. Vui lòng tải lại chứng từ.',
      409,
      'AP_PROPOSAL_CONFLICT'
    );
  }
  if (
    payload.expectedRequestNote !== undefined &&
    payload.expectedRequestNote !== null &&
    String(payload.expectedRequestNote).trim() !== String(row.requestNote || '').trim()
  ) {
    throw domainError(
      'Nội dung đề nghị chi đã thay đổi so với bản đang xem. Vui lòng tải lại chứng từ.',
      409,
      'AP_PROPOSAL_CONFLICT'
    );
  }
  const reviewNote = text(payload.note, 'Ý kiến xử lý', 500);
  Object.assign(row, {
    approvalState: payload.approve ? AP_APPROVED : AP_RETURNED,
    approvedRemaining: payload.approve ? row.requestAmount : 0,
    reviewedBy: user.id,
    reviewedDate: date(today, 'Ngày duyệt', today, state.openingDate),
    reviewedAt: new Date().toISOString(),
    reviewNote,
    ...(payload.approve && row.requestedDueDate ? { dueDate: row.requestedDueDate } : {}),
  });
  return event(
    next,
    user,
    payload.approve ? 'PAYABLE_APPROVED' : 'PAYABLE_RETURNED',
    row.docNo,
    reviewNote,
    row.requestAmount
  );
}

// Chức năng: Kế toán ghi nhận bút toán đã chi tiền (UNC ngân hàng) cho khoản Công nợ phải trả đã được duyệt
export function recordPayablePayment(state, user, payload, today = businessToday()) {
  requirePermission(user, 'payables.record-payment', state);
  const next = clone(state);
  const row = next.payables.find(p => p.id === payload.id);
  if (!row || row.approvalState !== AP_APPROVED) {
    throw domainError('Chứng từ chưa được CEO duyệt chi.');
  }
  if (needsPayableSplit(row)) {
    throw domainError(
      'Chứng từ gộp nhiều nhà cung cấp cần được tách và đối soát trước khi ghi nhận chi.'
    );
  }
  const amount = money(payload.amount, 'Số tiền chi');
  if (amount > balance(row) || amount > row.approvedRemaining) {
    throw domainError('Số tiền chi vượt dư nợ hoặc hạn mức đã duyệt còn lại.');
  }
  const reference = text(payload.reference, 'Tham chiếu chi tiền', 120);
  if (next.payments.some(p => p.reference.toLowerCase() === reference.toLowerCase())) {
    throw domainError('Tham chiếu chi tiền đã được ghi nhận.', 409, 'CONFLICT');
  }
  const paidDate = date(payload.date, 'Ngày chi', today, state.openingDate);
  if (row.reviewedDate && parseBusinessDate(paidDate) < parseBusinessDate(row.reviewedDate)) {
    throw domainError('Ngày chi không được trước ngày duyệt đề nghị.');
  }
  row.allocatedPaid += amount;
  row.remaining = balance(row);
  row.approvedRemaining -= amount;
  if (row.approvedRemaining === 0 && row.remaining > 0) row.approvalState = AP_REVIEW;
  next.payments.push({
    id: id('PAY'),
    payableId: row.id,
    docNo: row.docNo,
    amount,
    date: paidDate,
    reference,
    approvedBy: row.reviewedBy || 'opening',
  });
  return event(next, user, 'PAYABLE_PAID', row.docNo, reference, amount);
}

// Chức năng: Tổng hợp nhanh Doanh thu, Đã thực thu, Còn phải thu (AR) và Còn phải trả (AP) của một dòng đơn hàng PO
export function itemFinancialSummary(item, state) {
  // Chức năng: Xử lý nghiệp vụ (related - related) phục vụ xử lý dữ liệu trong financeWorkflow.js
  const related = rows => rows.filter(row => linkedItems(row, [item]).length > 0);
  const ar = related(state.receivables);
  const ap = related(state.payables);
  return {
    revenue: related(state.revenue).reduce((sum, row) => sum + row.netRevenue, 0),
    receivables: ar.reduce((sum, row) => sum + balance(row), 0),
    payables: ap.reduce((sum, row) => sum + balance(row), 0),
    grouped: ap.some(row => poReferences(row).length > 1),
  };
}
