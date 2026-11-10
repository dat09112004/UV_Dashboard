/**
 * Điểm tập trung các Phân hệ Nghiệp vụ (`src/modules/index.js`):
 * - `auth`: Đăng nhập (kiểm tra `acceptedTerms`), Đăng xuất (Redis JTI Blacklist), Làm mới JWT, Đổi mật khẩu.
 * - `directory`: Quản lý tài khoản nhân sự, khóa/mở khóa, phân quyền điều hướng phòng ban.
 * - `dashboard`: Tổng quan KPI điều hành, hàng đợi Báo động đỏ & dòng trạng thái nghiêng.
 * - `orders`: Theo dõi tiến độ đơn hàng PO (phân trang, tải dần từng phần, cập nhật tiến độ & xóa cache cũ).
 * - `finance`: Doanh thu, Phải thu AR, Khoản thu, Phân bổ, Phải trả AP, Tách chứng từ, Duyệt chi & Thực chi.
 * - `operations`: Giao việc cá nhân/phòng ban, tiếp nhận, bàn giao tệp riêng tư, duyệt việc & nhắc việc.
 * - `dataEntry`: Nhập liệu lô Excel / Lưới 500 dòng nguyên tử (Atomic Transaction).
 */
export * as authDirectoryService from '../services/authDirectoryService.js';
export * as dashboardService from '../services/dashboardService.js';
export * as orderService from '../services/orderService.js';
export * as financeService from '../services/financeService.js';
export * as dataEntryService from '../services/dataEntryService.js';
