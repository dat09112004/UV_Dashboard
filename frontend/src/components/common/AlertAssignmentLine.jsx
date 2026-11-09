import React from 'react';
import { BellRing, CheckCircle2, Clock3, UserCheck } from 'lucide-react';
import { t } from '../../locales/i18n.js';
import { resolveAlertAssignmentInfo } from '../../features/operations/services/taskWorkflow.js';

/**
 * Hiển thị 1 dòng nhỏ và nghiêng (small & italic) ở các cảnh báo đỏ
 * để biểu thị việc đã giao hay chưa, đã có ai/phòng ban nào đảm nhận hay chưa.
 * Tất cả các role (CEO, Admin, Sale, Kế toán) đều xem được dòng này.
 */
export default function AlertAssignmentLine({
  alertRef,
  tasks = [],
  accounts = [],
  reminders = [],
  onRemind,
  canRemind = false,
  compact = false,
}) {
  const info = resolveAlertAssignmentInfo(alertRef, tasks, accounts, reminders);
  const toneColors = {
    assigned: 'text-sky-800 bg-sky-50/90 border-sky-200',
    done: 'text-emerald-800 bg-emerald-50/90 border-emerald-200',
    reminded: 'text-amber-900 bg-amber-50/95 border-amber-300',
    unassigned: 'text-rose-800 bg-rose-50/90 border-rose-200',
  };
  const badgeClass = toneColors[info.tone] || toneColors.unassigned;

  return (
    <div
      className={`alert-assignment-line flex flex-wrap items-center gap-1.5 mt-1 ${compact ? 'text-[11px]' : 'text-xs'}`}
      onClick={e => e.stopPropagation()}
    >
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border italic font-medium leading-snug ${badgeClass}`}
        data-alert-assignment-status={info.tone}
      >
        {info.isAssigned ? (
          info.tone === 'done' ? <CheckCircle2 size={12} className="shrink-0" /> : <UserCheck size={12} className="shrink-0" />
        ) : (
          <Clock3 size={12} className="shrink-0" />
        )}
        <em className="italic">{t(info.italicLine)}</em>
      </span>
      {canRemind && onRemind && info.tone !== 'done' && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onRemind(alertRef, info);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold not-italic transition cursor-pointer"
          title={t('Nhắc sếp (CEO / Admin) giao việc hoặc đôn đốc xử lý cảnh báo này')}
        >
          <BellRing size={11} className="shrink-0" />
          <span>{t(info.pendingRemindersCount > 0 ? 'Nhắc lại sếp' : 'Nhắc việc sếp')}</span>
        </button>
      )}
    </div>
  );
}
