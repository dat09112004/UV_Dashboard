import { t } from '../../locales/i18n.js';
import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatDate, formatMoney } from '../../utils/dashboardMetrics.js';
import { payableAction } from '../../utils/workspaceUi.js';
import { FinanceHistory } from './FinanceForms.jsx';
import { needsPayableSplit, payableWorkflowStatus } from '../../utils/financeWorkflow.js';
import { isExecutiveRole } from '../../utils/roles.js';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';

export default function DebtDetailPanel({
  row, debtType, role, history, onOpen, onClose, canSplit = true,
  tasks = [], accounts = [], reminders = [], onRemindAlert,
}) {
  const isAr = debtType === 'receivables';
  const action = isAr
    ? ((isExecutiveRole(role) || role === 'Accountant') && row.remaining > 0 ? { type: 'ALLOCATE_AR', label: 'Thu tiền & phân bổ' } : null)
    : payableAction(row, role, canSplit);
  const grouped = !isAr && needsPayableSplit(row);
  const alertObj = { id: `${debtType}-${row.id}`, type: debtType, reference: row.docNo, label: row.customerName || row.supplierName, status: row.alertLabel, data: row };
  return <div className="debt-detail-content">
    <div className={`item-detail-notice ${row.priorityRank === 0 ? 'critical' : row.priorityRank === 1 ? 'warning' : 'normal'}`}>
      <div><strong>{t(row.alertLabel)}</strong><span>{t("Hạn thanh toán: ")}{formatDate(row.dueDate)}</span></div>
      {row.priorityRank === 0 && (
        <AlertAssignmentLine
          alertRef={{ id: alertObj.id, type: debtType, reference: row.docNo }}
          tasks={tasks}
          accounts={accounts}
          reminders={reminders}
          canRemind={Boolean(onRemindAlert)}
          onRemind={() => onRemindAlert?.(alertObj)}
        />
      )}
    </div>
    <section className="debt-identity"><span>{t(isAr ? 'Khách hàng' : 'Nhà cung cấp')}</span><h4>{t(row.customerName || row.supplierName)}</h4><p>{row.poId} · {t(row.sku)}</p></section>
    <div className="debt-detail-totals"><div><span>{t(isAr ? 'Phải thu gốc' : 'Phải trả gốc')}</span><strong>{formatMoney(row.originalAmount)}</strong></div><div><span>{t(isAr ? 'Đã thu / phân bổ' : 'Đã trả')}</span><strong>{formatMoney(row.allocatedPaid)}</strong></div><div><span>{t(isAr ? 'Còn phải thu' : 'Còn phải trả')}</span><strong>{formatMoney(row.remaining)}</strong></div></div>
    {!isAr && <p className="workflow-summary"><strong>{t("Trạng thái: ")}{t(payableWorkflowStatus(row))}</strong>{row.splitSourceDocNo && <><br />{t("Tách từ: ")}{row.splitSourceDocNo}</>}{!grouped && row.requestAmount > 0 && <><br />{t("Đề nghị: ")}{formatMoney(row.requestAmount)}</>}{!grouped && row.approvedRemaining > 0 && <><br />{t("Hạn mức chi còn lại: ")}{formatMoney(row.approvedRemaining)}</>}</p>}
    {(row.commitmentNote || row.requestNote) && <p className="debt-detail-note">{row.commitmentNote ? t(row.commitmentNote) : row.requestNote}</p>}
    {grouped && <p className="workflow-callout"><AlertTriangle size={18} /><span>{t(canSplit ? 'Chứng từ gộp nhiều nhà cung cấp. Kế toán cần tách và đối soát trước khi trình duyệt.' :
      'Cần quyền Tiến độ đơn hàng để tách chứng từ. Hãy liên hệ quản trị viên.')}</span></p>}
    <FinanceHistory entries={history.filter(entry => entry.reference === row.docNo || entry.reference === row.splitSourceDocNo)} />
    <div className="workflow-footer"><button type="button" onClick={onClose}>{t("Đóng")}</button>{action && <button className="primary" onClick={() => onOpen({ ...action, data: row })}>{t(action.label)}<ArrowRight size={16} /></button>}</div>
  </div>;
}
