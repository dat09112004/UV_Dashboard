import { ROLE_PROFILES } from '../utils/roles.js';
import {
  AP_APPROVED,
  AP_PENDING,
  AP_RETURNED,
  AP_REVIEW,
  initialFinanceState,
} from '../utils/financeWorkflow.js';
import {
  TASK_ACTIVE,
  TASK_DONE,
  TASK_NEW,
  TASK_RETURNED,
  TASK_REVIEW,
  REMINDER_PENDING,
  REMINDER_ASSIGNED,
} from '../utils/taskWorkflow.js';
import { BM41_OPENING_DATE, BM41_REPORT_DATE } from '../utils/business.js';

export { BM41_OPENING_DATE, BM41_REPORT_DATE };

// Pre-computed PBKDF2-HMAC-SHA256 (600,000 iterations) verifiers for default demo password '123'
export const SEED_CREDENTIALS = {
  'user-ceo': JSON.stringify({
    salt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    verifier: '6a0a18e91335f0d0a806853937128444072f6d4a92da57a7c829f8c2936eb95f',
    iterations: 600000,
  }),
  'user-admin': JSON.stringify({
    salt: 'b2c3d4e5f60718293a4b5c6d7e8f90a1',
    verifier: '3b5c9088cf04ee3e8909a0c0d59832083a8f3335b3de1f43a7181bcc76a6c58d',
    iterations: 600000,
  }),
  'user-sale': JSON.stringify({
    salt: 'c3d4e5f60718293a4b5c6d7e8f90a1b2',
    verifier: '57c8bdb3c9fa0c118f478a0dd14dcf7f2d3849cb261934a23332f4e832717c80',
    iterations: 600000,
  }),
  'user-accountant': JSON.stringify({
    salt: 'd4e5f60718293a4b5c6d7e8f90a1b2c3',
    verifier: '7347286e1bb41c1ddf987caca63075fb6e3c07132b4df85e76f0c6c646b0b99b',
    iterations: 600000,
  }),
};

export const MOCK_ACCOUNTS = [
  {
    username: 'ceo@uyenvu.vn',
    id: 'user-ceo',
    employeeCode: 'UV-CEO-001',
    email: 'ceo@uyenvu.vn',
    role: 'CEO',
    permissions: ROLE_PROFILES.CEO.permissions,
    roleLabel: 'CEO',
    status: 'active',
    avatar: null,
    initials: 'TQ',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'company',
    name: 'Trần Quốc',
    title: 'Tổng Giám Đốc (CEO)',
    department: 'Ban Điều Hành',
    permissionDescription:
      'Quản lý toàn bộ hệ thống, quản lý tài khoản, giao việc, duyệt chi và xác nhận bàn giao.',
  },
  {
    username: 'sale@uyenvu.vn',
    id: 'user-sale',
    employeeCode: 'UV-SAL-001',
    email: 'sale@uyenvu.vn',
    role: 'Sale',
    permissions: ROLE_PROFILES.Sale.permissions,
    roleLabel: 'Sale',
    status: 'active',
    avatar: null,
    initials: 'LH',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'company',
    name: 'Lê Hương',
    title: 'Chuyên viên Quản lý Đơn hàng (Sale)',
    department: 'Phòng Kinh Doanh & Đơn Hàng',
    permissionDescription:
      'Cập nhật tiến độ 4 mốc (Released PO, On Process, Packaging, Shipdate ETD/ETA), theo dõi tồn kho, nhắc việc & gửi bàn giao.',
  },
  {
    username: 'ketoan@uyenvu.vn',
    id: 'user-accountant',
    employeeCode: 'UV-ACC-001',
    email: 'ketoan@uyenvu.vn',
    role: 'Accountant',
    permissions: ROLE_PROFILES.Accountant.permissions,
    roleLabel: 'Kế toán',
    status: 'active',
    avatar: null,
    initials: 'PL',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'finance',
    name: 'Phạm Lan',
    title: 'Kế toán trưởng (Doanh thu & Công nợ)',
    department: 'Phòng Tài Chính - Kế Toán',
    permissionDescription:
      'Quản lý Doanh thu, phân bổ tiền thu khách hàng (AR), kiểm soát hạn thanh toán, nhắc việc & trình duyệt chi Nhà cung cấp (AP).',
  },
  {
    username: 'admin@uyenvu.vn',
    id: 'user-admin',
    employeeCode: 'UV-ADM-001',
    email: 'admin@uyenvu.vn',
    role: 'Admin',
    permissions: ROLE_PROFILES.Admin.permissions,
    roleLabel: 'Quản trị viên',
    status: 'active',
    avatar: null,
    initials: 'QT',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'company',
    name: 'Quản trị Demo',
    title: 'Quản trị hệ thống',
    department: 'Ban Điều Hành & Quản Trị',
    permissionDescription:
      'Toàn quyền như CEO: quản lý hệ thống, quản lý tài khoản, giao việc, nhận nhắc việc và duyệt tất cả công việc & tài chính.',
  },
];

export const BM41_ORDERS = [
  {
    rowId: 3500002,
    vendorNo: '15090',
    vendorName: 'MOC LAM PHAT',
    poId: 'UV-Intl-3500002',
    category: '210101080',
    vendorItemNo: 'Túi vải kích thước 12cm x 18cm',
    unit: 'pcs',
    orderedQty: 10000,
    releasedPoDate: '17/10/2026',
    expectedReceiptDate: '25/10/2026',
    unitPriceVnd: 1600,
    totalValueVnd: 16000000,
    inboundOnly: true,
    nhap: null,
    onProcessPct: null,
    packagingPct: null,
  },
  {
    rowId: 3500003,
    vendorNo: '15090',
    vendorName: 'MOC LAM PHAT',
    poId: 'UV-Intl-3500003',
    category: '210101080',
    vendorItemNo: 'Túi vải kích thước 12cm x 18cm',
    unit: 'pcs',
    orderedQty: 10000,
    releasedPoDate: '17/10/2026',
    expectedReceiptDate: '05/11/2026',
    unitPriceVnd: 1600,
    totalValueVnd: 16000000,
    inboundOnly: true,
    nhap: null,
    onProcessPct: null,
    packagingPct: null,
  },
  {
    rowId: 3500004,
    vendorNo: '15090',
    vendorName: 'MOC LAM PHAT',
    poId: 'UV-Intl-3500004',
    category: '210101080',
    vendorItemNo: 'Túi vải kích thước 12cm x 18cm',
    unit: 'pcs',
    orderedQty: 10000,
    releasedPoDate: '17/10/2026',
    expectedReceiptDate: '15/11/2026',
    unitPriceVnd: 1600,
    totalValueVnd: 16000000,
    inboundOnly: true,
    nhap: null,
    onProcessPct: null,
    packagingPct: null,
  },
  {
    rowId: 3500005,
    vendorNo: '15090',
    vendorName: 'MOC LAM PHAT',
    poId: 'UV-Intl-3500005',
    category: '210101080',
    vendorItemNo: 'Túi vải kích thước 12cm x 18cm',
    unit: 'pcs',
    orderedQty: 10000,
    releasedPoDate: '17/10/2026',
    expectedReceiptDate: '30/11/2026',
    unitPriceVnd: 1600,
    totalValueVnd: 16000000,
    inboundOnly: true,
    nhap: null,
    onProcessPct: null,
    packagingPct: null,
  },
  {
    rowId: 3500006,
    vendorNo: '15090',
    vendorName: 'MOC LAM PHAT',
    poId: 'UV-Intl-3500006',
    category: '210101080',
    vendorItemNo: 'Túi vải kích thước 15.5cm x 18.5cm',
    unit: 'pcs',
    orderedQty: 10000,
    releasedPoDate: '17/10/2026',
    expectedReceiptDate: '05/11/2026',
    unitPriceVnd: 1900,
    totalValueVnd: 19000000,
    inboundOnly: true,
    nhap: null,
    onProcessPct: null,
    packagingPct: null,
  },
];

const progress = [
  {
    onProcessPct: 100,
    packagingPct: 100,
    nhap: 10000,
    deliveredQty: 10000,
    shipDateEtd: '27/10/2026',
    actualShipDate: '27/10/2026',
    etaDate: '29/10/2026',
    actualDeliveryDate: '29/10/2026',
  },
  {
    onProcessPct: 100,
    packagingPct: 80,
    nhap: 8000,
    deliveredQty: 6000,
    shipDateEtd: '05/11/2026',
    actualShipDate: '05/11/2026',
    etaDate: '05/11/2026',
    actualDeliveryDate: '05/11/2026',
  },
  {
    onProcessPct: 65,
    packagingPct: 40,
    nhap: 0,
    deliveredQty: 0,
    shipDateEtd: '16/11/2026',
    etaDate: '18/11/2026',
  },
  {
    onProcessPct: 20,
    packagingPct: 0,
    nhap: 0,
    deliveredQty: null,
    shipDateEtd: '01/12/2026',
    etaDate: '03/12/2026',
  },
  {
    onProcessPct: 100,
    packagingPct: 100,
    nhap: 10000,
    deliveredQty: 4000,
    shipDateEtd: '05/11/2026',
    actualShipDate: '05/11/2026',
    etaDate: '06/11/2026',
    actualDeliveryDate: '05/11/2026',
  },
];

const [source2, source3, source4, source5, source6] = BM41_ORDERS;
const splitDemoOrder = {
  rowId: 900001,
  poId: 'DEMO-PO-TACH',
  vendorNo: 'DEMO-NCC-02',
  vendorName: 'Demo Supplier B',
  category: source6.category,
  vendorItemNo: 'Demo fabric bag',
  unit: 'pcs',
  orderedQty: 2000,
  releasedPoDate: '01/11/2026',
  expectedReceiptDate: '12/11/2026',
  inboundOnly: true,
  unitPriceVnd: 2000,
  totalValueVnd: 4000000,
  nhap: 0,
  deliveredQty: null,
  onProcessPct: 30,
  packagingPct: 0,
};

const updatedAt = '2026-11-06T02:00:00.000Z';
const progressReason = 'Dữ liệu mô phỏng để kiểm thử tiến độ.';

export const DEMO_ORDERS = [
  ...BM41_ORDERS.map((order, index) => ({
    ...order,
    ...progress[index],
    tonDau: 0,
    ban: progress[index].deliveredQty,
    lastUpdateDate: '06/11/2026',
    lastUpdateTime: '09:00',
    manualPriorityRank: 2,
    manualAlertReason: '',
    trackingVersion: null,
    trackingHistory: [
      {
        id: `DEMO-PROGRESS-${order.rowId}`,
        actorId: 'user-sale',
        actorName: 'Lê Hương',
        time: updatedAt,
        reason: progressReason,
      },
    ],
  })),
  {
    ...splitDemoOrder,
    tonDau: 0,
    ban: null,
    manualPriorityRank: 2,
    manualAlertReason: '',
    trackingVersion: null,
    trackingHistory: [],
  },
];

const reference = order => ({
  poId: order.poId,
  poLineId: order.rowId,
  sku: order.vendorItemNo,
  category: order.category,
  currency: 'VND',
});

const invoices = [
  {
    order: source2,
    code: 'A1',
    customerName: 'Demo Retail A',
    recordDate: '29/10/2026',
    dueDate: '02/11/2026',
    shippedQty: 5000,
    netRevenue: 12500000,
    collected: 12500000,
    receipt: 'A',
  },
  {
    order: source2,
    code: 'A2',
    customerName: 'Demo Retail A',
    recordDate: '29/10/2026',
    dueDate: '12/11/2026',
    shippedQty: 5000,
    netRevenue: 12500000,
    collected: 3500000,
    receipt: 'A',
  },
  {
    order: source3,
    code: 'B1',
    customerName: 'Demo Retail B',
    recordDate: '05/11/2026',
    dueDate: '05/11/2026',
    shippedQty: 6000,
    netRevenue: 15000000,
    collected: 5000000,
    receipt: 'B',
  },
  {
    order: source6,
    code: 'C1',
    customerName: 'Demo Retail C',
    recordDate: '05/11/2026',
    dueDate: '06/11/2026',
    shippedQty: 4000,
    netRevenue: 12000000,
    collected: 3000000,
    receipt: 'C',
  },
];

const docNo = code => `DEMO-INV-${code}`;
const arId = code => `DEMO-AR-${code}`;
const receiptId = code => `DEMO-REC-${code}`;
const receiptRef = code => `DEMO-THU-${code}`;
const invoiceCommon = row => ({
  ...reference(row.order),
  docNo: docNo(row.code),
  customerName: row.customerName,
  dueDate: row.dueDate,
});
const invoiceNote = 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.';

const revenue = invoices.map(row => ({
  ...invoiceCommon(row),
  id: `DEMO-REV-${row.code}`,
  vendorName: `${row.order.vendorNo} - ${row.order.vendorName}`,
  recordDate: row.recordDate,
  shippedQty: row.shippedQty,
  netRevenue: row.netRevenue,
  cashCollected: row.collected,
  approvalStatus: 'Đã ghi nhận',
  alertLevel: 'Đúng hạn',
  priorityRank: 2,
  basis: invoiceNote,
  statusNote: invoiceNote,
}));

const receivables = invoices.map(row => ({
  ...invoiceCommon(row),
  id: arId(row.code),
  vendorRef: `${row.order.vendorNo} - ${row.order.vendorName}`,
  originalAmount: row.netRevenue,
  adjustment: 0,
  allocatedPaid: row.collected,
  remaining: row.netRevenue - row.collected,
  commitmentNote: 'Khoản phải thu mô phỏng.',
}));

const receipts = [
  ['A', 'Demo Retail A', 18000000, '02/11/2026'],
  ['B', 'Demo Retail B', 5000000, '05/11/2026'],
  ['C', 'Demo Retail C', 3000000, '06/11/2026'],
  ['UNKNOWN', null, 4000000, '06/11/2026'],
].map(([code, customerName, amount, date]) => ({
  id: receiptId(code),
  reference: receiptRef(code),
  customerName,
  amount,
  date,
  currency: 'VND',
  status: customerName ? 'identified' : 'unidentified',
  allocatedAmount: invoices
    .filter(row => row.receipt === code)
    .reduce((total, row) => total + row.collected, 0),
}));

const allocations = invoices.map(row => ({
  id: `DEMO-ALLOC-${row.code}`,
  debtId: arId(row.code),
  docNo: docNo(row.code),
  receiptId: receiptId(row.receipt),
  amount: row.collected,
  date: receipts.find(receipt => receipt.id === receiptId(row.receipt)).date,
}));

const payable = (order, code, originalAmount, dueDate, extra = {}) => ({
  ...reference(order),
  id: `DEMO-AP-${code}`,
  docNo: `DEMO-BILL-${code}`,
  vendorNo: order.vendorNo,
  supplierName: order.vendorName,
  originalAmount,
  adjustment: 0,
  allocatedPaid: 0,
  remaining: originalAmount,
  dueDate,
  approvalState: AP_REVIEW,
  requestAmount: null,
  approvedRemaining: 0,
  approvalOrigin: 'opening',
  ...extra,
});

const paymentRequestNote = 'Đề nghị thanh toán mô phỏng.';
const request = (amount, dueDate) => ({
  requestAmount: amount,
  requestedDueDate: dueDate,
  requestNote: paymentRequestNote,
  requestedBy: 'user-accountant',
  approvalOrigin: 'workflow',
});
const approvedNote = 'Đã duyệt theo kịch bản kiểm thử.';
const returnedNote = 'Bổ sung tài liệu đối soát để trình lại.';

const payables = [
  payable(source2, '02', 16000000, '04/11/2026', {
    ...request(16000000, '04/11/2026'),
    approvalState: AP_APPROVED,
    approvedRemaining: 10000000,
    allocatedPaid: 6000000,
    remaining: 10000000,
    reviewedBy: 'user-ceo',
    reviewedDate: '02/11/2026',
    reviewedAt: '2026-11-02T02:00:00.000Z',
    reviewNote: approvedNote,
  }),
  payable(source3, '03', 12800000, '06/11/2026', {
    ...request(12800000, '06/11/2026'),
    approvalState: AP_PENDING,
  }),
  payable(source4, '04', 3200000, '14/11/2026', {
    ...request(3200000, '14/11/2026'),
    approvalState: AP_RETURNED,
    reviewedBy: 'user-ceo',
    reviewedDate: '05/11/2026',
    reviewedAt: '2026-11-05T03:00:00.000Z',
    reviewNote: returnedNote,
  }),
  payable(source5, '05', 3200000, '—'),
  payable(source6, 'GROUP', 23000000, '12/11/2026', {
    poLineId: undefined,
    poId: `${source6.poId} / ${splitDemoOrder.poId}`,
    poIds: [source6.poId, splitDemoOrder.poId],
    sku: `${source6.vendorItemNo} · ${splitDemoOrder.vendorItemNo}`,
    vendorNo: `${source6.vendorNo} / ${splitDemoOrder.vendorNo}`,
    supplierName: `${source6.vendorName} & ${splitDemoOrder.vendorName}`,
  }),
];

const payments = [
  {
    id: 'DEMO-PAY-02',
    payableId: 'DEMO-AP-02',
    docNo: 'DEMO-BILL-02',
    amount: 6000000,
    date: '03/11/2026',
    reference: 'DEMO-CHI-02',
    approvedBy: 'user-ceo',
  },
];

function history(type, ref, detail, amount, date, by = 'accountant', time = '04:00:00') {
  const [day, month, year] = date.split('/');
  return {
    id: `DEMO-AUD-${type}-${ref}`,
    type,
    reference: ref,
    detail,
    amount,
    actorId: `user-${by}`,
    actorName: by === 'ceo' ? 'Trần Quốc' : 'Phạm Lan',
    occurredAt: `${year}-${month}-${day}T${time}.000Z`,
  };
}

const audit = [
  ...revenue.map(row =>
    history('INVOICE_RECORDED', row.docNo, invoiceNote, row.netRevenue, row.recordDate, 'accountant', '01:00:00')
  ),
  ...receipts.map(row =>
    history(
      'RECEIPT_RECORDED',
      row.reference,
      `Khách hàng: ${row.customerName || 'Chưa xác định'}`,
      row.amount,
      row.date,
      'accountant',
      '02:00:00'
    )
  ),
  ...allocations.map(row =>
    history(
      'RECEIPT_ALLOCATED',
      row.docNo,
      receipts.find(receipt => receipt.id === row.receiptId).reference,
      row.amount,
      row.date
    )
  ),
  history('PAYABLE_SUBMITTED', 'DEMO-BILL-02', paymentRequestNote, 16000000, '01/11/2026'),
  history('PAYABLE_APPROVED', 'DEMO-BILL-02', approvedNote, 16000000, '02/11/2026', 'ceo', '02:00:00'),
  history('PAYABLE_PAID', 'DEMO-BILL-02', 'DEMO-CHI-02', 6000000, '03/11/2026'),
  history('PAYABLE_SUBMITTED', 'DEMO-BILL-03', paymentRequestNote, 12800000, '06/11/2026'),
  history('PAYABLE_SUBMITTED', 'DEMO-BILL-04', paymentRequestNote, 3200000, '04/11/2026'),
  history('PAYABLE_RETURNED', 'DEMO-BILL-04', returnedNote, 3200000, '05/11/2026', 'ceo', '03:00:00'),
].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

export const DEMO_FINANCE_BASE = {
  ...initialFinanceState([], [], [], BM41_OPENING_DATE, { includeOpeningReceipt: false }),
  revenue,
  receivables,
  payables,
  receipts,
  allocations,
  payments,
  audit,
};

export const DEMO_TASK_FILES = {
  'DEMO-TASKFILE-RESULT': {
    id: 'DEMO-TASKFILE-RESULT',
    name: 'doi-chieu-PO-lan-1.csv',
    content: 'cG8scmVjZWl2ZWQsZGVsaXZlcmVkClVWLUludGwtMzUwMDAwMyw4MDAwLAo=',
  },
};

function addTextFile(id, name, text) {
  DEMO_TASK_FILES[id] = { id, name, content: Buffer.from(text, 'utf8').toString('base64') };
  return id;
}

const packingGuide = addTextFile(
  'DEMO-TASKFILE-PACKING-GUIDE',
  'huong-dan-kiem-tra-dong-goi.txt',
  'PO UV-Intl-3500004\n1. Ghi số lượng đã đóng gói.\n2. Ghi ngày dự kiến hoàn tất.\n'
);
const bankResult = addTextFile(
  'DEMO-TASKFILE-BANK-RESULT',
  'doi-soat-thu-tien.csv',
  'receipt,total_vnd,allocated_vnd,unallocated_vnd\nDEMO-THU-A,18000000,16000000,2000000\n'
);
const etaResult = addTextFile(
  'DEMO-TASKFILE-ETA-RESULT',
  'lich-giao-3500006.csv',
  'po,ordered,delivered,remaining\nUV-Intl-3500006,10000,4000,6000\n'
);
const apResult = addTextFile(
  'DEMO-TASKFILE-AP-RESULT',
  'chung-tu-tam-ung.txt',
  'Chứng từ DEMO-BILL-04\nSố tiền đề nghị: 3.200.000 VND\nMã tham chiếu thanh toán: chưa bổ sung\n'
);

const acceptedAt = '2026-11-04T02:00:00.000Z';
const submittedAt = '2026-11-05T03:00:00.000Z';
const reviewedAt = '2026-11-05T07:30:00.000Z';

const returnedDemoTask = {
  id: 'demo-task-returned-sale',
  title: 'Bổ sung đối chiếu PO UV-Intl-3500003',
  description: 'Đối chiếu số nhập, số giao và ngày xác nhận giao. Nộp lại bảng đã bổ sung.',
  assigneeId: 'user-sale',
  assignerId: 'user-ceo',
  deadline: '12/11/2026',
  status: TASK_RETURNED,
  requiresFile: true,
  comments: [],
  sourceAlert: { type: 'orders', id: 'order-3500003', reference: 'UV-Intl-3500003' },
  submissions: [
    {
      note: 'Em đã gửi bảng đối chiếu lần 1. Số nhập đã được cập nhật.',
      fileIds: ['DEMO-TASKFILE-RESULT'],
      at: '2026-11-06T02:30:00.000Z',
    },
  ],
  reviews: [
    {
      approve: false,
      at: '2026-11-06T03:15:00.000Z',
    },
  ],
};

export const DEMO_TASKS = [
  {
    id: 'demo-task-po',
    title: 'Đối chiếu tiến độ UV-Intl-3500003',
    description: 'Kiểm tra số lượng nhập và giao theo PO.',
    assigneeId: 'user-sale',
    assignerId: 'user-ceo',
    deadline: '10/11/2026',
    status: TASK_NEW,
    comments: [],
    sourceAlert: { type: 'orders', id: 'order-3500003', reference: 'UV-Intl-3500003' },
  },
  {
    id: 'demo-task-accountant',
    title: 'Đối chiếu công nợ BM41',
    description: 'Kiểm tra chứng từ và gửi bảng đối chiếu.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    deadline: '11/11/2026',
    status: TASK_NEW,
    comments: [],
    requiresFile: true,
  },
  returnedDemoTask,
  {
    id: 'demo-task-active-sale',
    title: 'Kiểm tra đóng gói PO UV-Intl-3500004',
    description: 'Tải hướng dẫn, cập nhật số lượng đã đóng gói và nộp kết quả kèm tệp.',
    assigneeId: 'user-sale',
    assignerId: 'user-ceo',
    deadline: '09/11/2026',
    status: TASK_ACTIVE,
    comments: [{ id: 'DEMO-LOG-SALE-ACCEPT', author: 'Lê Hương', time: acceptedAt, text: 'Tiếp nhận công việc.' }],
    fileIds: [packingGuide],
    requiresFile: true,
    sourceAlert: { type: 'orders', id: 'order-3500004', reference: 'UV-Intl-3500004' },
  },
  {
    id: 'demo-task-active-accountant',
    title: 'Phòng Kế toán · Rà soát khoản thu chưa phân bổ',
    description: 'Đối soát khách hàng và đề xuất hóa đơn nhận phân bổ.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    department: 'Accountant',
    batchId: 'DEMO-TASKGROUP-ACCOUNTANT',
    deadline: '05/11/2026',
    status: TASK_ACTIVE,
    comments: [{ id: 'DEMO-LOG-ACC-ACCEPT', author: 'Phạm Lan', time: acceptedAt, text: 'Tiếp nhận công việc.' }],
  },
  {
    id: 'demo-task-open-accountant',
    title: 'Đối chiếu số dư DEMO-INV-A2',
    description: 'Kiểm tra số tiền đã thu và số dư còn phải thu của hóa đơn.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    deadline: '09/11/2026',
    status: TASK_ACTIVE,
    comments: [],
    sourceAlert: { type: 'receivables', id: 'receivables-DEMO-AR-2', reference: 'DEMO-INV-A2' },
  },
  {
    id: 'demo-task-review-sale',
    title: 'Xác nhận lịch giao PO UV-Intl-3500006',
    description: 'Đối chiếu số lượng đã giao và phần còn lại với kế hoạch giao khách.',
    assigneeId: 'user-sale',
    assignerId: 'user-ceo',
    deadline: '08/11/2026',
    status: TASK_REVIEW,
    comments: [],
    requiresFile: true,
    sourceAlert: { type: 'orders', id: 'order-3500006', reference: 'UV-Intl-3500006' },
    submissions: [
      {
        note: 'Đã giao 4.000 pcs, còn 6.000 pcs cần chốt lịch giao.',
        fileIds: [etaResult],
        at: submittedAt,
      },
    ],
  },
  {
    id: 'demo-task-review-accountant',
    title: 'Đối soát khoản thu DEMO-THU-A',
    description: 'Kiểm tra khoản thu chưa phân bổ và gửi bảng đối soát.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    deadline: '09/11/2026',
    status: TASK_REVIEW,
    comments: [],
    requiresFile: true,
    submissions: [
      {
        note: 'Khoản thu còn 2.000.000 VND chưa phân bổ. Đã nộp bảng đối soát.',
        fileIds: [bankResult],
        at: submittedAt,
      },
    ],
  },
  {
    id: 'demo-task-done-sale',
    title: 'Xác nhận giao đủ PO UV-Intl-3500002',
    description: 'Kiểm tra số lượng giao và xác nhận đã hoàn tất đơn hàng.',
    assigneeId: 'user-sale',
    assignerId: 'user-ceo',
    deadline: '05/11/2026',
    status: TASK_DONE,
    comments: [],
    submissions: [{ note: 'Đã xác nhận giao đủ 10.000 pcs.', fileIds: [], at: submittedAt }],
    reviews: [{ approve: true, at: reviewedAt }],
  },
  {
    id: 'demo-task-done-accountant',
    title: 'Kiểm tra khoản chi DEMO-BILL-02',
    description: 'Đối chiếu khoản đã chi với số dư phải trả.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    deadline: '05/11/2026',
    status: TASK_DONE,
    comments: [],
    submissions: [{ note: 'Đã chi 6.000.000 VND, còn phải trả 10.000.000 VND.', fileIds: [], at: submittedAt }],
    reviews: [{ approve: true, at: reviewedAt }],
  },
  {
    id: 'demo-task-returned-accountant',
    title: 'Bổ sung chứng từ DEMO-BILL-04',
    description: 'Bổ sung mã tham chiếu cho hồ sơ tạm ứng rồi nộp lại.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    deadline: '10/11/2026',
    status: TASK_RETURNED,
    comments: [],
    requiresFile: true,
    sourceAlert: { type: 'payables', id: 'payables-DEMO-AP-4', reference: 'DEMO-BILL-04' },
    submissions: [{ note: 'Đã nộp thông tin đề nghị tạm ứng.', fileIds: [apResult], at: submittedAt }],
    reviews: [{ approve: false, at: reviewedAt }],
  },
  {
    id: 'demo-task-rereview-sale',
    title: 'Duyệt lại xác nhận giao PO UV-Intl-3500003',
    description: 'Kiểm tra lại số lượng đã giao trên bảng theo dõi.',
    assigneeId: 'user-sale',
    assignerId: 'user-ceo',
    deadline: '12/11/2026',
    status: TASK_REVIEW,
    comments: [],
    submissions: [
      { note: 'Đã nộp số lượng giao ban đầu.', fileIds: [], at: submittedAt },
      { note: 'Đã bổ sung số giao xác nhận là 6.000 pcs.', fileIds: [], at: '2026-11-06T02:00:00.000Z' },
    ],
    reviews: [{ approve: false, at: reviewedAt }],
  },
  {
    id: 'demo-task-rereview-accountant',
    title: 'Duyệt lại số dư DEMO-BILL-02',
    description: 'Kiểm tra số dư còn phải trả sau khi đối chiếu khoản đã chi.',
    assigneeId: 'user-accountant',
    assignerId: 'user-admin',
    deadline: '12/11/2026',
    status: TASK_REVIEW,
    comments: [],
    submissions: [
      { note: 'Đã nộp bảng đối chiếu ban đầu.', fileIds: [], at: submittedAt },
      {
        note: 'Đã xác nhận số dư còn phải trả 10.000.000 VND.',
        fileIds: [],
        at: '2026-11-06T02:00:00.000Z',
      },
    ],
    reviews: [{ approve: false, at: reviewedAt }],
  },
];

export const DEMO_REMINDERS = [
  {
    id: 'demo-reminder-order-3500005',
    alertId: 'order-3500005',
    alertType: 'orders',
    reference: 'UV-Intl-3500005',
    subject: 'Túi vải kích thước 22cm x 15cm',
    issue: 'Quá hạn nhận hàng 1 ngày, chưa xác nhận nhập kho',
    message:
      'Đơn hàng UV-Intl-3500005 đã quá ngày dự kiến về kho nhưng chưa có người phụ trách xác nhận với NCC. Nhờ sếp giao việc giúp để tránh trễ lịch giao.',
    senderId: 'user-sale',
    senderName: 'Lê Hương',
    senderRole: 'Sale',
    createdAt: '2026-11-06T01:45:00.000Z',
    updatedAt: '2026-11-06T01:45:00.000Z',
    remindCount: 1,
    status: REMINDER_PENDING,
    history: [
      {
        id: 'DEMO-REMLOG-1',
        senderId: 'user-sale',
        senderName: 'Lê Hương',
        senderRole: 'Sale',
        message:
          'Đơn hàng UV-Intl-3500005 đã quá ngày dự kiến về kho nhưng chưa có người phụ trách xác nhận với NCC. Nhờ sếp giao việc giúp để tránh trễ lịch giao.',
        at: '2026-11-06T01:45:00.000Z',
      },
    ],
  },
  {
    id: 'demo-reminder-payable-bill03',
    alertId: 'payables-DEMO-AP-3',
    alertType: 'payables',
    reference: 'DEMO-BILL-03',
    subject: 'MOC LAM PHAT & Demo Supplier B',
    issue: 'Chưa xác định hạn · Cần tách chứng từ',
    message:
      'Chứng từ gộp DEMO-BILL-03 đang báo động đỏ chưa tách nhà cung cấp và chưa phân công xử lý. Nhờ CEO/Admin phân công gấp cho bộ phận liên quan.',
    senderId: 'user-accountant',
    senderName: 'Phạm Lan',
    senderRole: 'Accountant',
    createdAt: '2026-11-06T02:15:00.000Z',
    updatedAt: '2026-11-06T02:15:00.000Z',
    remindCount: 1,
    status: REMINDER_PENDING,
    history: [
      {
        id: 'DEMO-REMLOG-2',
        senderId: 'user-accountant',
        senderName: 'Phạm Lan',
        senderRole: 'Accountant',
        message:
          'Chứng từ gộp DEMO-BILL-03 đang báo động đỏ chưa tách nhà cung cấp và chưa phân công xử lý. Nhờ CEO/Admin phân công gấp cho bộ phận liên quan.',
        at: '2026-11-06T02:15:00.000Z',
      },
    ],
  },
  {
    id: 'demo-reminder-assigned-3500003',
    alertId: 'order-3500003',
    alertType: 'orders',
    reference: 'UV-Intl-3500003',
    subject: 'Túi vải kích thước 18cm x 12cm',
    issue: 'Quá hạn nhận hàng 1 ngày',
    message: 'Nhờ sếp phân công kiểm tra số lượng nhập kho thực tế cho PO UV-Intl-3500003.',
    senderId: 'user-sale',
    senderName: 'Lê Hương',
    senderRole: 'Sale',
    createdAt: '2026-11-05T08:00:00.000Z',
    updatedAt: '2026-11-05T09:00:00.000Z',
    remindCount: 1,
    status: REMINDER_ASSIGNED,
    assignedById: 'user-ceo',
    assignedByName: 'Trần Quốc',
    assignedAt: '2026-11-05T09:00:00.000Z',
    assignedTaskIds: ['demo-task-po'],
    assignedScope: 'person',
    assignedTargetLabel: 'Lê Hương',
    managerNote: 'Ưu tiên kiểm tra biên bản nhập kho với nhà cung cấp trong hôm nay.',
    history: [
      {
        id: 'DEMO-REMLOG-3',
        senderId: 'user-sale',
        senderName: 'Lê Hương',
        senderRole: 'Sale',
        message: 'Nhờ sếp phân công kiểm tra số lượng nhập kho thực tế cho PO UV-Intl-3500003.',
        at: '2026-11-05T08:00:00.000Z',
      },
    ],
  },
];

export function createInitialDatabaseState() {
  return {
    directory: {
      version: 1,
      accounts: {},
      credentials: structuredClone(SEED_CREDENTIALS),
      tokenVersions: {
        'user-ceo': 1,
        'user-admin': 1,
        'user-sale': 1,
        'user-accountant': 1,
      },
      departmentNavigation: {},
      tasks: structuredClone(DEMO_TASKS),
      taskFiles: structuredClone(DEMO_TASK_FILES),
      reminders: structuredClone(DEMO_REMINDERS),
      handoverDrafts: {},
    },
    orders: structuredClone(DEMO_ORDERS),
    finance: structuredClone(DEMO_FINANCE_BASE),
  };
}
