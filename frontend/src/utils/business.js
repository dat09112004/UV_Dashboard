export const DEMO_REPORT_DATE = '05/11/2026';
export const SALE_NAMES = ['Lê Hương (Sale)', 'Nguyễn Minh (Sale)'];

export function parseBusinessDate(value) {
  if (typeof value !== 'string') return null;
  const vn = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!vn && !iso) return null;
  const [y, m, d] = vn ? [Number(vn[3]), Number(vn[2]), Number(vn[1])] : [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function formatBusinessDate(value) {
  const date = parseBusinessDate(value);
  return date ? `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}` : '—';
}

export function dateInputValue(value) {
  return parseBusinessDate(value)?.toISOString().slice(0, 10) || '';
}

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const businessToday = (now = new Date()) => { const p = Object.fromEntries(businessDateFormatter.formatToParts(now).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };

export function nowVN() {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
}

export function isTaskOverdue(task, reportDate = DEMO_REPORT_DATE) {
  const due = parseBusinessDate(task.deadline);
  const report = parseBusinessDate(reportDate);
  return task.status !== 'Hoàn tất' && Boolean(due && report && due < report);
}

export function canWorkOnTask(user, task) {
  if (task?.assigneeId) return Boolean(user?.status === 'active' && user.id === task.assigneeId &&
    user.permissions?.includes('tasks.handover'));
  return Boolean(user?.role === 'Sale' && task && task.assignee === `${user.name} (Sale)`);
}

export function debtAtDate(record, reportDate = DEMO_REPORT_DATE) {
  if (!record) throw new Error('Không tìm thấy chứng từ công nợ.');
  const report = parseBusinessDate(reportDate);
  if (!report) throw new Error('Ngày báo cáo không hợp lệ.');
  const remaining = Math.max(0, record.originalAmount + record.adjustment - record.allocatedPaid);
  const due = parseBusinessDate(record.dueDate);
  const overdueDays = due && remaining > 0 ? Math.max(0, Math.floor((report - due) / 86400000)) : 0;
  const agingBucket = remaining === 0 ? 'Đã hoàn tất' : !due ? 'Chưa xác định hạn' : due > report ? 'Sắp đến hạn' : due.getTime() === report.getTime() ? 'Đến hạn hôm nay' : `Quá hạn (${overdueDays <= 30 ? '1–30' : overdueDays <= 60 ? '31–60' : overdueDays <= 90 ? '61–90' : 'Trên 90'} ngày)`;
  return { ...record, remaining, overdueDays, agingBucket };
}

export function isDue(record, reportDate) {
  const due = parseBusinessDate(record.dueDate);
  const report = parseBusinessDate(reportDate);
  return record.remaining > 0 && Boolean(due && report && due <= report);
}

export function inRevenuePeriod(record, period, anchor = DEMO_REPORT_DATE) {
  const date = parseBusinessDate(record.recordDate);
  if (!date || record.approvalStatus !== 'Đã duyệt') return false;
  if (period === 'Tất cả các kỳ') return true;
  const ref = parseBusinessDate(anchor);
  const month = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (period === 'Tháng trước' ? 1 : 0), 1));
  return date.getUTCFullYear() === month.getUTCFullYear() && date.getUTCMonth() === month.getUTCMonth();
}

export function ageSummary(records) {
  const groups = [
    ['Sắp đến hạn', 'bg-teal-600'], ['Đến hạn hôm nay', 'bg-amber-500'],
    ['Quá hạn (1–30 ngày)', 'bg-rose-500'], ['Quá hạn (31–60 ngày)', 'bg-rose-700'],
    ['Quá hạn (61–90 ngày)', 'bg-rose-800'], ['Quá hạn (Trên 90 ngày)', 'bg-rose-950'],
    ['Chưa xác định hạn', 'bg-slate-400'], ['Đã hoàn tất', 'bg-emerald-600'],
  ];
  return groups.map(([label, color]) => {
    const items = records.filter(r => r.agingBucket === label);
    return { label, color, count: items.length, amount: items.reduce((sum, r) => sum + r.remaining, 0) };
  });
}

export function onTimeStats(shipments, reportDate = DEMO_REPORT_DATE) {
  const report = parseBusinessDate(reportDate);
  const due = shipments.filter(s => parseBusinessDate(s.etd) && parseBusinessDate(s.etd) <= report);
  const onTime = due.filter(s => {
    const actual = parseBusinessDate(s.actualShip);
    const shipped = s.shippedQty ?? (actual ? s.qty : 0);
    return shipped >= s.qty && actual && actual <= parseBusinessDate(s.etd);
  });
  return { rate: due.length ? Math.round(onTime.length / due.length * 100) : null, sample: `${onTime.length}/${due.length} đợt đến hạn có lịch` };
}

export function updateTask(task, user, action, payload = {}, time = nowVN()) {
  if (!task) throw new Error('Không tìm thấy công việc.');
  const ceoAction = ['confirm', 'review', 'assign'].includes(action);
  if (ceoAction ? !['CEO', 'Admin'].includes(user?.role) : !canWorkOnTask(user, task)) throw new Error('Bạn không có quyền thực hiện thao tác trên công việc này.');
  let patch = {};
  let text = '';
  if (action === 'accept') {
    if (!['Mới giao', 'Đã tiếp nhận'].includes(task.status)) throw new Error('Công việc không ở trạng thái chờ tiếp nhận.');
    patch = { status: 'Đang thực hiện' }; text = 'Tiếp nhận công việc.';
  } else if (action === 'handover') {
    if (!['Đang thực hiện', 'Đang vướng'].includes(task.status)) throw new Error('Hãy tiếp nhận công việc trước khi gửi bàn giao.');
    if (!payload.note?.trim()) throw new Error('Cần nhập kết quả bàn giao.');
    patch = { status: 'Chờ CEO xác nhận', handoverNote: payload.note.trim(), handoverDocVersion: payload.docVersion?.trim() || 'Chưa đính kèm tài liệu', handoverTime: time };
    text = `[Gửi bàn giao] ${patch.handoverNote}`;
  } else if (action === 'propose') {
    if (task.status === 'Hoàn tất') throw new Error('Công việc đã hoàn tất.');
    if (!parseBusinessDate(payload.deadline) || !payload.reason?.trim()) throw new Error('Cần ngày hợp lệ và lý do đề nghị.');
    patch = { proposedDeadline: formatBusinessDate(payload.deadline), proposalReason: payload.reason.trim() };
    text = `Đề nghị đổi hạn ${task.deadline} → ${patch.proposedDeadline}: ${patch.proposalReason}. Hạn cũ còn hiệu lực.`;
  } else if (action === 'confirm') {
    if (task.status !== 'Chờ CEO xác nhận') throw new Error('Chỉ xác nhận công việc đang chờ bàn giao.');
    if (!payload.approve && !payload.reason?.trim()) throw new Error('Cần nhập lý do yêu cầu bổ sung.');
    patch = { status: payload.approve ? 'Hoàn tất' : 'Đang thực hiện', ...(payload.approve ? { proposedDeadline: null, proposedAssignee: null, proposalReason: null } : {}) };
    text = payload.approve ? 'CEO xác nhận hoàn tất.' : `CEO yêu cầu bổ sung: ${payload.reason.trim()}`;
  } else if (action === 'review') {
    if (!task.proposedDeadline || task.status === 'Hoàn tất') throw new Error('Không còn đề nghị đổi hạn cần duyệt.');
    patch = { deadline: payload.accept ? task.proposedDeadline : task.deadline, proposedDeadline: null, proposedAssignee: null, proposalReason: null };
    text = payload.accept ? `CEO duyệt đổi hạn ${task.deadline} → ${patch.deadline}.` : `CEO từ chối; giữ hạn ${task.deadline}.`;
  } else if (action === 'assign') {
    if ((task.assigneeId ? !payload.assigneeId : !SALE_NAMES.includes(payload.assignee)) || !parseBusinessDate(payload.deadline) || !payload.reason?.trim()) throw new Error('Cần người nhận Sale, ngày hợp lệ và lý do thay đổi.');
    if (task.status === 'Hoàn tất') throw new Error('Không thể sửa phân công của công việc đã hoàn tất.');
    patch = { assignee: payload.assignee, ...(task.assigneeId ? { assigneeId: payload.assigneeId } : {}), deadline: formatBusinessDate(payload.deadline), proposedDeadline: null, proposedAssignee: null, proposalReason: null };
    if (task.assigneeId ? payload.assigneeId !== task.assigneeId : payload.assignee !== task.assignee) {
      patch = { ...patch, status: 'Mới giao', handoverNote: '', handoverDocVersion: '', handoverTime: '', handoverHistory: [...(task.handoverHistory || []), ...(task.handoverNote ? [{ note: task.handoverNote, doc: task.handoverDocVersion, time: task.handoverTime, assignee: task.assignee }] : [])] };
    }
    text = `CEO đổi phân công ${task.assignee || task.assigneeId} → ${patch.assignee}, hạn ${task.deadline} → ${patch.deadline}. Lý do: ${payload.reason.trim()}`;
  } else throw new Error('Thao tác không hợp lệ.');
  const result = { ...task, ...patch, comments: [...task.comments, { id: `${Date.now()}-${task.comments.length}`, author: `${user.name} (${user.role})`, role: user.role, time, text }] };
  return { ...result, isOverdue: isTaskOverdue(result) };
}

export function validateProgress(po, values) {
  const qty = [values.productionQty, values.packagingQty, values.shippedQty];
  if (qty.some(n => !Number.isFinite(n) || n < 0 || n > po.effectiveQty)) throw new Error('Số lượng phải từ 0 đến số lượng đặt hiệu lực.');
  if (qty[2] > qty[1] || qty[1] > qty[0]) throw new Error('Số lượng xuất không vượt đóng gói; đóng gói không vượt sản xuất đạt.');
  const etd = parseBusinessDate(values.etdUpdated);
  const eta = parseBusinessDate(values.etaUpdated);
  for (const value of [values.etdUpdated, values.etaUpdated]) if (value && value !== '—' && !parseBusinessDate(value)) throw new Error('Ngày phải đúng định dạng DD/MM/YYYY hoặc YYYY-MM-DD.');
  if (etd && eta && eta < etd) throw new Error('ETA không thể trước ETD.');
  const delta = values.shippedQty - po.shippedQty;
  const shipment = po.shipments.find(s => s.id === values.shipmentId);
  if (delta) {
    if (!shipment) throw new Error('Chọn đợt giao cần cập nhật số lượng xuất.');
    const actual = shipment.shippedQty ?? (parseBusinessDate(shipment.actualShip) ? shipment.qty : 0);
    if (actual + delta < 0 || actual + delta > shipment.qty) throw new Error('Số lượng xuất thay đổi vượt số lượng của đợt giao đã chọn.');
  }
  return po.shipments.map(s => {
    if (!delta || s.id !== values.shipmentId) return s;
    const shippedQty = (s.shippedQty ?? (parseBusinessDate(s.actualShip) ? s.qty : 0)) + delta;
    const actualShip = shippedQty > 0 ? delta < 0 && parseBusinessDate(s.actualShip) ? s.actualShip : DEMO_REPORT_DATE : '—';
    return { ...s, shippedQty, actualShip, status: shippedQty === s.qty ? 'Đã xuất' : shippedQty ? 'Xuất một phần' : 'Đang chuẩn bị', onTime: shippedQty < s.qty ? s.onTime : parseBusinessDate(s.etd) && parseBusinessDate(actualShip) <= parseBusinessDate(s.etd) ? 'Đúng hạn' : 'Quá hạn' };
  });
}

export function allocatePayment(payment, debt, rawAmount, date = DEMO_REPORT_DATE) {
  const amount = Number(rawAmount);
  if (!payment || !debt) throw new Error('Không tìm thấy giao dịch hoặc chứng từ.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > payment.unallocatedAmount || amount > debt.remaining) throw new Error('Số phân bổ phải lớn hơn 0, không vượt tiền chưa phân bổ hoặc dư nợ chứng từ.');
  if (payment.currency !== (debt.currency || 'VND')) throw new Error('Không thể phân bổ khác loại tiền.');
  const allowed = payment.allowedCustomerNames || [payment.partnerName];
  if (!allowed.includes(debt.customerName)) throw new Error('Giao dịch không thuộc khách hàng của chứng từ này.');
  return {
    payment: { ...payment, allocatedAmount: payment.allocatedAmount + amount, unallocatedAmount: payment.unallocatedAmount - amount, allocations: [...payment.allocations, { docNo: debt.docNo, poId: debt.poId, category: debt.category, sku: debt.sku, amount, date }] },
    debt: debtAtDate({ ...debt, allocatedPaid: debt.allocatedPaid + amount, status: debt.remaining === amount ? 'Đã hoàn tất' : 'Thu một phần' }, date),
  };
}
