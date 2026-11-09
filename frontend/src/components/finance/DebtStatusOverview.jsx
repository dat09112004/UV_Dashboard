import { useChartEntrance } from '../../hooks/useChartEntrance.js';
import { DEBT_COLORS } from '../../utils/chartColors.js';
import { phrase, t } from '../../locales/i18n.js';
import React from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { debtMatchesFilter, formatMoney } from '../../utils/dashboardMetrics.js';
import { payableAction } from '../../utils/workspaceUi.js';
import { AP_PENDING, AP_APPROVED, AP_RETURNED, needsPayableSplit } from '../../utils/financeWorkflow.js';
import { isExecutiveRole } from '../../utils/roles.js';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';

const BUCKETS = [
  { id: 'overdue', label: 'Quá hạn', color: DEBT_COLORS.overdue },
  { id: 'today', label: 'Đến hạn hôm nay', color: DEBT_COLORS.today },
  { id: 'near', label: 'Sắp đến hạn (1–7 ngày)', color: DEBT_COLORS.near },
  { id: 'future', label: 'Chưa tới hạn (>7 ngày)', color: DEBT_COLORS.upcoming },
  { id: 'unknown', label: 'Chưa xác định hạn', color: DEBT_COLORS.unknown },
];

function suggestedAction(row, debtType, role) {
  if (debtType === 'payables' && needsPayableSplit(row)) return 'Tách chứng từ và đối soát từng nhà cung cấp trước khi duyệt.';
  if (row.debtStatus === 'unknown') {
    return debtType === 'payables' ? 'Xác minh hạn thanh toán với nhà cung cấp.' : 'Đối chiếu hóa đơn và bổ sung hạn thu.';
  }
  if (debtType === 'receivables') {
    if (row.debtStatus === 'overdue') return 'Liên hệ khách hàng, chốt ngày thu.';
    if (row.debtStatus === 'today') return 'Kiểm tra tiền về và đối chiếu hóa đơn.';
    return 'Nhắc khách hàng trước hạn thu.';
  }
  if (row.approvalState === AP_PENDING) {
    return isExecutiveRole(role) ? 'Xem và xử lý đề nghị chi.' : 'Theo dõi đề nghị chờ CEO duyệt.';
  }
  if (row.approvalState === AP_APPROVED) return 'Đối chiếu chứng từ và kế hoạch chi.';
  if (row.approvalState === AP_RETURNED) return 'Bổ sung hồ sơ theo yêu cầu.';
  return 'Kiểm tra hồ sơ để lập đề nghị chi.';
}

export default function DebtStatusOverview({
  rows, debtType, role, filter, onFilter, onOpen, redOnly, onClearRed, canSplit = true,
  tasks = [], accounts = [], reminders = [], onRemindAlert,
}) {
  const chartRef = useChartEntrance();
  const groups = BUCKETS.map(bucket => {
    const matching = rows.filter(row => debtMatchesFilter(row, bucket.id));
    return { ...bucket, count: matching.length, amount: matching.reduce((sum, row) => sum + row.remaining, 0) };
  });
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  const attention = rows.filter(row => debtMatchesFilter(row, 'attention'));
  const isPayable = debtType === 'payables';
  const openRow = row => {
    const action = isPayable && payableAction(row, role, canSplit);
    if (action?.type === 'SPLIT_AP' || (action?.type === 'REVIEW_AP' && row.debtStatus !== 'unknown')) {
      onOpen({ type: action.type, data: row });
      return;
    }
    onOpen({ type: 'DEBT_DETAIL', debtType, data: row });
  };

  return <div className="debt-overview">
    <section className="debt-overview-card" aria-label={t("Biểu đồ dư nợ theo hạn thanh toán")}>
      <div className="debt-overview-heading">
        <div><h3>{t("Dư nợ theo hạn thanh toán")}</h3><p>{t("Còn ")}{t(isPayable ? 'phải trả' : 'phải thu')}{t(" trong phạm vi lọc")}</p></div>
        <strong className="debt-overview-total">{formatMoney(total)}</strong>
      </div>
      <div ref={chartRef} className="debt-overview-bars">
        {groups.map(group => <button
          key={group.id}
          className="debt-overview-bar"
          aria-pressed={filter === group.id}
          onClick={() => onFilter(filter === group.id ? 'all' : group.id)}
        >
          <span className="debt-overview-bar-label">
            <span><i style={{ backgroundColor: group.color }} />{t(group.label)} <small>({group.count})</small></span>
            <strong>{formatMoney(group.amount)}</strong>
          </span>
          <span className="debt-overview-track" aria-hidden="true">
            <span style={{ width: `${total ? group.amount / total * 100 : 0}%`, backgroundColor: group.color }} />
          </span>
        </button>)}
      </div>
      <div className="debt-overview-footer">
        <span>{t(redOnly ? 'Đang lọc báo động đỏ' : 'Chọn một nhóm để lọc chứng từ bên dưới.')}</span>
        {redOnly && <button onClick={onClearRed}>{t("Hiện mọi mức")}</button>}
        {filter !== 'all' && <button onClick={() => onFilter('all')}>{t("Xem mọi trạng thái")}</button>}
      </div>
    </section>

    <section className="debt-overview-card" aria-label={t("Công nợ cần làm trước")}>
      <div className="debt-overview-heading">
        <div><h3>{attention.length ? <AlertTriangle className="debt-warning-icon" size={17} /> : <CheckCircle2 size={17} />}{t("Cần làm trước")}</h3><p>{t("Việc cần xử lý theo hạn và hồ sơ")}</p></div>
        {attention.length > 0 && <button className="debt-overview-link" aria-pressed={filter === 'attention'} onClick={() => onFilter(filter === 'attention' ? 'all' : 'attention')}>
          {phrase('Xem § khoản', attention.length)}<ArrowUpRight size={15} />
        </button>}
      </div>
      {attention.length ? <table className="debt-action-table">
        <thead><tr><th scope="col">{t("Chứng từ")}</th><th scope="col">{t("Đề xuất xử lý")}</th></tr></thead>
        <tbody>{attention.slice(0, 3).map(row => {
          const alertObj = { id: `${debtType}-${row.id}`, type: debtType, reference: row.docNo, label: row.customerName || row.supplierName, status: row.alertLabel, data: row };
          return <tr key={row.id}>
            <td>
              <button className="debt-overview-link" onClick={() => openRow(row)}>{row.docNo} <ArrowUpRight size={13} /></button>
              <span className="debt-action-partner">{t(isPayable ? row.supplierName : row.customerName)}</span>
              <strong>{formatMoney(row.remaining)}</strong>
            </td>
            <td>
              <span className={row.priorityRank === 0 ? 'debt-action-urgent' : 'debt-action-soon'}>
                {t(row.debtStatus === 'upcoming' ? `Còn ${row.daysUntilDue} ngày` : row.alertLabel)}
              </span>
              <p>{t(suggestedAction(row, debtType, role))}</p>
              {row.priorityRank === 0 && (
                <AlertAssignmentLine
                  alertRef={{ id: alertObj.id, type: debtType, reference: row.docNo }}
                  tasks={tasks}
                  accounts={accounts}
                  reminders={reminders}
                  canRemind={Boolean(onRemindAlert)}
                  onRemind={() => onRemindAlert?.(alertObj)}
                  compact={true}
                />
              )}
            </td>
          </tr>;
        })}</tbody>
      </table> : <p className="debt-overview-empty">{t("Không có khoản cần xử lý trong phạm vi đang xem.")}</p>}
    </section>
  </div>;
}
