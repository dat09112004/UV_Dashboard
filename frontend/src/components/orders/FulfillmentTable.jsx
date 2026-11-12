import { phrase, t } from '../../locales/i18n.js';
import React, { lazy, Suspense, useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, PackageCheck, ShoppingBag, Truck, ClipboardCheck } from 'lucide-react';
import { useProgressivePagination } from '../../hooks/useProgressivePagination.js';
import { fulfillmentSummary, matchesFulfillment, formatQuantity, formatPercent } from '../../utils/orderFulfillment.js';
import ReceiptStatusChart from './ReceiptStatusChart.jsx';
import { deliveryAnalytics, matchesDeliveryChart } from '../../utils/deliveryAnalytics.js';
import { matchesReceiptChart, receiptAnalytics } from '../../utils/receiptAnalytics.js';
import { formatDate, formatMoney } from '../../utils/dashboardMetrics.js';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';
import ProgressivePaginationBar from '../common/ProgressivePaginationBar.jsx';

const DeliveryStatusChart = lazy(() => import('./DeliveryStatusChart.jsx'));

export function QuantityProgress({ label, quantity, percent, unit, tone = 'normal' }) {
  return <div className={`quantity-progress ${tone}`}><div className="quantity-progress-values"><strong>{formatQuantity(quantity)}{quantity !== null && unit && <small> {unit}</small>}</strong><b>{formatPercent(percent)}</b></div>
    {percent === null ? <div className="quantity-progress-unknown" aria-label={t(`${label}: chưa đủ dữ liệu tính tỷ lệ`)} /> : <div className="quantity-progress-track" role="progressbar" aria-label={t(label)} aria-valuenow={Math.min(100, percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, percent)}%` }} /></div>}</div>;
}

export default function FulfillmentTable({
  items, reportDate, onOpenItem, onViewAll, limit, onResetFilters,
  selectedFilter, onFilterChange, tasks = [], accounts = [], reminders = [], onRemindAlert,
}) {
  const [localFilter, setLocalFilter] = useState('all');
  const activeFilter = selectedFilter ?? localFilter;
  const setFilter = onFilterChange ?? setLocalFilter;
  const chartFilter = activeFilter.includes(':') ? activeFilter : 'all';
  const filter = chartFilter === 'all' ? activeFilter : 'all';
  const analytics = useMemo(() => deliveryAnalytics(items, reportDate), [items, reportDate]);
  const receipts = useMemo(() => receiptAnalytics(items, reportDate), [items, reportDate]);
  const toggleFilter = value => setFilter(value === activeFilter ? 'all' : value);
  const id = useId();
  const summary = useMemo(() => fulfillmentSummary(items, reportDate), [items, reportDate]);
  const chartRows = new Map(analytics.rows.map(row => [row.item.rowId, row]));
  const receiptRows = new Map(receipts.rows.map(row => [row.item.rowId, row]));
  const receiptFilter = chartFilter.startsWith('receipt:') ? chartFilter.slice('receipt:'.length) : null;
  const receiptLabels = new Map(receipts.groups.map(group => [group.id, group.label]));
  const filtered = items.filter(item => {
    const delivery = chartRows.get(item.rowId);
    if (receiptFilter) return matchesReceiptChart(receiptRows.get(item.rowId), receiptFilter);
    if (chartFilter !== 'all') return matchesDeliveryChart(delivery, chartFilter);
    if (filter === 'late') return ['late', 'today'].includes(delivery.risk);
    return matchesFulfillment(item, filter, reportDate);
  });

  // Phân trang & tải trước 1 phần + tải dần khi lướt xuống (khi không bị giới hạn limit từ Tổng quan)
  const pagination = useProgressivePagination(filtered, {
    sectionKey: 'orders-fulfillment',
    initialChunkSize: limit || 5,
    stepSize: 5,
    pageSize: limit || 10,
    resetDeps: [activeFilter, reportDate, items.length],
  });
  const visible = limit ? filtered.slice(0, limit) : pagination.visibleItems;

  const orderValue = filtered.reduce((total, item) => total + (item.totalValueVnd ?? 0), 0);
  const unconfirmedInView = filtered.filter(item => chartRows.get(item.rowId)?.delivery === 'unconfirmed').length;
  const cards = [
    ['ordered', 'PO đã phát hành', summary.released, ShoppingBag], ['arrived', 'Đã có hàng về kho', summary.arrived, PackageCheck],
    ['partial_delivery', 'Đang giao một phần', summary.partial, Truck], ['delivered', 'Đã giao đủ', summary.delivered, ClipboardCheck],
  ];
  return <section className="analytics-card fulfillment-panel">
    <div className="panel-heading"><div><h2>{t("Đặt hàng · Nhập kho · Giao khách")}</h2><p>{t("Theo dõi số lượng và tỷ lệ trên từng mã hàng")}</p>{orderValue > 0 && <p>{t("Giá trị PO")} <strong>{formatMoney(orderValue)}</strong></p>}</div>{onViewAll && <button className="text-action" onClick={() => onViewAll(activeFilter)}>{t(activeFilter === 'all' ? 'Xem tất cả' : 'Xem danh sách đã lọc')} <ArrowUpRight size={15} /></button>}</div>
    <ReceiptStatusChart analytics={receipts} reportDate={reportDate} filter={receiptFilter} onSelect={value => toggleFilter(`receipt:${value}`)} onOpenItem={onOpenItem} compact={Boolean(limit)} />
    {!limit && <section aria-labelledby={`${id}-outbound`}>
      <div className="receipt-overview-heading"><div><h3 id={`${id}-outbound`}><Truck size={19} />{t(" Hàng giao khách")}</h3><p>{t("Theo dõi tiến độ giao và đơn cần xử lý")}</p></div></div>
      <Suspense fallback={<p role="status">{t('Đang tải dữ liệu…')}</p>}>
        <DeliveryStatusChart analytics={analytics} filter={receiptFilter ? 'all' : chartFilter} onSelect={toggleFilter} onOpenItem={onOpenItem} />
      </Suspense>
    </section>}
    {limit && <div className="fulfillment-summary">{cards.map(([key, label, count, Icon]) => <button key={key} onClick={() => toggleFilter(key)} aria-pressed={filter === key}><Icon size={19} /><div><strong>{count}<small>{t(" mã hàng")}</small></strong><span>{t(label)}</span></div></button>)}</div>}
    {receiptFilter && <div className="delivery-selected-filter">
      <span>{t("Đang lọc hàng về kho · ")}<strong>{t(receiptFilter === 'watch' ? 'Lịch về kho cần theo dõi' : receiptLabels.get(receiptFilter))}</strong></span>
      <button type="button" onClick={() => setFilter('all')}>{t("Bỏ lọc hàng về kho")}</button>
    </div>}
    <div className="fulfillment-toolbar"><span>{phrase('§ mã hàng', filtered.length)}{unconfirmedInView > 0 && <small> · {phrase('§ chưa đủ xác nhận giao', unconfirmedInView)}</small>}</span><label htmlFor={id}>{t("Trạng thái")}<select id={id} aria-label={t("Lọc trạng thái nhập và giao")} value={filter} onChange={event => setFilter(event.target.value)}>
      <option value="all">{t("Tất cả trạng thái")}</option><option value="ordered">{t("PO đã phát hành")}</option><option value="arrived">{t("Đã có hàng về kho")}</option><option value="not_received">{t("Chưa có hàng về")}</option><option value="partial_receipt">{t("Hàng về một phần")}</option><option value="full_receipt">{t("Hàng về đủ")}</option><option value="partial_delivery">{t("Giao khách một phần")}</option><option value="delivered">{t("Đã giao đủ")}</option><option value="unknown_delivery">{t("Chưa xác nhận giao")}</option><option value="late">{t("Trễ / đến hạn giao")}</option><option value="missing">{t("Cần bổ sung số liệu")}</option>
    </select></label></div>
    <div className="table-scroll"><table className="fulfillment-table"><thead><tr><th>{t("PO / Mã hàng")}</th><th>{t("SL đặt")}</th><th>{t("Đã về kho / %")}</th><th>{t("Đã giao khách / %")}</th><th>{t("Lịch dự kiến")}</th><th>{t("Tiến độ giao hàng")}</th><th className="sticky-action">{t("Thao tác")}</th></tr></thead><tbody>{visible.map(item => {
      const delivery = chartRows.get(item.rowId);
      const { state } = delivery;
      const receipt = receiptRows.get(item.rowId);
      const inboundLabel = state.receivedComplete ? 'Đã về đủ' : state.remainingReceipt > 0 && state.receivedQty > 0 ? 'Về một phần' : receiptLabels.get(receipt.status);
      const inboundLate = receipt.deadline === 'late';
      const statusTone = delivery.item.priorityRank === 0 ? 'critical' : state.tone;
      const statusLabel = delivery.item.priorityRank === 0 ? delivery.item.alertLabel : state.label;
      const alertObj = { id: `order-${item.rowId}`, type: 'orders', reference: item.poId, label: item.vendorItemNo, status: item.alertLabel, data: item };
      return <tr key={item.rowId} className={state.tone}><td><button className="order-cell" onClick={() => onOpenItem(item)}><strong>{item.poId}</strong><span>{t(item.vendorItemNo)}</span></button><span className="fulfillment-category">{item.category}</span>{item.priorityRank === 0 && (
        <>
          <span className="source-risk-label">{t(item.alertLabel)}</span>
          <AlertAssignmentLine
            alertRef={{ id: alertObj.id, type: 'orders', reference: item.poId }}
            tasks={tasks}
            accounts={accounts}
            reminders={reminders}
            canRemind={Boolean(onRemindAlert)}
            onRemind={() => onRemindAlert?.(alertObj)}
            compact={true}
          />
        </>
      )}</td>
        <td className="ordered-quantity"><strong>{formatQuantity(state.orderedQty)}</strong><span>{t(item.unit || 'Chưa có ĐVT')}</span><small>PO: {formatDate(item.releasedPoDate)}</small>{item.totalValueVnd != null && <small>{formatMoney(item.totalValueVnd)}</small>}</td>
        <td><QuantityProgress label={t(`Hàng về ${item.poId}`)} quantity={state.receivedQty} percent={state.receivedPct} unit={item.unit} tone={inboundLate ? 'critical' : state.receivedPct === null ? 'neutral' : 'normal'} />{state.receivedQty === null && <small className="unconfirmed-label">{t("Chưa xác nhận nhập kho")}</small>}
          <small className={`remaining-quantity${inboundLate ? ' receipt-late' : ''}`}>{t(inboundLate ? (state.receivedQty === null ? `Quá hạn nhận hàng ${-receipt.daysUntilReceipt} ngày` : `Trễ về kho ${-receipt.daysUntilReceipt} ngày`) : inboundLabel)}{t(state.remainingReceipt > 0 && ` · Còn về ${formatQuantity(state.remainingReceipt)} ${item.unit}`)}</small></td>
        <td><QuantityProgress label={t(`Giao khách ${item.poId}`)} quantity={state.deliveredQty} percent={state.deliveredPct} unit={item.unit} tone={state.tone} />{state.deliveredQty === null && <small className="unconfirmed-label">{t("Chưa xác nhận")}</small>}</td>
        <td className="fulfillment-dates"><span>{t("Về kho: ")}<strong>{formatDate(item.expectedReceiptDate)}</strong></span><span>{t('Giao (ETA): ')}<strong>{formatDate(item.etaDate)}</strong></span>{item.actualDeliveryDate && <span>{t("Giao gần nhất: ")}<strong>{formatDate(item.actualDeliveryDate)}</strong></span>}</td>
        <td><span className={`fulfillment-status ${statusTone}`}>{t(statusLabel)}</span>{statusLabel !== state.label && <small className="remaining-quantity">{t(state.label)}</small>}{state.remainingDelivery !== null && <small className="remaining-quantity">{t("Còn giao ")}{formatQuantity(state.remainingDelivery)} {item.unit}</small>}</td>
        <td className="sticky-action"><button className="row-detail-button" onClick={() => onOpenItem(item)} aria-label={t(`Chi tiết nhập giao ${item.poId}`)}><span>{t("Chi tiết")}</span><ChevronRight size={16} /></button></td></tr>;
    })}{!visible.length && <tr><td colSpan={7} className="empty-table">{t("Không có mã hàng phù hợp. ")}{(activeFilter !== 'all' || onResetFilters) && <button onClick={() => { setFilter('all'); onResetFilters?.(); }}>{t("Xóa bộ lọc")}</button>}</td></tr>}</tbody></table></div>
    {!limit && <ProgressivePaginationBar pagination={pagination} itemUnit="mã hàng" />}
    <div className="fulfillment-footnote"><span>{t("Tỷ lệ = số lượng thực tế / SL đặt. “—”: chưa đủ dữ liệu.")}</span>{limit && filtered.length > limit && <button className="text-action" onClick={() => onViewAll(activeFilter)}>{phrase('Xem § mã hàng', filtered.length)}<ChevronRight size={14} /></button>}</div>
  </section>;
}
