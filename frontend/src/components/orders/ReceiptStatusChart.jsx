import { useChartEntrance } from '../../hooks/useChartEntrance.js';
import { phrase, t } from '../../locales/i18n.js';
import React from 'react';
import { CalendarDays, ChevronRight, PackageCheck } from 'lucide-react';
import { formatDate } from '../../utils/dashboardMetrics.js';
import { formatQuantity } from '../../utils/orderFulfillment.js';

export default function ReceiptStatusChart({ analytics, reportDate, filter, onSelect, onOpenItem, compact }) {
  const { groups, total, schedule } = analytics;
  const chartRef = useChartEntrance();
  return <section className="receipt-overview" aria-label={t("Theo dõi hàng về kho")}>
    <div className="receipt-overview-heading">
      <div><h3><PackageCheck size={19} />{t(" Hàng về kho")}</h3><p>{t("Ngày theo dõi ")}{formatDate(reportDate)}</p></div>
      <span>{phrase('§ dòng mã hàng', total)}</span>
    </div>
    <div className={`receipt-overview-grid${compact ? ' is-compact' : ''}`}>
      <div ref={chartRef} className="receipt-chart" aria-label={t("Biểu đồ trạng thái hàng về kho")}>
        {groups.map(group => <button type="button" key={group.id} className="receipt-chart-row"
          style={{ '--chart-color': group.id === 'late' && !group.count ? '#64748b' : group.color }}
          aria-pressed={filter === group.id} onClick={() => onSelect(group.id)}>
          <span className="chart-status-label">{t(group.label)}</span>
          <span className="receipt-chart-track" aria-hidden="true"><i style={{ width: `${total ? group.count / total * 100 : 0}%` }} /></span>
          <strong className="chart-status-count">{group.count}</strong>
        </button>)}
        <p className="receipt-chart-note">{t("Sắp về tính từ ngày theo dõi đến 7 ngày sau. Mới đặt gồm PO phát hành trong 7 ngày tính đến ngày theo dõi, chưa có hàng về và chưa thuộc nhóm sắp về hoặc trễ. Hàng về một phần có thể xuất hiện trong cả nhóm đã có hàng về và nhóm theo hạn của phần còn thiếu.")}</p>
      </div>
      {!compact && <div className="receipt-schedule">
        <div className="delivery-panel-title">
          <h4><CalendarDays size={17} />{t(" Lịch về kho cần theo dõi")}</h4>
          {schedule.length > 0 && <button type="button" aria-pressed={filter === 'watch'} onClick={() => onSelect('watch')}>{phrase('Lọc § mã hàng', schedule.length)}<ChevronRight size={15} /></button>}
        </div>
        {schedule.length > 0 && <p className="receipt-chart-note">{t("Bao gồm phần hàng còn thiếu của các PO đã về một phần.")}</p>}
        {schedule.length ? <div className="delivery-hot-orders">
          {schedule.slice(0, 4).map(({ item, state, daysUntilReceipt }) => <button type="button" key={item.rowId} onClick={() => onOpenItem(item)}>
            <div><strong>{item.poId}</strong><span>{t(item.vendorItemNo)}</span></div>
            <div><b className={daysUntilReceipt < 0 ? 'receipt-late' : 'receipt-on-schedule'}>{t(daysUntilReceipt < 0 ? (state.receivedQty === null ? `Quá hạn nhận hàng ${-daysUntilReceipt} ngày` : `Trễ ${-daysUntilReceipt} ngày`) : daysUntilReceipt === 0 ? 'Dự kiến về vào ngày theo dõi' : `Còn ${daysUntilReceipt} ngày`)}</b>
              <span>{formatDate(item.expectedReceiptDate)}{t(state.remainingReceipt !== null && ` · Còn về ${formatQuantity(state.remainingReceipt)} ${item.unit}`)}</span></div>
            <ChevronRight size={16} />
          </button>)}
        </div> : <p className="receipt-schedule-empty">{t(total ? 'Chưa có lịch về kho trong 7 ngày tới hoặc đã trễ ở phạm vi này. Mở chi tiết PO để cập nhật ngày dự kiến về kho.' : 'Không có mã hàng trong phạm vi đang xem.')}</p>}
      </div>}
    </div>
  </section>;
}
