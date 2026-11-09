import { DEBT_COLORS } from './chartColors.js';
import { parseBusinessDate } from './business.js';
import { getFulfillment } from './orderFulfillment.js';
import { classifyProgress, comparePriority } from './dashboardMetrics.js';

export const DELIVERY_GROUPS = [
  { id: 'delivered', label: 'Đã giao đủ', color: '#087750' },
  { id: 'partial', label: 'Giao một phần', color: '#1558C9' },
  { id: 'not_delivered', label: 'Chưa giao', color: '#65758B' },
  { id: 'unconfirmed', label: 'Chưa đủ xác nhận', color: '#7545A7' },
];
export const DELIVERY_RISKS = [
  { id: 'late', label: 'Đã trễ hạn', color: DEBT_COLORS.overdue },
  { id: 'today', label: 'Đến hạn vào ngày theo dõi', color: DEBT_COLORS.today },
  { id: 'critical', label: 'Báo động khác', color: DEBT_COLORS.unknown },
  { id: 'warning', label: 'Cần theo dõi', color: '#526782' },
];

export function deliveryRow(item, reportDate) {
  const options = { includeReceiptRisk: false };
  const progress = classifyProgress(item, reportDate, options);
  const state = getFulfillment(progress, reportDate, options);
  const confirmed = state.deliveredComplete && Boolean(parseBusinessDate(progress.actualDeliveryDate));
  const delivery = confirmed ? 'delivered' : state.orderedQty > 0 && state.deliveredQty > 0 && !state.deliveredComplete ? 'partial' : state.deliveredQty === 0 ? 'not_delivered' : 'unconfirmed';
  // Delivery confirmation and operational risks are independent dimensions.
  // A completed order can still carry an unresolved manual alert.
  const risk = !confirmed && (state.lateDeliveryDays > 0 || /^(Trễ ETD|Quá ETA)/.test(progress.alertLabel)) ? 'late' :
    !confirmed && (state.deliveryDueToday || progress.urgency === 1) ? 'today' : progress.priorityRank === 0 ? 'critical' :
    progress.priorityRank === 1 || state.tone === 'warning' ? 'warning' : 'normal';
  const deadlineReason = (risk === 'today' && state.deliveryDueToday) || (risk === 'late' && state.lateDeliveryDays > 0);
  return { item: progress, state, delivery, risk, reason: deadlineReason ? state.label : risk === 'warning' && state.tone === 'warning' && progress.priorityRank > 1 ? state.label : progress.alertLabel };
}

export function deliveryAnalytics(items, reportDate) {
  const rows = items.map(item => deliveryRow(item, reportDate));
  const groups = DELIVERY_GROUPS.map(group => ({ ...group, count: rows.filter(row => row.delivery === group.id).length }));
  const risks = DELIVERY_RISKS.map(group => ({ ...group, count: rows.filter(row => row.risk === group.id).length }));
  const attention = rows.filter(row => row.risk !== 'normal').sort((a, b) => {
    const rank = id => ({ late: 0, today: 1, critical: 2, warning: 3 })[id];
    return rank(a.risk) - rank(b.risk) || comparePriority(a.item, b.item);
  });
  return { total: rows.length, rows, groups, risks, attention };
}

export function matchesDeliveryChart(row, filter) {
  if (filter === 'all') return true;
  if (filter === 'risk:all') return row.risk !== 'normal';
  const [kind, value] = filter.split(':');
  return kind === 'delivery' ? row.delivery === value : kind === 'risk' ? row.risk === value : false;
}
