-- =============================================================================
-- UYEN VU INTERNATIONAL — SEED DATA (CHUẨN HÓA TỪ BM41 & KỊCH BẢN NGHIỆP VỤ)
-- Phiên bản: 2.0 — Tương thích PostgreSQL 16+ & Node.js 26.12.1
-- Mật khẩu mặc định của 4 tài khoản mẫu ('123') đã được băm bằng
-- PBKDF2-HMAC-SHA256 (600.000 vòng lặp, salt 16 bytes)
-- =============================================================================

BEGIN;

SET TIME ZONE 'Asia/Ho_Chi_Minh';

-- 0. Khởi tạo trạng thái kỳ tài chính (BM41 Opening Date: 17/10/2026, Report Date: 06/11/2026)
INSERT INTO system_state (id, opening_date, report_date_default, finance_revision, is_period_locked)
VALUES (1, '2026-10-17', '2026-11-06', 0, FALSE)
ON CONFLICT (id) DO UPDATE SET
    opening_date = EXCLUDED.opening_date,
    report_date_default = EXCLUDED.report_date_default;

-- 1. Khởi tạo 4 tài khoản chuẩn (CEO, Admin, Sale, Accountant)
INSERT INTO users (
    id, email, username, password_hash, password_salt, password_iterations,
    name, role, status, title, department, employee_code, initials,
    locale, timezone, data_scope, permission_description, navigation_json
) VALUES
(
    'user-ceo', 'ceo@uyenvu.vn', 'ceo@uyenvu.vn',
    '6a0a18e91335f0d0a806853937128444072f6d4a92da57a7c829f8c2936eb95f', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 600000,
    'Trần Quốc', 'CEO', 'active', 'Tổng Giám Đốc (CEO)', 'Ban Điều Hành', 'UV-CEO-001', 'TQ',
    'vi-VN', 'Asia/Ho_Chi_Minh', 'company',
    'Quản lý toàn bộ hệ thống, quản lý tài khoản, giao việc, duyệt chi và xác nhận bàn giao.',
    '["overview","orders","revenue","receivables","payables","users","assignments","reminders"]'::jsonb
),
(
    'user-admin', 'admin@uyenvu.vn', 'admin@uyenvu.vn',
    '3b5c9088cf04ee3e8909a0c0d59832083a8f3335b3de1f43a7181bcc76a6c58d', 'b2c3d4e5f60718293a4b5c6d7e8f90a1', 600000,
    'Quản trị Demo', 'Admin', 'active', 'Quản trị hệ thống', 'Ban Điều Hành & Quản Trị', 'UV-ADM-001', 'QT',
    'vi-VN', 'Asia/Ho_Chi_Minh', 'company',
    'Toàn quyền như CEO: quản lý hệ thống, quản lý tài khoản, giao việc, nhận nhắc việc và duyệt tất cả công việc & tài chính.',
    '["overview","orders","revenue","receivables","payables","users","assignments","reminders"]'::jsonb
),
(
    'user-sale', 'sale@uyenvu.vn', 'sale@uyenvu.vn',
    '57c8bdb3c9fa0c118f478a0dd14dcf7f2d3849cb261934a23332f4e832717c80', 'c3d4e5f60718293a4b5c6d7e8f90a1b2', 600000,
    'Lê Hương', 'Sale', 'active', 'Chuyên viên Quản lý Đơn hàng (Sale)', 'Phòng Kinh Doanh & Đơn Hàng', 'UV-SAL-001', 'LH',
    'vi-VN', 'Asia/Ho_Chi_Minh', 'company',
    'Cập nhật tiến độ 4 mốc (Released PO, On Process, Packaging, Shipdate ETD/ETA), theo dõi tồn kho, nhắc việc & gửi bàn giao.',
    NULL
),
(
    'user-accountant', 'ketoan@uyenvu.vn', 'ketoan@uyenvu.vn',
    '7347286e1bb41c1ddf987caca63075fb6e3c07132b4df85e76f0c6c646b0b99b', 'd4e5f60718293a4b5c6d7e8f90a1b2c3', 600000,
    'Phạm Lan', 'Accountant', 'active', 'Kế toán trưởng (Doanh thu & Công nợ)', 'Phòng Tài Chính - Kế Toán', 'UV-ACC-001', 'PL',
    'vi-VN', 'Asia/Ho_Chi_Minh', 'finance',
    'Quản lý Doanh thu, phân bổ tiền thu khách hàng (AR), kiểm soát hạn thanh toán, nhắc việc & trình duyệt chi Nhà cung cấp (AP).',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 2. Khởi tạo quyền điều hướng mặc định của Phòng Sale & Phòng Kế toán
INSERT INTO department_navigation (role, navigation_json, updated_by) VALUES
('Sale', '["orders","revenue","tasks","reminders"]'::jsonb, 'user-ceo'),
('Accountant', '["overview","orders","revenue","receivables","payables","tasks","reminders"]'::jsonb, 'user-ceo')
ON CONFLICT (role) DO NOTHING;

-- 3. Khởi tạo Đơn hàng PO chuẩn BM41 & Kịch bản kiểm thử (DEMO_ORDERS)
INSERT INTO purchase_orders (
    row_id, po_id, vendor_no, vendor_name, vendor_item_no, category, country_of_origin,
    released_po_date, inbound_only, unit, ordered_qty, unit_price_vnd, total_value_vnd,
    ton_dau, nhap, delivered_qty, ban, on_process_pct, packaging_pct,
    expected_receipt_date, ship_date_etd, eta_date, actual_ship_date, actual_delivery_date,
    manual_priority_rank, manual_alert_reason, alert_level, last_update_date, last_update_time, tracking_version
) VALUES
(
    3500002, 'UV-Intl-3500002', '15090', 'MOC LAM PHAT', 'Túi vải kích thước 12cm x 18cm', '210101080', 'VIETNAM',
    '2026-10-17', TRUE, 'pcs', 10000, 1600, 16000000,
    0, 10000, 10000, 10000, 100, 100,
    '2026-10-25', '2026-10-27', '2026-10-29', '2026-10-27', '2026-10-29',
    2, '', 'Đúng hạn', '06/11/2026', '09:00', NULL
),
(
    3500003, 'UV-Intl-3500003', '15090', 'MOC LAM PHAT', 'Túi vải kích thước 12cm x 18cm', '210101080', 'VIETNAM',
    '2026-10-17', TRUE, 'pcs', 10000, 1600, 16000000,
    0, 8000, 6000, 6000, 100, 80,
    '2026-11-05', '2026-11-05', '2026-11-05', '2026-11-05', '2026-11-05',
    2, '', 'Báo động đỏ', '06/11/2026', '09:00', NULL
),
(
    3500004, 'UV-Intl-3500004', '15090', 'MOC LAM PHAT', 'Túi vải kích thước 12cm x 18cm', '210101080', 'VIETNAM',
    '2026-10-17', TRUE, 'pcs', 10000, 1600, 16000000,
    0, 0, 0, 0, 65, 40,
    '2026-11-15', '2026-11-16', '2026-11-18', NULL, NULL,
    2, '', 'Đúng hạn', '06/11/2026', '09:00', NULL
),
(
    3500005, 'UV-Intl-3500005', '15090', 'MOC LAM PHAT', 'Túi vải kích thước 12cm x 18cm', '210101080', 'VIETNAM',
    '2026-10-17', TRUE, 'pcs', 10000, 1600, 16000000,
    0, 0, NULL, NULL, 20, 0,
    '2026-11-30', '2026-12-01', '2026-12-03', NULL, NULL,
    2, '', 'Đúng hạn', '06/11/2026', '09:00', NULL
),
(
    3500006, 'UV-Intl-3500006', '15090', 'MOC LAM PHAT', 'Túi vải kích thước 15.5cm x 18.5cm', '210101080', 'VIETNAM',
    '2026-10-17', TRUE, 'pcs', 10000, 1900, 19000000,
    0, 10000, 4000, 4000, 100, 100,
    '2026-11-05', '2026-11-05', '2026-11-06', '2026-11-05', '2026-11-05',
    2, '', 'Báo động đỏ', '06/11/2026', '09:00', NULL
),
(
    900001, 'DEMO-PO-TACH', 'DEMO-NCC-02', 'Demo Supplier B', 'Demo fabric bag', '210101080', 'VIETNAM',
    '2026-11-01', TRUE, 'pcs', 2000, 2000, 4000000,
    0, 0, NULL, NULL, 30, 0,
    '2026-11-12', NULL, NULL, NULL, NULL,
    2, '', 'Đúng hạn', NULL, NULL, NULL
)
ON CONFLICT (row_id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('purchase_orders', 'row_id'), 3500006, true);

-- 4. Lịch sử cập nhật tiến độ PO mẫu
INSERT INTO po_tracking_history (id, po_row_id, actor_id, actor_name, occurred_at, reason) VALUES
('DEMO-PROGRESS-3500002', 3500002, 'user-sale', 'Lê Hương', '2026-11-06T02:00:00.000Z', 'Dữ liệu mô phỏng để kiểm thử tiến độ.'),
('DEMO-PROGRESS-3500003', 3500003, 'user-sale', 'Lê Hương', '2026-11-06T02:00:00.000Z', 'Dữ liệu mô phỏng để kiểm thử tiến độ.'),
('DEMO-PROGRESS-3500004', 3500004, 'user-sale', 'Lê Hương', '2026-11-06T02:00:00.000Z', 'Dữ liệu mô phỏng để kiểm thử tiến độ.'),
('DEMO-PROGRESS-3500005', 3500005, 'user-sale', 'Lê Hương', '2026-11-06T02:00:00.000Z', 'Dữ liệu mô phỏng để kiểm thử tiến độ.'),
('DEMO-PROGRESS-3500006', 3500006, 'user-sale', 'Lê Hương', '2026-11-06T02:00:00.000Z', 'Dữ liệu mô phỏng để kiểm thử tiến độ.')
ON CONFLICT (id) DO NOTHING;

-- 5. Chứng từ Doanh thu mẫu (revenue_invoices)
INSERT INTO revenue_invoices (
    id, doc_no, po_id, po_line_id, customer_name, vendor_name, sku, category, currency,
    record_date, due_date, shipped_qty, net_revenue, cash_collected, approval_status, alert_level, priority_rank, basis, status_note
) VALUES
(
    'DEMO-REV-A1', 'DEMO-INV-A1', 'UV-Intl-3500002', 3500002, 'Demo Retail A', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-10-29', '2026-11-02', 5000, 12500000, 12500000, 'Đã ghi nhận', 'Đúng hạn', 2,
    'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.'
),
(
    'DEMO-REV-A2', 'DEMO-INV-A2', 'UV-Intl-3500002', 3500002, 'Demo Retail A', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-10-29', '2026-11-12', 5000, 12500000, 3500000, 'Đã ghi nhận', 'Đúng hạn', 2,
    'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.'
),
(
    'DEMO-REV-B1', 'DEMO-INV-B1', 'UV-Intl-3500003', 3500003, 'Demo Retail B', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-05', '2026-11-05', 6000, 15000000, 5000000, 'Đã ghi nhận', 'Đúng hạn', 2,
    'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.'
),
(
    'DEMO-REV-C1', 'DEMO-INV-C1', 'UV-Intl-3500006', 3500006, 'Demo Retail C', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 15.5cm x 18.5cm', '210101080', 'VND',
    '2026-11-05', '2026-11-06', 4000, 12000000, 3000000, 'Đã ghi nhận', 'Đúng hạn', 2,
    'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.'
)
ON CONFLICT (id) DO NOTHING;

-- 6. Công nợ Phải thu mẫu (accounts_receivable)
INSERT INTO accounts_receivable (
    id, doc_no, po_id, po_line_id, customer_name, vendor_ref, sku, category, currency,
    due_date, original_amount, adjustment, allocated_paid, remaining, commitment_note
) VALUES
(
    'DEMO-AR-A1', 'DEMO-INV-A1', 'UV-Intl-3500002', 3500002, 'Demo Retail A', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-02', 12500000, 0, 12500000, 0, 'Khoản phải thu mô phỏng.'
),
(
    'DEMO-AR-A2', 'DEMO-INV-A2', 'UV-Intl-3500002', 3500002, 'Demo Retail A', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-12', 12500000, 0, 3500000, 9000000, 'Khoản phải thu mô phỏng.'
),
(
    'DEMO-AR-B1', 'DEMO-INV-B1', 'UV-Intl-3500003', 3500003, 'Demo Retail B', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-05', 15000000, 0, 5000000, 10000000, 'Khoản phải thu mô phỏng.'
),
(
    'DEMO-AR-C1', 'DEMO-INV-C1', 'UV-Intl-3500006', 3500006, 'Demo Retail C', '15090 - MOC LAM PHAT',
    'Túi vải kích thước 15.5cm x 18.5cm', '210101080', 'VND',
    '2026-11-06', 12000000, 0, 3000000, 9000000, 'Khoản phải thu mô phỏng.'
)
ON CONFLICT (id) DO NOTHING;

-- 7. Khoản thu Ngân hàng mẫu (cash_receipts)
INSERT INTO cash_receipts (
    id, reference, customer_name, receipt_date, amount, allocated_amount, currency, status
) VALUES
('DEMO-REC-A', 'DEMO-THU-A', 'Demo Retail A', '2026-11-02', 18000000, 16000000, 'VND', 'identified'),
('DEMO-REC-B', 'DEMO-THU-B', 'Demo Retail B', '2026-11-05', 5000000, 5000000, 'VND', 'identified'),
('DEMO-REC-C', 'DEMO-THU-C', 'Demo Retail C', '2026-11-06', 3000000, 3000000, 'VND', 'identified'),
('DEMO-REC-UNKNOWN', 'DEMO-THU-UNKNOWN', NULL, '2026-11-06', 4000000, 0, 'VND', 'unidentified')
ON CONFLICT (id) DO NOTHING;

-- 8. Phân bổ Tiền thu mẫu (receipt_allocations)
INSERT INTO receipt_allocations (id, entry_reference, receipt_id, debt_id, doc_no, amount, allocation_date) VALUES
('DEMO-ALLOC-A1', 'DEMO-ALLOC-A1', 'DEMO-REC-A', 'DEMO-AR-A1', 'DEMO-INV-A1', 12500000, '2026-11-02'),
('DEMO-ALLOC-A2', 'DEMO-ALLOC-A2', 'DEMO-REC-A', 'DEMO-AR-A2', 'DEMO-INV-A2', 3500000, '2026-11-02'),
('DEMO-ALLOC-B1', 'DEMO-ALLOC-B1', 'DEMO-REC-B', 'DEMO-AR-B1', 'DEMO-INV-B1', 5000000, '2026-11-05'),
('DEMO-ALLOC-C1', 'DEMO-ALLOC-C1', 'DEMO-REC-C', 'DEMO-AR-C1', 'DEMO-INV-C1', 3000000, '2026-11-06')
ON CONFLICT (id) DO NOTHING;

-- 9. Công nợ Phải trả mẫu (accounts_payable)
INSERT INTO accounts_payable (
    id, doc_no, vendor_no, supplier_name, po_id, po_ids_json, po_line_id, sku, category, currency,
    due_date, original_amount, adjustment, allocated_paid, remaining,
    approval_state, approval_origin, approved_remaining,
    request_amount, requested_due_date, request_note, requested_by,
    reviewed_by, reviewed_date, reviewed_at, review_note
) VALUES
(
    'DEMO-AP-02', 'DEMO-BILL-02', '15090', 'MOC LAM PHAT', 'UV-Intl-3500002', NULL, 3500002,
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-04', 16000000, 0, 6000000, 10000000,
    'Đã duyệt', 'workflow', 10000000,
    16000000, '2026-11-04', 'Đề nghị thanh toán mô phỏng.', 'user-accountant',
    'user-ceo', '2026-11-02', '2026-11-02T02:00:00.000Z', 'Đã duyệt theo kịch bản kiểm thử.'
),
(
    'DEMO-AP-03', 'DEMO-BILL-03', '15090', 'MOC LAM PHAT', 'UV-Intl-3500003', NULL, 3500003,
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-06', 12800000, 0, 0, 12800000,
    'Chờ CEO duyệt chi', 'workflow', 0,
    12800000, '2026-11-06', 'Đề nghị thanh toán mô phỏng.', 'user-accountant',
    NULL, NULL, NULL, NULL
),
(
    'DEMO-AP-04', 'DEMO-BILL-04', '15090', 'MOC LAM PHAT', 'UV-Intl-3500004', NULL, 3500004,
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    '2026-11-14', 3200000, 0, 0, 3200000,
    'Yêu cầu bổ sung', 'workflow', 0,
    3200000, '2026-11-14', 'Đề nghị thanh toán mô phỏng.', 'user-accountant',
    'user-ceo', '2026-11-05', '2026-11-05T03:00:00.000Z', 'Bổ sung tài liệu đối soát để trình lại.'
),
(
    'DEMO-AP-05', 'DEMO-BILL-05', '15090', 'MOC LAM PHAT', 'UV-Intl-3500005', NULL, 3500005,
    'Túi vải kích thước 12cm x 18cm', '210101080', 'VND',
    NULL, 3200000, 0, 0, 3200000,
    'Kế toán đang kiểm tra hồ sơ', 'opening', 0,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL
),
(
    'DEMO-AP-GROUP', 'DEMO-BILL-GROUP', '15090 / DEMO-NCC-02', 'MOC LAM PHAT & Demo Supplier B',
    'UV-Intl-3500006 / DEMO-PO-TACH', '["UV-Intl-3500006","DEMO-PO-TACH"]'::jsonb, NULL,
    'Túi vải kích thước 15.5cm x 18.5cm · Demo fabric bag', '210101080', 'VND',
    '2026-11-12', 23000000, 0, 0, 23000000,
    'Kế toán đang kiểm tra hồ sơ', 'opening', 0,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

-- 10. Bút toán Thực chi mẫu (payable_payments)
INSERT INTO payable_payments (id, payable_id, doc_no, reference, amount, paid_date, approved_by) VALUES
('DEMO-PAY-02', 'DEMO-AP-02', 'DEMO-BILL-02', 'DEMO-CHI-02', 6000000, '2026-11-03', 'user-ceo')
ON CONFLICT (id) DO NOTHING;

-- 11. Nhật ký Kiểm toán Tài chính mẫu (finance_audit_logs)
INSERT INTO finance_audit_logs (id, event_type, reference, actor_id, actor_name, occurred_at, detail, amount, revision) VALUES
('DEMO-AUD-INVOICE_RECORDED-DEMO-INV-A1', 'INVOICE_RECORDED', 'DEMO-INV-A1', 'user-accountant', 'Phạm Lan', '2026-10-29T01:00:00.000Z', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 12500000, 1),
('DEMO-AUD-INVOICE_RECORDED-DEMO-INV-A2', 'INVOICE_RECORDED', 'DEMO-INV-A2', 'user-accountant', 'Phạm Lan', '2026-10-29T01:00:00.000Z', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 12500000, 2),
('DEMO-AUD-PAYABLE_SUBMITTED-DEMO-BILL-02', 'PAYABLE_SUBMITTED', 'DEMO-BILL-02', 'user-accountant', 'Phạm Lan', '2026-11-01T04:00:00.000Z', 'Đề nghị thanh toán mô phỏng.', 16000000, 3),
('DEMO-AUD-PAYABLE_APPROVED-DEMO-BILL-02', 'PAYABLE_APPROVED', 'DEMO-BILL-02', 'user-ceo', 'Trần Quốc', '2026-11-02T02:00:00.000Z', 'Đã duyệt theo kịch bản kiểm thử.', 16000000, 4),
('DEMO-AUD-RECEIPT_RECORDED-DEMO-THU-A', 'RECEIPT_RECORDED', 'DEMO-THU-A', 'user-accountant', 'Phạm Lan', '2026-11-02T02:00:00.000Z', 'Khách hàng: Demo Retail A', 18000000, 5),
('DEMO-AUD-RECEIPT_ALLOCATED-DEMO-INV-A1', 'RECEIPT_ALLOCATED', 'DEMO-INV-A1', 'user-accountant', 'Phạm Lan', '2026-11-02T04:00:00.000Z', 'DEMO-THU-A', 12500000, 6),
('DEMO-AUD-RECEIPT_ALLOCATED-DEMO-INV-A2', 'RECEIPT_ALLOCATED', 'DEMO-INV-A2', 'user-accountant', 'Phạm Lan', '2026-11-02T04:00:00.000Z', 'DEMO-THU-A', 3500000, 7),
('DEMO-AUD-PAYABLE_PAID-DEMO-BILL-02', 'PAYABLE_PAID', 'DEMO-BILL-02', 'user-accountant', 'Phạm Lan', '2026-11-03T04:00:00.000Z', 'DEMO-CHI-02', 6000000, 8),
('DEMO-AUD-PAYABLE_SUBMITTED-DEMO-BILL-04', 'PAYABLE_SUBMITTED', 'DEMO-BILL-04', 'user-accountant', 'Phạm Lan', '2026-11-04T04:00:00.000Z', 'Đề nghị thanh toán mô phỏng.', 3200000, 9),
('DEMO-AUD-INVOICE_RECORDED-DEMO-INV-B1', 'INVOICE_RECORDED', 'DEMO-INV-B1', 'user-accountant', 'Phạm Lan', '2026-11-05T01:00:00.000Z', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 15000000, 10),
('DEMO-AUD-INVOICE_RECORDED-DEMO-INV-C1', 'INVOICE_RECORDED', 'DEMO-INV-C1', 'user-accountant', 'Phạm Lan', '2026-11-05T01:00:00.000Z', 'Chứng từ doanh thu mô phỏng theo số lượng giao mẫu.', 12000000, 11),
('DEMO-AUD-RECEIPT_RECORDED-DEMO-THU-B', 'RECEIPT_RECORDED', 'DEMO-THU-B', 'user-accountant', 'Phạm Lan', '2026-11-05T02:00:00.000Z', 'Khách hàng: Demo Retail B', 5000000, 12),
('DEMO-AUD-PAYABLE_RETURNED-DEMO-BILL-04', 'PAYABLE_RETURNED', 'DEMO-BILL-04', 'user-ceo', 'Trần Quốc', '2026-11-05T03:00:00.000Z', 'Bổ sung tài liệu đối soát để trình lại.', 3200000, 13),
('DEMO-AUD-RECEIPT_ALLOCATED-DEMO-INV-B1', 'RECEIPT_ALLOCATED', 'DEMO-INV-B1', 'user-accountant', 'Phạm Lan', '2026-11-05T04:00:00.000Z', 'DEMO-THU-B', 5000000, 14),
('DEMO-AUD-RECEIPT_RECORDED-DEMO-THU-C', 'RECEIPT_RECORDED', 'DEMO-THU-C', 'user-accountant', 'Phạm Lan', '2026-11-06T02:00:00.000Z', 'Khách hàng: Demo Retail C', 3000000, 15),
('DEMO-AUD-RECEIPT_RECORDED-DEMO-THU-UNKNOWN', 'RECEIPT_RECORDED', 'DEMO-THU-UNKNOWN', 'user-accountant', 'Phạm Lan', '2026-11-06T02:00:00.000Z', 'Khách hàng: Chưa xác định', 4000000, 16),
('DEMO-AUD-RECEIPT_ALLOCATED-DEMO-INV-C1', 'RECEIPT_ALLOCATED', 'DEMO-INV-C1', 'user-accountant', 'Phạm Lan', '2026-11-06T04:00:00.000Z', 'DEMO-THU-C', 3000000, 17),
('DEMO-AUD-PAYABLE_SUBMITTED-DEMO-BILL-03', 'PAYABLE_SUBMITTED', 'DEMO-BILL-03', 'user-accountant', 'Phạm Lan', '2026-11-06T04:00:00.000Z', 'Đề nghị thanh toán mô phỏng.', 12800000, 18)
ON CONFLICT (id) DO NOTHING;

-- 12. Công việc mẫu (tasks)
INSERT INTO tasks (
    id, assigner_id, assignee_id, department, batch_id, title, description,
    deadline, status, requires_file, file_ids_json, source_alert_type, source_alert_id, source_alert_ref
) VALUES
('demo-task-po', 'user-ceo', 'user-sale', NULL, NULL, 'Đối chiếu tiến độ UV-Intl-3500003', 'Kiểm tra số lượng nhập và giao theo PO.', '2026-11-10', 'Mới giao', FALSE, '[]'::jsonb, 'orders', 'order-3500003', 'UV-Intl-3500003'),
('demo-task-accountant', 'user-admin', 'user-accountant', NULL, NULL, 'Đối chiếu công nợ BM41', 'Kiểm tra chứng từ và gửi bảng đối chiếu.', '2026-11-11', 'Mới giao', TRUE, '[]'::jsonb, NULL, NULL, NULL),
('demo-task-returned-sale', 'user-ceo', 'user-sale', NULL, NULL, 'Bổ sung đối chiếu PO UV-Intl-3500003', 'Đối chiếu số nhập, số giao và ngày xác nhận giao. Nộp lại bảng đã bổ sung.', '2026-11-12', 'Không đạt yêu cầu', TRUE, '[]'::jsonb, 'orders', 'order-3500003', 'UV-Intl-3500003'),
('demo-task-active-sale', 'user-ceo', 'user-sale', NULL, NULL, 'Kiểm tra đóng gói PO UV-Intl-3500004', 'Tải hướng dẫn, cập nhật số lượng đã đóng gói và nộp kết quả kèm tệp.', '2026-11-09', 'Đang thực hiện', TRUE, '["DEMO-TASKFILE-PACKING-GUIDE"]'::jsonb, 'orders', 'order-3500004', 'UV-Intl-3500004'),
('demo-task-active-accountant', 'user-admin', 'user-accountant', 'Accountant', 'DEMO-TASKGROUP-ACCOUNTANT', 'Phòng Kế toán · Rà soát khoản thu chưa phân bổ', 'Đối soát khách hàng và đề xuất hóa đơn nhận phân bổ.', '2026-11-05', 'Đang thực hiện', FALSE, '[]'::jsonb, NULL, NULL, NULL),
('demo-task-open-accountant', 'user-admin', 'user-accountant', NULL, NULL, 'Đối chiếu số dư DEMO-INV-A2', 'Kiểm tra số tiền đã thu và số dư còn phải thu của hóa đơn.', '2026-11-09', 'Đang thực hiện', FALSE, '[]'::jsonb, 'receivables', 'receivables-DEMO-AR-2', 'DEMO-INV-A2'),
('demo-task-review-sale', 'user-ceo', 'user-sale', NULL, NULL, 'Xác nhận lịch giao PO UV-Intl-3500006', 'Đối chiếu số lượng đã giao và phần còn lại với kế hoạch giao khách.', '2026-11-08', 'Chờ duyệt', TRUE, '[]'::jsonb, 'orders', 'order-3500006', 'UV-Intl-3500006'),
('demo-task-review-accountant', 'user-admin', 'user-accountant', NULL, NULL, 'Đối soát khoản thu DEMO-THU-A', 'Kiểm tra khoản thu chưa phân bổ và gửi bảng đối soát.', '2026-11-09', 'Chờ duyệt', TRUE, '[]'::jsonb, NULL, NULL, NULL),
('demo-task-done-sale', 'user-ceo', 'user-sale', NULL, NULL, 'Xác nhận giao đủ PO UV-Intl-3500002', 'Kiểm tra số lượng giao và xác nhận đã hoàn tất đơn hàng.', '2026-11-05', 'Hoàn tất', FALSE, '[]'::jsonb, NULL, NULL, NULL),
('demo-task-done-accountant', 'user-admin', 'user-accountant', NULL, NULL, 'Kiểm tra khoản chi DEMO-BILL-02', 'Đối chiếu khoản đã chi với số dư phải trả.', '2026-11-05', 'Hoàn tất', FALSE, '[]'::jsonb, NULL, NULL, NULL),
('demo-task-returned-accountant', 'user-admin', 'user-accountant', NULL, NULL, 'Bổ sung chứng từ DEMO-BILL-04', 'Bổ sung mã tham chiếu cho hồ sơ tạm ứng rồi nộp lại.', '2026-11-10', 'Không đạt yêu cầu', TRUE, '[]'::jsonb, 'payables', 'payables-DEMO-AP-4', 'DEMO-BILL-04'),
('demo-task-rereview-sale', 'user-ceo', 'user-sale', NULL, NULL, 'Duyệt lại xác nhận giao PO UV-Intl-3500003', 'Kiểm tra lại số lượng đã giao trên bảng theo dõi.', '2026-11-12', 'Chờ duyệt', FALSE, '[]'::jsonb, NULL, NULL, NULL),
('demo-task-rereview-accountant', 'user-admin', 'user-accountant', NULL, NULL, 'Duyệt lại số dư DEMO-BILL-02', 'Kiểm tra số dư còn phải trả sau khi đối chiếu khoản đã chi.', '2026-11-12', 'Chờ duyệt', FALSE, '[]'::jsonb, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- 13. Tệp đính kèm công việc mẫu (task_files)
INSERT INTO task_files (id, task_id, file_name, mime_type, size_bytes, storage_key_or_base64, uploaded_by) VALUES
('DEMO-TASKFILE-RESULT', 'demo-task-returned-sale', 'doi-chieu-PO-lan-1.csv', 'text/csv', 44, 'cG8scmVjZWl2ZWQsZGVsaXZlcmVkClVWLUludGwtMzUwMDAwMyw4MDAwLAo=', 'user-sale'),
('DEMO-TASKFILE-PACKING-GUIDE', 'demo-task-active-sale', 'huong-dan-kiem-tra-dong-goi.txt', 'text/plain', 84, 'UE8gVVYtSW50bC0zNTAwMDA0CjEuIEdoaSBz4buRIHbGsOG7o25nIMSRw6MgxJHDs25nIGfDs2kuCjIuIEdoaSBuZ8OgeSBk4buxIGtp4bq/biBob8OgbiB04bqldC4K', 'user-ceo'),
('DEMO-TASKFILE-BANK-RESULT', 'demo-task-review-accountant', 'doi-soat-thu-tien.csv', 'text/csv', 77, 'cmVjZWlwdCx0b3RhbF92bmQsYWxsb2NhdGVkX3ZuZCx1bmFsbG9jYXRlZF92bmQKREVNTy1USFU-QSwxODAwMDAwMCwxNjAwMDAwMCwyMDAwMDAwCg==', 'user-accountant'),
('DEMO-TASKFILE-ETA-RESULT', 'demo-task-review-sale', 'lich-giao-3500006.csv', 'text/csv', 60, 'cG8sb3JkZXJlZCxkZWxpdmVyZWQscmVtYWluaW5nClVWLUludGwtMzUwMDAwNiwxMDAwMCw0MDAwLDYwMDAK', 'user-sale'),
('DEMO-TASKFILE-AP-RESULT', 'demo-task-returned-accountant', 'chung-tu-tam-ung.txt', 'text/plain', 96, 'Q2jhu6luZyB04burIERFTU8tQklMTC0wNApT4buRIHRp4buBbiDEkeG7gSBuZ2jhu4s6IDMuMjAwLjAwMCBWTkQKTcOjIHRoYW0gY2hp4bq/dSB0aGFuaCB0b8OhbjogY2jGsGEgYuG7lSBzdW5nCg==', 'user-accountant')
ON CONFLICT (id) DO NOTHING;

-- 14. Tương tác công việc mẫu (task_interactions)
INSERT INTO task_interactions (id, task_id, interaction_type, actor_id, actor_name, note_or_text, approve_flag, file_ids_json, created_at) VALUES
('DEMO-INT-1', 'demo-task-returned-sale', 'submission', 'user-sale', 'Lê Hương', 'Em đã gửi bảng đối chiếu lần 1. Số nhập đã được cập nhật.', NULL, '["DEMO-TASKFILE-RESULT"]'::jsonb, '2026-11-06T02:30:00.000Z'),
('DEMO-INT-2', 'demo-task-returned-sale', 'review', 'user-ceo', 'Trần Quốc', 'Không đạt yêu cầu', FALSE, '[]'::jsonb, '2026-11-06T03:15:00.000Z'),
('DEMO-LOG-SALE-ACCEPT', 'demo-task-active-sale', 'system_log', 'user-sale', 'Lê Hương', 'Tiếp nhận công việc.', NULL, '[]'::jsonb, '2026-11-04T02:00:00.000Z'),
('DEMO-LOG-ACC-ACCEPT', 'demo-task-active-accountant', 'system_log', 'user-accountant', 'Phạm Lan', 'Tiếp nhận công việc.', NULL, '[]'::jsonb, '2026-11-04T02:00:00.000Z'),
('DEMO-INT-3', 'demo-task-review-sale', 'submission', 'user-sale', 'Lê Hương', 'Đã giao 4.000 pcs, còn 6.000 pcs cần chốt lịch giao.', NULL, '["DEMO-TASKFILE-ETA-RESULT"]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-4', 'demo-task-review-accountant', 'submission', 'user-accountant', 'Phạm Lan', 'Khoản thu còn 2.000.000 VND chưa phân bổ. Đã nộp bảng đối soát.', NULL, '["DEMO-TASKFILE-BANK-RESULT"]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-5', 'demo-task-done-sale', 'submission', 'user-sale', 'Lê Hương', 'Đã xác nhận giao đủ 10.000 pcs.', NULL, '[]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-6', 'demo-task-done-sale', 'review', 'user-ceo', 'Trần Quốc', 'Đã chấp nhận hoàn thành.', TRUE, '[]'::jsonb, '2026-11-05T07:30:00.000Z'),
('DEMO-INT-7', 'demo-task-done-accountant', 'submission', 'user-accountant', 'Phạm Lan', 'Đã chi 6.000.000 VND, còn phải trả 10.000.000 VND.', NULL, '[]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-8', 'demo-task-done-accountant', 'review', 'user-admin', 'Quản trị Demo', 'Đã chấp nhận hoàn thành.', TRUE, '[]'::jsonb, '2026-11-05T07:30:00.000Z'),
('DEMO-INT-9', 'demo-task-returned-accountant', 'submission', 'user-accountant', 'Phạm Lan', 'Đã nộp thông tin đề nghị tạm ứng.', NULL, '["DEMO-TASKFILE-AP-RESULT"]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-10', 'demo-task-returned-accountant', 'review', 'user-admin', 'Quản trị Demo', 'Không đạt yêu cầu', FALSE, '[]'::jsonb, '2026-11-05T07:30:00.000Z'),
('DEMO-INT-11', 'demo-task-rereview-sale', 'submission', 'user-sale', 'Lê Hương', 'Đã nộp số lượng giao ban đầu.', NULL, '[]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-12', 'demo-task-rereview-sale', 'review', 'user-ceo', 'Trần Quốc', 'Không đạt yêu cầu', FALSE, '[]'::jsonb, '2026-11-05T07:30:00.000Z'),
('DEMO-INT-13', 'demo-task-rereview-sale', 'submission', 'user-sale', 'Lê Hương', 'Đã bổ sung số giao xác nhận là 6.000 pcs.', NULL, '[]'::jsonb, '2026-11-06T02:00:00.000Z'),
('DEMO-INT-14', 'demo-task-rereview-accountant', 'submission', 'user-accountant', 'Phạm Lan', 'Đã nộp bảng đối chiếu ban đầu.', NULL, '[]'::jsonb, '2026-11-05T03:00:00.000Z'),
('DEMO-INT-15', 'demo-task-rereview-accountant', 'review', 'user-admin', 'Quản trị Demo', 'Không đạt yêu cầu', FALSE, '[]'::jsonb, '2026-11-05T07:30:00.000Z'),
('DEMO-INT-16', 'demo-task-rereview-accountant', 'submission', 'user-accountant', 'Phạm Lan', 'Đã xác nhận số dư còn phải trả 10.000.000 VND.', NULL, '[]'::jsonb, '2026-11-06T02:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- 15. Nhắc việc Cảnh báo đỏ mẫu (work_reminders)
INSERT INTO work_reminders (
    id, alert_id, alert_type, reference, subject, issue, message,
    sender_id, sender_name, sender_role, remind_count, status,
    assigned_by_id, assigned_by_name, assigned_at, assigned_scope, assigned_target_label,
    assigned_task_ids_json, manager_note, history_json, created_at, updated_at
) VALUES
(
    'demo-reminder-order-3500005', 'order-3500005', 'orders', 'UV-Intl-3500005',
    'Túi vải kích thước 22cm x 15cm', 'Quá hạn nhận hàng 1 ngày, chưa xác nhận nhập kho',
    'Đơn hàng UV-Intl-3500005 đã quá ngày dự kiến về kho nhưng chưa có người phụ trách xác nhận với NCC. Nhờ sếp giao việc giúp để tránh trễ lịch giao.',
    'user-sale', 'Lê Hương', 'Sale', 1, 'Chờ giao việc',
    NULL, NULL, NULL, NULL, NULL, '[]'::jsonb, NULL,
    '[{"id":"DEMO-REMLOG-1","senderId":"user-sale","senderName":"Lê Hương","senderRole":"Sale","message":"Đơn hàng UV-Intl-3500005 đã quá ngày dự kiến về kho nhưng chưa có người phụ trách xác nhận với NCC. Nhờ sếp giao việc giúp để tránh trễ lịch giao.","at":"2026-11-06T01:45:00.000Z"}]'::jsonb,
    '2026-11-06T01:45:00.000Z', '2026-11-06T01:45:00.000Z'
),
(
    'demo-reminder-payable-bill03', 'payables-DEMO-AP-3', 'payables', 'DEMO-BILL-03',
    'MOC LAM PHAT & Demo Supplier B', 'Chưa xác định hạn · Cần tách chứng từ',
    'Chứng từ gộp DEMO-BILL-03 đang báo động đỏ chưa tách nhà cung cấp và chưa phân công xử lý. Nhờ CEO/Admin phân công gấp cho bộ phận liên quan.',
    'user-accountant', 'Phạm Lan', 'Accountant', 1, 'Chờ giao việc',
    NULL, NULL, NULL, NULL, NULL, '[]'::jsonb, NULL,
    '[{"id":"DEMO-REMLOG-2","senderId":"user-accountant","senderName":"Phạm Lan","senderRole":"Accountant","message":"Chứng từ gộp DEMO-BILL-03 đang báo động đỏ chưa tách nhà cung cấp và chưa phân công xử lý. Nhờ CEO/Admin phân công gấp cho bộ phận liên quan.","at":"2026-11-06T02:15:00.000Z"}]'::jsonb,
    '2026-11-06T02:15:00.000Z', '2026-11-06T02:15:00.000Z'
),
(
    'demo-reminder-assigned-3500003', 'order-3500003', 'orders', 'UV-Intl-3500003',
    'Túi vải kích thước 18cm x 12cm', 'Quá hạn nhận hàng 1 ngày',
    'Nhờ sếp phân công kiểm tra số lượng nhập kho thực tế cho PO UV-Intl-3500003.',
    'user-sale', 'Lê Hương', 'Sale', 1, 'Đã giao việc',
    'user-ceo', 'Trần Quốc', '2026-11-05T09:00:00.000Z', 'person', 'Lê Hương',
    '["demo-task-po"]'::jsonb, 'Ưu tiên kiểm tra biên bản nhập kho với nhà cung cấp trong hôm nay.',
    '[{"id":"DEMO-REMLOG-3","senderId":"user-sale","senderName":"Lê Hương","senderRole":"Sale","message":"Nhờ sếp phân công kiểm tra số lượng nhập kho thực tế cho PO UV-Intl-3500003.","at":"2026-11-05T08:00:00.000Z"}]'::jsonb,
    '2026-11-05T08:00:00.000Z', '2026-11-05T09:00:00.000Z'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
