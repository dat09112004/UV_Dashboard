import { can, canOpenSection } from '../../utils/roles.js';

const col = (key, label, type = 'text', aliases = []) => ({ key, label, type, aliases });
const lineId = col('rowId', 'Mã dòng PO', 'number', ['poLineId']);
const po = col('poId', 'Mã PO', 'text', ['PO', 'PO No', 'Số PO', 'SAP']);
const doc = col('docNo', 'Số chứng từ', 'text', ['Invoice', 'Invoice No', 'Bill No']);
const due = col('dueDate', 'Hạn thanh toán', 'date', ['Due date', 'Ngày đến hạn']);
const date = col('date', 'Ngày giao dịch', 'date', ['Transaction date']);
const amount = col('amount', 'Số tiền VND', 'number', ['Amount']);
const reference = col('reference', 'Tham chiếu', 'text', ['Reference']);
const customer = col('customerName', 'Khách hàng', 'text', ['Customer']);
const remaining = col('remaining', 'Còn lại', 'number', ['Balance']);

export const ENTRY_SHEETS = [
  { id: 'orders', label: 'Đơn hàng và tiến độ', name: 'PO', section: 'orders', write: 'orders.update', columns: [
    lineId, po, col('vendorItemNo', 'Mã hàng', 'text', ['Tên hàng', 'Description', 'Item', 'Item Description']), col('vendorNo', 'Mã nhà cung cấp', 'text', ['Vendor code', 'Supplier Code', 'Mã NCC']),
    col('vendorName', 'Nhà cung cấp', 'text', ['Supplier', 'Vendor', 'Supplier Name']), col('category', 'Ngành hàng', 'text', ['Category', 'Merchandise Category']),
    col('countryOfOrigin', 'Xuất xứ'), col('releasedPoDate', 'Ngày phát hành PO', 'date', ['Release date', 'Released', 'Ngày phát hành']),
    col('unit', 'Đơn vị', 'text', ['Unit', 'ĐVT']), col('orderedQty', 'SL đặt', 'number', ['Qty', 'Quantity']),
    col('unitPriceVnd', 'Đơn giá VND', 'number', ['Unit price']), col('nhap', 'SL đã về kho', 'number', ['receivedQty', 'Nhập']),
    col('deliveredQty', 'SL đã giao khách', 'number'), col('onProcessPct', 'Sản xuất (%)', 'number'),
    col('packagingPct', 'Đóng gói (%)', 'number'), col('expectedReceiptDate', 'Dự kiến về kho', 'date', ['Req.', 'Expected receipt']),
    col('shipDateEtd', 'ETD', 'date', ['Xuất dự kiến (ETD)']), col('etaDate', 'ETA', 'date', ['Giao dự kiến (ETA)']), col('actualShipDate', 'Ngày xuất thực tế', 'date'),
    col('actualDeliveryDate', 'Ngày giao xác nhận', 'date'), col('changeReason', 'Lý do cập nhật'),
  ] },
  { id: 'revenue', label: 'Doanh thu', name: 'Doanh_thu', section: 'revenue', write: 'revenue.create', needsOrders: true, columns: [
    doc, lineId, po, customer, col('recordDate', 'Ngày ghi nhận', 'date'), due, col('shippedQty', 'SL đã xuất', 'number'),
    col('netRevenue', 'Doanh thu thuần', 'number', ['Net revenue']), col('basis', 'Căn cứ ghi nhận'),
  ], extra: [col('cashCollected', 'Thực thu', 'number')] },
  { id: 'receivables', label: 'Công nợ phải thu', name: 'Phai_thu', section: 'receivables', columns: [
    doc, po, customer, due, col('originalAmount', 'Số tiền gốc', 'number'), col('allocatedPaid', 'Đã thu', 'number'), remaining,
  ] },
  { id: 'payables', label: 'Công nợ phải trả', name: 'Phai_tra', section: 'payables', write: 'payables.submit', needsOrders: true, columns: [
    doc, lineId, po, due, col('originalAmount', 'Số tiền gốc', 'number'),
  ], extra: [col('supplierName', 'Nhà cung cấp'), col('allocatedPaid', 'Đã trả', 'number'), remaining, col('approvalState', 'Trạng thái duyệt')] },
  { id: 'receipts', label: 'Thu tiền', name: 'Thu_tien', section: 'receivables', write: 'receivables.allocate',
    columns: [reference, customer, date, amount], extra: [col('allocatedAmount', 'Đã phân bổ', 'number')] },
  { id: 'allocations', label: 'Phân bổ thu', name: 'Phan_bo_thu', section: 'receivables', write: 'receivables.allocate',
    columns: [col('entryReference', 'Mã lần phân bổ'), col('receiptReference', 'Tham chiếu khoản thu'), doc, date, amount] },
  { id: 'payments', label: 'Chi tiền', name: 'Chi_tien', section: 'payables', write: 'payables.record-payment',
    columns: [reference, doc, date, amount] },
  { id: 'tasks', label: 'Công việc', name: 'Cong_viec', write: 'tasks.assign', columns: [
    col('title', 'Tên công việc'), col('description', 'Nội dung'), col('assigneeEmail', 'Email người phụ trách', 'text', ['Assignee email']),
    col('department', 'Phòng ban'), col('deadline', 'Hạn công việc', 'date'), col('requiresFile', 'Yêu cầu tệp kết quả', 'boolean'),
  ], extra: [col('status', 'Trạng thái')] },
];

export const canReadSheet = (user, sheet) => sheet.id === 'tasks'
  ? canOpenSection(user, 'assignments') || canOpenSection(user, 'tasks') : canOpenSection(user, sheet.section);
export const canWriteSheet = (user, sheet) => canReadSheet(user, sheet) && Boolean(sheet.write) &&
  can(user, sheet.write) && (!sheet.needsOrders || canOpenSection(user, 'orders'));
