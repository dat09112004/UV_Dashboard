-- =============================================================================
-- UYEN VU INTERNATIONAL — EXECUTIVE PO, PROGRESS, FINANCE & TASK DISPATCH SYSTEM
-- POSTGRESQL 16+ RELATIONAL DATABASE SCHEMA (3NF)
-- Phiên bản: 2.0 (Master BA & Backend Implementation Blueprint)
-- Ngày lập: 09/11/2026
-- Múi giờ chuẩn nghiệp vụ: Asia/Ho_Chi_Minh (UTC+7)
-- =============================================================================

BEGIN;

-- Thiết lập múi giờ mặc định cho phiên làm việc
SET TIME ZONE 'Asia/Ho_Chi_Minh';

-- Mở rộng hỗ trợ UUID và криптографии nếu cần
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- KIỂU DỮ LIỆU ENUM NGHIỆP VỤ (CUSTOM ENUM TYPES)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
        CREATE TYPE user_role_enum AS ENUM ('CEO', 'Admin', 'Sale', 'Accountant');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN
        CREATE TYPE account_status_enum AS ENUM ('active', 'inactive');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_status_enum') THEN
        CREATE TYPE receipt_status_enum AS ENUM ('unidentified', 'identified');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_interaction_type_enum') THEN
        CREATE TYPE task_interaction_type_enum AS ENUM ('submission', 'review', 'discussion', 'system_log');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_module_type_enum') THEN
        CREATE TYPE alert_module_type_enum AS ENUM ('orders', 'receivables', 'payables');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_status_enum') THEN
        CREATE TYPE reminder_status_enum AS ENUM ('Chờ giao việc', 'Đã giao việc', 'Đã xử lý');
    END IF;
END$$;

-- =============================================================================
-- HÀM TRIGGER TỰ ĐỘNG CẬP NHẬT CỘT updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- BẢNG PHỤ TRỢ HỆ THỐNG: system_state (Quản lý kỳ kế toán & Optimistic Revision)
-- =============================================================================
CREATE TABLE IF NOT EXISTS system_state (
    id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    opening_date        DATE NOT NULL DEFAULT '2026-10-17',
    report_date_default DATE NOT NULL DEFAULT '2026-11-06',
    finance_revision    BIGINT NOT NULL DEFAULT 0 CHECK (finance_revision >= 0),
    is_period_locked    BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 1. BẢNG users — Quản lý Hồ sơ Nhân sự, Vai trò & Xác thực PBKDF2
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id                      VARCHAR(64) PRIMARY KEY,
    email                   VARCHAR(254) NOT NULL,
    username                VARCHAR(254) NOT NULL,
    password_hash           TEXT NOT NULL,
    password_salt           VARCHAR(64) NOT NULL,
    password_iterations     INTEGER NOT NULL DEFAULT 600000 CHECK (password_iterations >= 100000),
    name                    VARCHAR(100) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    role                    user_role_enum NOT NULL,
    status                  account_status_enum NOT NULL DEFAULT 'active',
    title                   VARCHAR(160),
    department              VARCHAR(120),
    employee_code           VARCHAR(64),
    initials                VARCHAR(8),
    avatar                  TEXT,
    locale                  VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
    timezone                VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    data_scope              VARCHAR(32) NOT NULL DEFAULT 'company',
    permission_description  TEXT,
    navigation_json         JSONB NULL,
    token_version           INTEGER NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Bảo vệ tài khoản gốc CEO: không bao giờ bị khóa hoặc đổi sang vai trò khác
    CONSTRAINT chk_users_ceo_root_protected CHECK (
        id <> 'user-ceo' OR (status = 'active' AND role = 'CEO')
    ),
    CONSTRAINT chk_users_navigation_array CHECK (
        navigation_json IS NULL OR jsonb_typeof(navigation_json) = 'array'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 2. BẢNG department_navigation — Quyền điều hướng mặc định theo Phòng ban
-- =============================================================================
CREATE TABLE IF NOT EXISTS department_navigation (
    role            VARCHAR(32) PRIMARY KEY CHECK (role IN ('Sale', 'Accountant')),
    navigation_json JSONB NOT NULL CHECK (jsonb_typeof(navigation_json) = 'array'),
    updated_by      VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. BẢNG purchase_orders — Đơn hàng Mua (PO), Tiến độ Sản xuất & Giao nhận
-- =============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    row_id                  BIGSERIAL PRIMARY KEY,
    po_id                   VARCHAR(64) NOT NULL,
    vendor_no               VARCHAR(64) NOT NULL,
    vendor_name             VARCHAR(255) NOT NULL,
    vendor_item_no          VARCHAR(255) NOT NULL,
    category                VARCHAR(120) NOT NULL,
    country_of_origin       VARCHAR(120) DEFAULT 'VIETNAM',
    season_code             VARCHAR(32),
    season_desc             VARCHAR(120),
    released_po_date        DATE NOT NULL,
    inbound_only            BOOLEAN NOT NULL DEFAULT TRUE,
    unit                    VARCHAR(24) DEFAULT '',
    ordered_qty             NUMERIC(15,3) NULL CHECK (ordered_qty IS NULL OR ordered_qty > 0),
    unit_price_vnd          BIGINT NULL CHECK (unit_price_vnd IS NULL OR unit_price_vnd >= 0),
    total_value_vnd         BIGINT NULL CHECK (total_value_vnd IS NULL OR total_value_vnd >= 0),
    ton_dau                 NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (ton_dau >= 0),
    nhap                    NUMERIC(15,3) NULL CHECK (nhap IS NULL OR nhap >= 0),
    xuat                    NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (xuat >= 0),
    delivered_qty           NUMERIC(15,3) NULL CHECK (delivered_qty IS NULL OR delivered_qty >= 0),
    ban                     NUMERIC(15,3) NULL CHECK (ban IS NULL OR ban >= 0),
    stock_on_hand           NUMERIC(15,3) NOT NULL DEFAULT 0,
    on_process_pct          NUMERIC(5,2) NULL CHECK (on_process_pct IS NULL OR (on_process_pct >= 0 AND on_process_pct <= 100)),
    packaging_pct           NUMERIC(5,2) NULL CHECK (packaging_pct IS NULL OR (packaging_pct >= 0 AND packaging_pct <= 100)),
    expected_receipt_date   DATE NULL,
    ship_date_etd           DATE NULL,
    eta_date                DATE NULL,
    actual_ship_date        DATE NULL,
    actual_arrival_date     DATE NULL,
    actual_delivery_date    DATE NULL,
    manual_priority_rank    SMALLINT NOT NULL DEFAULT 2 CHECK (manual_priority_rank IN (0, 1, 2)),
    manual_alert_reason     VARCHAR(500) DEFAULT '',
    alert_level             VARCHAR(64) DEFAULT 'Đúng hạn',
    last_update_date        VARCHAR(16),
    last_update_time        VARCHAR(16),
    tracking_version        VARCHAR(64) NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ràng buộc nghiệp vụ số lượng & tỷ lệ
    CONSTRAINT chk_po_unit_when_ordered CHECK (
        ordered_qty IS NULL OR char_length(btrim(COALESCE(unit, ''))) BETWEEN 1 AND 24
    ),
    CONSTRAINT chk_po_nhap_le_ordered CHECK (
        ordered_qty IS NULL OR nhap IS NULL OR nhap <= ordered_qty
    ),
    CONSTRAINT chk_po_delivered_le_ordered CHECK (
        ordered_qty IS NULL OR delivered_qty IS NULL OR delivered_qty <= ordered_qty
    ),
    CONSTRAINT chk_po_delivered_le_available CHECK (
        delivered_qty IS NULL OR delivered_qty <= COALESCE(nhap, 0) + COALESCE(ton_dau, 0)
    ),
    CONSTRAINT chk_po_packaging_le_process CHECK (
        packaging_pct IS NULL OR (on_process_pct IS NOT NULL AND packaging_pct <= on_process_pct)
    ),
    -- Ràng buộc trình tự ngày tháng
    CONSTRAINT chk_po_expected_receipt_dates CHECK (
        (expected_receipt_date IS NULL OR expected_receipt_date >= released_po_date) AND
        (expected_receipt_date IS NULL OR eta_date IS NULL OR expected_receipt_date <= eta_date)
    ),
    CONSTRAINT chk_po_etd_eta_sequence CHECK (
        (ship_date_etd IS NULL OR ship_date_etd >= released_po_date) AND
        (eta_date IS NULL OR ship_date_etd IS NULL OR eta_date >= ship_date_etd)
    ),
    CONSTRAINT chk_po_actual_ship_date CHECK (
        actual_ship_date IS NULL OR actual_ship_date >= released_po_date
    ),
    CONSTRAINT chk_po_actual_delivery_date CHECK (
        (actual_delivery_date IS NULL OR (delivered_qty IS NOT NULL AND delivered_qty > 0)) AND
        (actual_delivery_date IS NULL OR actual_delivery_date >= released_po_date) AND
        (actual_delivery_date IS NULL OR actual_ship_date IS NULL OR actual_delivery_date >= actual_ship_date)
    )
);

CREATE INDEX IF NOT EXISTS idx_po_lookup ON purchase_orders (po_id, vendor_no, category);
CREATE INDEX IF NOT EXISTS idx_po_country ON purchase_orders (country_of_origin);

DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;
CREATE TRIGGER trg_po_updated_at
BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 4. BẢNG po_tracking_history — Lịch sử Cập nhật Tiến độ Đơn hàng PO
-- =============================================================================
CREATE TABLE IF NOT EXISTS po_tracking_history (
    id          VARCHAR(64) PRIMARY KEY,
    po_row_id   BIGINT NOT NULL REFERENCES purchase_orders(row_id) ON DELETE CASCADE,
    actor_id    VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    actor_name  VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason      VARCHAR(500) NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    before_json JSONB NULL,
    after_json  JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_po_history_row_time ON po_tracking_history (po_row_id, occurred_at DESC);

-- =============================================================================
-- 5. BẢNG revenue_invoices — Chứng từ Ghi nhận Doanh thu
-- =============================================================================
CREATE TABLE IF NOT EXISTS revenue_invoices (
    id              VARCHAR(64) PRIMARY KEY,
    doc_no          VARCHAR(64) NOT NULL,
    po_id           VARCHAR(64) NOT NULL,
    po_line_id      BIGINT REFERENCES purchase_orders(row_id) ON DELETE RESTRICT,
    customer_name   VARCHAR(255) NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 255),
    vendor_name     VARCHAR(255) NOT NULL,
    sku             VARCHAR(255) NOT NULL,
    category        VARCHAR(120) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    record_date     DATE NOT NULL,
    due_date        DATE NOT NULL,
    shipped_qty     NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (shipped_qty >= 0),
    net_revenue     BIGINT NOT NULL CHECK (net_revenue > 0),
    cash_collected  BIGINT NOT NULL DEFAULT 0 CHECK (cash_collected >= 0 AND cash_collected <= net_revenue),
    approval_status VARCHAR(64) NOT NULL DEFAULT 'Đã ghi nhận',
    alert_level     VARCHAR(64) NOT NULL DEFAULT 'Đúng hạn',
    priority_rank   SMALLINT NOT NULL DEFAULT 2,
    basis           VARCHAR(500) NOT NULL CHECK (char_length(btrim(basis)) BETWEEN 1 AND 500),
    status_note     VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_revenue_doc_no UNIQUE (doc_no),
    CONSTRAINT chk_revenue_due_ge_record CHECK (due_date >= record_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_doc_no_upper ON revenue_invoices (UPPER(doc_no));
CREATE INDEX IF NOT EXISTS idx_revenue_customer_category ON revenue_invoices (customer_name, category, record_date);

DROP TRIGGER IF EXISTS trg_revenue_updated_at ON revenue_invoices;
CREATE TRIGGER trg_revenue_updated_at
BEFORE UPDATE ON revenue_invoices
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 6. BẢNG accounts_receivable — Công nợ Phải thu Khách hàng (AR)
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts_receivable (
    id              VARCHAR(64) PRIMARY KEY,
    doc_no          VARCHAR(64) NOT NULL REFERENCES revenue_invoices(doc_no) ON DELETE CASCADE,
    po_id           VARCHAR(64) NOT NULL,
    po_line_id      BIGINT REFERENCES purchase_orders(row_id) ON DELETE RESTRICT,
    customer_name   VARCHAR(255) NOT NULL,
    vendor_ref      VARCHAR(255) NOT NULL,
    sku             VARCHAR(255) NOT NULL,
    category        VARCHAR(120) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    due_date        DATE NULL,
    original_amount BIGINT NOT NULL CHECK (original_amount > 0),
    adjustment      BIGINT NOT NULL DEFAULT 0 CHECK (adjustment >= 0),
    allocated_paid  BIGINT NOT NULL DEFAULT 0 CHECK (allocated_paid >= 0),
    remaining       BIGINT NOT NULL CHECK (remaining >= 0),
    commitment_note VARCHAR(500) DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ar_doc_no UNIQUE (doc_no),
    CONSTRAINT chk_ar_balance_integrity CHECK (
        allocated_paid <= original_amount + adjustment AND
        remaining = (original_amount + adjustment - allocated_paid)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_doc_no_upper ON accounts_receivable (UPPER(doc_no));
CREATE INDEX IF NOT EXISTS idx_ar_customer_due ON accounts_receivable (customer_name, due_date, remaining);

DROP TRIGGER IF EXISTS trg_ar_updated_at ON accounts_receivable;
CREATE TRIGGER trg_ar_updated_at
BEFORE UPDATE ON accounts_receivable
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 7. BẢNG cash_receipts — Khoản thu Ngân hàng / Phiếu thu Tiền mặt
-- =============================================================================
CREATE TABLE IF NOT EXISTS cash_receipts (
    id               VARCHAR(64) PRIMARY KEY,
    reference        VARCHAR(120) NOT NULL,
    customer_name    VARCHAR(255) NULL,
    receipt_date     DATE NULL,
    amount           BIGINT NOT NULL CHECK (amount > 0),
    allocated_amount BIGINT NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
    currency         CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    status           receipt_status_enum NOT NULL DEFAULT 'unidentified',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_receipt_allocated_le_amount CHECK (allocated_amount <= amount),
    CONSTRAINT chk_receipt_unidentified_no_alloc CHECK (
        (status = 'unidentified' AND customer_name IS NULL AND allocated_amount = 0) OR
        (status = 'identified' AND customer_name IS NOT NULL AND char_length(btrim(customer_name)) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_ref_lower ON cash_receipts (LOWER(reference)) WHERE reference <> '';
CREATE INDEX IF NOT EXISTS idx_receipts_customer_status ON cash_receipts (customer_name, status);

DROP TRIGGER IF EXISTS trg_receipts_updated_at ON cash_receipts;
CREATE TRIGGER trg_receipts_updated_at
BEFORE UPDATE ON cash_receipts
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 8. BẢNG receipt_allocations — Giao dịch Phân bổ Tiền thu vào Hóa đơn AR
-- =============================================================================
CREATE TABLE IF NOT EXISTS receipt_allocations (
    id              VARCHAR(64) PRIMARY KEY,
    entry_reference VARCHAR(120) NULL,
    receipt_id      VARCHAR(64) NOT NULL REFERENCES cash_receipts(id) ON DELETE RESTRICT,
    debt_id         VARCHAR(64) NOT NULL REFERENCES accounts_receivable(id) ON DELETE RESTRICT,
    doc_no          VARCHAR(64) NOT NULL,
    amount          BIGINT NOT NULL CHECK (amount > 0),
    allocation_date DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_allocations_entry_ref_lower ON receipt_allocations (LOWER(entry_reference)) WHERE entry_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_allocations_receipt_debt ON receipt_allocations (receipt_id, debt_id);

-- =============================================================================
-- 9. BẢNG accounts_payable — Công nợ Phải trả Nhà cung cấp (AP & Lịch sử Tách)
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts_payable (
    id                       VARCHAR(64) PRIMARY KEY,
    doc_no                   VARCHAR(64) NOT NULL,
    vendor_no                VARCHAR(120) NOT NULL,
    supplier_name            VARCHAR(255) NOT NULL,
    po_id                    VARCHAR(120) NOT NULL,
    po_ids_json              JSONB NULL,
    po_line_id               BIGINT NULL REFERENCES purchase_orders(row_id) ON DELETE SET NULL,
    sku                      TEXT NOT NULL,
    category                 VARCHAR(120) NOT NULL,
    currency                 CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    due_date                 DATE NULL,
    original_amount          BIGINT NOT NULL CHECK (original_amount > 0),
    adjustment               BIGINT NOT NULL DEFAULT 0 CHECK (adjustment >= 0),
    allocated_paid           BIGINT NOT NULL DEFAULT 0 CHECK (allocated_paid >= 0),
    remaining                BIGINT NOT NULL CHECK (remaining >= 0),
    approval_state           VARCHAR(64) NOT NULL DEFAULT 'Kế toán đang kiểm tra hồ sơ',
    approval_origin          VARCHAR(32) NOT NULL DEFAULT 'workflow',
    approved_remaining       BIGINT NOT NULL DEFAULT 0 CHECK (approved_remaining >= 0),
    request_amount           BIGINT NULL CHECK (request_amount IS NULL OR request_amount > 0),
    requested_due_date       DATE NULL,
    request_note             VARCHAR(500) NULL,
    requested_by             VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by              VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_date            DATE NULL,
    reviewed_at              TIMESTAMPTZ NULL,
    review_note              VARCHAR(500) NULL,
    split_source_doc_no      VARCHAR(64) NULL,
    split_into               TEXT NULL,
    is_archived_split_source BOOLEAN NOT NULL DEFAULT FALSE,
    pic                      VARCHAR(120) NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ap_balance_integrity CHECK (
        allocated_paid <= original_amount + adjustment AND
        remaining = (original_amount + adjustment - allocated_paid) AND
        approved_remaining <= remaining
    ),
    -- Quy tắc bất biến: Người lập đề nghị chi không được tự phê duyệt
    CONSTRAINT chk_ap_no_self_approval CHECK (
        requested_by IS NULL OR reviewed_by IS NULL OR requested_by <> reviewed_by
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_doc_no_upper ON accounts_payable (UPPER(doc_no));
CREATE INDEX IF NOT EXISTS idx_ap_active_state ON accounts_payable (is_archived_split_source, approval_state, due_date);

DROP TRIGGER IF EXISTS trg_ap_updated_at ON accounts_payable;
CREATE TRIGGER trg_ap_updated_at
BEFORE UPDATE ON accounts_payable
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 10. BẢNG payable_payments — Bút toán Thực chi Nhà cung cấp
-- =============================================================================
CREATE TABLE IF NOT EXISTS payable_payments (
    id          VARCHAR(64) PRIMARY KEY,
    payable_id  VARCHAR(64) NOT NULL REFERENCES accounts_payable(id) ON DELETE RESTRICT,
    doc_no      VARCHAR(64) NOT NULL,
    reference   VARCHAR(120) NOT NULL,
    amount      BIGINT NOT NULL CHECK (amount > 0),
    paid_date   DATE NOT NULL,
    approved_by VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_payments_ref_lower ON payable_payments (LOWER(reference));
CREATE INDEX IF NOT EXISTS idx_payable_payments_payable_id ON payable_payments (payable_id, paid_date);

-- =============================================================================
-- 11. BẢNG finance_audit_logs — Nhật ký Kiểm toán Tài chính Bất biến (Append-only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS finance_audit_logs (
    id          VARCHAR(64) PRIMARY KEY,
    event_type  VARCHAR(64) NOT NULL,
    reference   VARCHAR(120) NOT NULL,
    actor_id    VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    actor_name  VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    detail      TEXT NOT NULL,
    amount      BIGINT NULL,
    revision    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_audit_time ON finance_audit_logs (occurred_at DESC, revision DESC);
CREATE INDEX IF NOT EXISTS idx_finance_audit_ref ON finance_audit_logs (reference, event_type);

-- =============================================================================
-- 12. BẢNG tasks — Quản lý Giao việc Cá nhân / Phòng ban & Liên kết Cảnh báo đỏ
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id                        VARCHAR(64) PRIMARY KEY,
    assigner_id               VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assignee_id               VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    department                VARCHAR(32) NULL CHECK (department IS NULL OR department IN ('Sale', 'Accountant')),
    batch_id                  VARCHAR(64) NULL,
    title                     VARCHAR(160) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
    description               VARCHAR(1000) NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
    manager_note              VARCHAR(500) NULL,
    deadline                  DATE NOT NULL,
    status                    VARCHAR(64) NOT NULL DEFAULT 'Mới giao',
    requires_file             BOOLEAN NOT NULL DEFAULT FALSE,
    file_ids_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_alert_type         VARCHAR(32) NULL CHECK (source_alert_type IS NULL OR source_alert_type IN ('orders', 'receivables', 'payables')),
    source_alert_id           VARCHAR(160) NULL,
    source_alert_ref          VARCHAR(160) NULL,
    legacy_manager_assignment BOOLEAN NOT NULL DEFAULT FALSE,
    previous_assignments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks (assignee_id, status, deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_assigner_status ON tasks (assigner_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source_alert ON tasks (source_alert_id, source_alert_ref, source_alert_type);
CREATE INDEX IF NOT EXISTS idx_tasks_batch_id ON tasks (batch_id) WHERE batch_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- 13. BẢNG task_files — Tệp Đính kèm Hướng dẫn & Kết quả Bàn giao Công việc
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_files (
    id                    VARCHAR(64) PRIMARY KEY,
    task_id               VARCHAR(64) NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_name             VARCHAR(180) NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 180),
    mime_type             VARCHAR(80) DEFAULT 'application/octet-stream',
    size_bytes            INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 1048576),
    storage_key_or_base64 TEXT NOT NULL,
    uploaded_by           VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files (task_id);

-- =============================================================================
-- 14. BẢNG task_interactions — Lịch sử Nộp bài, Duyệt bài, Thảo luận & Nhật ký Việc
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_interactions (
    id               VARCHAR(64) PRIMARY KEY,
    task_id          VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    interaction_type task_interaction_type_enum NOT NULL,
    actor_id         VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    actor_name       VARCHAR(100) NOT NULL,
    note_or_text     VARCHAR(1000) NULL,
    approve_flag     BOOLEAN NULL,
    file_ids_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_interactions_task_type ON task_interactions (task_id, interaction_type, created_at ASC);

-- =============================================================================
-- 15. BẢNG work_reminders — Nhắc việc Cảnh báo Đỏ & Giao việc Nhanh kèm Note
-- =============================================================================
CREATE TABLE IF NOT EXISTS work_reminders (
    id                    VARCHAR(64) PRIMARY KEY,
    alert_id              VARCHAR(160) NOT NULL,
    alert_type            alert_module_type_enum NOT NULL DEFAULT 'orders',
    reference             VARCHAR(160) NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 160),
    subject               VARCHAR(180) NOT NULL,
    issue                 VARCHAR(240) NOT NULL,
    message               VARCHAR(1000) NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
    sender_id             VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_name           VARCHAR(100) NOT NULL,
    sender_role           VARCHAR(32) NOT NULL,
    remind_count          INTEGER NOT NULL DEFAULT 1 CHECK (remind_count >= 1),
    status                reminder_status_enum NOT NULL DEFAULT 'Chờ giao việc',
    assigned_by_id        VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_by_name      VARCHAR(100) NULL,
    assigned_at           TIMESTAMPTZ NULL,
    assigned_scope        VARCHAR(32) NULL CHECK (assigned_scope IS NULL OR assigned_scope IN ('person', 'department')),
    assigned_target_label VARCHAR(255) NULL,
    assigned_task_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolved_by_id        VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL,
    resolved_by_name      VARCHAR(100) NULL,
    resolved_at           TIMESTAMPTZ NULL,
    manager_note          VARCHAR(500) NULL,
    history_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reminders_alert_status ON work_reminders (alert_id, reference, alert_type, status);
CREATE INDEX IF NOT EXISTS idx_reminders_updated_at ON work_reminders (updated_at DESC);

DROP TRIGGER IF EXISTS trg_reminders_updated_at ON work_reminders;
CREATE TRIGGER trg_reminders_updated_at
BEFORE UPDATE ON work_reminders
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- BẢNG PHỤ TRỢ NGƯỜI DÙNG: task_handover_drafts (Lưu nháp tự động bàn giao việc)
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_handover_drafts (
    actor_id   VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id    VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    draft_note VARCHAR(1000) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id, task_id)
);

COMMIT;
