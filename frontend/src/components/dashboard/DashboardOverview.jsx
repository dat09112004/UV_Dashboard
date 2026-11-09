import { t } from '../../locales/i18n.js';
import React, { useState } from 'react';
import { TrendingUp, Package, Wallet, CreditCard, ChevronRight, AlertTriangle, CheckCircle2, ArrowRight, BellRing, ClipboardPlus, Clock3 } from 'lucide-react';
import { CategoryProgressChart, RevenueChart, DebtChart, CashPriorityChart } from './DashboardCharts.jsx';
import { formatMoney, formatMillions, sumBy } from '../../utils/dashboardMetrics.js';
import FulfillmentTable from '../orders/FulfillmentTable.jsx';
import { getRoleLayout, getSeverity, presentAlert } from '../../utils/dashboardPresentation.js';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';

export function AttentionSummary({
  alerts, role, onNavigate, onOpenAlert, onAssignAlert, onRemindAlert,
  activeSection, canNavigate = () => true, tasks = [], accounts = [], reminders = [],
}) {
  const critical = alerts.filter(alert => alert.data.priorityRank === 0);
  const warnings = alerts.filter(alert => alert.data.priorityRank === 1);
  const layout = getRoleLayout(role);
  const sections = [['orders', 'Giao hàng'], ['receivables', 'Phải thu'], ['payables', 'Phải trả']];
  const shownSections = sections.filter(([id]) => canNavigate(id));
  const selectedIndex = shownSections.findIndex(([id]) => id === activeSection);
  const focus = critical.find(alert => layout.alertType === 'all' || (layout.alertType === 'finance' ? alert.type !== 'orders' : alert.type === layout.alertType)) || critical[0] || warnings[0];
  return <section className={`attention-summary ${critical.length ? 'critical' : warnings.length ? 'warning' : 'normal'}`} aria-label={t("Công việc ưu tiên")}>
    <span className="attention-icon">{focus ? <AlertTriangle size={23} /> : <CheckCircle2 size={23} />}</span>
    <div className="attention-copy">
      <strong>{t(critical.length ? `${critical.length} báo động đỏ cần xử lý` : warnings.length ? `${warnings.length} việc cần theo dõi` : 'Không có cảnh báo cần xử lý')}</strong>
      {focus && (
        <>
          <span><b>{focus.reference}</b> · {t(presentAlert(focus, role).subject)} · {t(presentAlert(focus, role).issue)}</span>
          {focus.data.priorityRank === 0 && (
            <AlertAssignmentLine
              alertRef={{ id: focus.id, type: focus.type, reference: focus.reference }}
              tasks={tasks}
              accounts={accounts}
              reminders={reminders}
              canRemind={Boolean(onRemindAlert)}
              onRemind={() => onRemindAlert?.(focus)}
              compact={true}
            />
          )}
        </>
      )}
    </div>
    {shownSections.length > 0 && <nav className="attention-counts" aria-label={t("Điều hướng cảnh báo")}>
      <div className="attention-nav-track" style={{ gridTemplateColumns: `repeat(${shownSections.length}, minmax(0, 1fr))` }}>
        <span className="attention-nav-indicator" aria-hidden="true" style={{ transform: `translateX(${Math.max(0, selectedIndex) * 100}%)`, opacity: selectedIndex < 0 || shownSections.length !== sections.length ? 0 : 1 }} />
        {shownSections.map(([type, label]) => <button key={type} aria-current={activeSection === type ? 'page' : undefined} className={critical.some(a => a.type === type) ? 'has-alert' : ''} onClick={() => onNavigate(type, 'red')}><strong>{critical.filter(a => a.type === type).length}</strong><span>{t(label)}</span></button>)}
      </div>
    </nav>}
    {focus && <div className="attention-actions">
      <button className="attention-open" onClick={() => onOpenAlert(focus)}>{t('Mở việc ưu tiên ')}<ArrowRight size={16} /></button>
      {onAssignAlert && focus.data.priorityRank === 0 && <button className="row-detail-button alert-assignment-action"
        type="button" onClick={() => onAssignAlert(focus)}><ClipboardPlus size={15} aria-hidden="true" />{t('Giao việc')}</button>}
    </div>}
  </section>;
}

export function EmployeeAlertReminder({ alerts, role, onOpen, onRemindAlert, tasks = [], accounts = [], reminders = [] }) {
  if (!alerts.length) return null;
  return <details className="employee-alert-reminder" open>
    <summary><BellRing size={17} aria-hidden="true" />
      <strong>{t('Nhắc việc từ báo động đỏ')}</strong><span>{alerts.length}</span>
    </summary>
    <ul>{alerts.map(alert => {
      const view = presentAlert(alert, role);
      return <li key={alert.id} className="flex flex-col gap-1 p-2 rounded-lg bg-white/90 border border-rose-200">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="row-detail-button" onClick={() => onOpen(alert)}>
            <strong>{alert.reference}</strong><span>{t(view.issue)}</span><ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
        <AlertAssignmentLine
          alertRef={{ id: alert.id, type: alert.type, reference: alert.reference }}
          tasks={tasks}
          accounts={accounts}
          reminders={reminders}
          canRemind={Boolean(onRemindAlert)}
          onRemind={() => onRemindAlert?.(alert)}
          compact={true}
        />
      </li>;
    })}</ul>
  </details>;
}

export function OverviewKpis({ items, revenue, ar, ap, onNavigate, role, canNavigate = () => true }) {
  const redCount = items.filter(row => row.priorityRank === 0).length;
  const cards = [
    { id: 'revenue', label: 'Doanh thu ghi nhận', value: formatMoney(sumBy(revenue, 'netRevenue')), icon: TrendingUp, tone: 'teal', detail: `${revenue.length} chứng từ`, secondary: `Thực thu ${formatMillions(sumBy(revenue, 'cashCollected'))}` },
    { id: 'orders', filter: 'red', label: 'Mã hàng cần xử lý', value: `${redCount}`, unit: '/ ' + t(`${items.length} mã hàng`), icon: Package, tone: 'gold', detail: redCount ? `${redCount} báo động đỏ` : 'Không có báo động đỏ', secondary: `${new Set(items.map(row => row.category)).size} ngành hàng`, warning: redCount > 0 },
    { id: 'receivables', filter: 'due', label: 'Phải thu đến hạn', value: formatMoney(ar.due), icon: Wallet, tone: 'blue', detail: `Quá hạn ${formatMillions(ar.overdue)}`, secondary: `Hôm nay ${formatMillions(ar.today)}`, warning: ar.overdue > 0 },
    { id: 'payables', filter: 'due', label: 'Phải trả đến hạn', value: formatMoney(ap.due), icon: CreditCard, tone: 'purple', detail: `Quá hạn ${formatMillions(ap.overdue)}`, secondary: `Hôm nay ${formatMillions(ap.today)}`, warning: ap.overdue > 0 },
  ];
  const ordered = getRoleLayout(role).kpis.filter(canNavigate).map(id => cards.find(card => card.id === id));
  return <section className="overview-kpis" aria-label={t("Chỉ số điều hành")}>{ordered.map(({ id, filter, label, value, unit, icon: Icon, tone, detail, secondary, warning }, index) => <button key={id} className={`metric-card ${index < 2 ? 'role-primary-metric' : ''}`} data-metric={id} onClick={() => onNavigate(id, filter || 'all')}>
    <div className="metric-label"><span>{t(label)}</span><span className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.8} /></span></div>
    <div className="metric-value">{value}{unit && <small>{unit}</small>}</div>
    <div className="metric-footer"><span className={warning ? 'text-danger' : ''}>{t(detail)}</span><span>{t(secondary)}</span></div>
  </button>)}</section>;
}

function PriorityAlerts({ alerts, onOpen, onAssignAlert, onRemindAlert, role, tasks = [], accounts = [], reminders = [] }) {
  const [type, setType] = useState(getRoleLayout(role).alertType);
  const [level, setLevel] = useState('critical');
  const scoped = alerts.filter(alert => type === 'all' || (type === 'finance' ? alert.type !== 'orders' : alert.type === type));
  const critical = scoped.filter(a => a.data.priorityRank === 0).length;
  const warning = scoped.filter(a => a.data.priorityRank === 1).length;
  const visible = scoped.filter(alert => level === 'all' || getSeverity(alert.data.priorityRank) === level);
  return <section className="analytics-card priority-panel">
    <div className="panel-heading"><div><span className="panel-priority-tag">{visible.length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{t(visible.length ? 'Cần hành động' : 'Theo dõi công việc')}</span><h2>{t("Công việc đang cảnh báo")}</h2></div><div className="alert-level-counts"><button className={critical > 0 ? 'critical' : 'empty'} onClick={() => setLevel('critical')}>{critical}{t(" đỏ")}</button><button className={warning > 0 ? 'warning' : 'empty'} onClick={() => setLevel('warning')}>{warning}{t(" theo dõi")}</button></div></div>
    <div className="alert-controls"><label>{t("Nhóm công việc")}<select aria-label={t("Nhóm cảnh báo")} value={type} onChange={e => setType(e.target.value)}><option value="all">{t("Tất cả công việc")}</option><option value="orders">{t("Giao hàng & tiến độ")}</option><option value="finance">{t("Tài chính (thu & trả)")}</option><option value="receivables">{t("Công nợ phải thu")}</option><option value="payables">{t("Công nợ phải trả")}</option></select></label>
      <label>{t("Mức cảnh báo")}<select aria-label={t("Mức cảnh báo")} value={level} onChange={e => setLevel(e.target.value)}><option value="critical">{t("Báo động đỏ")}</option><option value="warning">{t("Cần theo dõi")}</option><option value="all">{t("Tất cả mức")}</option></select></label></div>
    <div className="priority-list" tabIndex={0} aria-label={t(`${visible.length} công việc cảnh báo`)}>{visible.length ? visible.map(alert => {
      const view = presentAlert(alert, role);
      return <article key={alert.id} className={`work-alert ${view.severity}`}>
        <div className="work-alert-heading"><span className="work-alert-reference">{t(view.typeLabel)} · <strong>{alert.reference}</strong></span><span className="work-alert-status"><AlertTriangle size={12} />{t(view.issue)}</span></div>
        <h3>{t(view.subject)}</h3><p className="work-alert-partner" title={t(view.partner)}>{t(view.partner)}</p>
        {view.severity === 'critical' && (
          <AlertAssignmentLine
            alertRef={{ id: alert.id, type: alert.type, reference: alert.reference }}
            tasks={tasks}
            accounts={accounts}
            reminders={reminders}
            canRemind={Boolean(onRemindAlert)}
            onRemind={() => onRemindAlert?.(alert)}
          />
        )}
        <div className="work-alert-facts"><span><Clock3 size={13} />{t(view.deadline)}</span><span>{t(view.facts)}</span></div>
        {view.amount && <div className="work-alert-amount"><span>{t(alert.type === 'receivables' ? 'Còn phải thu' : 'Còn phải trả')}</span><strong>{view.amount}</strong></div>}
        <div className="work-alert-action"><p>{t(view.action)}</p><div className="work-alert-buttons">
          <button type="button" onClick={() => onOpen(alert)}>{t(view.button)}<ArrowRight size={14} /></button>
          {onAssignAlert && view.severity === 'critical' && <button type="button" className="alert-assignment-action"
            onClick={() => onAssignAlert(alert)}><ClipboardPlus size={14} aria-hidden="true" />{t('Giao việc')}</button>}
        </div></div>
      </article>;
    }) : <div className="dashboard-empty"><CheckCircle2 size={28} /><strong>{t("Không có công việc ở nhóm này")}</strong><button className="text-action" onClick={() => { setType('all'); setLevel('all'); }}>{t("Xem tất cả cảnh báo")}</button></div>}</div>
    <div className="alert-list-footer">{visible.length}{t(" công việc · ")}{t(getRoleLayout(role).label)}</div>
  </section>;
}

export default function DashboardOverview({
  items, categoryStats, ar, ap, alerts, monthlyData,
  onNavigate, onOpenItem, onOpenAlert, onAssignAlert, onRemindAlert, onResetFilters,
  role, reportDate, tasks = [], accounts = [], reminders = [],
}) {
  const layout = getRoleLayout(role);
  const openAlert = onOpenAlert;
  const widgets = {
    alerts: <PriorityAlerts alerts={alerts} onOpen={openAlert} onAssignAlert={onAssignAlert} onRemindAlert={onRemindAlert} role={role} tasks={tasks} accounts={accounts} reminders={reminders} />,
    revenue: <RevenueChart stats={categoryStats} monthlyData={monthlyData} onOpen={() => onNavigate('revenue')} />,
    progress: <section className="analytics-card progress-panel"><div className="panel-heading"><div><span className="panel-priority-tag"><Package size={13} />{t("Vận hành đơn hàng")}</span><h2>{t("Tiến độ ngành hàng")}</h2><p>{t("Sản xuất / đóng gói · % hoàn thành")}</p></div><button className="text-action" onClick={() => onNavigate('orders', 'production')}>{t("Chi tiết ")}<ChevronRight size={15} /></button></div><CategoryProgressChart stats={categoryStats} /></section>,
    receivables: <DebtChart type="receivables" title={t("Công nợ phải thu")} summary={ar} onOpen={filter => onNavigate('receivables', filter)} />,
    payables: <DebtChart type="payables" title={t("Công nợ phải trả")} summary={ap} onOpen={filter => onNavigate('payables', filter)} />,
    cash: <CashPriorityChart ar={ar} ap={ap} onNavigate={onNavigate} />,
    orders: <FulfillmentTable onResetFilters={onResetFilters} items={items} reportDate={reportDate} onOpenItem={onOpenItem} onViewAll={filter => onNavigate('orders', filter)} limit={role === 'Accountant' ? 3 : 5} tasks={tasks} accounts={accounts} reminders={reminders} onRemindAlert={onRemindAlert} />,
  };
  return <div className={`role-dashboard role-${role.toLowerCase()}`} aria-label={t(layout.label)}>
    <div className="role-dashboard-heading"><strong>{t(layout.label)}</strong></div>
    <div className="role-widget-grid">{layout.widgets.map(([id, span, size]) => <div key={id} data-widget={id} className={`role-widget span-${span} is-${size}`}>{widgets[id]}</div>)}</div>
  </div>;
}
