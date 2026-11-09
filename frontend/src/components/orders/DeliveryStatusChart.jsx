import { useChartEntrance } from '../../hooks/useChartEntrance.js';
import { phrase, t } from '../../locales/i18n.js';
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { formatDate } from '../../utils/dashboardMetrics.js';

export default function DeliveryStatusChart({ analytics, filter, onSelect, onOpenItem }) {
  const { total, groups, risks, attention } = analytics;
  const chartRef = useChartEntrance();
  const risksRef = useChartEntrance();
  const allUnconfirmed = total > 0 && groups.some(group => group.id === 'unconfirmed' && group.count === total);
  const selectedLabel = filter === 'risk:all' ? 'Tất cả đơn cần xử lý' : [...groups.map(g => ({ ...g, key: `delivery:${g.id}` })), ...risks.map(g => ({ ...g, key: `risk:${g.id}` }))].find(g => g.key === filter)?.label;
  return <div className="delivery-analytics">
    <section className="delivery-chart-panel" aria-label={t("Biểu đồ trạng thái giao hàng")}>
      <div className="delivery-panel-title"><h3>{t("Trạng thái giao khách")}</h3><span>{phrase('§ dòng mã hàng', total)}</span></div>
      <div className="delivery-distribution">
        <div ref={chartRef} className="delivery-donut" role="img" aria-label={groups.map(g => `${t(g.label)}: ${g.count}`).join('. ')}>
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={total ? groups.filter(g => g.count).map(g => ({ ...g, label: t(g.label) })) : [{ count: 1, color: '#e2e8f0' }]} dataKey="count" nameKey="label" innerRadius="72%" outerRadius="96%" paddingAngle={total ? 3 : 0} stroke="none" isAnimationActive={false} onClick={data => data.id && onSelect(`delivery:${data.id}`)}>
            {(total ? groups.filter(g => g.count) : [{ color: '#e2e8f0' }]).map((g, index) => <Cell key={g.id || index} fill={g.color} cursor={total ? 'pointer' : 'default'} />)}
          </Pie>{total > 0 && <Tooltip formatter={value => [phrase('§ mã hàng', value), t('Số lượng')]} contentStyle={{ borderRadius: 10, color: '#182333' }} itemStyle={{ color: '#182333' }} />}</PieChart></ResponsiveContainer>
          <div className="delivery-donut-total"><strong>{total}</strong><span>{t("mã hàng")}</span></div>
        </div>
        <div className="delivery-chart-legend">{groups.map(g => <button key={g.id} type="button" style={{ '--chart-color': g.color }}
          aria-pressed={filter === `delivery:${g.id}`} onClick={() => onSelect(`delivery:${g.id}`)}>
          <span className="chart-status-label">{t(g.label)}</span><strong className="chart-status-count">{g.count}</strong>
        </button>)}</div>
      </div>
      <p className="delivery-data-note">{allUnconfirmed && <strong>{phrase('Cả § mã hàng đều chưa đủ thông tin xác nhận giao.', total)}{' '}</strong>}{t("“Chưa giao” là số giao đã xác nhận bằng 0. Thiếu số lượng hoặc ngày xác nhận được theo dõi riêng.")}</p>
    </section>
    <section className="delivery-attention-panel" aria-label={t("Đơn hàng cần xử lý trước")}>
      <div className="delivery-panel-title"><h3>{attention.length ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} style={{ color: '#1558c9' }} />}{t("Cần xử lý trước")}</h3><button onClick={() => onSelect('risk:all')}>{phrase('§ mã hàng', attention.length)}<ChevronRight size={15} /></button></div>
      <div ref={risksRef} className="delivery-risk-bars">{risks.map(g => <button key={g.id} aria-pressed={filter === `risk:${g.id}`} onClick={() => onSelect(`risk:${g.id}`)}><span>{t(g.label)}</span><i><b style={{ width: `${total ? g.count / total * 100 : 0}%`, background: g.color }} /></i><strong style={{ color: g.count ? g.color : undefined }}>{g.count}</strong></button>)}</div>
      <div className="delivery-hot-orders">{attention.slice(0, 3).map(row => <button key={row.item.rowId} onClick={() => onOpenItem(row.item)}><div><strong>{row.item.poId}</strong><span>{t(row.item.vendorItemNo)}</span></div><div><b>{t(row.reason)}</b><span>ETD {formatDate(row.item.shipDateEtd)} · ETA {formatDate(row.item.etaDate)}</span></div><ChevronRight size={16} /></button>)}{!attention.length && <div className="delivery-no-alert"><CheckCircle2 size={20} />{t(total ? 'Không có cảnh báo trong phạm vi đang xem.' : 'Không có đơn hàng trong phạm vi đang xem.')}</div>}</div>
      {attention.length > 3 && <button className="delivery-view-alerts" onClick={() => onSelect('risk:all')}>{phrase('Xem toàn bộ § mã hàng cần xử lý', attention.length)}<ChevronRight size={15} /></button>}
    </section>
    {filter !== 'all' && <div className="delivery-selected-filter"><span>{t("Đang xem: ")}<strong>{t(selectedLabel)}</strong></span><button onClick={() => onSelect('all')}>{t("Xem tất cả trạng thái")}</button></div>}
  </div>;
}
