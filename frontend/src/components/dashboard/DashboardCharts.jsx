import { useChartEntrance } from '../../hooks/useChartEntrance.js';
import { getLanguage, locale, phrase, t } from '../../locales/i18n.js';
import React, { useId, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LabelList } from 'recharts';
import { ChevronRight, AlertTriangle, Wallet } from 'lucide-react';
import { formatPercent } from '../../utils/orderFulfillment.js';
import { formatMillions, formatMoney, buildProfitabilitySeries } from '../../utils/dashboardMetrics.js';
import { SERIES_COLORS } from '../../utils/dashboardPresentation.js';
import { DEBT_COLORS } from '../../utils/chartColors.js';

const tick = { fontSize: 12, fill: '#516478' };
const tooltipStyle = { borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 13, color: '#102a43', boxShadow: '0 12px 30px #102a4320' };
const number = value => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value || 0);
export const ChartLegend = ({ items }) => <div className="chart-legend">{items.map(([label, color]) => <span key={label}><i style={{ background: color }} />{t(label)}</span>)}</div>;

function IndustryTick({ x, y, payload }) {
  const lines = payload.value === 'VW Ipin Touch Cable' ? ['VW Ipin', 'Touch Cable'] : [payload.value];
  return <text x={x} y={y + 11} textAnchor="middle" fill="#40566c" fontSize={11} fontWeight={550}>{lines.map((line, i) => <tspan key={line} x={x} dy={i ? 13 : 0}>{line}</tspan>)}</text>;
}

export function CategoryProgressChart({ stats }) {
  const id = useId().replaceAll(':', '');
  const chartRef = useChartEntrance();
  if (!stats.some(row => row.avgOnProcess !== null || row.avgPackaging !== null)) return <p className="revenue-chart-empty">{t('Chưa có số liệu sản xuất hoặc đóng gói.')}</p>;
  return <div className="progress-chart-content">
    <div ref={chartRef} className="category-plot" role="img" aria-label={t(`Sản xuất và đóng gói theo ngành hàng. ${stats.map(row => phrase('§: sản xuất §, đóng gói §, § báo động đỏ, § cần theo dõi', row.category, formatPercent(row.avgOnProcess), formatPercent(row.avgPackaging), row.redCount, row.warningCount || 0)).join('. ')}`)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stats} margin={{ top: 28, right: 5, left: -18, bottom: 15 }} barGap={7}>
          <defs><pattern id={`${id}-packaging`} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill={SERIES_COLORS.packaging} /><path d="M0 6L6 0" stroke="#fff" strokeWidth="2" opacity=".4" /></pattern></defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#dfe7ef" />
          <XAxis dataKey="shortLabel" tick={<IndustryTick />} height={42} axisLine={false} tickLine={false} interval={0} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={tick} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload ? phrase('§ · § đỏ, § theo dõi', payload[0].payload.category, payload[0].payload.redCount, payload[0].payload.warningCount || 0) : ''} formatter={(value, name) => [`${value}%`, name]} contentStyle={tooltipStyle} itemStyle={{ color: '#25354e' }} cursor={{ fill: '#f1f5f9' }} />
          <Bar name={t("Sản xuất")} dataKey="avgOnProcess" fill={SERIES_COLORS.production} radius={[5, 5, 0, 0]} maxBarSize={38} isAnimationActive={false}>
            <LabelList position="top" formatter={value => value == null ? '' : formatPercent(value)} fill="#172f46" fontSize={12} fontWeight={700} />
          </Bar>
          <Bar name={t("Đóng gói")} dataKey="avgPackaging" fill={`url(#${id}-packaging)`} radius={[5, 5, 0, 0]} maxBarSize={38} isAnimationActive={false}>
            <LabelList position="top" formatter={value => value == null ? '' : formatPercent(value)} fill="#172f46" fontSize={12} fontWeight={700} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="progress-series-key"><span><i className="solid-key" />{t("Sản xuất")}</span><span><i className="striped-key" />{t("Đóng gói")}</span></div>
    <div className="category-risk-list">{stats.filter(row => row.totalItems > 0).map(row => <div key={row.category} className="category-risk-row"><strong>{row.category}</strong><div className="category-risk-badges">{row.redCount > 0 && <span className="risk-count critical">{row.redCount}{t(" báo động")}</span>}{row.warningCount > 0 && <span className="risk-count warning">{row.warningCount}{t(" theo dõi")}</span>}{!row.redCount && !row.warningCount && <span className="risk-count normal">{t("Theo kế hoạch")}</span>}</div></div>)}</div>
  </div>;
}

const industryRevenueSeries = [
  ['Thực thu', SERIES_COLORS.collected, 'revenueCollected'],
  ['Đến hạn / quá hạn', DEBT_COLORS.overdue, 'revenueDue'],
  ['Chưa đến hạn', SERIES_COLORS.upcoming, 'revenueUpcoming'],
  ['Chưa phân loại', SERIES_COLORS.neutral, 'revenueUnclassified'],
];
const monthlyRevenueSeries = [
  ['Doanh thu', SERIES_COLORS.production, 'doanhThu'],
  ['Thực thu', SERIES_COLORS.collected, 'thucThu'],
];

function RevenueBar({ parts, max }) {
  return <div className="revenue-bar-track" aria-hidden="true">
    {parts.filter(part => part.amount > 0).map(({ key, label, color, amount }) =>
      <span key={key} style={{ width: `${amount / max * 100}%`, backgroundColor: color, color: color === SERIES_COLORS.upcoming ? '#13243c' : '#fff' }} title={t(`${label} · ${number(amount)} triệu VND`)}>
        <b>{number(amount)}</b>
      </span>
    )}
  </div>;
}

export function RevenueChart({ stats, monthlyData, onOpen }) {
  const [mode, setMode] = useState('category');
  const chartRef = useChartEntrance();
  const isCategory = mode === 'category';
  const series = isCategory ? industryRevenueSeries : monthlyRevenueSeries;
  const rows = isCategory ? stats.filter(row => row.revenue > 0) : monthlyData;
  const total = stats.reduce((sum, row) => sum + row.revenue, 0);
  const collected = stats.reduce((sum, row) => sum + row.cashCollected, 0);
  const max = Math.max(1, ...rows.map(row => isCategory ? row.revenue / 1000000 : Math.max(row.doanhThu, row.thucThu)));
  return <section ref={chartRef} className="analytics-card revenue-panel">
    <div className="panel-heading"><div><h2>{t("Doanh thu & thực thu")}</h2><p>{t(mode === 'category' ? 'Theo ngành hàng' : 'Theo tháng ghi nhận')}{t(" · triệu VND")}</p></div>
      <div className="segmented-control" aria-label={t("Kiểu biểu đồ doanh thu")}><button aria-pressed={mode === 'category'} onClick={() => setMode('category')}>{t("Ngành hàng")}</button><button aria-pressed={mode === 'month'} onClick={() => setMode('month')}>{t("Tháng")}</button></div>
    </div>
    {rows.length > 0 && <dl className="revenue-totals">
      {[['Doanh thu', total], ['Thực thu', collected], ['Chưa thực thu', Math.max(0, total - collected)]].map(([label, amount]) =>
        <div key={label}><dt>{t(label)}</dt><dd>{formatMoney(amount)}</dd></div>)}
    </dl>}
    {rows.length ? <ul className="revenue-bars" aria-label={t(isCategory ? 'Doanh thu theo ngành hàng, triệu VND' : 'Doanh thu theo tháng, triệu VND')}>
      {rows.map(row => {
        const name = isCategory ? row.category : getLanguage() === 'en' ? row.month.slice(1) : row.month;
        const parts = series.map(([label, color, key]) => ({ key, label: t(label), color, amount: isCategory ? row[key] / 1000000 : row[key] }));
        return <li className="revenue-bar-row" key={isCategory ? row.category : row.month}>
          <span className="revenue-bar-name">{t(name)}</span>
          {isCategory ? <>
            <RevenueBar parts={parts} max={max} />
            <strong className="revenue-bar-amount"><span className="sr-only">{t("Tổng ")}</span>{number(row.revenue / 1000000)}</strong>
            <span className="sr-only">{parts.map(({ label, amount }) => phrase('§ § triệu VND', label, number(amount))).join(', ')}</span>
          </> : <div className="revenue-month-bars">
            {parts.map(part => <div className="revenue-month-series" key={part.key}>
              <RevenueBar parts={[part]} max={max} />
              <strong className="revenue-bar-amount"><span className="sr-only">{t(part.label)} </span>{number(part.amount)}</strong>
            </div>)}
          </div>}
        </li>;
      })}
    </ul> : <p className="revenue-chart-empty">{t("Không có doanh thu trong bộ lọc hiện tại.")}</p>}
    <div className="chart-footer"><ChartLegend items={series} />{onOpen && <button className="text-action" onClick={onOpen}>{t("Xem chứng từ ")}<ChevronRight size={15} /></button>}</div>
  </section>;
}

export function DebtChart({ type, title, summary, onOpen }) {
  const chartRef = useChartEntrance();
  const groups = [
    { name: 'Quá hạn', value: summary.overdue, color: DEBT_COLORS.overdue, filter: 'overdue' },
    { name: 'Đến hạn hôm nay', value: summary.today, color: DEBT_COLORS.today, filter: 'today' },
    { name: 'Chưa đến hạn', value: summary.upcoming, color: DEBT_COLORS.upcoming, filter: 'upcoming' },
    { name: 'Thiếu hạn thanh toán', value: summary.unknown, color: DEBT_COLORS.unknown, filter: 'unknown' },
  ];
  return <section className="analytics-card debt-panel"><div className="panel-heading"><div><h2>{t(title)}</h2><p>{t("Cơ cấu số dư · triệu VND")}</p></div><button className="text-action" onClick={() => onOpen('all')}>{t("Chi tiết ")}<ChevronRight size={15} /></button></div>
    <div className="debt-chart-body"><div ref={chartRef} className="debt-donut" role="img" aria-label={t(`${title}: tổng dư nợ ${formatMoney(summary.total)}. ${groups.map(g => `${t(g.name)} ${formatMoney(g.value)}`).join('. ')}`)}>
      <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.total ? groups.filter(g => g.value > 0).map(g => ({ ...g, name: t(g.name) })) : [{ value: 1, color: '#e2e8f0' }]} dataKey="value" nameKey="name" innerRadius="69%" outerRadius="93%" paddingAngle={3} stroke="none" isAnimationActive={false}>
        {(summary.total ? groups.filter(g => g.value > 0) : [{ color: '#e2e8f0' }]).map((g, i) => <Cell key={i} fill={g.color} />)}
      </Pie>{summary.total > 0 && <Tooltip formatter={value => formatMoney(value)} contentStyle={tooltipStyle} itemStyle={{ color: '#25354e' }} />}</PieChart></ResponsiveContainer>
      <div className="donut-total"><span>{t("Tổng dư nợ")}</span><strong>{t(formatMillions(summary.total))}</strong></div>
    </div><div className="debt-legend">{groups.map(g => <button key={g.filter} onClick={() => onOpen(g.filter)}><span><i style={{ background: g.color }} />{t(g.name)}</span><strong style={{ color: g.value && ['overdue', 'today', 'unknown'].includes(g.filter) ? g.color : undefined }}>{t(formatMillions(g.value))}</strong></button>)}</div></div>
    <button className="debt-due-link" onClick={() => onOpen('due')}><span>{t(type === 'receivables' ? 'Phải thu đến hạn' : 'Phải trả đến hạn')}</span><strong>{formatMoney(summary.due)} <ChevronRight size={15} /></strong></button>
  </section>;
}

export function CashPriorityChart({ ar, ap, onNavigate }) {
  const chartRef = useChartEntrance();
  const data = [{ name: t('Phải thu'), overdue: ar.overdue / 1000000, today: ar.today / 1000000 }, { name: t('Phải trả'), overdue: ap.overdue / 1000000, today: ap.today / 1000000 }];
  return <section className="analytics-card cash-priority-panel"><div className="panel-heading"><div><span className="panel-priority-tag"><Wallet size={13} />{t("Ưu tiên kế toán")}</span><h2>{t("Thu & chi đến hạn")}</h2><p>{t("Phải thu / phải trả · triệu VND")}</p></div></div>
    <div className="cash-focus-totals"><button onClick={() => onNavigate('receivables', 'due')}><span>{t("Cần thu")}</span><strong>{formatMoney(ar.due)}</strong><div className="cash-focus-meta"><small>{t("Hôm nay ")}{t(formatMillions(ar.today))}</small>{ar.overdue > 0 && <span className="warning-inline">{t("Quá hạn ")}{t(formatMillions(ar.overdue))}</span>}</div></button><button onClick={() => onNavigate('payables', 'due')}><span>{t("Cần trả")}</span><strong>{formatMoney(ap.due)}</strong><div className="cash-focus-meta"><small>{t("Hôm nay ")}{t(formatMillions(ap.today))}</small>{ap.overdue > 0 && <span className="warning-inline">{t("Quá hạn ")}{t(formatMillions(ap.overdue))}</span>}</div></button></div>
    <div ref={chartRef} className="cash-priority-plot" role="img" aria-label={t(`Phải thu đến hạn ${formatMoney(ar.due)}, phải trả đến hạn ${formatMoney(ap.due)}. Khoản thiếu hạn không được cộng vào đến hạn.`)}>
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 8, right: 35, left: 0, bottom: 0 }} barSize={32}>
        <CartesianGrid horizontal={false} strokeDasharray="3 5" stroke="#dfe7ef" /><XAxis type="number" tickFormatter={number} tick={tick} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={68} tick={{ ...tick, fontWeight: 600 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value, name) => [phrase('§ triệu VND', number(value)), name]} contentStyle={tooltipStyle} itemStyle={{ color: '#25354e' }} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="overdue" name={t("Quá hạn")} stackId="due" fill={DEBT_COLORS.overdue} isAnimationActive={false}><LabelList dataKey="overdue" position="center" formatter={value => value ? number(value) : ''} fill="#fff" fontWeight={700} fontSize={12} /></Bar>
        <Bar dataKey="today" name={t("Đến hạn hôm nay")} stackId="due" fill={DEBT_COLORS.today} radius={[0, 5, 5, 0]} isAnimationActive={false}><LabelList dataKey="today" position="center" formatter={value => value ? number(value) : ''} fill="#fff" fontWeight={700} fontSize={12} /></Bar>
      </BarChart></ResponsiveContainer>
    </div><ChartLegend items={[['Quá hạn', DEBT_COLORS.overdue], ['Đến hạn hôm nay', DEBT_COLORS.today]]} />
    {ap.unknown > 0 && <button className="missing-deadline-callout" onClick={() => onNavigate('payables', 'unknown')}><AlertTriangle size={15} /><span>{t(formatMillions(ap.unknown))}{t(" phải trả chưa có hạn")}</span><ChevronRight size={15} /></button>}
  </section>;
}

export function RevenueTaxProfitabilityPanel({ revenueRecords = [], items = [] }) {
  const [periodMode, setPeriodMode] = useState('month');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [interestRate, setInterestRate] = useState(6.5);
  const [taxRate, setTaxRate] = useState(20);
  const [operatingCostRate, setOperatingCostRate] = useState(8);
  const chartRef = useChartEntrance();

  const { rows: allRows } = buildProfitabilitySeries(revenueRecords, items, {
    periodMode,
    annualInterestRatePct: interestRate,
    taxRatePct: taxRate,
    operatingCostRatePct: operatingCostRate,
  });

  const activePeriod = selectedPeriod === 'all' || allRows.some(r => r.period === selectedPeriod) ? selectedPeriod : 'all';
  const rows = activePeriod === 'all' ? allRows : allRows.filter(r => r.period === activePeriod);

  const totals = rows.reduce(
    (acc, row) => ({
      invoiceCount: acc.invoiceCount + row.invoiceCount,
      netRevenue: acc.netRevenue + row.netRevenue,
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

  const chartData = rows.map(row => ({
    period: row.period,
    doanhThu: Math.round((row.netRevenue / 1000000) * 100) / 100,
    loiNhuanGop: Math.round((row.grossProfit / 1000000) * 100) / 100,
    lnTruocThue: Math.round((row.profitBeforeTax / 1000000) * 100) / 100,
    lnSauThue: Math.round((row.profitAfterTax / 1000000) * 100) / 100,
  }));

  return (
    <section className="analytics-card profitability-panel space-y-5" aria-label={t('Thống kê lợi nhuận và thuế theo kỳ')}>
      <div className="panel-heading flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>{t('Báo cáo Lợi nhuận trước & sau thuế (Kế toán)')}</h2>
          <p>
            {t(
              periodMode === 'year'
                ? 'Tổng hợp theo Năm · triệu VND & VND'
                : periodMode === 'quarter'
                  ? 'Tổng hợp theo Quý · triệu VND & VND'
                  : 'Tổng hợp theo Tháng · triệu VND & VND'
            )}
          </p>
        </div>
        <div className="profit-filter-controls">
          <div className="segmented-control profit-period-slider" role="group" aria-label={t('Kỳ thống kê lợi nhuận')}>
            <button
              type="button"
              aria-pressed={periodMode === 'month'}
              onClick={() => { setPeriodMode('month'); setSelectedPeriod('all'); }}
            >
              {t('Tháng')}
            </button>
            <button
              type="button"
              aria-pressed={periodMode === 'quarter'}
              onClick={() => { setPeriodMode('quarter'); setSelectedPeriod('all'); }}
            >
              {t('Quý')}
            </button>
            <button
              type="button"
              aria-pressed={periodMode === 'year'}
              onClick={() => { setPeriodMode('year'); setSelectedPeriod('all'); }}
            >
              {t('Năm')}
            </button>
          </div>
          <select
            className="profit-period-select"
            aria-label={t('Chọn kỳ cụ thể')}
            value={activePeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
          >
            <option value="all">
              {t(periodMode === 'year' ? 'Tất cả các năm' : periodMode === 'quarter' ? 'Tất cả các quý' : 'Tất cả các tháng')}
            </option>
            {allRows.map(r => (
              <option key={r.period} value={r.period}>{r.period}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
        <label className="flex flex-col gap-1.5 font-semibold text-slate-700">
          <span>{t('Lãi suất vốn / trả chậm (%/năm)')}</span>
          <input
            type="number"
            min="0"
            max="30"
            step="0.5"
            value={interestRate}
            onChange={e => setInterestRate(Math.max(0, Number(e.target.value) || 0))}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold text-slate-700">
          <span>{t('Chi phí vận hành ước tính (% DT)')}</span>
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={operatingCostRate}
            onChange={e => setOperatingCostRate(Math.max(0, Number(e.target.value) || 0))}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold text-slate-700">
          <span>{t('Thuế suất TNDN (%)')}</span>
          <input
            type="number"
            min="0"
            max="30"
            step="1"
            value={taxRate}
            onChange={e => setTaxRate(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-900"
          />
        </label>
      </div>

      <dl className="revenue-totals profit-kpi-totals">
        <div>
          <dt>{t('Lợi nhuận gộp')}</dt>
          <dd>{formatMoney(totals.grossProfit)}</dd>
        </div>
        <div>
          <dt>{t('Chi phí lãi vay ước tính')}</dt>
          <dd>{formatMoney(totals.interestExpense)}</dd>
        </div>
        <div>
          <dt>{t('LN trước thuế (EBT)')}</dt>
          <dd>{formatMoney(totals.profitBeforeTax)}</dd>
        </div>
        <div>
          <dt>{t(`LN sau thuế (Thuế ${taxRate}%)`)}</dt>
          <dd className="text-emerald-700 font-bold">{formatMoney(totals.profitAfterTax)} ({totals.netMarginPct}%)</dd>
        </div>
      </dl>

      {chartData.length > 0 ? (
        <div className="profit-chart-box">
          <div ref={chartRef} className="profit-chart-plot" role="img" aria-label={t('Biểu đồ doanh thu và lợi nhuận theo kỳ')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 24, right: 16, left: 4, bottom: 8 }} barGap={6}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#dfe7ef" />
                <XAxis dataKey="period" tick={{ fontSize: 13, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={number} tick={{ fontSize: 12, fill: '#475569' }} unit=" tr" axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [`${number(value)} triệu VND`, name]}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                  cursor={{ fill: '#f1f5f9' }}
                />
                <Bar name={t('Doanh thu thuần')} dataKey="doanhThu" fill={SERIES_COLORS.production} radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false}>
                  <LabelList dataKey="doanhThu" position="top" formatter={v => v ? number(v) : ''} fill="#1e293b" fontSize={11} fontWeight={700} />
                </Bar>
                <Bar name={t('Lợi nhuận gộp')} dataKey="loiNhuanGop" fill={SERIES_COLORS.upcoming} radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false} />
                <Bar name={t('LN trước thuế')} dataKey="lnTruocThue" fill="#0d9488" radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false} />
                <Bar name={t('LN sau thuế')} dataKey="lnSauThue" fill="#15803d" radius={[5, 5, 0, 0]} maxBarSize={42} isAnimationActive={false}>
                  <LabelList dataKey="lnSauThue" position="top" formatter={v => v ? number(v) : ''} fill="#15803d" fontSize={11} fontWeight={700} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={[
              ['Doanh thu thuần', SERIES_COLORS.production],
              ['Lợi nhuận gộp', SERIES_COLORS.upcoming],
              ['LN trước thuế', '#0d9488'],
              ['LN sau thuế', '#15803d'],
            ]}
          />
        </div>
      ) : (
        <p className="revenue-chart-empty">{t('Không có dữ liệu lợi nhuận trong kỳ đã chọn.')}</p>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full min-w-[860px] text-left border-collapse text-sm revenue-data-table" aria-label={t('Bảng lợi nhuận trước và sau thuế')}>
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200 whitespace-nowrap">
              <th className="py-3 px-3.5">{t('Kỳ báo cáo')}</th>
              <th className="py-3 px-3.5 text-right">{t('Doanh thu thuần')}</th>
              <th className="py-3 px-3.5 text-right">{t('Giá vốn PO')}</th>
              <th className="py-3 px-3.5 text-right">{t('Lợi nhuận gộp')}</th>
              <th className="py-3 px-3.5 text-right">{t('CP vận hành & Lãi vay')}</th>
              <th className="py-3 px-3.5 text-right">{t('LN trước thuế')}</th>
              <th className="py-3 px-3.5 text-right">{t('Thuế TNDN')}</th>
              <th className="py-3 px-3.5 text-right">{t('LN sau thuế')}</th>
              <th className="py-3 px-3.5 text-right">{t('Biên LN ròng')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {!rows.length && (
              <tr>
                <td colSpan={9} className="empty-table">{t('Không có dữ liệu doanh thu trong kỳ')}</td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.period} className="bg-white hover:bg-slate-50">
                <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                  {row.period} <span className="text-xs font-normal text-slate-500">({row.invoiceCount} CT)</span>
                </td>
                <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-900">{formatMoney(row.netRevenue)}</td>
                <td className="py-3 px-3.5 text-right font-mono text-slate-600">{formatMoney(row.cogs)}</td>
                <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-800">{formatMoney(row.grossProfit)}</td>
                <td className="py-3 px-3.5 text-right font-mono text-slate-600">
                  {formatMoney(row.operatingCost + row.interestExpense)}
                  <div className="text-xs text-slate-500">{t('Lãi vay:')} {formatMoney(row.interestExpense)}</div>
                </td>
                <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">{formatMoney(row.profitBeforeTax)}</td>
                <td className="py-3 px-3.5 text-right font-mono text-rose-700">{formatMoney(row.taxAmount)}</td>
                <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-700">{formatMoney(row.profitAfterTax)}</td>
                <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-800">{row.netMarginPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
