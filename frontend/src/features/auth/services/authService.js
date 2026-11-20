import {
  changePasswordApi,
  clearAuthToken,
  decodeJwtPayload,
  ensureValidSessionToken,
  fetchBootstrapApi,
  getAuthToken,
  getRefreshToken,
  getSessionVersion,
  getStoredAuthSession,
  loginApi,
  setAuthToken,
  updateSessionAccount,
} from '../../../services/api.js';

// Chức năng: Thực hiện đăng nhập người dùng, lưu thông tin phiên an toàn và nạp dữ liệu khởi tạo hệ thống
export async function signIn(
  email,
  password,
  acceptedTerms,
  policyVersion,
  { requiredOnLogin = true } = {}
) {
  if (requiredOnLogin !== false && acceptedTerms !== true) {
    return { status: 'terms_required' };
  }
  if (!email.trim() || !password || password.length > 128) return { status: 'invalid' };

  let response;
  try {
    response = await loginApi(email.trim().toLowerCase(), password, acceptedTerms, policyVersion);
  } catch (error) {
    if (error.code === 'TERMS_REQUIRED') return { status: 'terms_required', message: error.message };
    if (error.status === 401) return { status: 'invalid' };
    throw error;
  }
  if (response.status === 423) return { status: 'locked' };
  const {
    token,
    refreshToken,
    account,
    accessExpiresAt,
    refreshExpiresAt,
    expiresIn,
    refreshExpiresIn,
  } = response.data;
  if (!token || !account) throw new Error('Phản hồi đăng nhập không hợp lệ.');
  setAuthToken(token, refreshToken, {
    accessExpiresAt,
    refreshExpiresAt,
    expiresIn,
    refreshExpiresIn,
    accountId: account.id,
    account,
  });
  try {
    const directory = await fetchBootstrapApi();
    return { status: 'authenticated', account, homeSection: account.home, directory };
  } catch (error) {
    clearAuthToken();
    throw error;
  }
}

let restoreInFlight = null;

/**
 * QA02 + QA03 + QA04 Fix:
 * - Khôi phục phiên đăng nhập từ sessionStorage của tab hiện tại (hỗ trợ chống gọi đúp do React.StrictMode khi F5).
 * - Đối chiếu nghiêm ngặt principal qua directory.me, stored.accountId và jwt.sub; tuyệt đối không fallback sang tài khoản active khác (QA02).
 * - Không ghi đè lại access token cũ sau khi fetchBootstrapApi đã xoay vòng token mới (QA03).
 * - Trả về trạng thái lỗi tạm thời (transient_error) khi mạng/server gián đoạn để giao diện hiển thị nút Thử lại (QA04).
 */
export async function restoreSessionOnLoad() {
  const version = getSessionVersion();
  if (restoreInFlight?.version === version) {
    return restoreInFlight.promise;
  }

  // Chức năng: Chạy tác vụ (runRestore - Restore) phục vụ xử lý dữ liệu trong authService.js
  const runRestore = async () => {
    const stored = getStoredAuthSession();
    if (!stored) return { status: 'anonymous' };

    const activeToken = getAuthToken() || stored.token || null;
    const activeRefresh = getRefreshToken() || stored.refreshToken || null;
    setAuthToken(activeToken, activeRefresh, {
      accessExpiresAt: stored.accessExpiresAt,
      refreshExpiresAt: stored.refreshExpiresAt,
      accountId: stored.accountId,
      account: stored.account,
    });

    try {
      const tokenStatus = await ensureValidSessionToken();
      if (tokenStatus.status === 'expired' || tokenStatus.status === 'anonymous') {
        clearAuthToken();
        return { status: 'expired' };
      }
      if (tokenStatus.status === 'transient_error') {
        return {
          status: 'transient_error',
          message: tokenStatus.message || 'Kết nối tạm thời gián đoạn khi làm mới phiên đăng nhập.',
          retryAfterMs: tokenStatus.retryAfterMs || 1500,
        };
      }

      const directory = await fetchBootstrapApi();
      const accounts = Array.isArray(directory?.accounts) ? directory.accounts : [];
      const currentJwt = getAuthToken() || tokenStatus.token || stored.token;
      const jwtSub = decodeJwtPayload(currentJwt)?.sub || null;
      const storedId = stored.accountId || stored.account?.id || null;
      const bootstrapMeId = directory?.me?.id || null;

      if (
        (storedId && jwtSub && storedId !== jwtSub) ||
        (storedId && bootstrapMeId && storedId !== bootstrapMeId) ||
        (jwtSub && bootstrapMeId && jwtSub !== bootstrapMeId)
      ) {
        clearAuthToken();
        return { status: 'expired' };
      }

      const expectedId = bootstrapMeId || jwtSub || storedId;
      if (!expectedId) {
        clearAuthToken();
        return { status: 'expired' };
      }

      const matched =
        accounts.find(acc => acc.id === expectedId && acc.status === 'active') ||
        (directory?.me?.id === expectedId && directory.me.status === 'active' ? directory.me : null);

      if (!matched || (storedId && matched.id !== storedId)) {
        clearAuthToken();
        return { status: 'expired' };
      }

      // QA03 Fix: Chỉ cập nhật thông tin tài khoản, giữ nguyên bộ token mới nhất do lớp API quản lý
      updateSessionAccount(matched);

      return {
        status: 'authenticated',
        account: matched,
        homeSection: matched.home,
        directory,
      };
    } catch (error) {
      if (error?.status === 401 || error?.status === 403 || error?.code === 'SESSION_EXPIRED') {
        clearAuthToken();
        return { status: 'expired' };
      }
      return {
        status: 'transient_error',
        message: error?.message || 'Không thể kết nối máy chủ để khôi phục phiên đăng nhập.',
      };
    }
  };

  const promise = runRestore();
  restoreInFlight = { version, promise };
  try {
    return await promise;
  } finally {
    if (restoreInFlight?.promise === promise) {
      restoreInFlight = null;
    }
  }
}

// Chức năng: Xác thực (authenticateAccount - Account) phục vụ xử lý dữ liệu trong authService.js
export async function authenticateAccount(email, password, acceptedTerms, policyVersion, options) {
  return (await signIn(email, password, acceptedTerms, policyVersion, options)).account ?? null;
}

// Chức năng: Xử lý nghiệp vụ (changePassword - Password) phục vụ xử lý dữ liệu trong authService.js
export async function changePassword(_accountId, currentPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.trim().length < 12 || newPassword.length > 128) {
    return 'Mật khẩu mới phải có từ 12 đến 128 ký tự.';
  }
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
    return 'Mật khẩu hiện tại không hợp lệ.';
  }
  try {
    await changePasswordApi(currentPassword, newPassword);
    return null;
  } catch (error) {
    return error.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.';
  }
}
