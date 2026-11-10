# Kiến trúc Thư mục Chuẩn `src/` (25 Thư mục + 6 File Gốc) — Uyen Vu International

Cấu trúc thư mục `src/` được tổ chức đồng bộ 100% với sơ đồ kiến trúc trên VS Code:

- `src/api/`: Client gọi RESTful API kèm JWT Bearer, `AbortController` hủy request trang cũ và `releasePageCacheApi`.
- `src/assets/`: Tài nguyên biểu tượng, hình ảnh thương hiệu và phông chữ.
- `src/components/`: Các thành phần giao diện dùng chung (`ProgressivePaginationBar.jsx`, `AlertAssignmentLine.jsx`, `PageGuide.jsx`) và theo phân hệ (`dashboard`, `orders`, `finance`, `layout`, `rbac`).
- `src/config/`: Cấu hình biến môi trường (`env.js`), kết nối Redis (`redis.js`) và chính sách bảo mật OWASP (`security.js`).
- `src/constants/`: Hằng số hệ thống (`DEBOUNCE_DELAYS`, `PAGINATION_DEFAULTS`, `CACHE_NAMESPACES`, `RATE_LIMIT_TIERS`, `TERMS_POLICY_VERSION`).
- `src/contexts/`: Ngữ cảnh React quản lý phiên đăng nhập và giải phóng bộ nhớ trang cũ khi điều hướng.
- `src/database/`: Kết nối PostgreSQL 3NF Connection Pool, Transaction Manager và bộ kịch bản SQL (`schema.sql`, `views_and_procedures.sql`, `seed.sql`).
- `src/docs/`: Tài liệu kiến trúc và đặc tả RESTful API.
- `src/events/`: Event Bus trung tâm (`systemEvents.js`) tự động kích hoạt xóa Redis cache khi có sự kiện `DATA_MUTATED` và giải phóng trang cũ khi có `PAGE_SWITCHED`.
- `src/features/`: Các phân hệ chức năng (`auth`, `dashboard`, `orders`, `finance`, `operations`, `users`, `dataEntry`, `audit`, `reports`, `roles`).
- `src/hooks/`: Custom hooks `useDebouncedValue`, `useDebouncedCallback` (`useDebounce.js`) và `useProgressivePagination` (`useProgressivePagination.js`).
- `src/i18n/`: Cầu nối đa ngôn ngữ Việt – Anh.
- `src/jobs/`: Tác vụ nền `midnightTaskLockJob.js` tự động khóa việc quá hạn lúc 00:00 (`Asia/Ho_Chi_Minh`) và dọn cache hết hạn.
- `src/locales/`: Từ điển song ngữ `messages.js`, `vi.json`, `en.json` và `LanguageSwitch.jsx`.
- `src/middlewares/`: Các tầng middleware bảo mật `requireAuth` (JWT + Redis JTI Blacklist), `requirePermission`, `requireSectionAccess`, `apiRateLimiter` (Tiered Rate Limit) và `dataIsolation`.
- `src/mocks/`: Chốt chặn `ZERO_MOCK_ENFORCED` đảm bảo loại bỏ hoàn toàn dữ liệu mẫu tĩnh.
- `src/modules/`: Điểm kết nối các module nghiệp vụ (`auth`, `orders`, `finance`, `operations`, `directory`, `dataEntry`).
- `src/queues/`: Hàng đợi bất đồng bộ xử lý xóa Redis Cache (`enqueueCacheInvalidation`) và giải phóng trang cũ (`enqueuePageEviction`).
- `src/routes/`: Định nghĩa toàn bộ đường dẫn RESTful API v1 (`v1Routes.js`) và điều hướng giao diện.
- `src/services/`: Tầng xử lý logic nghiệp vụ lõi và kết nối API.
- `src/shims/`: Tương thích WebCrypto và môi trường chạy.
- `src/store/`: Quản lý trạng thái Redux Toolkit (`slices`, `middleware`).
- `src/styles/`: Hệ thống giao diện CSS chuẩn Executive Dashboard.
- `src/uploads/`: Kiểm duyệt và lưu trữ an toàn tệp đính kèm công việc riêng tư (`validateAttachmentUploadBatch`).
- `src/utils/`: Các thuật toán tính toán nghiệp vụ, phân trang (`pagination.js`), cô lập dữ liệu (`dataIsolation.js`) và mã hóa (`cryptoAuth.js`).
- **6 File gốc trong `src/`**: `app.js`, `App.jsx`, `cluster.js`, `index.css`, `main.jsx`, `server.js`.
