// Cấu hình hồ sơ vai trò (Role Profiles), quyền hạn (Permissions) và thanh điều hướng mặc định của hệ thống
export const ROLE_PROFILES = Object.freeze({
  CEO: {
    role: 'CEO',
    label: 'CEO',
    title: 'Tổng Giám Đốc (CEO)',
    defaultNavigation: ['overview', 'orders', 'revenue', 'receivables', 'payables', 'assignments', 'assignment-reviews', 'reminders', 'data-entry'],
    permissions: ['dashboard.read', 'orders.read', 'orders.update', 'orders.override-alert', 'revenue.read', 'revenue.create', 'receivables.read', 'receivables.allocate', 'payables.read', 'payables.submit', 'payables.approve', 'payables.record-payment', 'tasks.read', 'tasks.assign', 'tasks.review'],
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
    defaultNavigation: ['orders', 'tasks', 'reminders', 'data-entry'],
    permissions: ['dashboard.read', 'orders.read', 'orders.update', 'tasks.read'],
  },
  Accountant: {
    role: 'Accountant',
    label: 'Phòng Kế toán',
    title: 'Kế Toán Tổng Hợp & Công Nợ',
    defaultNavigation: ['overview', 'revenue', 'receivables', 'payables', 'tasks', 'reminders', 'data-entry'],
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

// Chức năng: Kiểm tra vai trò có thuộc nhóm điều hành cấp cao (CEO hoặc Admin) để duyệt chi và giao việc hay không
export const isExecutiveRole = role => role === 'CEO' || role === 'Admin';

// Chức năng: Lấy danh sách các tab điều hướng mặc định được khởi tạo cho từng vai trò
export const defaultNavigationForRole = role => [...(ROLE_PROFILES[role]?.defaultNavigation ?? [])];

// Chức năng: Tính toán danh sách các tab điều hướng thực tế cho một vai trò dựa trên cấu hình phòng ban
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

// Chức năng: Kiểm tra tài khoản đang hoạt động có một quyền nghiệp vụ cụ thể (permission) hay không
export const can = (user, permission) => Boolean(user?.status === 'active' && user.permissions?.includes(permission));

// Chức năng: Kiểm tra người dùng có được phép mở một phân hệ trên thanh điều hướng hay không (riêng 'users' chỉ dành cho Admin)
export const canOpenSection = (user, section) => {
  if (!user || user.status !== 'active') return false;
  if (section === 'users') {
    return user.role === 'Admin' && (Array.isArray(user.navigation) ? user.navigation.includes('users') : true);
  }
  return Boolean(isExecutiveRole(user.role) || user.navigation?.includes(section));
};

// Chức năng: Xác định trang chủ mặc định khi người dùng vừa đăng nhập hoặc bấm vào logo thương hiệu
export const homeSection = user => isExecutiveRole(user?.role) ? 'overview' : user?.navigation?.[0] ?? 'orders';

// Chức năng: Trả về danh sách các vai trò mà người dùng hiện tại được phép tạo hoặc cấp quyền (chỉ Admin mới được quản lý Sale & Accountant, CEO không có quyền này)
export const manageableRoles = actor => actor?.status !== 'active' ? [] :
  actor.role === 'Admin' ? ['Sale', 'Accountant'] : [];

// Chức năng: Kiểm tra người dùng hiện tại có quyền chỉnh sửa/cấp quyền cho tài khoản mục tiêu hay không (chỉ Admin được sửa Sale & Accountant)
export const canEditAccount = (actor, target) => Boolean(actor && target && actor.status === 'active' &&
  actor.role === 'Admin' && actor.id !== target.id &&
  manageableRoles(actor).includes(target.role));

// Chức năng: Kiểm tra người dùng hiện tại có quyền khóa/mở khóa tài khoản mục tiêu hay không (chỉ Admin mới có quyền khóa/mở khóa CEO, Sale, Accountant; CEO không có quyền khóa tài khoản)
export const canToggleAccountStatus = (actor, target) => Boolean(
  actor &&
  target &&
  actor.status === 'active' &&
  actor.role === 'Admin' &&
  actor.id !== target.id &&
  target.role !== 'Admin'
);
