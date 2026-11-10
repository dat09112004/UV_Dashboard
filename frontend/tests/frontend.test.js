import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('FE-01: Kiểm tra loại bỏ hoàn toàn dữ liệu mẫu (Zero Mock Data) và cấu hình kết nối RESTful API', () => {
  const mockDir = path.resolve('src/mock');
  assert.equal(fs.existsSync(mockDir), false, 'Thư mục src/mock phải được xóa hoàn toàn');

  const demoPasswords = path.resolve('src/features/auth/services/demoPasswords.js');
  assert.equal(fs.existsSync(demoPasswords), false, 'File demoPasswords.js phải được xóa hoàn toàn');

  const apiJs = fs.readFileSync(path.resolve('src/services/api.js'), 'utf8');
  assert.match(apiJs, /\/auth\/login/);
  assert.match(apiJs, /\/auth\/logout/);
  assert.match(apiJs, /\/auth\/refresh/);
  assert.match(apiJs, /acceptedTerms/);
});

test('FE-02: Kiểm tra tích hợp Debounce (useDebouncedValue) trên tất cả các màn hình tìm kiếm và bộ lọc', () => {
  const debounceHook = fs.readFileSync(path.resolve('src/hooks/useDebounce.js'), 'utf8');
  assert.match(debounceHook, /export function useDebouncedValue/);
  assert.match(debounceHook, /export function useDebouncedCallback/);

  const filesWithDebounce = [
    'src/App.jsx',
    'src/features/operations/components/TasksPage.jsx',
    'src/features/operations/components/RemindersPage.jsx',
    'src/features/users/components/AccountsPage.jsx',
    'src/features/dataEntry/DataEntryPage.jsx',
  ];

  for (const relPath of filesWithDebounce) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert.match(
      content,
      /useDebouncedValue/,
      `File ${relPath} phải áp dụng useDebouncedValue cho ô tìm kiếm và bộ lọc`
    );
  }
});

test('FE-03: Kiểm tra Ô tích Chính sách bảo mật & Điều khoản sử dụng bắt buộc trên màn hình Đăng nhập', async () => {
  const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
  assert.match(appJsx, /id="login-accept-terms"/);
  assert.match(appJsx, /name="acceptedTerms"/);
  assert.match(appJsx, /Tôi đã đọc và đồng ý với Chính sách bảo mật và Điều khoản sử dụng hệ thống/);
  assert.match(appJsx, /Xem chi tiết Chính sách bảo mật & Điều khoản sử dụng/);

  const { attemptMockSignIn } = await import('../src/features/auth/services/mockAuth.js');
  const blockedResult = await attemptMockSignIn('ceo@uyenvu.vn', '123', false);
  assert.equal(blockedResult.status, 'terms_required');
  assert.match(blockedResult.message, /Chính sách bảo mật và Điều khoản sử dụng/);
});

test('FE-04: Kiểm tra Phân trang, Tải trước 1 phần & Cuộn tải dần (useProgressivePagination) + Clear trang cũ khi chuyển trang', () => {
  const hookCode = fs.readFileSync(
    path.resolve('src/hooks/useProgressivePagination.js'),
    'utf8'
  );
  assert.match(hookCode, /export function useProgressivePagination/);
  assert.match(hookCode, /IntersectionObserver/);
  assert.match(hookCode, /releasePageCacheApi/);
  assert.match(hookCode, /createPageAbortSignal/);

  const barCode = fs.readFileSync(
    path.resolve('src/components/common/ProgressivePaginationBar.jsx'),
    'utf8'
  );
  assert.match(barCode, /export default function ProgressivePaginationBar/);
  assert.match(barCode, /sentinelRef/);

  const paginatedFiles = [
    'src/App.jsx',
    'src/components/orders/FulfillmentTable.jsx',
    'src/features/operations/components/TasksPage.jsx',
    'src/features/operations/components/RemindersPage.jsx',
    'src/features/users/components/AccountsPage.jsx',
    'src/features/dataEntry/DataEntryPage.jsx',
  ];

  for (const relPath of paginatedFiles) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert.match(
      content,
      /useProgressivePagination/,
      `File ${relPath} phải áp dụng useProgressivePagination`
    );
    assert.match(
      content,
      /ProgressivePaginationBar/,
      `File ${relPath} phải hiển thị ProgressivePaginationBar`
    );
  }
});

test('FE-05: Kiểm tra cấu trúc Frontend tinh gọn (không chứa file thừa của Backend)', async () => {
  const requiredFeDirs = [
    'assets',
    'components',
    'contexts',
    'features',
    'hooks',
    'locales',
    'routes',
    'services',
    'store',
    'styles',
    'utils',
  ];
  const requiredFeFiles = ['App.jsx', 'index.css', 'main.jsx'];

  for (const dirName of requiredFeDirs) {
    assert.equal(
      fs.existsSync(path.resolve('src', dirName)),
      true,
      `Thiếu thư mục Frontend src/${dirName}`
    );
  }
  for (const fileName of requiredFeFiles) {
    assert.equal(
      fs.existsSync(path.resolve('src', fileName)),
      true,
      `Thiếu file gốc Frontend src/${fileName}`
    );
  }
  for (const beOnly of ['server.js', 'cluster.js', 'app.js', 'database', 'db', 'middlewares']) {
    assert.equal(
      fs.existsSync(path.resolve('src', beOnly)),
      false,
      `Frontend phải loại bỏ hoàn toàn file/thư mục Backend: src/${beOnly}`
    );
  }

  const { assertNoMockDataInProduction } = await import('../src/mocks/index.js');
  assert.equal(assertNoMockDataInProduction(), true);
});
