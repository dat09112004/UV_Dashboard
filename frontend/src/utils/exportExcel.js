import { getLanguage, translate } from '../locales/i18n.js';

const sheetNames = {
  Tien_do: 'Order progress', Doanh_thu: 'Revenue', Phai_thu: 'Receivables', Phai_tra: 'Payables',
  Nguon_chung_tu_tach: 'Consolidated documents', Thu_tien: 'Receipts', Phan_bo_thu: 'Receipt allocations',
  Chi_tien: 'Payments', Nhat_ky_tai_chinh: 'Finance audit log', Nhat_ky_tien_do: 'Order progress log', Nhap_giao_hang: 'Receiving and delivery',
};

const filterValues = {
  all: ['Tất cả', 'All'], overview: ['Tổng quan', 'Overview'], orders: ['Tiến độ đơn hàng', 'Order tracking'],
  revenue: ['Doanh thu', 'Revenue'], receivables: ['Công nợ phải thu', 'Accounts receivable'],
  payables: ['Công nợ phải trả', 'Accounts payable'], red: ['Báo động đỏ', 'Critical alerts'],
  due: ['Đến hạn & quá hạn', 'Due and overdue'], today: ['Đến hạn hôm nay', 'Due today'],
  overdue: ['Quá hạn', 'Overdue'], upcoming: ['Chưa đến hạn', 'Not yet due'], near: ['Sắp đến hạn', 'Due soon'],
  future: ['Chưa tới hạn (>7 ngày)', 'Due in more than 7 days'], attention: ['Cần xử lý', 'Action required'],
  unknown: ['Chưa có hạn', 'No due date'], paid: ['Đã tất toán', 'Settled'],
  production: ['Theo dõi sản xuất & ETD/ETA', 'Production & ETD/ETA'],
  fulfillment: ['Nhập kho & Giao hàng', 'Receiving & Delivery'],
  ordered: ['Đã phát hành PO', 'PO released'],
  arrived: ['Đã về kho', 'Received'],
  partial_receipt: ['Về một phần', 'Partially received'],
  full_receipt: ['Đã về đủ', 'Fully received'],
  not_received: ['Chưa về kho', 'Not received'],
  partial_delivery: ['Đang giao một phần', 'Partially delivered'],
  delivered: ['Đã giao đủ', 'Fully delivered'],
  unknown_delivery: ['Chưa xác nhận giao', 'Unconfirmed delivery'],
  late: ['Trễ hạn nhập/giao', 'Late receipt/delivery'],
  missing: ['Thiếu dữ liệu theo dõi', 'Missing tracking data'],
};

const eventNames = {
  INVOICE_RECORDED: ['Ghi nhận doanh thu', 'Revenue recorded'],
  RECEIPT_IDENTIFIED: ['Đối soát khoản thu', 'Receipt reconciled'],
  RECEIPT_CORRECTED: ['Sửa đối soát khoản thu', 'Receipt reconciliation corrected'],
  RECEIPT_RECORDED: ['Ghi nhận khoản thu', 'Receipt recorded'],
  RECEIPT_ALLOCATED: ['Phân bổ tiền thu', 'Receipt allocated'],
  PAYABLE_SUBMITTED: ['Trình đề nghị chi', 'Payment request submitted'],
  PAYABLE_APPROVED: ['Duyệt chi', 'Payment approved'],
  PAYABLE_RECORDED: ['Ghi nhận phải trả', 'Payable recorded'],
  PAYABLE_RETURNED: ['Yêu cầu bổ sung', 'Revision requested'],
  PAYABLE_PAID: ['Ghi nhận đã chi', 'Payment recorded'],
  PAYABLE_SPLIT: ['Tách chứng từ gộp', 'Consolidated document split'],
};

const workflowValues = {
  status: { identified: ['Đã xác định khách hàng', 'Customer identified'], unidentified: ['Chưa xác định khách hàng', 'Customer not identified'] },
  approvalOrigin: { opening: ['Dữ liệu mở đầu', 'Opening data'], workflow: ['Quy trình duyệt', 'Approval workflow'], split: ['Tách chứng từ', 'Document split'] },
};

const localizableFields = new Set([
  'vendorName', 'vendorRef', 'supplierName', 'customerName', 'partnerName',
  'vendorItemNo', 'itemName', 'sku', 'alertLevel', 'alertReason', 'alertLabel', 'manualAlertReason',
  'agingBucket', 'approvalState', 'fulfillmentStatus', 'statusNote', 'commitmentNote', 'pic', 'detail', 'reason',
]);

const additionalLabels = {
  rowId: 'Mã dòng PO', vendorNo: 'Mã NCC', vendorName: 'Nhà cung cấp', vendorItemNo: 'Tên hàng',
  tonDau: 'Tồn đầu', nhap: 'Nhập', xuat: 'Xuất kho', ban: 'Bán', stockOnHand: 'Tồn kho',
  seasonCode: 'Mã mùa hàng', seasonDesc: 'Mùa hàng', lastUpdateDate: 'Ngày cập nhật', lastUpdateTime: 'Giờ cập nhật',
  countryOfOrigin: 'Xuất xứ', releasedPoDate: 'Ngày phát hành PO', onProcessPct: 'Sản xuất (%)',
  packagingPct: 'Đóng gói (%)', shipDateEtd: 'Xuất dự kiến (ETD)', etaDate: 'Giao dự kiến (ETA)',
  revenueVnd: 'Doanh thu', arDueVnd: 'Phải thu đến hạn', apDueVnd: 'Phải trả đến hạn', alertLevel: 'Mức cảnh báo',
  priorityRank: 'Hạng ưu tiên', alertReason: 'Lý do cảnh báo', urgency: 'Mức độ khẩn', alertLabel: 'Cảnh báo',
  poValue: 'Giá trị PO VND', cashCollected: 'Thực thu', statusNote: 'Đánh giá Kế toán',
  vendorRef: 'Tham chiếu NCC', commitmentNote: 'Ghi chú / Cam kết', daysUntilDue: 'Số ngày tới hạn',
  debtStatus: 'Trạng thái công nợ', approvalState: 'Trạng thái hồ sơ', amount: 'Số tiền',
  splitSourceDocNo: 'Số chứng từ gốc', splitInto: 'Tách thành chứng từ', splitFrom: 'Tách từ chứng từ',
  splitSourceId: 'Mã chứng từ gốc', reviewedDate: 'Ngày duyệt',
  reviewedAt: 'Thời điểm duyệt', requestedBy: 'Người lập đề nghị', requestedAt: 'Thời điểm lập đề nghị',
  actualArrivalDate: 'Ngày hàng đến thực tế', trackingRevision: 'Phiên bản tiến độ', trackingVersion: 'Phiên bản tiến độ',
  sourceId: 'Mã nguồn', sourceDocNo: 'Số chứng từ gốc', splitNote: 'Căn cứ tách và đối soát',
  splitBy: 'Người tách chứng từ', splitAt: 'Thời điểm tách chứng từ',
  poIds: 'Danh sách PO', payableIds: 'Danh sách mã khoản phải trả',
  time: 'Thời điểm thao tác', reason: 'Lý do cập nhật',
  beforeOnProcessPct: 'Sản xuất trước (%)', afterOnProcessPct: 'Sản xuất sau (%)',
  beforePackagingPct: 'Đóng gói trước (%)', afterPackagingPct: 'Đóng gói sau (%)',
  beforeReceivedQty: 'SL đã về trước', afterReceivedQty: 'SL đã về sau',
  beforeDeliveredQty: 'SL đã giao trước', afterDeliveredQty: 'SL đã giao sau',
  inboundOnly: 'Chỉ theo dõi nhập kho',
};

/**
 * X03 Fix: Chặn CSV/Excel Formula Injection cho mọi giá trị chuỗi bắt đầu bằng =, +, -, @
 */
export function sanitizeExcelCellValue(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value) || /^[\t\r\n]+[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * X04 Fix: Làm phẳng các trường mảng (poIds, splitInto, payableIds) và đối tượng lồng nhau (before/after)
 */
function flattenRecordForExport(record) {
  if (!record || typeof record !== 'object') return {};
  const flat = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'trackingHistory') continue;
    if (Array.isArray(value)) {
      flat[key] = value.filter(v => v !== null && v !== undefined && v !== '').join(', ');
    } else if (value && typeof value === 'object' && (key === 'before' || key === 'after')) {
      const prefix = key;
      if (value.onProcessPct !== undefined) flat[`${prefix}OnProcessPct`] = value.onProcessPct;
      if (value.packagingPct !== undefined) flat[`${prefix}PackagingPct`] = value.packagingPct;
      if (value.receivedQty !== undefined) flat[`${prefix}ReceivedQty`] = value.receivedQty;
      if (value.deliveredQty !== undefined) flat[`${prefix}DeliveredQty`] = value.deliveredQty;
    } else if (value === null || typeof value !== 'object') {
      flat[key] = value;
    }
  }
  return flat;
}

export async function exportExcel(tables, filters, language = getLanguage()) {
  const english = language === 'en';
  const languageIndex = english ? 1 : 0;
  const localize = text => translate(text, language);
  const cellValue = (key, value) => {
    let resolved = value;
    if (key === 'type') resolved = eventNames[value]?.[languageIndex] ?? value;
    else if (key === 'debtStatus') resolved = filterValues[value]?.[languageIndex] ?? value;
    else if (workflowValues[key]) resolved = workflowValues[key][value]?.[languageIndex] ?? localize(value);
    else if (localizableFields.has(key)) resolved = localize(value);
    return sanitizeExcelCellValue(resolved);
  };
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = localize('Điều hành');
  const context = book.addWorksheet(english ? 'Filters' : 'Bo loc');
  Object.entries(filters).forEach(([name, value]) => {
    const displayValue = ['Phân hệ', 'Nhóm công nợ', 'Chế độ xem đơn hàng', 'Bộ lọc đơn hàng'].includes(name)
      ? filterValues[value]?.[languageIndex] ?? localize(value)
      : name === 'Tìm kiếm' ? value : localize(value);
    context.addRow([sanitizeExcelCellValue(localize(name)), sanitizeExcelCellValue(String(displayValue))]);
  });
  context.columns = [{ width: 28 }, { width: 65 }];
  const labels = {
    manualPriorityRank: 'Mức cảnh báo thủ công', manualAlertReason: 'Lý do cảnh báo thủ công',
    actualShipDate: 'Ngày xuất thực tế', approvedRemaining: 'Hạn mức duyệt còn lại',
    requestAmount: 'Số tiền đề nghị', requestedDueDate: 'Hạn thanh toán đề nghị',
    requestNote: 'Nội dung đề nghị', reviewNote: 'Ý kiến duyệt', reviewedBy: 'Người duyệt',
    approvalOrigin: 'Nguồn trạng thái duyệt', actorName: 'Người thao tác', actorId: 'Mã người thao tác',
    type: 'Loại sự kiện', reference: 'Tham chiếu', detail: 'Nội dung xử lý', occurredAt: 'Thời điểm thao tác',
    receiptId: 'Mã khoản thu', debtId: 'Mã khoản phải thu', payableId: 'Mã khoản phải trả',
    approvedBy: 'Người duyệt chi', poLineId: 'Mã dòng PO', orderedQty: 'SL đặt',
    receivedQty: 'SL đã về kho', deliveredQty: 'SL đã giao khách', receivedPct: 'Đã về (%)',
    deliveredPct: 'Đã giao (%)', expectedReceiptDate: 'Dự kiến về kho',
    expectedDeliveryDate: 'Giao dự kiến (ETA)', actualDeliveryDate: 'Ngày giao xác nhận gần nhất',
    fulfillmentStatus: 'Tiến độ nhập/giao', id: 'Mã', docNo: 'Số chứng từ', poId: 'Mã PO',
    sku: 'Mã hàng', customerName: 'Khách hàng', supplierName: 'Nhà cung cấp', category: 'Ngành hàng',
    itemName: 'Tên hàng', unit: 'Đơn vị', effectiveQty: 'SL đặt hiệu lực', productionQty: 'SL sản xuất đạt',
    packagingQty: 'SL đóng gói', shippedQty: 'SL đã xuất', totalValueVnd: 'Giá trị PO VND',
    unitPriceVnd: 'Đơn giá VND', currency: 'Loại tiền', releasedDate: 'Ngày phát hành',
    recordDate: 'Ngày ghi nhận', docDate: 'Ngày chứng từ', dueDate: 'Ngày đến hạn',
    originalAmount: 'Số tiền gốc', adjustment: 'Điều chỉnh', allocatedPaid: 'Đã thanh toán phân bổ',
    remaining: 'Còn lại', overdueDays: 'Số ngày quá hạn', agingBucket: 'Nhóm tuổi nợ',
    status: 'Trạng thái', title: 'Nội dung', deadline: 'Hạn công việc', assignee: 'Người nhận',
    assigner: 'Người giao', pic: 'Người phụ trách', grossAmount: 'Giá trị trước giảm trừ',
    deduction: 'Giảm trừ', netRevenue: 'Doanh thu thuần', totalAmount: 'Tổng tiền',
    allocatedAmount: 'Đã phân bổ', unallocatedAmount: 'Chưa phân bổ', partnerName: 'Đối tác',
    date: 'Ngày giao dịch', etdUpdated: 'ETD cập nhật', etaUpdated: 'ETA cập nhật',
  };
  Object.entries(tables).forEach(([name, records]) => {
    const sheet = book.addWorksheet(english ? sheetNames[name] ?? name : name);
    const rows = (records || []).map(record => {
      const flat = flattenRecordForExport(record);
      return Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, cellValue(key, value)]));
    });
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    if (!keys.length) { sheet.addRow([localize('Không có dữ liệu theo bộ lọc')]); return; }
    sheet.columns = keys.map(key => ({ header: localize(labels[key] || additionalLabels[key] || key), key, width: /name|title|note|detail|action|reason/i.test(key) ? 40 : 22 }));
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2942' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
  });
  const bytes = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = english ? 'Operations_report.xlsx' : 'Bao_cao_dieu_hanh.xlsx';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
