import { phrase, t } from '../../locales/i18n.js';
import React, { lazy, Suspense, useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, PackageCheck, ShoppingBag, Truck, ClipboardCheck, FileText } from 'lucide-react';
import { useProgressivePagination } from '../../hooks/useProgressivePagination.js';
import { fulfillmentSummary, matchesFulfillment, formatQuantity, formatPercent } from '../../utils/orderFulfillment.js';
import ReceiptStatusChart from './ReceiptStatusChart.jsx';
import { deliveryAnalytics, matchesDeliveryChart } from '../../utils/deliveryAnalytics.js';
import { matchesReceiptChart, receiptAnalytics } from '../../utils/receiptAnalytics.js';
import { formatDate, formatMoney } from '../../utils/dashboardMetrics.js';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';
import ProgressivePaginationBar from '../common/ProgressivePaginationBar.jsx';

const DeliveryStatusChart = lazy(() => import('./DeliveryStatusChart.jsx'));

// Chức năng: Thành phần giao diện (React Component QuantityProgress) hiển thị và xử lý tương tác người dùng trong FulfillmentTable.jsx
export function QuantityProgress({ label, quantity, percent, unit, tone = 'normal' }) {
  return <div className={`quantity-progress ${tone}`}><div className="quantity-progress-values"><strong>{formatQuantity(quantity)}{quantity !== null && unit && <small> {unit}</small>}</strong><b>{formatPercent(percent)}</b></div>
    {percent === null ? <div className="quantity-progress-unknown" aria-label={t(`${label}: chưa đủ dữ liệu tính tỷ lệ`)} /> : <div className="quantity-progress-track" role="progressbar" aria-label={t(label)} aria-valuenow={Math.min(100, percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, percent)}%` }} /></div>}</div>;
}

// Chức năng: Bảng danh sách theo dõi tiến độ đơn hàng (PO): hỗ trợ tách riêng 2 bản Nhập hàng (inbound) và Giao hàng đi (outbound), hoặc gộp (all) trên Tổng quan
export default function FulfillmentTable({
  items, reportDate, onOpenItem, onViewAll, limit, onResetFilters,
  selectedFilter, onFilterChange, tasks = [], accounts = [], reminders = [], onRemindAlert,
  mode = 'all', deliveries = [], currentUser = null,
}) {
  const [localFilter, setLocalFilter] = useState('all');
  const activeFilter = selectedFilter ?? localFilter;
  const setFilter = onFilterChange ?? setLocalFilter;
  const chartFilter = activeFilter.includes(':') ? activeFilter : 'all';
  const filter = chartFilter === 'all' ? activeFilter : 'all';
  const isInbound = mode === 'inbound';
  const isOutbound = mode === 'outbound';
  const analytics = useMemo(() => deliveryAnalytics(items, reportDate), [items, reportDate]);
  const receipts = useMemo(() => receiptAnalytics(items, reportDate), [items, reportDate]);
  // Chức năng: Xử lý nghiệp vụ (toggleFilter - Filter) phục vụ xử lý dữ liệu trong FulfillmentTable.jsx
  const toggleFilter = value => setFilter(value === activeFilter ? 'all' : value);
  const id = useId();
  const summary = useMemo(() => fulfillmentSummary(items, reportDate), [items, reportDate]);
  const chartRows = new Map(analytics.rows.map(row => [row.item.rowId, row]));
  const receiptRows = new Map(receipts.rows.map(row => [row.item.rowId, row]));
  const itemsByRowId = useMemo(() => new Map(items.map(item => [Number(item.rowId), item])), [items]);
  const receiptFilter = chartFilter.startsWith('receipt:') ? chartFilter.slice('receipt:'.length) : null;
  const receiptLabels = new Map(receipts.groups.map(group => [group.id, group.label]));
  const filtered = items.filter(item => {
    const delivery = chartRows.get(item.rowId);
    const receipt = receiptRows.get(item.rowId);
    if (receiptFilter) return matchesReceiptChart(receipt, receiptFilter);
    if (chartFilter !== 'all') return matchesDeliveryChart(delivery, chartFilter);
    if (filter === 'late_inbound') return receipt?.deadline === 'late';
    if (filter === 'late') return ['late', 'today'].includes(delivery.risk);
    return matchesFulfillment(item, filter, reportDate);
  });

  // Phân trang & tải trước 1 phần + tải dần khi lướt xuống (khi không bị giới hạn limit từ Tổng quan)
  const pagination = useProgressivePagination(filtered, {
    sectionKey: `orders-fulfillment-${mode}`,
    initialChunkSize: limit || 5,
    stepSize: 5,
    pageSize: limit || 10,
    resetDeps: [mode, activeFilter, reportDate, items.length],
  });
  const visible = limit ? filtered.slice(0, limit) : pagination.visibleItems;

  const deliveryPagination = useProgressivePagination(deliveries, {
    sectionKey: 'orders-outbound-deliveries',
    initialChunkSize: 8,
    stepSize: 8,
    pageSize: 15,
    resetDeps: [deliveries.length, reportDate],
  });

  const orderValue = filtered.reduce((total, item) => total + (item.totalValueVnd ?? 0), 0);
  const outboundValue = deliveries.reduce((total, d) => total + (Number(d.totalSaleAmountVnd) || 0), 0);
  const unconfirmedInView = filtered.filter(item => chartRows.get(item.rowId)?.delivery === 'unconfirmed').length;
  const cards = [
    ['ordered', 'PO đã phát hành', summary.released, ShoppingBag], ['arrived', 'Đã có hàng về kho', summary.arrived, PackageCheck],
    ['partial_delivery', 'Đang giao một phần', summary.partial, Truck], ['delivered', 'Đã giao đủ', summary.delivered, ClipboardCheck],
  ];

  const headingTitle = isInbound
    ? 'Đơn hàng nhập kho (Nhập hàng)'
    : isOutbound
      ? 'Đơn giao hàng đi (Giao khách)'
      : 'Đặt hàng · Nhập kho · Giao khách';
  const headingSubtitle = isInbound
    ? 'Theo dõi đặt hàng PO, số lượng về kho và lịch nhập hàng từ nhà cung cấp'
    : isOutbound
      ? 'Theo dõi tiến độ giao khách theo mã hàng và danh sách phiếu giao hàng đi'
      : 'Theo dõi số lượng và tỷ lệ trên từng mã hàng';

  return <section className="analytics-card fulfillment-panel">
    <div className="panel-heading">
      <div>
        <h2>{t(headingTitle)}</h2>
        <p>{t(headingSubtitle)}</p>
        {!isOutbound && orderValue > 0 && <p>{t("Giá trị PO nhập")} <strong>{formatMoney(orderValue)}</strong></p>}
        {isOutbound && outboundValue > 0 && <p>{t("Tổng giá trị phiếu giao đi")} <strong>{formatMoney(outboundValue)}</strong></p>}
      </div>
      {onViewAll && <button className="text-action" onClick={() => onViewAll(activeFilter)}>{t(activeFilter === 'all' ? 'Xem tất cả' : 'Xem danh sách đã lọc')} <ArrowUpRight size={15} /></button>}
    </div>

    {!isOutbound && (
      <ReceiptStatusChart analytics={receipts} reportDate={reportDate} filter={receiptFilter} onSelect={value => toggleFilter(`receipt:${value}`)} onOpenItem={onOpenItem} compact={Boolean(limit)} />
    )}

    {!limit && !isInbound && <section aria-labelledby={`${id}-outbound`}>
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

    <div className="fulfillment-toolbar">
      <span>
        {phrase('§ mã hàng', filtered.length)}
        {!isInbound && unconfirmedInView > 0 && <small> · {phrase('§ chưa đủ xác nhận giao', unconfirmedInView)}</small>}
      </span>
      <label htmlFor={id}>{t("Trạng thái")}<select id={id} aria-label={t(isInbound ? "Lọc trạng thái nhập hàng" : isOutbound ? "Lọc trạng thái giao hàng đi" : "Lọc trạng thái nhập và giao")} value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">{t("Tất cả trạng thái")}</option>
        {!isOutbound && <>
          <option value="ordered">{t("PO đã phát hành")}</option>
          <option value="arrived">{t("Đã có hàng về kho")}</option>
          <option value="not_received">{t("Chưa có hàng về")}</option>
          <option value="partial_receipt">{t("Hàng về một phần")}</option>
          <option value="full_receipt">{t("Hàng về đủ")}</option>
          {isInbound && <option value="late_inbound">{t("Trễ lịch về kho")}</option>}
        </>}
        {!isInbound && <>
          <option value="partial_delivery">{t("Giao khách một phần")}</option>
          <option value="delivered">{t("Đã giao đủ")}</option>
          <option value="unknown_delivery">{t("Chưa xác nhận giao")}</option>
          <option value="late">{t("Trễ / đến hạn giao")}</option>
        </>}
        <option value="missing">{t("Cần bổ sung số liệu")}</option>
      </select></label>
    </div>

    <div className="table-scroll">
      <table className="fulfillment-table">
        <thead>
          <tr>
            <th>{t("PO / Mã hàng")}</th>
            <th>{t(isOutbound ? "SL đặt / Tồn sẵn giao" : "SL đặt")}</th>
            {!isOutbound && <th>{t("Đã về kho / %")}</th>}
            {!isInbound && <th>{t("Đã giao khách / %")}</th>}
            <th>{t(isInbound ? "Lịch về kho" : isOutbound ? "Lịch giao dự kiến" : "Lịch dự kiến")}</th>
            <th>{t(isInbound ? "Trạng thái nhập hàng" : "Tiến độ giao hàng")}</th>
            <th className="sticky-action">{t("Thao tác")}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(item => {
            const delivery = chartRows.get(item.rowId);
            const { state } = delivery;
            const receipt = receiptRows.get(item.rowId);
            const inboundLabel = state.receivedComplete ? 'Đã về đủ' : state.remainingReceipt > 0 && state.receivedQty > 0 ? 'Về một phần' : receiptLabels.get(receipt.status);
            const inboundLate = receipt.deadline === 'late';
            const inboundTone = inboundLate ? 'critical' : state.receivedComplete ? 'done' : state.receivedQty > 0 ? 'progress' : 'neutral';
            const statusTone = delivery.item.priorityRank === 0 ? 'critical' : state.tone;
            const statusLabel = delivery.item.priorityRank === 0 ? delivery.item.alertLabel : state.label;
            const alertObj = { id: `order-${item.rowId}`, type: 'orders', reference: item.poId, label: item.vendorItemNo, status: item.alertLabel, data: item };
            const isSaleOwned = item.ownerType === 'sale_self_owned' || item.createdByRole === 'Sale';
            const availableToDeliver = Math.max(0, Number(item.tonDau || 0) + Number(item.nhap || 0) - Number(item.deliveredQty || 0));

            return <tr key={item.rowId} className={isInbound ? inboundTone : state.tone}>
              <td>
                <button className="order-cell" onClick={() => onOpenItem(item)}><strong>{item.poId}</strong><span>{t(item.vendorItemNo)}</span></button>
                <span className="fulfillment-category">
                  {isInbound && item.vendorName ? `${t(item.vendorName)} · ` : ''}
                  {isOutbound && item.customerName ? `${t('KH')}: ${item.customerName} · ` : ''}
                  {item.category}
                  {!isOutbound && (item.onProcessPct != null || item.packagingPct != null) ? ` · SX: ${formatPercent(item.onProcessPct ?? 0)} · ĐG: ${formatPercent(item.packagingPct ?? 0)}` : ''}
                </span>
                {(isSaleOwned || item.assignedSaleName) && item.priorityRank !== 0 && (
                  <small className="block text-[11px] italic text-emerald-800 mt-0.5">
                    {item.ownerType === 'transferred' ? t('Sale phụ trách:') : t('Sale tạo & đảm nhận:')} {item.assignedSaleName || item.createdByName || 'Phòng Sale'}
                  </small>
                )}
                {item.pendingTransfer && (
                  <small className="block text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1">
                    {currentUser && String(currentUser.id) === String(item.pendingTransfer.toUserId)
                      ? `${t('Yêu cầu nhận đơn từ')} ${item.pendingTransfer.requestedByName} — ${t('Bấm Chi tiết để đồng ý')}`
                      : `${t('Chờ')} ${item.pendingTransfer.toUserName} ${t('đồng ý nhận đơn')}`}
                  </small>
                )}
                {item.priorityRank === 0 && (
                  <>
                    <span className="source-risk-label">{t(item.alertLabel)}</span>
                    <AlertAssignmentLine
                      alertRef={{ id: alertObj.id, type: 'orders', reference: item.poId, data: item }}
                      tasks={tasks}
                      accounts={accounts}
                      reminders={reminders}
                      canRemind={Boolean(onRemindAlert)}
                      onRemind={() => onRemindAlert?.(alertObj)}
                      compact={true}
                    />
                  </>
                )}
              </td>

              <td className="ordered-quantity">
                <strong>{formatQuantity(state.orderedQty)}</strong>
                <span>{t(item.unit || 'Chưa có ĐVT')}</span>
                {isOutbound ? (
                  <>
                    <small>{t("Đã về kho: ")}{formatQuantity(state.receivedQty ?? 0)} {item.unit}</small>
                    <small>{t("Sẵn giao: ")}{formatQuantity(availableToDeliver)} {item.unit}</small>
                  </>
                ) : (
                  <>
                    <small>PO: {formatDate(item.releasedPoDate)}</small>
                    {item.totalValueVnd != null && <small>{formatMoney(item.totalValueVnd)}</small>}
                  </>
                )}
              </td>

              {!isOutbound && (
                <td>
                  <QuantityProgress label={t(`Hàng về ${item.poId}`)} quantity={state.receivedQty} percent={state.receivedPct} unit={item.unit} tone={inboundLate ? 'critical' : state.receivedPct === null ? 'neutral' : 'normal'} />
                  {state.receivedQty === null && <small className="unconfirmed-label">{t("Chưa xác nhận nhập kho")}</small>}
                  <small className={`remaining-quantity${inboundLate ? ' receipt-late' : ''}`}>{t(inboundLate ? (state.receivedQty === null ? `Quá hạn nhận hàng ${-receipt.daysUntilReceipt} ngày` : `Trễ về kho ${-receipt.daysUntilReceipt} ngày`) : inboundLabel)}{t(state.remainingReceipt > 0 && ` · Còn về ${formatQuantity(state.remainingReceipt)} ${item.unit}`)}</small>
                </td>
              )}

              {!isInbound && (
                <td>
                  <QuantityProgress label={t(`Giao khách ${item.poId}`)} quantity={state.deliveredQty} percent={state.deliveredPct} unit={item.unit} tone={state.tone} />
                  {state.deliveredQty === null && <small className="unconfirmed-label">{t("Chưa xác nhận")}</small>}
                  {item.actualDeliveryDate && <small className="remaining-quantity">{t("Giao xác nhận: ")}{formatDate(item.actualDeliveryDate)}</small>}
                </td>
              )}

              <td className="fulfillment-dates">
                {isInbound ? (
                  <>
                    <span>{t("Phát hành PO: ")}<strong>{formatDate(item.releasedPoDate)}</strong></span>
                    <span>{t("Dự kiến về kho: ")}<strong>{formatDate(item.expectedReceiptDate)}</strong></span>
                  </>
                ) : isOutbound ? (
                  <>
                    {item.shipDateEtd && <span>{t("Dự kiến xuất (ETD): ")}<strong>{formatDate(item.shipDateEtd)}</strong></span>}
                    <span>{t('Dự kiến đến (ETA): ')}<strong>{formatDate(item.etaDate)}</strong></span>
                    {item.actualDeliveryDate && <span>{t("Giao gần nhất: ")}<strong>{formatDate(item.actualDeliveryDate)}</strong></span>}
                  </>
                ) : (
                  <>
                    <span>{t("Về kho: ")}<strong>{formatDate(item.expectedReceiptDate)}</strong></span>
                    {item.shipDateEtd && <span>{t("Dự kiến xuất (ETD): ")}<strong>{formatDate(item.shipDateEtd)}</strong></span>}
                    <span>{t('Dự kiến đến (ETA): ')}<strong>{formatDate(item.etaDate)}</strong></span>
                    {item.actualDeliveryDate && <span>{t("Giao gần nhất: ")}<strong>{formatDate(item.actualDeliveryDate)}</strong></span>}
                  </>
                )}
              </td>

              <td>
                {isInbound ? (
                  <>
                    <span className={`fulfillment-status ${inboundTone}`}>{t(inboundLate ? (state.receivedQty === null ? `Quá hạn nhận hàng ${-receipt.daysUntilReceipt} ngày` : `Trễ về kho ${-receipt.daysUntilReceipt} ngày`) : inboundLabel)}</span>
                    {state.remainingReceipt > 0 && <small className="remaining-quantity">{t("Còn về ")}{formatQuantity(state.remainingReceipt)} {item.unit}</small>}
                  </>
                ) : (
                  <>
                    <span className={`fulfillment-status ${statusTone}`}>{t(statusLabel)}</span>
                    {statusLabel !== state.label && <small className="remaining-quantity">{t(state.label)}</small>}
                    {state.remainingDelivery !== null && <small className="remaining-quantity">{t("Còn giao ")}{formatQuantity(state.remainingDelivery)} {item.unit}</small>}
                  </>
                )}
              </td>

              <td className="sticky-action">
                <button className="row-detail-button" onClick={() => onOpenItem(item)} aria-label={t(`Chi tiết nhập giao ${item.poId}`)}>
                  <span>{t("Chi tiết")}</span><ChevronRight size={16} />
                </button>
              </td>
            </tr>;
          })}
          {!visible.length && <tr><td colSpan={isInbound || isOutbound ? 6 : 7} className="empty-table">{t("Không có mã hàng phù hợp. ")}{(activeFilter !== 'all' || onResetFilters) && <button onClick={() => { setFilter('all'); onResetFilters?.(); }}>{t("Xóa bộ lọc")}</button>}</td></tr>}
        </tbody>
      </table>
    </div>
    {!limit && <ProgressivePaginationBar pagination={pagination} itemUnit="mã hàng" />}

    {isOutbound && !limit && (
      <section className="mt-6 pt-5 border-t border-slate-200" aria-labelledby={`${id}-delivery-docs`}>
        <div className="receipt-overview-heading">
          <div>
            <h3 id={`${id}-delivery-docs`}><FileText size={18} />{t(" Danh sách phiếu giao hàng đi (Chứng từ giao khách)")}</h3>
            <p>{t("Mỗi phiếu giao hàng đi được lập từ tồn kho PO và tự động liên kết với Công nợ phải thu (AR)")}</p>
          </div>
          <span className="text-xs font-semibold text-slate-600">{phrase('§ phiếu giao', deliveries.length)}</span>
        </div>
        <div className="table-scroll">
          <table className="fulfillment-table">
            <thead>
              <tr>
                <th>{t("Mã phiếu giao")}</th>
                <th>{t("Mã PO")}</th>
                <th>{t("Khách hàng")}</th>
                <th>{t("SL giao")}</th>
                <th>{t("Đơn giá bán / Thành tiền")}</th>
                <th>{t("Ngày giao / Hạn TT")}</th>
                <th>{t("Công nợ phải thu (AR)")}</th>
                <th className="sticky-action">{t("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {deliveryPagination.visibleItems.map(doc => {
                const linkedItem = itemsByRowId.get(Number(doc.poRowId));
                return <tr key={doc.id}>
                  <td><strong>{doc.deliveryNo}</strong>{doc.note && <small className="remaining-quantity">{doc.note}</small>}</td>
                  <td><strong>{doc.poId}</strong>{linkedItem && <small className="remaining-quantity">{t(linkedItem.vendorItemNo)}</small>}</td>
                  <td><strong>{doc.customerName}</strong>{doc.createdByName && <small className="remaining-quantity">{t("Lập bởi:")} {doc.createdByName}</small>}</td>
                  <td><strong>{formatQuantity(doc.deliveredQty)}</strong> {linkedItem?.unit && <small>{linkedItem.unit}</small>}</td>
                  <td>
                    <strong>{doc.totalSaleAmountVnd != null ? formatMoney(doc.totalSaleAmountVnd) : '—'}</strong>
                    {doc.saleUnitPriceVnd != null && <small className="remaining-quantity">{formatMoney(doc.saleUnitPriceVnd)} / {linkedItem?.unit || t('đv')}</small>}
                  </td>
                  <td className="fulfillment-dates">
                    <span>{t("Ngày giao: ")}<strong>{formatDate(doc.deliveryDate)}</strong></span>
                    {doc.dueDate && <span>{t("Hạn TT: ")}<strong>{formatDate(doc.dueDate)}</strong></span>}
                  </td>
                  <td>{doc.arDocNo ? <span className="fulfillment-status done">{doc.arDocNo}</span> : <span className="remaining-quantity">—</span>}</td>
                  <td className="sticky-action">
                    {linkedItem ? (
                      <button className="row-detail-button" onClick={() => onOpenItem(linkedItem)}>
                        <span>{t("Xem PO")}</span><ChevronRight size={16} />
                      </button>
                    ) : <span>—</span>}
                  </td>
                </tr>;
              })}
              {!deliveryPagination.visibleItems.length && (
                <tr>
                  <td colSpan={8} className="empty-table">
                    {t("Chưa có phiếu giao hàng đi nào. Vào mục Nhập liệu → Đơn giao hàng đi để tạo phiếu giao cho khách hàng.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {deliveries.length > 0 && <ProgressivePaginationBar pagination={deliveryPagination} itemUnit="phiếu giao" />}
      </section>
    )}

    <div className="fulfillment-footnote"><span>{t("Tỷ lệ = số lượng thực tế / SL đặt. “—”: chưa đủ dữ liệu.")}</span>{limit && filtered.length > limit && <button className="text-action" onClick={() => onViewAll(activeFilter)}>{phrase('Xem § mã hàng', filtered.length)}<ChevronRight size={14} /></button>}</div>
  </section>;
}
