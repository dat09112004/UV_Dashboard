import { MOCK_ACCOUNTS } from '../../../mock/accounts.js';
import { readDirectory, directoryProfiles } from '../../users/services/demoDirectory.js';
import { createPasswordRecord, matchesPassword, validNewPassword } from './demoPasswords.js';

// This store is only for demo accounts. Production credentials belong to the server.
const passwordKey = id => `uv-demo-password-v1:${id}`;
export async function attemptMockSignIn(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const directory = readDirectory();
  const account = directoryProfiles(directory).find(item => item.email === normalizedEmail);
  if (!account || typeof password !== 'string' || password.length > 128) return { status: 'invalid' };
  const saved = globalThis.localStorage?.getItem(passwordKey(account.id)) ?? directory.credentials[account.id] ?? null;
  const demoSeed = MOCK_ACCOUNTS.find(item => item.id === account.id) || {};
  if (!await matchesPassword(demoSeed, password, saved)) return { status: 'invalid' };
  const latest = directoryProfiles(readDirectory()).find(item => item.id === account.id && item.email === normalizedEmail);
  if (!latest) return { status: 'invalid' };
  return latest.status === 'active' ? { status: 'authenticated', account: latest } : { status: 'locked' };
}

export async function authenticateMockAccount(email, password) {
  const result = await attemptMockSignIn(email, password);
  return result.account ?? null;
}

export async function changeMockPassword(accountId, currentPassword, newPassword) {
  const directory = readDirectory();
  const account = directoryProfiles(directory).find(item => item.id === accountId && item.status === 'active');
  if (!account) return 'Tài khoản không khả dụng.';
  if (!validNewPassword(newPassword)) return 'Mật khẩu mới phải có từ 8 đến 128 ký tự.';
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) return 'Mật khẩu hiện tại không hợp lệ.';
  const storage = globalThis.localStorage;
  if (!storage || !globalThis.crypto?.subtle) return 'Đổi mật khẩu thử nghiệm cần trình duyệt hỗ trợ lưu trữ trên HTTPS hoặc localhost.';
  const key = passwordKey(account.id);
  const saved = storage.getItem(key);
  if (!await matchesPassword(MOCK_ACCOUNTS.find(item => item.id === account.id) || {}, currentPassword, saved ?? directory.credentials[account.id] ?? null)) return 'Mật khẩu hiện tại không đúng.';
  if (currentPassword === newPassword) return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  const record = await createPasswordRecord(newPassword);
  if (storage.getItem(key) !== saved) return 'Mật khẩu vừa được thay đổi. Vui lòng nhập lại mật khẩu hiện tại.';
  storage.setItem(key, record);
  return null;
}
