const businessRead = ['dashboard.read', 'orders.read', 'revenue.read', 'receivables.read', 'payables.read'];
const accounting = ['revenue.create', 'receivables.allocate', 'payables.submit', 'payables.record-payment'];
const executivePermissions = [
  ...businessRead,
  ...accounting,
  'orders.update',
  'payables.approve',
  'accounts.manage',
  'tasks.assign',
  'tasks.confirm',
  'reminders.manage',
];

export const EXECUTIVE_ROLES = ['CEO', 'Admin'];
export const isExecutiveRole = role => EXECUTIVE_ROLES.includes(role);

export const ROLE_PROFILES = {
  CEO: { label: 'CEO', title: 'Tổng Giám Đốc (CEO)', permissions: [...executivePermissions] },
  Admin: { label: 'Quản trị viên', title: 'Quản trị hệ thống', permissions: [...executivePermissions] },
  Sale: { label: 'Sale', title: 'Nhân viên kinh doanh', permissions: [...businessRead, 'orders.update', 'tasks.handover', 'reminders.create'] },
  Accountant: { label: 'Kế toán', title: 'Kế toán', permissions: [...businessRead, ...accounting, 'tasks.handover', 'reminders.create'] },
};

export const can = (user, permission) => user?.status === 'active' && Boolean(user.permissions?.includes(permission));

export function manageableRoles(actor) {
  if (!can(actor, 'accounts.manage')) return [];
  if (isExecutiveRole(actor.role)) return Object.keys(ROLE_PROFILES);
  return [];
}

export function canEditAccount(actor, target) {
  return Boolean(target && target.id !== actor?.id && target.id !== 'user-ceo' &&
    manageableRoles(actor).includes(target.role));
}

export const NAVIGATION_LABELS = {
  overview: 'Tổng quan', orders: 'Tiến độ đơn hàng', revenue: 'Doanh thu',
  receivables: 'Công nợ phải thu', payables: 'Công nợ phải trả',
  users: 'Quản lý tài khoản', tasks: 'Công việc của tôi', assignments: 'Giao việc',
  reminders: 'Nhắc việc',
};
const sections = {
  overview: 'dashboard.read', orders: 'orders.read', revenue: 'revenue.read',
  receivables: 'receivables.read', payables: 'payables.read', users: 'accounts.manage',
  tasks: 'tasks.handover', assignments: 'tasks.assign', reminders: 'dashboard.read',
};
export const DEPARTMENT_ROLES = { Sale: 'Phòng Sale', Accountant: 'Phòng Kế toán' };
export const OVERVIEW_SECTIONS = ['orders', 'revenue', 'receivables', 'payables'];

export const navigationForRole = role => Object.keys(NAVIGATION_LABELS)
  .filter(section => ROLE_PROFILES[role]?.permissions.includes(sections[section]));

export const defaultNavigationForRole = role => role === 'Sale'
  ? ['orders', 'revenue', 'tasks', 'reminders'] : navigationForRole(role);

export function canOpenSection(user, section) {
  if (section === 'data-entry') return user?.status === 'active' && Object.hasOwn(ROLE_PROFILES, user.role);
  if (section === 'reminders') return user?.status === 'active' && Object.hasOwn(ROLE_PROFILES, user.role);
  const key = section === 'assignment-reviews' ? 'assignments' : section;
  if (!can(user, sections[key])) return false;
  const navigation = user.navigation ?? defaultNavigationForRole(user.role);
  return navigation.includes(key) && (key !== 'overview' ||
    OVERVIEW_SECTIONS.every(item => navigation.includes(item)));
}
export const homeSection = user => [...Object.keys(NAVIGATION_LABELS), 'data-entry']
  .find(section => canOpenSection(user, section)) || 'data-entry';
