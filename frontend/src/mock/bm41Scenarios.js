import { BM41_ORDERS, BM41_OPENING_DATE } from './bm41.js';
import { AP_APPROVED, AP_PENDING, AP_RETURNED, AP_REVIEW, initialFinanceState } from '../utils/financeWorkflow.js';

// The five source PO rows remain in bm41.js. Everything added here is a demo.
export const DEMO_TRACKING_KEY = 'uv-order-tracking-bm41-scenarios-v1';
export const DEMO_FINANCE_KEY = 'uv-finance-bm41-scenarios-v1';

const progress = [
  { onProcessPct: 100, packagingPct: 100, nhap: 10000, deliveredQty: 10000, shipDateEtd: '27/10/2026',
    actualShipDate: '27/10/2026', etaDate: '29/10/2026', actualDeliveryDate: '29/10/2026' },
  { onProcessPct: 100, packagingPct: 80, nhap: 8000, deliveredQty: 6000, shipDateEtd: '05/11/2026',
    actualShipDate: '05/11/2026', etaDate: '05/11/2026', actualDeliveryDate: '05/11/2026' },
  { onProcessPct: 65, packagingPct: 40, nhap: 0, deliveredQty: 0, shipDateEtd: '16/11/2026',
    etaDate: '18/11/2026' },
  { onProcessPct: 20, packagingPct: 0, nhap: 0, deliveredQty: null, shipDateEtd: '01/12/2026',
    etaDate: '03/12/2026' },
  { onProcessPct: 100, packagingPct: 100, nhap: 10000, deliveredQty: 4000, shipDateEtd: '05/11/2026',
    actualShipDate: '05/11/2026', etaDate: '06/11/2026', actualDeliveryDate: '05/11/2026' },
];
const [source2, source3, source4, source5, source6] = BM41_ORDERS;
const splitDemoOrder = {
  rowId: 900001, poId: 'DEMO-PO-TACH', vendorNo: 'DEMO-NCC-02', vendorName: 'Demo Supplier B',
  category: source6.category, vendorItemNo: 'Demo fabric bag', unit: 'pcs', orderedQty: 2000,
  releasedPoDate: '01/11/2026', expectedReceiptDate: '12/11/2026', inboundOnly: true,
  unitPriceVnd: 2000, nhap: 0, deliveredQty: null, onProcessPct: 30, packagingPct: 0,
};

const updatedAt = '2026-11-06T02:00:00.000Z';
const progressReason = 'Dữ liệu mô phỏng để kiểm thử tiến độ.';
export const DEMO_ORDERS = [...BM41_ORDERS.map((order, index) => ({
  ...order, ...progress[index], tonDau: 0, ban: progress[index].deliveredQty,
  lastUpdateDate: '06/11/2026', lastUpdateTime: '09:00',
  trackingHistory: [{ id: `DEMO-PROGRESS-${order.rowId}`, actorId: 'user-sale',
    actorName: 'Lê Hương', time: updatedAt, reason: progressReason }],
})), splitDemoOrder];

const reference = order => ({
  poId: order.poId, poLineId: order.rowId, sku: order.vendorItemNo, category: order.category, currency: 'VND',
});

const invoices = [
  { order: source2, code: 'A1', customerName: 'Demo Retail A', recordDate: '29/10/2026', dueDate: '02/11/2026',
    shippedQty: 5000, netRevenue: 12500000, collected: 12500000, receipt: 'A' },
  { order: source2, code: 'A2', customerName: 'Demo Retail A', recordDate: '29/10/2026', dueDate: '12/11/2026',
    shippedQty: 5000, netRevenue: 12500000, collected: 3500000, receipt: 'A' },
  { order: source3, code: 'B1', customerName: 'Demo Retail B', recordDate: '05/11/2026', dueDate: '05/11/2026',
    shippedQty: 6000, netRevenue: 15000000, collected: 5000000, receipt: 'B' },
  { order: source6, code: 'C1', customerName: 'Demo Retail C', recordDate: '05/11/2026', dueDate: '06/11/2026',
    shippedQty: 4000, netRevenue: 12000000, collected: 3000000, receipt: 'C' },
];

const docNo = code => `DEMO-INV-${code}`;
const arId = code => `DEMO-AR-${code}`;
const receiptId = code => `DEMO-REC-${code}`;
const receiptRef = code => `DEMO-THU-${code}`;
const invoiceCommon = row => ({ ...reference(row.order), docNo: docNo(row.code),
  customerName: row.customerName, dueDate: row.dueDate });
const invoiceNote = 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.';
const revenue = invoices.map(row => ({
  ...invoiceCommon(row), id: `DEMO-REV-${row.code}`, vendorName: `${row.order.vendorNo} - ${row.order.vendorName}`,
  recordDate: row.recordDate, shippedQty: row.shippedQty, netRevenue: row.netRevenue, cashCollected: row.collected,
  approvalStatus: 'Đã ghi nhận', alertLevel: 'Đúng hạn', priorityRank: 2, basis: invoiceNote, statusNote: invoiceNote,
}));
const receivables = invoices.map(row => ({
  ...invoiceCommon(row), id: arId(row.code), vendorRef: `${row.order.vendorNo} - ${row.order.vendorName}`,
  originalAmount: row.netRevenue, adjustment: 0, allocatedPaid: row.collected, remaining: row.netRevenue - row.collected,
  commitmentNote: 'Khoản phải thu mô phỏng.',
}));

const receipts = [
  ['A', 'Demo Retail A', 18000000, '02/11/2026'],
  ['B', 'Demo Retail B', 5000000, '05/11/2026'],
  ['C', 'Demo Retail C', 3000000, '06/11/2026'],
  ['UNKNOWN', null, 4000000, '06/11/2026'],
].map(([code, customerName, amount, date]) => ({
  id: receiptId(code), reference: receiptRef(code), customerName, amount, date, currency: 'VND',
  status: customerName ? 'identified' : 'unidentified',
  allocatedAmount: invoices.filter(row => row.receipt === code).reduce((total, row) => total + row.collected, 0),
}));

const allocations = invoices.map(row => ({
  id: `DEMO-ALLOC-${row.code}`, debtId: arId(row.code), docNo: docNo(row.code), receiptId: receiptId(row.receipt),
  amount: row.collected, date: receipts.find(receipt => receipt.id === receiptId(row.receipt)).date,
}));

const payable = (order, code, originalAmount, dueDate, extra = {}) => ({
  ...reference(order), id: `DEMO-AP-${code}`, docNo: `DEMO-BILL-${code}`, vendorNo: order.vendorNo,
  supplierName: order.vendorName, originalAmount, adjustment: 0, allocatedPaid: 0, remaining: originalAmount,
  dueDate, approvalState: AP_REVIEW, requestAmount: null, approvedRemaining: 0, approvalOrigin: 'opening',
  ...extra,
});
const paymentRequestNote = 'Đề nghị thanh toán mô phỏng.';
const request = (amount, dueDate) => ({
  requestAmount: amount, requestedDueDate: dueDate, requestNote: paymentRequestNote,
  requestedBy: 'user-accountant', approvalOrigin: 'workflow',
});
const approvedNote = 'Đã duyệt theo kịch bản kiểm thử.';
const returnedNote = 'Bổ sung tài liệu đối soát để trình lại.';
const payables = [
  payable(source2, '02', 16000000, '04/11/2026', {
    ...request(16000000, '04/11/2026'), approvalState: AP_APPROVED, approvedRemaining: 10000000,
    allocatedPaid: 6000000, remaining: 10000000, reviewedBy: 'user-ceo', reviewedDate: '02/11/2026',
    reviewedAt: '2026-11-02T02:00:00.000Z', reviewNote: approvedNote,
  }),
  payable(source3, '03', 12800000, '06/11/2026', {
    ...request(12800000, '06/11/2026'), approvalState: AP_PENDING,
  }),
  payable(source4, '04', 3200000, '14/11/2026', {
    ...request(3200000, '14/11/2026'), approvalState: AP_RETURNED, reviewedBy: 'user-ceo',
    reviewedDate: '05/11/2026', reviewedAt: '2026-11-05T03:00:00.000Z', reviewNote: returnedNote,
  }),
  payable(source5, '05', 3200000, '—'),
  payable(source6, 'GROUP', 23000000, '12/11/2026', {
    poLineId: undefined, poId: `${source6.poId} / ${splitDemoOrder.poId}`,
    poIds: [source6.poId, splitDemoOrder.poId], sku: `${source6.vendorItemNo} · ${splitDemoOrder.vendorItemNo}`,
    vendorNo: `${source6.vendorNo} / ${splitDemoOrder.vendorNo}`,
    supplierName: `${source6.vendorName} & ${splitDemoOrder.vendorName}`,
  }),
];

const payments = [{
  id: 'DEMO-PAY-02', payableId: 'DEMO-AP-02', docNo: 'DEMO-BILL-02', amount: 6000000,
  date: '03/11/2026', reference: 'DEMO-CHI-02', approvedBy: 'user-ceo',
}];

function history(type, ref, detail, amount, date, by = 'accountant', time = '04:00:00') {
  const [day, month, year] = date.split('/');
  return { id: `DEMO-AUD-${type}-${ref}`, type, reference: ref, detail, amount,
    actorId: `user-${by}`, actorName: by === 'ceo' ? 'Trần Quốc' : 'Phạm Lan',
    occurredAt: `${year}-${month}-${day}T${time}.000Z` };
}
const audit = [
  ...revenue.map(row => history('INVOICE_RECORDED', row.docNo, invoiceNote, row.netRevenue, row.recordDate, 'accountant', '01:00:00')),
  ...receipts.map(row => history('RECEIPT_RECORDED', row.reference, `Khách hàng: ${row.customerName || 'Chưa xác định'}`, row.amount, row.date, 'accountant', '02:00:00')),
  ...allocations.map(row => history('RECEIPT_ALLOCATED', row.docNo, receipts.find(receipt => receipt.id === row.receiptId).reference, row.amount, row.date)),
  history('PAYABLE_SUBMITTED', 'DEMO-BILL-02', paymentRequestNote, 16000000, '01/11/2026'),
  history('PAYABLE_APPROVED', 'DEMO-BILL-02', approvedNote, 16000000, '02/11/2026', 'ceo', '02:00:00'),
  history('PAYABLE_PAID', 'DEMO-BILL-02', 'DEMO-CHI-02', 6000000, '03/11/2026'),
  history('PAYABLE_SUBMITTED', 'DEMO-BILL-03', paymentRequestNote, 12800000, '06/11/2026'),
  history('PAYABLE_SUBMITTED', 'DEMO-BILL-04', paymentRequestNote, 3200000, '04/11/2026'),
  history('PAYABLE_RETURNED', 'DEMO-BILL-04', returnedNote, 3200000, '05/11/2026', 'ceo', '03:00:00'),
].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

export const DEMO_FINANCE_BASE = {
  ...initialFinanceState([], [], [], BM41_OPENING_DATE, { includeOpeningReceipt: false }),
  revenue, receivables, payables, receipts, allocations, payments, audit,
};
