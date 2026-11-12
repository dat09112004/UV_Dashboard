import {
  changePasswordApi, clearAuthToken, fetchBootstrapApi, loginApi, setAuthToken,
} from '../../../services/api.js';

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
  const { token, refreshToken, account } = response.data;
  if (!token || !account) throw new Error('Phản hồi đăng nhập không hợp lệ.');
  setAuthToken(token, refreshToken);
  try {
    const directory = await fetchBootstrapApi();
    return { status: 'authenticated', account, homeSection: account.home, directory };
  } catch (error) {
    clearAuthToken();
    throw error;
  }
}

export async function authenticateAccount(email, password, acceptedTerms, policyVersion, options) {
  return (await signIn(email, password, acceptedTerms, policyVersion, options)).account ?? null;
}

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
