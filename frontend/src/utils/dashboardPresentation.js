import { formatQuantity } from './orderFulfillment.js';
import { formatDate, formatMillions, formatMoney } from './dashboardMetrics.js';
import { needsPayableSplit, payableWorkflowStatus } from './financeWorkflow.js';
import { isExecutiveRole } from './roles.js';

// Series colors identify measurements; warning colors are reserved for actual alerts.
export const SERIES_COLORS = { production: '#1558C9', packaging: '#D4FF24', collected: '#08776D', upcoming: '#7097E5', neutral: '#64748B' };
export const ROLE_LAYOUTS = {
  CEO: {
    label: 'Điều hành toàn công ty', alertType: 'all',
    kpis: ['receivables', 'payables', 'revenue', 'orders'],
    widgets: [['alerts', 7, 'hero'], ['revenue', 5, 'hero'], ['progress', 4, 'compact'], ['receivables', 4, 'compact'], ['payables', 4, 'compact'], ['orders', 12, 'table']],
  },
  Admin: {
    label: 'Điều hành toàn công ty', alertType: 'all',
    kpis: ['receivables', 'payables', 'revenue', 'orders'],
    widgets: [['alerts', 7, 'hero'], ['revenue', 5, 'hero'], ['progress', 4, 'compact'], ['receivables', 4, 'compact'], ['payables', 4, 'compact'], ['orders', 12, 'table']],
  },
  Sale: {
    label: 'Giao hàng & tiến độ sản xuất', alertType: 'orders',
    kpis: ['orders', 'revenue', 'receivables', 'payables'],
    widgets: [['progress', 7, 'hero'], ['alerts', 5, 'hero'], ['orders', 12, 'table'], ['revenue', 4, 'compact'], ['receivables', 4, 'compact'], ['payables', 4, 'compact']],
  },
  Accountant: {
    label: 'Thu hồi công nợ & thanh toán', alertType: 'finance',
    kpis: ['receivables', 'payables', 'revenue', 'orders'],
    widgets: [['cash', 7, 'hero'], ['alerts', 5, 'hero'], ['receivables', 6, 'compact'], ['payables', 6, 'compact'], ['revenue', 6, 'compact'], ['progress', 6, 'compact'], ['orders', 12, 'table']],
  },
};
export const getRoleLayout = role => ROLE_LAYOUTS[role] || ROLE_LAYOUTS.CEO;
export const getSeverity = rank => rank === 0 ? 'critical' : rank === 1 ? 'warning' : 'normal';

export function presentAlert(alert, role) {
  const data = alert.data;
  const severity = getSeverity(data.priorityRank);
  const isExec = isExecutiveRole(role);
  if (alert.type === 'orders') {
    const missing = data.alertLabel.includes('Thiếu lịch');
    if (data.inboundOnly && !data.shipDateEtd && !data.etaDate) {
      return { severity, typeLabel: 'Nhập kho', subject: data.vendorItemNo, partner: data.vendorName,
        issue: data.alertLabel, amount: null, deadline: `Dự kiến nhận hàng: ${formatDate(data.expectedReceiptDate)}`,
        facts: `Đã đặt ${formatQuantity(data.orderedQty)} ${data.unit}`,
        action: 'Xác nhận ngày giao và số lượng đã nhận với nhà cung cấp.',
        button: 'Mở tiến độ đơn hàng' };
    }
    return { severity, typeLabel: 'Giao hàng', subject: data.vendorItemNo, partner: data.vendorName,
      issue: data.alertLabel, amount: null,
      deadline: `ETD ${formatDate(data.shipDateEtd)} · ETA ${formatDate(data.etaDate)}`,
      facts: data.orderedQty > 0 ? `Đã về ${formatQuantity(data.nhap)}/${formatQuantity(data.orderedQty)} ${data.unit || ''} · Đã giao ${formatQuantity(data.deliveredQty)}/${formatQuantity(data.orderedQty)}` : `Sản xuất ${data.onProcessPct}% · Đóng gói ${data.packagingPct}%`,
      action: missing ? 'Xác nhận lịch xuất và ngày hàng đến với nhà cung cấp.' : data.alertLabel.includes('hàng về') ? 'Xác nhận phần hàng còn thiếu và ngày về kho mới với nhà cung cấp.' : data.orderedQty > 0 ? 'Đôn đốc phần hàng chưa giao và xác nhận lịch giao với khách hàng.' : 'Kiểm tra tiến độ đóng gói và xác nhận phương án giao hàng.',
      button: role === 'Sale' || isExec ? 'Mở tiến độ đơn hàng' : 'Xem đơn hàng' };
  }
  const isAr = alert.type === 'receivables';
  const grouped = !isAr && needsPayableSplit(data);
  const due = data.debtStatus === 'today' ? 'Đến hạn hôm nay' : data.debtStatus === 'upcoming' ? `Còn ${data.daysUntilDue} ngày đến hạn` : data.alertLabel;
  let action = isAr ? 'Đối chiếu hóa đơn và đôn đốc khách hàng thanh toán.' :
    data.approvalState === 'Đã duyệt' ? 'Kiểm tra hồ sơ và ghi nhận thanh toán cho nhà cung cấp.' :
    data.approvalState === 'Chờ CEO duyệt chi' ? 'Có đề nghị thanh toán đang chờ CEO duyệt chi.' : 'Hoàn thiện hồ sơ và trình duyệt thanh toán.';
  if (!isAr && isExec && data.approvalState === 'Chờ CEO duyệt chi') action = 'Xem xét đề nghị duyệt chi trước hạn thanh toán.';
  if (data.debtStatus === 'unknown') action = 'Bổ sung và xác nhận hạn thanh toán trước khi lập kế hoạch chi.';
  if (grouped) action = 'Tách chứng từ và đối soát từng nhà cung cấp trước khi duyệt chi.';
  return { severity, typeLabel: isAr ? 'Phải thu' : 'Phải trả', subject: data.customerName || data.supplierName,
    partner: data.sku, issue: due, amount: formatMoney(data.remaining),
    deadline: data.debtStatus === 'unknown' ? 'Chưa xác định hạn' : `Hạn ${formatDate(data.dueDate)}`,
    facts: isAr ? `Đã thu ${formatMillions(data.allocatedPaid)}` : payableWorkflowStatus(data),
    action, button: grouped && role === 'Accountant' ? 'Tách chứng từ' : !isAr && isExec && data.approvalState === 'Chờ CEO duyệt chi' ? grouped ? 'Yêu cầu tách hồ sơ' : 'Xem đề nghị duyệt chi' : isAr ? 'Mở khoản phải thu' : 'Mở khoản phải trả' };
}
