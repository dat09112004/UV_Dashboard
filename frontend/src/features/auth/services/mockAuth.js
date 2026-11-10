import {
  changePasswordApi,
  clearAuthToken,
  fetchBootstrapApi,
  fetchFinanceStateApi,
  fetchOrdersApi,
  loginApi,
  setAuthToken,
} from '../../../services/api.js';
import { setClientIdentity } from '../../../utils/permissions.js';

/**
 * Xác thực đăng nhập trực tiếp với Backend API (/api/v1/auth/login).
 * Kiểm tra bắt buộc đồng ý Chính sách bảo mật & Điều khoản sử dụng (`acceptedTerms`).
 * Không sử dụng bất kỳ tài khoản mẫu (MOCK_ACCOUNTS) hay mật khẩu lưu trên trình duyệt nào.
 */
export async function attemptMockSignIn(email, password, acceptedTerms = true) {
  if (!acceptedTerms) {
    return {
      status: 'terms_required',
      message: 'Vui lòng tích chọn đồng ý Chính sách bảo mật và Điều khoản sử dụng trước khi đăng nhập.',
    };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || typeof password !== 'string' || !password || password.length > 128) {
    return { status: 'invalid' };
  }

  let response;
  try {
    response = await loginApi(normalizedEmail, password, true);
  } catch (err) {
    if (err.code === 'TERMS_NOT_ACCEPTED') {
      return {
        status: 'terms_required',
        message: err.message,
      };
    }
    if (err.status === 401) return { status: 'invalid' };
    if (err.status === 429) throw err;
    throw new Error(err.message || 'Không thể kết nối đến máy chủ xác thực.');
  }

  if (response.status === 423 || response.data?.status === 'locked') {
    clearAuthToken();
    return { status: 'locked' };
  }

  if (response.status !== 200 || !response.data?.token || !response.data?.account) {
    return { status: 'invalid' };
  }

  const { token, account, homeSection } = response.data;
  setAuthToken(token);
  setClientIdentity(account);

  // Nạp đồng thời dữ liệu Quản trị/Công việc, Đơn hàng PO và Tài chính đã cô lập quyền từ Backend
  const [directory, ordersPayload, financeState] = await Promise.all([
    fetchBootstrapApi(),
    fetchOrdersApi().catch(() => ({ items: [] })),
    fetchFinanceStateApi().catch(() => null),
  ]);

  return {
    status: 'authenticated',
    token,
    account,
    homeSection,
    directory,
    orders: ordersPayload?.items || [],
    finance: financeState,
  };
}

export async function authenticateMockAccount(email, password, acceptedTerms = true) {
  const result = await attemptMockSignIn(email, password, acceptedTerms);
  return result.account ?? null;
}

/**
 * Đổi mật khẩu cá nhân trực tiếp qua Backend API (/api/v1/auth/change-password).
 */
export async function changeMockPassword(_accountId, currentPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.trim().length < 8 || newPassword.length > 128) {
    return 'Mật khẩu mới phải có từ 8 đến 128 ký tự.';
  }
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
    return 'Mật khẩu hiện tại không hợp lệ.';
  }
  try {
    await changePasswordApi(currentPassword, newPassword);
    return null;
  } catch (err) {
    return err.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.';
  }
}
