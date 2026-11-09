import { ROLE_PROFILES } from '../utils/roles.js';

/**
 * Tài khoản thử nghiệm tại máy, không chứa tài khoản thật.
 * Giữ nguyên email/mật khẩu/vai trò từ bộ dữ liệu được cung cấp.
 * Các mã nhân viên, ID và thông tin hiển thị bổ sung là dữ liệu mẫu.
 * Khi nối backend: thay bằng hồ sơ được server xác thực, không đưa mật khẩu thật vào frontend.
 */
export const MOCK_ACCOUNTS = [
  {
    username: 'ceo@uyenvu.vn',
    password: '123',
    id: 'user-ceo',
    employeeCode: 'UV-CEO-001',
    email: 'ceo@uyenvu.vn',
    role: 'CEO',
    permissions: ROLE_PROFILES.CEO.permissions,
    roleLabel: 'CEO',
    status: 'active',
    avatar: null,
    initials: 'TQ',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'company',
    name: 'Trần Quốc',
    title: 'Tổng Giám Đốc (CEO)',
    department: 'Ban Điều Hành',
    permissionDescription: 'Quản lý toàn bộ hệ thống, quản lý tài khoản, giao việc, duyệt chi và xác nhận bàn giao.'
  },
  {
    username: 'sale@uyenvu.vn',
    password: '123',
    id: 'user-sale',
    employeeCode: 'UV-SAL-001',
    email: 'sale@uyenvu.vn',
    role: 'Sale',
    permissions: ROLE_PROFILES.Sale.permissions,
    roleLabel: 'Sale',
    status: 'active',
    avatar: null,
    initials: 'LH',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'company',
    name: 'Lê Hương',
    title: 'Chuyên viên Quản lý Đơn hàng (Sale)',
    department: 'Phòng Kinh Doanh & Đơn Hàng',
    permissionDescription: 'Cập nhật tiến độ 4 mốc (Released PO, On Process, Packaging, Shipdate ETD/ETA), theo dõi tồn kho, nhắc việc & gửi bàn giao.'
  },
  {
    username: 'ketoan@uyenvu.vn',
    password: '123',
    id: 'user-accountant',
    employeeCode: 'UV-ACC-001',
    email: 'ketoan@uyenvu.vn',
    role: 'Accountant',
    permissions: ROLE_PROFILES.Accountant.permissions,
    roleLabel: 'Kế toán',
    status: 'active',
    avatar: null,
    initials: 'PL',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'finance',
    name: 'Phạm Lan',
    title: 'Kế toán trưởng (Doanh thu & Công nợ)',
    department: 'Phòng Tài Chính - Kế Toán',
    permissionDescription: 'Quản lý Doanh thu, phân bổ tiền thu khách hàng (AR), kiểm soát hạn thanh toán, nhắc việc & trình duyệt chi Nhà cung cấp (AP).'
  },
  {
    username: 'admin@uyenvu.vn',
    password: '123',
    id: 'user-admin',
    employeeCode: 'UV-ADM-001',
    email: 'admin@uyenvu.vn',
    role: 'Admin',
    permissions: ROLE_PROFILES.Admin.permissions,
    roleLabel: 'Quản trị viên',
    status: 'active',
    avatar: null,
    initials: 'QT',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    dataScope: 'company',
    name: 'Quản trị Demo',
    title: 'Quản trị hệ thống',
    department: 'Ban Điều Hành & Quản Trị',
    permissionDescription: 'Toàn quyền như CEO: quản lý hệ thống, quản lý tài khoản, giao việc, nhận nhắc việc và duyệt tất cả công việc & tài chính.'
  },
];
