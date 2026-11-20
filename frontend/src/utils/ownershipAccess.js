// Chức năng: Kiểm tra vai trò quản trị / điều hành có toàn quyền xử lý
export function isLeadershipRole(role) {
  return role === 'CEO' || role === 'Admin';
}

// Chức năng: Xác định danh sách người phụ trách của một dòng đơn hàng (từ Sale tạo hoặc phân công Giao việc)
export function resolveOrderResponsible(item, tasks = [], accounts = []) {
  const ids = new Set();
  const names = [];
  if (!item) return { ids, names, ownerLabel: '' };

  const addPerson = (id, name) => {
    const cleanId = id ? String(id).trim() : '';
    if (cleanId) ids.add(cleanId);
    const cleanName = String(name || '').trim();
    if (cleanName && !names.includes(cleanName)) names.push(cleanName);
  };

  if (item.assignedSaleId) {
    addPerson(item.assignedSaleId, item.assignedSaleName || item.createdByName);
  }
  if (item.ownerType === 'sale_self_owned' || item.createdByRole === 'Sale') {
    if (item.createdById) {
      addPerson(item.createdById, item.createdByName || item.assignedSaleName);
    }
  }

  const rowIdStr = item.rowId != null ? String(item.rowId) : '';
  const orderAlertId = rowIdStr ? `order-${rowIdStr}` : '';
  const poUpper = String(item.poId || '').trim().toUpperCase();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || !task.assigneeId) continue;
    const src = task.sourceAlert;
    if (!src || src.type !== 'orders') continue;
    const srcId = String(src.id || '').trim();
    const srcRef = String(src.reference || '').trim().toUpperCase();
    const matched =
      (orderAlertId && srcId === orderAlertId) ||
      (rowIdStr && srcId === rowIdStr) ||
      (poUpper && srcRef && srcRef === poUpper);
    if (matched) {
      const acc = Array.isArray(accounts)
        ? accounts.find(a => a.id === task.assigneeId)
        : null;
      addPerson(task.assigneeId, acc?.name || task.assigneeName || '');
    }
  }

  return {
    ids,
    names,
    ownerLabel: names.join(', ') || 'nhân sự phụ trách khác',
  };
}

// Chức năng: Kiểm tra tài khoản hiện tại có quyền sửa/cập nhật/giao hàng cho đơn hàng hay chỉ được xem
export function canActorEditOrder(actor, item, tasks = [], accounts = []) {
  if (!actor || !item) return { allowed: false, ownerLabel: '' };
  if (isLeadershipRole(actor.role)) return { allowed: true, ownerLabel: '' };
  if (actor.role !== 'Sale') return { allowed: false, ownerLabel: '' };

  const { ids, ownerLabel } = resolveOrderResponsible(item, tasks, accounts);
  if (ids.size === 0) {
    return { allowed: true, ownerLabel: '' };
  }
  const allowed = ids.has(String(actor.id || '').trim());
  return { allowed, ownerLabel };
}

// Chức năng: Xác định danh sách kế toán phụ trách của một bản ghi công nợ (AR/AP) hoặc doanh thu
export function resolveFinanceResponsible(record, recordType, tasks = [], accounts = []) {
  const ids = new Set();
  const names = [];
  if (!record) return { ids, names, ownerLabel: '' };

  const addPerson = (id, name) => {
    const cleanId = id ? String(id).trim() : '';
    if (cleanId) ids.add(cleanId);
    const cleanName = String(name || '').trim();
    if (cleanName && !names.includes(cleanName)) names.push(cleanName);
  };

  if (record.assignedAccountantId) {
    addPerson(record.assignedAccountantId, record.assignedAccountantName || record.createdByName);
  }
  if (record.ownerType === 'accountant_self_owned' || record.createdByRole === 'Accountant') {
    if (record.createdById) {
      addPerson(record.createdById, record.createdByName || record.assignedAccountantName);
    }
  }

  const recId = String(record.id || '').trim();
  const alertId = recId && recordType ? `${recordType}-${recId}` : '';
  const docUpper = String(record.docNo || '').trim().toUpperCase();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || !task.assigneeId) continue;
    const src = task.sourceAlert;
    if (!src || (recordType && src.type !== recordType)) continue;
    const srcId = String(src.id || '').trim();
    const srcRef = String(src.reference || '').trim().toUpperCase();
    const matched =
      (alertId && srcId === alertId) ||
      (recId && srcId === recId) ||
      (docUpper && srcRef && srcRef === docUpper);
    if (matched) {
      const acc = Array.isArray(accounts)
        ? accounts.find(a => a.id === task.assigneeId)
        : null;
      addPerson(task.assigneeId, acc?.name || task.assigneeName || '');
    }
  }

  return {
    ids,
    names,
    ownerLabel: names.join(', ') || 'kế toán phụ trách khác',
  };
}

// Chức năng: Kiểm tra tài khoản kế toán hiện tại có quyền sửa/xử lý chứng từ tài chính hay đang ở hàng chờ chung / chỉ xem
export function canActorEditFinanceRecord(actor, record, recordType, tasks = [], accounts = []) {
  if (!actor || !record) return { allowed: false, unassigned: false, ownerLabel: '', isSelfOwned: false };
  const { ids, ownerLabel } = resolveFinanceResponsible(record, recordType, tasks, accounts);
  const unassigned = ids.size === 0;
  if (isLeadershipRole(actor.role)) {
    return { allowed: true, unassigned, ownerLabel: unassigned ? '' : ownerLabel, isSelfOwned: false };
  }
  if (actor.role !== 'Accountant') {
    return { allowed: false, unassigned, ownerLabel: unassigned ? '' : ownerLabel, isSelfOwned: false };
  }
  if (unassigned) {
    return {
      allowed: record.ownerType !== 'unassigned',
      unassigned: true,
      ownerLabel: 'Chưa có người phụ trách',
      isSelfOwned: false,
    };
  }
  const isSelfOwned = ids.has(String(actor.id || '').trim());
  return { allowed: isSelfOwned, unassigned: false, ownerLabel, isSelfOwned };
}
