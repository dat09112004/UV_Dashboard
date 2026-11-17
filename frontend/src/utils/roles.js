export const ROLE_PROFILES = Object.freeze({
  CEO: {
    role: 'CEO',
    label: 'CEO',
    title: 'Tổng Giám Đốc (CEO)',
    defaultNavigation: ['overview', 'orders', 'revenue', 'receivables', 'payables', 'assignments', 'assignment-reviews', 'reminders', 'users', 'data-entry'],
    permissions: ['dashboard.read', 'orders.read', 'orders.update', 'orders.override-alert', 'revenue.read', 'revenue.create', 'receivables.read', 'receivables.allocate', 'payables.read', 'payables.submit', 'payables.approve', 'payables.record-payment', 'tasks.read', 'tasks.assign', 'tasks.review', 'users.manage'],
  },
  Admin: {
    role: 'Admin',
    label: 'Quản trị viên',
    title: 'Quản Trị Viên Hệ Thống (Admin)',
    defaultNavigation: ['overview', 'orders', 'revenue', 'receivables', 'payables', 'assignments', 'assignment-reviews', 'reminders', 'users', 'data-entry'],
    permissions: ['dashboard.read', 'orders.read', 'orders.update', 'orders.override-alert', 'revenue.read', 'revenue.create', 'receivables.read', 'receivables.allocate', 'payables.read', 'payables.submit', 'payables.approve', 'payables.record-payment', 'tasks.read', 'tasks.assign', 'tasks.review', 'users.manage'],
  },
  Sale: {
    role: 'Sale',
    label: 'Phòng Sale',
    title: 'Chuyên viên Quản lý Đơn hàng (Sale)',
    defaultNavigation: ['orders', 'revenue', 'tasks', 'reminders', 'data-entry'],
    permissions: ['dashboard.read', 'orders.read', 'orders.update', 'revenue.read', 'tasks.read'],
  },
  Accountant: {
    role: 'Accountant',
    label: 'Phòng Kế toán',
    title: 'Kế Toán Tổng Hợp & Công Nợ',
    defaultNavigation: ['overview', 'revenue', 'receivables', 'payables', 'tasks', 'reminders'],
    permissions: ['dashboard.read', 'orders.read', 'revenue.read', 'revenue.create', 'receivables.read', 'receivables.allocate', 'payables.read', 'payables.submit', 'payables.record-payment', 'tasks.read'],
  },
});

export const NAVIGATION_LABELS = Object.freeze({
  overview: 'Tổng quan',
  orders: 'Tiến độ đơn hàng',
  revenue: 'Doanh thu',
  receivables: 'Công nợ phải thu',
  payables: 'Công nợ phải trả',
  users: 'Quản lý tài khoản',
  tasks: 'Công việc của tôi',
  assignments: 'Giao việc',
  reminders: 'Nhắc việc',
  'data-entry': 'Đơn hàng',
});

export const OVERVIEW_SECTIONS = Object.freeze(['revenue', 'receivables', 'payables']);

export const DEPARTMENT_ROLES = Object.freeze({ Sale: 'Phòng Sale', Accountant: 'Phòng Kế toán' });
export const isExecutiveRole = role => role === 'CEO' || role === 'Admin';
export const defaultNavigationForRole = role => [...(ROLE_PROFILES[role]?.defaultNavigation ?? [])];
export function navigationForRole(role, customNavMap = null) {
  const defaultNav = defaultNavigationForRole(role);
  if (isExecutiveRole(role)) return defaultNav;
  const custom = customNavMap && typeof customNavMap === 'object' ? customNavMap[role] : null;
  if (Array.isArray(custom) && custom.length > 0) {
    const allowedSet = new Set(defaultNav);
    const filtered = custom.filter(sec => typeof sec === 'string' && allowedSet.has(sec));
    if (filtered.length > 0) return [...new Set(filtered)];
  }
  return defaultNav;
}
export const can = (user, permission) => Boolean(user?.status === 'active' && user.permissions?.includes(permission));
export const canOpenSection = (user, section) => Boolean(user?.status === 'active' &&
  (isExecutiveRole(user.role) || user.navigation?.includes(section)));
export const homeSection = user => isExecutiveRole(user?.role) ? 'overview' : user?.navigation?.[0] ?? 'orders';
export const manageableRoles = actor => actor?.status !== 'active' ? [] :
  actor.role === 'CEO' ? ['Sale', 'Accountant', 'CEO'] :
  actor.role === 'Admin' ? ['Sale', 'Accountant'] : [];
export const canEditAccount = (actor, target) => Boolean(actor && target && actor.id !== target.id &&
  manageableRoles(actor).includes(target.role));
export const canToggleAccountStatus = (actor, target) => Boolean(
  actor &&
  target &&
  actor.status === 'active' &&
  isExecutiveRole(actor.role) &&
  actor.id !== target.id &&
  !(actor.role === 'Admin' && target.role === 'Admin')
);
