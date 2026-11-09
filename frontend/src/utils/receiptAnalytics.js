import { parseBusinessDate } from './business.js';
import { getFulfillment } from './orderFulfillment.js';

const DAY = 86400000;
const WINDOW_DAYS = 7;
const GROUPS = [
  { id: 'arrived', label: 'Đã có hàng về', color: '#158269' },
  { id: 'upcoming', label: 'Sắp về kho', color: '#b45f09' },
  { id: 'recent', label: 'Mới đặt', color: '#7055ba' },
  { id: 'late', label: 'Trễ về kho', color: '#cf263b' },
  { id: 'scheduled', label: 'Còn hơn 7 ngày', color: '#1558c9' },
  { id: 'unknown', label: 'Chưa đủ thông tin', color: '#64748b' },
];

export function receiptAnalytics(items, reportDate) {
  const today = parseBusinessDate(reportDate);
  const rows = items.map(item => {
    const state = getFulfillment(item, reportDate);
    const released = parseBusinessDate(item.releasedPoDate);
    const { daysUntilReceipt, waitingForReceipt, lateReceiptDays } = state;
    const daysSinceOrder = released && today ? (today - released) / DAY : null;
    const dueSoon = waitingForReceipt && daysUntilReceipt !== null && daysUntilReceipt >= 0 && daysUntilReceipt <= WINDOW_DAYS;
    const recent = waitingForReceipt && !(state.receivedQty > 0) && daysSinceOrder !== null && daysSinceOrder >= 0 && daysSinceOrder < WINDOW_DAYS;
    const deadline = lateReceiptDays > 0 ? 'late' : dueSoon ? 'upcoming' : !recent && waitingForReceipt && daysUntilReceipt > WINDOW_DAYS ? 'scheduled' : null;
    const status = state.receivedQty > 0 ? 'arrived' : deadline || (recent ? 'recent' : 'unknown');
    return { item, state, status, deadline, daysUntilReceipt };
  });
  const groups = GROUPS.map(group => ({ ...group, count: rows.filter(row => matchesReceiptChart(row, group.id)).length }));
  const schedule = rows.filter(row => matchesReceiptChart(row, 'watch')).sort((a, b) => a.daysUntilReceipt - b.daysUntilReceipt);
  return { rows, groups, schedule, total: rows.length };
}

export function matchesReceiptChart(row, filter) {
  return filter === 'watch' ? row.deadline === 'late' || row.deadline === 'upcoming' : row.status === filter || row.deadline === filter;
}
