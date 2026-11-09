import { locale, t } from '../locales/i18n.js';
import { parseBusinessDate } from './business.js';
import { getFulfillment } from './orderFulfillment.js';
import { linkedItems } from './recordReferences.js';

export const CATEGORIES = ['Garment', 'Recycle Bag', 'Volkswagen Ipin Touch Cable'];
const DAY = 86400000;
export const sumBy = (rows, key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
export const formatMoney = value => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(value || 0) + ' VND';
export const formatMillions = value => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format((value || 0) / 1000000) + t(' tr');
export const formatDate = value => {
  const date = parseBusinessDate(value);
  return date ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : '—';
};

export function classifyDebt(record, reportDate) {
  const today = parseBusinessDate(reportDate);
  if (!today) throw new Error('Ngày theo dõi không hợp lệ.');
  const remaining = Math.max(0, Number(record.originalAmount || 0) + Number(record.adjustment || 0) - Number(record.allocatedPaid || 0));
  const due = parseBusinessDate(record.dueDate);
  const days = due ? Math.round((today - due) / DAY) : 0;
  const status = !remaining ? 'paid' : !due ? 'unknown' : days > 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming';
  const isRed = ['overdue', 'today', 'unknown'].includes(status);
  const daysUntilDue = due ? -days : null;
  const warning = status === 'upcoming' && daysUntilDue <= 7;
  const agingBucket = status === 'overdue' ? `Quá hạn ${days <= 30 ? '1–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : 'trên 90'} ngày` :
    ({ paid: 'Đã tất toán', unknown: 'Chưa xác định hạn', today: 'Đến hạn hôm nay', upcoming: 'Chưa đến hạn' })[status];
  return { ...record, remaining, overdueDays: Math.max(0, days), daysUntilDue, debtStatus: status,
    agingBucket, urgency: ({ overdue: 0, today: 1, unknown: 2, upcoming: 3, paid: 4 })[status], alertLevel: isRed ? 'Báo động đỏ' : warning ? 'Cần xử lý' : 'Đúng hạn', priorityRank: isRed ? 0 : warning ? 1 : 2,
    alertLabel: status === 'overdue' ? `Quá hạn ${days} ngày` : agingBucket };
}

export function classifyProgress(record, reportDate, { includeReceiptRisk = true } = {}) {
  const today = parseBusinessDate(reportDate);
  if (!today) throw new Error('Ngày theo dõi không hợp lệ.');
  const etd = parseBusinessDate(record.shipDateEtd);
  const eta = parseBusinessDate(record.etaDate);
  const actualShip = parseBusinessDate(record.actualShipDate);
  const actualArrival = parseBusinessDate(record.actualArrivalDate);
  const confirmedComplete = record.orderedQty > 0 && record.deliveredQty >= record.orderedQty && Boolean(parseBusinessDate(record.actualDeliveryDate));
  const notReady = !confirmedComplete && ((record.onProcessPct ?? 0) < 100 || (record.packagingPct ?? 0) < 100);
  const days = etd ? Math.round((today - etd) / DAY) : 0;
  const etaDays = eta ? Math.round((today - eta) / DAY) : 0;
  const manualPriorityRank = record.manualPriorityRank ?? record.priorityRank ?? 2;
  let priorityRank = manualPriorityRank;
  let urgency = priorityRank === 2 ? 4 : 3;
  let alertLabel = priorityRank === 0 ? (record.manualAlertReason || record.alertReason || 'Cần xử lý ngay') : priorityRank === 1 ? 'Cần theo dõi' : confirmedComplete ? 'Đã giao đủ' : 'Theo kế hoạch';
  if (!confirmedComplete && (!record.inboundOnly || etd || eta) && (!etd || !eta)) { priorityRank = 0; urgency = 2; alertLabel = 'Thiếu lịch ETD / ETA'; }
  else if (!confirmedComplete && !actualArrival && actualShip && etaDays > 0) { priorityRank = 0; urgency = 0; alertLabel = `Quá ETA ${etaDays} ngày, chờ xác nhận`; }
  else if (!actualShip && notReady && days > 0) { priorityRank = 0; urgency = 0; alertLabel = `Trễ ETD ${days} ngày`; }
  else if (!actualShip && notReady && etd && days === 0) { priorityRank = 0; urgency = 1; alertLabel = 'Đến hạn xuất vào ngày theo dõi'; }
  else if (!confirmedComplete && !actualShip && !notReady && etd && days >= 0) { priorityRank = Math.min(priorityRank, 1); alertLabel = 'Đã sẵn sàng, chưa xác nhận ngày xuất'; }
  else if (!actualShip && notReady && etd && days >= -3) { priorityRank = Math.min(priorityRank, 1); alertLabel = `ETD còn ${-days} ngày`; }
  let trackingLateDays = 0;
  if (record.orderedQty > 0 || record.expectedReceiptDate) {
    const fulfillment = getFulfillment(record, reportDate, { includeReceiptRisk });
    trackingLateDays = Math.max(includeReceiptRisk ? fulfillment.lateReceiptDays : 0, fulfillment.lateDeliveryDays);
    if (fulfillment.tone === 'critical') { priorityRank = 0; urgency = trackingLateDays > 0 ? 0 : 1; alertLabel = fulfillment.label; }
    else if (fulfillment.tone === 'warning' && priorityRank > 1) { priorityRank = 1; urgency = 3; alertLabel = fulfillment.label; }
    else if (confirmedComplete && priorityRank > 0) { priorityRank = manualPriorityRank; urgency = manualPriorityRank === 1 ? 3 : 4; alertLabel = manualPriorityRank === 1 ? record.manualAlertReason || 'Cần theo dõi thủ công' : 'Đã giao đủ'; }
  }
  return { ...record, manualPriorityRank, priorityRank, urgency, alertLabel,
    alertLevel: priorityRank === 0 ? 'Báo động đỏ' : priorityRank === 1 ? 'Cần xử lý' : 'Đúng hạn',
    overdueDays: Math.max(trackingLateDays, actualShip && !actualArrival ? Math.max(0, etaDays) : !actualShip && notReady ? Math.max(0, days) : 0) };
}

export function debtSummary(records) {
  const amount = status => sumBy(records.filter(row => row.debtStatus === status), 'remaining');
  return { total: sumBy(records, 'remaining'), overdue: amount('overdue'), today: amount('today'),
    upcoming: amount('upcoming'), unknown: amount('unknown'), due: amount('overdue') + amount('today') };
}

function averageProgress(rows, field) {
  const measured = rows.filter(row => Number.isFinite(row[field]));
  return measured.length ? Math.round(sumBy(measured, field) / measured.length) : null;
}

export function summarizeCategories(items, revenue, receivables = [], categories = CATEGORIES) {
  return categories.map(category => {
    const rows = items.filter(row => row.category === category);
    const docs = revenue.filter(row => row.category === category);
    return { category, shortLabel: category === CATEGORIES[2] ? 'VW Ipin Touch Cable' : category,
      totalItems: rows.length, redCount: rows.filter(row => row.priorityRank === 0).length,
      warningCount: rows.filter(row => row.priorityRank === 1).length,
      normalCount: rows.filter(row => row.priorityRank > 1).length,
      priorityRank: rows.some(row => row.priorityRank === 0) ? 0 : rows.some(row => row.priorityRank === 1) ? 1 : 2,
      ...revenueBreakdown(docs, receivables),
      avgOnProcess: averageProgress(rows, 'onProcessPct'),
      avgPackaging: averageProgress(rows, 'packagingPct'),
      revenue: sumBy(docs, 'netRevenue'), cashCollected: sumBy(docs, 'cashCollected'),
      receivedItems: rows.filter(row => row.nhap > 0).length, totalNhap: sumBy(rows, 'nhap'), totalBan: sumBy(rows, 'ban') };
  });
}

export function buildAlertQueue(items, receivables, payables, { includeWarnings = false } = {}) {
  const relevant = row => row.priorityRank === 0 || (includeWarnings && row.priorityRank === 1);
  const progress = items.filter(relevant).map(row => ({
    id: `order-${row.rowId}`, type: 'orders', label: row.vendorItemNo, reference: row.poId,
    partner: row.vendorName, date: row.shipDateEtd || (row.inboundOnly ? row.expectedReceiptDate : undefined), status: row.alertLabel, overdueDays: row.overdueDays, urgency: row.urgency, data: row,
  }));
  const debtAlerts = (rows, type) => rows.filter(row => relevant(row) && row.remaining > 0).map(row => ({
    id: `${type}-${row.id}`, type, label: row.customerName || row.supplierName, reference: row.docNo,
    partner: row.sku, date: row.dueDate, status: row.alertLabel, amount: row.remaining,
    overdueDays: row.overdueDays, urgency: row.urgency, data: row,
  }));
  return [...progress, ...debtAlerts(receivables, 'receivables'), ...debtAlerts(payables, 'payables')]
    .sort((a, b) => a.data.priorityRank - b.data.priorityRank || a.urgency - b.urgency || b.overdueDays - a.overdueDays || a.id.localeCompare(b.id));
}

export function debtMatchesFilter(row, filter) {
  if (filter === 'due') return ['today', 'overdue'].includes(row.debtStatus);
  if (filter === 'red') return row.priorityRank === 0;
  const near = row.debtStatus === 'upcoming' && row.priorityRank === 1;
  if (filter === 'near') return near;
  if (filter === 'future') return row.debtStatus === 'upcoming' && !near;
  if (filter === 'attention') return near || ['overdue', 'today', 'unknown'].includes(row.debtStatus);
  return filter === 'all' || row.debtStatus === filter;
}

export function matchesOrigin(record, origin, items) {
  if (origin === 'Tất cả xuất xứ') return true;
  if (record.countryOfOrigin) return record.countryOfOrigin === origin;
  return linkedItems(record, items).some(item => item.countryOfOrigin === origin);
}

export function monthlyRevenueSeries(records) {
  const actual = new Map();
  for (const record of records) {
    const date = parseBusinessDate(record.recordDate);
    if (!date) continue;
    const month = `T${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
    const previous = actual.get(month) || { month, doanhThu: 0, thucThu: 0 };
    actual.set(month, { month, doanhThu: previous.doanhThu + Number(record.netRevenue || 0) / 1000000,
      thucThu: previous.thucThu + Number(record.cashCollected || 0) / 1000000 });
  }
  const rows = [...actual.values()];
  return rows.sort((a, b) => Number(a.month.slice(-4)) - Number(b.month.slice(-4)) || Number(a.month.slice(1, 3)) - Number(b.month.slice(1, 3)));
}

export const comparePriority = (a, b) => a.priorityRank - b.priorityRank || (a.urgency ?? 3) - (b.urgency ?? 3) || (b.overdueDays || 0) - (a.overdueDays || 0);

export function revenueBreakdown(records, receivables) {
  const result = { revenueCollected: 0, revenueDue: 0, revenueUpcoming: 0, revenueUnclassified: 0 };
  for (const record of records) {
    const total = Math.max(0, Number(record.netRevenue) || 0);
    const collected = Math.min(total, Math.max(0, Number(record.cashCollected) || 0));
    const remaining = total - collected;
    const debt = receivables.find(row => row.docNo === record.docNo);
    const matched = Math.min(remaining, Math.max(0, Number(debt?.remaining) || 0));
    result.revenueCollected += collected;
    if (debt && ['overdue', 'today'].includes(debt.debtStatus)) result.revenueDue += matched;
    else if (debt?.debtStatus === 'upcoming') result.revenueUpcoming += matched;
    else result.revenueUnclassified += matched;
    result.revenueUnclassified += remaining - matched;
  }
  return result;
}

export function buildProfitabilitySeries(
  revenueRecords = [],
  items = [],
  { periodMode = 'month', annualInterestRatePct = 6.5, taxRatePct = 20, operatingCostRatePct = 8 } = {}
) {
  const itemById = new Map(items.map(item => [Number(item.rowId), item]));
  const itemByPo = new Map(items.map(item => [String(item.poId || '').trim().toUpperCase(), item]));
  const groups = new Map();

  for (const record of revenueRecords) {
    const date = parseBusinessDate(record.recordDate);
    if (!date) continue;
    const year = date.getUTCFullYear();
    const monthNum = date.getUTCMonth() + 1;
    const quarterNum = Math.floor((monthNum - 1) / 3) + 1;

    const periodKey = periodMode === 'year'
      ? `${year}`
      : periodMode === 'quarter'
        ? `Q${quarterNum}/${year}`
        : `T${String(monthNum).padStart(2, '0')}/${year}`;

    const sortKey = periodMode === 'year'
      ? year
      : periodMode === 'quarter'
        ? year * 10 + quarterNum
        : year * 100 + monthNum;

    const netRevenue = Math.max(0, Number(record.netRevenue) || 0);
    const cashCollected = Math.min(netRevenue, Math.max(0, Number(record.cashCollected) || 0));
    const uncollected = Math.max(0, netRevenue - cashCollected);

    const matchedItem = itemById.get(Number(record.poLineId)) ||
      itemByPo.get(String(record.poId || '').trim().toUpperCase());
    const shippedQty = Math.max(0, Number(record.shippedQty) || 0);
    const unitCost = Math.max(0, Number(matchedItem?.unitPriceVnd) || 0);
    const rawCogs = shippedQty > 0 && unitCost > 0 ? shippedQty * unitCost : Math.round(netRevenue * 0.62);
    const cogs = Math.min(netRevenue, rawCogs);

    const operatingCost = Math.round(netRevenue * (Math.max(0, Number(operatingCostRatePct) || 0) / 100));
    const periodFraction = periodMode === 'year' ? 1 : periodMode === 'quarter' ? 0.25 : 1 / 12;
    const workingCapitalBase = uncollected + Math.round(cogs * 0.5);
    const interestExpense = Math.round(
      workingCapitalBase * (Math.max(0, Number(annualInterestRatePct) || 0) / 100) * periodFraction
    );

    const prev = groups.get(periodKey) || {
      period: periodKey,
      sortKey,
      invoiceCount: 0,
      netRevenue: 0,
      cashCollected: 0,
      uncollected: 0,
      cogs: 0,
      operatingCost: 0,
      interestExpense: 0,
    };

    groups.set(periodKey, {
      ...prev,
      invoiceCount: prev.invoiceCount + 1,
      netRevenue: prev.netRevenue + netRevenue,
      cashCollected: prev.cashCollected + cashCollected,
      uncollected: prev.uncollected + uncollected,
      cogs: prev.cogs + cogs,
      operatingCost: prev.operatingCost + operatingCost,
      interestExpense: prev.interestExpense + interestExpense,
    });
  }

  const effectiveTaxRate = Math.min(100, Math.max(0, Number(taxRatePct) || 0)) / 100;

  const rows = [...groups.values()]
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(row => {
      const grossProfit = row.netRevenue - row.cogs;
      const profitBeforeTax = grossProfit - row.operatingCost - row.interestExpense;
      const taxAmount = profitBeforeTax > 0 ? Math.round(profitBeforeTax * effectiveTaxRate) : 0;
      const profitAfterTax = profitBeforeTax - taxAmount;
      const netMarginPct = row.netRevenue > 0 ? Math.round((profitAfterTax / row.netRevenue) * 1000) / 10 : 0;
      return {
        ...row,
        grossProfit,
        profitBeforeTax,
        taxAmount,
        profitAfterTax,
        netMarginPct,
      };
    });

  const totals = rows.reduce(
    (acc, row) => ({
      invoiceCount: acc.invoiceCount + row.invoiceCount,
      netRevenue: acc.netRevenue + row.netRevenue,
      cashCollected: acc.cashCollected + row.cashCollected,
      uncollected: acc.uncollected + row.uncollected,
      cogs: acc.cogs + row.cogs,
      grossProfit: acc.grossProfit + row.grossProfit,
      operatingCost: acc.operatingCost + row.operatingCost,
      interestExpense: acc.interestExpense + row.interestExpense,
      profitBeforeTax: acc.profitBeforeTax + row.profitBeforeTax,
      taxAmount: acc.taxAmount + row.taxAmount,
      profitAfterTax: acc.profitAfterTax + row.profitAfterTax,
    }),
    {
      invoiceCount: 0,
      netRevenue: 0,
      cashCollected: 0,
      uncollected: 0,
      cogs: 0,
      grossProfit: 0,
      operatingCost: 0,
      interestExpense: 0,
      profitBeforeTax: 0,
      taxAmount: 0,
      profitAfterTax: 0,
    }
  );

  totals.netMarginPct = totals.netRevenue > 0
    ? Math.round((totals.profitAfterTax / totals.netRevenue) * 1000) / 10
    : 0;

  return { rows, totals };
}
