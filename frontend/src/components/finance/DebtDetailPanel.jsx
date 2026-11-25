import { t } from '../../locales/i18n.js';
import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatDate, formatMoney } from '../../utils/dashboardMetrics.js';
import { payableAction, receivableAction } from '../../utils/workspaceUi.js';
import { FinanceHistory } from './FinanceForms.jsx';
import { needsPayableSplit, payableWorkflowStatus } from '../../utils/financeWorkflow.js';
import { isExecutiveRole } from '../../utils/roles.js';
import { canActorEditFinanceRecord } from '../../utils/ownershipAccess.js';
import AlertAssignmentLine from '../common/AlertAssignmentLine.jsx';

// Chức năng: Cửa sổ xem chi tiết khoản công nợ phải thu/phải trả, kiểm soát quyền nhận việc, chuyển giao 2 chiều có xác nhận và nhắc việc sếp
export default function DebtDetailPanel({
  actor, row, debtType, role, history, onOpen, onClose, onClaim, onTransferRespond, canSplit = true,
  tasks = [], accounts = [], reminders = [], onRemindAlert,
}) {
  const isAr = debtType === 'receivables';
  const effectiveActor = actor || { role };
  const access = canActorEditFinanceRecord(effectiveActor, row, debtType, tasks, accounts);
  const isAccountantUnassigned = role === 'Accountant' && access.unassigned;
  const isAccountantReadOnly = role === 'Accountant' && !access.unassigned && !access.allowed;
  const canWorkOnRecord = isExecutiveRole(role) || (role === 'Accountant' && access.allowed && !access.unassigned);

  const pendingTransfer = row?.pendingTransfer || null;
  const isTransferRecipient = Boolean(pendingTransfer && effectiveActor?.id && pendingTransfer.toUserId === effectiveActor.id);

  const isSettled = Number(row?.remaining ?? 0) <= 0;
  const canManageCrud = canWorkOnRecord && !isSettled;
  const action = canWorkOnRecord && !isSettled
    ? (isAr ? receivableAction(row, role) : payableAction(row, role, canSplit))
    : null;
  const canAllocateAr = isAr && canWorkOnRecord && !isSettled;
  const canRequestTransfer = role === 'Accountant' && access.isSelfOwned && !pendingTransfer && !isSettled;
  const grouped = !isAr && needsPayableSplit(row);
  const alertObj = {
    id: `${debtType}-${row.id}`,
    type: debtType,
    reference: row.docNo,
    label: row.customerName || row.supplierName,
    status: row.alertLabel,
    data: row,
  };

  const ownerDisplay = access.unassigned
    ? t('Chưa có người đảm nhận (Hàng chờ chung)')
    : (access.ownerLabel || row.assignedAccountantName || row.createdByName || row.pic || t('Phòng Kế toán'));

  return <div className="debt-detail-content">
    <div className={`item-detail-notice ${row.priorityRank === 0 ? 'critical' : row.priorityRank === 1 ? 'warning' : 'normal'}`}>
      <div><strong>{t(row.alertLabel)}</strong><span>{t("Hạn thanh toán: ")}{formatDate(row.dueDate)}</span></div>
      <AlertAssignmentLine
        alertRef={{ id: alertObj.id, type: debtType, reference: row.docNo, data: row }}
        tasks={tasks}
        accounts={accounts}
        reminders={reminders}
        canRemind={Boolean(onRemindAlert && (row.priorityRank === 0 || access.unassigned))}
        onRemind={() => onRemindAlert?.(alertObj)}
      />
    </div>
    <section className="debt-identity">
      <span>{t(isAr ? 'Khách hàng' : 'Nhà cung cấp')}</span>
      <h4>{t(row.customerName || row.supplierName)}</h4>
      <p>{row.poId} · {t(row.sku)}</p>
      <p className="text-xs text-slate-600 mt-1">
        {t('Người tạo chứng từ:')} <b>{(row.createdByRole === 'Admin' || row.createdByName === 'Quản trị Demo' ? 'Ban Giám đốc' : (row.createdByName || (row.ownerType === 'accountant_self_owned' ? 'Phòng Kế toán' : 'Ban Giám đốc')))}</b>
        {' · '}
        {t('Người đảm nhận:')} <b className={access.unassigned ? 'text-amber-700' : 'text-emerald-800'}>{ownerDisplay}</b>
      </p>
    </section>
    <div className="debt-detail-totals">
      <div><span>{t(isAr ? 'Phải thu gốc' : 'Phải trả gốc')}</span><strong>{formatMoney(row.originalAmount)}</strong></div>
      <div><span>{t(isAr ? 'Đã thu / phân bổ' : 'Đã trả')}</span><strong>{formatMoney(row.allocatedPaid)}</strong></div>
      <div><span>{t(isAr ? 'Còn phải thu' : 'Còn phải trả')}</span><strong>{formatMoney(row.remaining)}</strong></div>
    </div>
    {isAr && <p className="workflow-summary"><strong>{t("Trạng thái thu: ")}{t(row.remaining <= 0 ? 'Đã xác nhận thu đủ' : (row.collectionState || 'Chưa lập đề nghị thu'))}</strong>{row.collectionRequestAmount > 0 && <><br />{t("Đề nghị thu: ")}{formatMoney(row.collectionRequestAmount)}</>}</p>}
    {!isAr && <p className="workflow-summary"><strong>{t("Trạng thái: ")}{t(payableWorkflowStatus(row))}</strong>{row.splitSourceDocNo && <><br />{t("Tách từ: ")}{row.splitSourceDocNo}</>}{!grouped && row.requestAmount > 0 && <><br />{t("Đề nghị: ")}{formatMoney(row.requestAmount)}</>}{!grouped && row.approvedRemaining > 0 && <><br />{t("Hạn mức chi còn lại: ")}{formatMoney(row.approvedRemaining)}</>}</p>}
    {(row.commitmentNote || row.requestNote) && <p className="debt-detail-note">{row.commitmentNote ? t(row.commitmentNote) : row.requestNote}</p>}
    {pendingTransfer && (
      <div className="entry-warnings" role="status">
        <strong>{t('Yêu cầu chuyển giao đang chờ xác nhận')}:</strong>{' '}
        {pendingTransfer.fromUserName} {t('muốn chuyển cho')} <b>{pendingTransfer.toUserName}</b> · {t('Lý do:')} {pendingTransfer.reason}
      </div>
    )}
    {isAccountantUnassigned && (
      <div className="entry-warnings" role="status">
        <strong>{t('Hồ sơ chưa có người đảm nhận')}:</strong> {t('Vui lòng bấm "Nhận xử lý" để trực tiếp thực hiện, hoặc bấm "Nhắc việc sếp" để Ban Giám đốc phân công kế toán phụ trách.')}
      </div>
    )}
    {isAccountantReadOnly && !isTransferRecipient && (
      <div className="entry-warnings" role="status">
        <strong>{t('Chế độ chỉ xem')}:</strong> {t('Hồ sơ này đang do')} {ownerDisplay} {t('phụ trách. Bạn không thể chỉnh sửa hoặc lập đề nghị.')}
      </div>
    )}
    {grouped && <p className="workflow-callout"><AlertTriangle size={18} /><span>{t(canSplit ? 'Chứng từ gộp nhiều nhà cung cấp. Kế toán cần tách và đối soát trước khi trình duyệt.' :
      'Cần quyền Tiến độ đơn hàng để tách chứng từ. Hãy liên hệ quản trị viên.')}</span></p>}
    <FinanceHistory entries={history.filter(entry => entry.reference === row.docNo || entry.reference === row.splitSourceDocNo)} />
    <div className="workflow-footer">
      <button type="button" onClick={onClose}>{t("Đóng")}</button>
      {isTransferRecipient && onTransferRespond && (
        <>
          <button type="button" className="row-detail-button" onClick={() => onTransferRespond(debtType, row, false)}>
            {t("Từ chối nhận việc")}
          </button>
          <button type="button" className="primary" onClick={() => onTransferRespond(debtType, row, true)}>
            {t("Xác nhận nhận chuyển giao")}
          </button>
        </>
      )}
      {isAccountantUnassigned && onRemindAlert && (
        <button type="button" className="row-detail-button" onClick={() => onRemindAlert(alertObj)}>
          {t("Nhắc việc sếp")}
        </button>
      )}
      {isAccountantUnassigned && onClaim && (
        <button type="button" className="primary" onClick={() => onClaim(debtType, row)}>
          {t("Nhận xử lý")}
        </button>
      )}
      {canManageCrud && (
        <button type="button" className="row-detail-button" onClick={() => onOpen({ type: isAr ? 'EDIT_AR' : 'EDIT_AP', debtType, data: row })}>
          {t("Điều chỉnh / Sửa chứng từ")}
        </button>
      )}
      {canRequestTransfer && (
        <button type="button" className="row-detail-button" onClick={() => onOpen({ type: 'TRANSFER_DEBT', debtType, data: row })}>
          {t("Chuyển giao việc")}
        </button>
      )}
      {canAllocateAr && <button type="button" className="row-detail-button" onClick={() => onOpen({ type: 'ALLOCATE_AR', data: row })}>{t("Thu tiền & phân bổ")}</button>}
      {action && <button className="primary" onClick={() => onOpen({ ...action, data: row })}>{t(action.label)}<ArrowRight size={16} /></button>}
    </div>
  </div>;
}
