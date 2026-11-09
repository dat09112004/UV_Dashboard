import { TASK_ACTIVE, TASK_DONE, TASK_NEW, TASK_RETURNED, TASK_REVIEW, REMINDER_PENDING, REMINDER_ASSIGNED } from '../features/operations/services/taskWorkflow.js';

// Demo dates use the dashboard's 06/11/2026 reporting snapshot.
const returnedDemoTask = {
  id: 'demo-task-returned-sale', title: 'Bổ sung đối chiếu PO UV-Intl-3500003',
  description: 'Đối chiếu số nhập, số giao và ngày xác nhận giao. Nộp lại bảng đã bổ sung.',
  assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '12/11/2026',
  status: TASK_RETURNED, requiresFile: true, comments: [],
  sourceAlert: { type: 'orders', id: 'order-3500003', reference: 'UV-Intl-3500003' },
  submissions: [{
    note: 'Em đã gửi bảng đối chiếu lần 1. Số nhập đã được cập nhật.',
    fileIds: ['DEMO-TASKFILE-RESULT'], at: '2026-11-06T02:30:00.000Z',
  }],
  reviews: [{
    approve: false, at: '2026-11-06T03:15:00.000Z',
  }],
};
export const DEMO_TASK_FILES = {
  "DEMO-TASKFILE-RESULT": {
    "id": "DEMO-TASKFILE-RESULT",
    "name": "doi-chieu-PO-lan-1.csv",
    "content": "cG8scmVjZWl2ZWQsZGVsaXZlcmVkClVWLUludGwtMzUwMDAwMyw4MDAwLAo="
  },
};

function addTextFile(id, name, text) {
  const bytes = new TextEncoder().encode(text);
  DEMO_TASK_FILES[id] = { id, name, content: btoa(String.fromCharCode(...bytes)) };
  return id;
}

const packingGuide = addTextFile('DEMO-TASKFILE-PACKING-GUIDE', 'huong-dan-kiem-tra-dong-goi.txt',
  'PO UV-Intl-3500004\n1. Ghi số lượng đã đóng gói.\n2. Ghi ngày dự kiến hoàn tất.\n');
const bankResult = addTextFile('DEMO-TASKFILE-BANK-RESULT', 'doi-soat-thu-tien.csv',
  'receipt,total_vnd,allocated_vnd,unallocated_vnd\nDEMO-THU-A,18000000,16000000,2000000\n');
const etaResult = addTextFile('DEMO-TASKFILE-ETA-RESULT', 'lich-giao-3500006.csv',
  'po,ordered,delivered,remaining\nUV-Intl-3500006,10000,4000,6000\n');
const apResult = addTextFile('DEMO-TASKFILE-AP-RESULT', 'chung-tu-tam-ung.txt',
  'Chứng từ DEMO-BILL-04\nSố tiền đề nghị: 3.200.000 VND\nMã tham chiếu thanh toán: chưa bổ sung\n');

const acceptedAt = '2026-11-04T02:00:00.000Z';
const submittedAt = '2026-11-05T03:00:00.000Z';
const reviewedAt = '2026-11-05T07:30:00.000Z';

export const DEMO_TASKS = [
  {
    id: 'demo-task-po', title: 'Đối chiếu tiến độ UV-Intl-3500003',
    description: 'Kiểm tra số lượng nhập và giao theo PO.',
    assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '10/11/2026', status: TASK_NEW, comments: [],
    sourceAlert: { type: 'orders', id: 'order-3500003', reference: 'UV-Intl-3500003' },
  },
  {
    id: 'demo-task-accountant', title: 'Đối chiếu công nợ BM41',
    description: 'Kiểm tra chứng từ và gửi bảng đối chiếu.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '11/11/2026',
    status: TASK_NEW, comments: [], requiresFile: true,
  },
  returnedDemoTask,
  {
    id: 'demo-task-active-sale', title: 'Kiểm tra đóng gói PO UV-Intl-3500004',
    description: 'Tải hướng dẫn, cập nhật số lượng đã đóng gói và nộp kết quả kèm tệp.',
    assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '09/11/2026',
    status: TASK_ACTIVE, comments: [{ id: 'DEMO-LOG-SALE-ACCEPT', author: 'Lê Hương', time: acceptedAt, text: 'Tiếp nhận công việc.' }],
    fileIds: [packingGuide], requiresFile: true,
    sourceAlert: { type: 'orders', id: 'order-3500004', reference: 'UV-Intl-3500004' },
  },
  {
    id: 'demo-task-active-accountant', title: 'Phòng Kế toán · Rà soát khoản thu chưa phân bổ',
    description: 'Đối soát khách hàng và đề xuất hóa đơn nhận phân bổ.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', department: 'Accountant',
    batchId: 'DEMO-TASKGROUP-ACCOUNTANT', deadline: '05/11/2026',
    status: TASK_ACTIVE, comments: [{ id: 'DEMO-LOG-ACC-ACCEPT', author: 'Phạm Lan', time: acceptedAt, text: 'Tiếp nhận công việc.' }],
  },
  {
    id: 'demo-task-open-accountant', title: 'Đối chiếu số dư DEMO-INV-A2',
    description: 'Kiểm tra số tiền đã thu và số dư còn phải thu của hóa đơn.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '09/11/2026',
    status: TASK_ACTIVE, comments: [],
    sourceAlert: { type: 'receivables', id: 'receivables-DEMO-AR-2', reference: 'DEMO-INV-A2' },
  },
  {
    id: 'demo-task-review-sale', title: 'Xác nhận lịch giao PO UV-Intl-3500006',
    description: 'Đối chiếu số lượng đã giao và phần còn lại với kế hoạch giao khách.',
    assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '08/11/2026',
    status: TASK_REVIEW, comments: [], requiresFile: true,
    sourceAlert: { type: 'orders', id: 'order-3500006', reference: 'UV-Intl-3500006' },
    submissions: [{ note: 'Đã giao 4.000 pcs, còn 6.000 pcs cần chốt lịch giao.', fileIds: [etaResult], at: submittedAt }],
  },
  {
    id: 'demo-task-review-accountant', title: 'Đối soát khoản thu DEMO-THU-A',
    description: 'Kiểm tra khoản thu chưa phân bổ và gửi bảng đối soát.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '09/11/2026',
    status: TASK_REVIEW, comments: [], requiresFile: true,
    submissions: [{ note: 'Khoản thu còn 2.000.000 VND chưa phân bổ. Đã nộp bảng đối soát.', fileIds: [bankResult], at: submittedAt }],
  },
  {
    id: 'demo-task-done-sale', title: 'Xác nhận giao đủ PO UV-Intl-3500002',
    description: 'Kiểm tra số lượng giao và xác nhận đã hoàn tất đơn hàng.',
    assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '05/11/2026',
    status: TASK_DONE, comments: [],
    submissions: [{ note: 'Đã xác nhận giao đủ 10.000 pcs.', fileIds: [], at: submittedAt }],
    reviews: [{ approve: true, at: reviewedAt }],
  },
  {
    id: 'demo-task-done-accountant', title: 'Kiểm tra khoản chi DEMO-BILL-02',
    description: 'Đối chiếu khoản đã chi với số dư phải trả.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '05/11/2026',
    status: TASK_DONE, comments: [],
    submissions: [{ note: 'Đã chi 6.000.000 VND, còn phải trả 10.000.000 VND.', fileIds: [], at: submittedAt }],
    reviews: [{ approve: true, at: reviewedAt }],
  },
  {
    id: 'demo-task-returned-accountant', title: 'Bổ sung chứng từ DEMO-BILL-04',
    description: 'Bổ sung mã tham chiếu cho hồ sơ tạm ứng rồi nộp lại.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '10/11/2026',
    status: TASK_RETURNED, comments: [], requiresFile: true,
    sourceAlert: { type: 'payables', id: 'payables-DEMO-AP-4', reference: 'DEMO-BILL-04' },
    submissions: [{ note: 'Đã nộp thông tin đề nghị tạm ứng.', fileIds: [apResult], at: submittedAt }],
    reviews: [{ approve: false, at: reviewedAt }],
  },
  {
    id: 'demo-task-rereview-sale', title: 'Duyệt lại xác nhận giao PO UV-Intl-3500003',
    description: 'Kiểm tra lại số lượng đã giao trên bảng theo dõi.',
    assigneeId: 'user-sale', assignerId: 'user-ceo', deadline: '12/11/2026',
    status: TASK_REVIEW, comments: [],
    submissions: [
      { note: 'Đã nộp số lượng giao ban đầu.', fileIds: [], at: submittedAt },
      { note: 'Đã bổ sung số giao xác nhận là 6.000 pcs.', fileIds: [], at: '2026-11-06T02:00:00.000Z' },
    ],
    reviews: [{ approve: false, at: reviewedAt }],
  },
  {
    id: 'demo-task-rereview-accountant', title: 'Duyệt lại số dư DEMO-BILL-02',
    description: 'Kiểm tra số dư còn phải trả sau khi đối chiếu khoản đã chi.',
    assigneeId: 'user-accountant', assignerId: 'user-admin', deadline: '12/11/2026',
    status: TASK_REVIEW, comments: [],
    submissions: [
      { note: 'Đã nộp bảng đối chiếu ban đầu.', fileIds: [], at: submittedAt },
      { note: 'Đã xác nhận số dư còn phải trả 10.000.000 VND.', fileIds: [], at: '2026-11-06T02:00:00.000Z' },
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
    message: 'Đơn hàng UV-Intl-3500005 đã quá ngày dự kiến về kho nhưng chưa có người phụ trách xác nhận với NCC. Nhờ sếp giao việc giúp để tránh trễ lịch giao.',
    senderId: 'user-sale',
    senderName: 'Lê Hương',
    senderRole: 'Sale',
    createdAt: '2026-11-06T01:45:00.000Z',
    updatedAt: '2026-11-06T01:45:00.000Z',
    remindCount: 1,
    status: REMINDER_PENDING,
    history: [{
      id: 'DEMO-REMLOG-1',
      senderId: 'user-sale',
      senderName: 'Lê Hương',
      senderRole: 'Sale',
      message: 'Đơn hàng UV-Intl-3500005 đã quá ngày dự kiến về kho nhưng chưa có người phụ trách xác nhận với NCC. Nhờ sếp giao việc giúp để tránh trễ lịch giao.',
      at: '2026-11-06T01:45:00.000Z',
    }],
  },
  {
    id: 'demo-reminder-payable-bill03',
    alertId: 'payables-DEMO-AP-3',
    alertType: 'payables',
    reference: 'DEMO-BILL-03',
    subject: 'MOC LAM PHAT & Demo Supplier B',
    issue: 'Chưa xác định hạn · Cần tách chứng từ',
    message: 'Chứng từ gộp DEMO-BILL-03 đang báo động đỏ chưa tách nhà cung cấp và chưa phân công xử lý. Nhờ CEO/Admin phân công gấp cho bộ phận liên quan.',
    senderId: 'user-accountant',
    senderName: 'Phạm Lan',
    senderRole: 'Accountant',
    createdAt: '2026-11-06T02:15:00.000Z',
    updatedAt: '2026-11-06T02:15:00.000Z',
    remindCount: 1,
    status: REMINDER_PENDING,
    history: [{
      id: 'DEMO-REMLOG-2',
      senderId: 'user-accountant',
      senderName: 'Phạm Lan',
      senderRole: 'Accountant',
      message: 'Chứng từ gộp DEMO-BILL-03 đang báo động đỏ chưa tách nhà cung cấp và chưa phân công xử lý. Nhờ CEO/Admin phân công gấp cho bộ phận liên quan.',
      at: '2026-11-06T02:15:00.000Z',
    }],
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
    history: [{
      id: 'DEMO-REMLOG-3',
      senderId: 'user-sale',
      senderName: 'Lê Hương',
      senderRole: 'Sale',
      message: 'Nhờ sếp phân công kiểm tra số lượng nhập kho thực tế cho PO UV-Intl-3500003.',
      at: '2026-11-05T08:00:00.000Z',
    }],
  },
];
