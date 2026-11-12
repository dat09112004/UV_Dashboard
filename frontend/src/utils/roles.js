const businessRead = ['dashboard.read', 'orders.read', 'revenue.read', 'receivables.read', 'payables.read'];
const accounting = ['revenue.create', 'receivables.allocate', 'payables.submit', 'payables.record-payment'];
const executivePermissions = [
  ...businessRead,
  ...accounting,
  'orders.update',
  'payables.approve',
  'users.manage',
  'tasks.assign',
  'tasks.review',
];

export const EXECUTIVE_ROLES = ['CEO', 'Admin'];
export const isExecutiveRole = role => EXECUTIVE_ROLES.includes(role);

export const ROLE_PROFILES = {
  CEO: { label: 'CEO', title: 'Tổng Giám Đốc (CEO)', permissions: [...executivePermissions] },
  Admin: { label: 'Quản trị viên', title: 'Quản trị hệ thống', permissions: [...executivePermissions] },
  Sale: { label: 'Sale', title: 'Nhân viên kinh doanh', permissions: [...businessRead, 'orders.update', 'tasks.read'] },
  Accountant: { label: 'Kế toán', title: 'Kế toán', permissions: [...businessRead, ...accounting, 'tasks.read'] },
};

export const can = (user, permission) => user?.status === 'active' && Boolean((user.permissions ?? ROLE_PROFILES[user.role]?.permissions)?.includes(permission));

export function manageableRoles(actor) {
  if (!can(actor, 'users.manage')) return [];
  if (isExecutiveRole(actor.role)) return ['Admin', 'Sale', 'Accountant'];
  return [];
}

export function canEditAccount(actor, target) {
  return Boolean(target && target.id !== actor?.id && target.role !== 'CEO' &&
    manageableRoles(actor).includes(target.role));
}

export const NAVIGATION_LABELS = {
  overview: 'Tổng quan', orders: 'Tiến độ đơn hàng', revenue: 'Doanh thu',
  receivables: 'Công nợ phải thu', payables: 'Công nợ phải trả',
  users: 'Quản lý tài khoản', tasks: 'Công việc của tôi', assignments: 'Giao việc',
  reminders: 'Nhắc việc', 'data-entry': 'Nhập liệu Excel',
};
const sections = {
  overview: 'dashboard.read', orders: 'orders.read', revenue: 'revenue.read',
  receivables: 'receivables.read', payables: 'payables.read', users: 'users.manage',
  tasks: 'tasks.read', assignments: 'tasks.assign', reminders: 'dashboard.read', 'data-entry': 'dashboard.read',
};
export const DEPARTMENT_ROLES = { Sale: 'Phòng Sale', Accountant: 'Phòng Kế toán' };
export const OVERVIEW_SECTIONS = ['orders', 'revenue', 'receivables', 'payables'];

export const defaultNavigationForRole = role => {
  if (role === 'Sale') return ['orders', 'revenue', 'tasks', 'reminders', 'data-entry'];
  return Object.keys(NAVIGATION_LABELS).filter(section =>
    ROLE_PROFILES[role]?.permissions.includes(sections[section]) &&
    (section !== 'tasks' || !isExecutiveRole(role)));
};

export const navigationForRole = defaultNavigationForRole;

export function canOpenSection(user, section) {
  const key = section === 'assignment-reviews' ? 'assignments' : section;
  if (!can(user, sections[key])) return false;
  const navigation = user.navigation ?? defaultNavigationForRole(user.role);
  return navigation.includes(key) && (key !== 'overview' ||
    OVERVIEW_SECTIONS.every(item => navigation.includes(item)));
}
export const homeSection = user => (user?.navigation ?? defaultNavigationForRole(user?.role))
  .find(section => canOpenSection(user, section)) || 'overview';
