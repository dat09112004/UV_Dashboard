-- =============================================================================
-- UYEN VU INTERNATIONAL — POSTGRESQL VIEWS & TRANSACTIONAL FUNCTIONS
-- Hỗ trợ truy vấn nhanh Dashboard KPI, Tuổi nợ AR/AP & Trạng thái Cảnh báo Đỏ
-- =============================================================================

BEGIN;

SET TIME ZONE 'Asia/Ho_Chi_Minh';

-- 1. View tổng hợp Công nợ Phải thu (AR) kèm số ngày quá hạn theo ngày hiện tại
CREATE OR REPLACE VIEW vw_accounts_receivable_aging AS
SELECT
    ar.*,
    ri.record_date,
    ri.shipped_qty,
    ri.net_revenue,
    ri.cash_collected,
    CASE
        WHEN ar.remaining = 0 THEN 0
        WHEN ar.due_date IS NULL THEN 0
        ELSE GREATEST(0, (CURRENT_DATE - ar.due_date))
    END AS overdue_days_today,
    CASE
        WHEN ar.remaining = 0 THEN 'paid'
        WHEN ar.due_date IS NULL THEN 'unknown'
        WHEN CURRENT_DATE > ar.due_date THEN 'overdue'
        WHEN CURRENT_DATE = ar.due_date THEN 'today'
        ELSE 'upcoming'
    END AS debt_status_today
FROM accounts_receivable ar
LEFT JOIN revenue_invoices ri ON ri.doc_no = ar.doc_no;

-- 2. View tổng hợp Công nợ Phải trả (AP) đang hoạt động (chưa bị tách lưu trữ)
CREATE OR REPLACE VIEW vw_active_accounts_payable AS
SELECT
    ap.*,
    (position('/' in COALESCE(ap.vendor_no, '')) > 0) AS needs_split,
    CASE
        WHEN (position('/' in COALESCE(ap.vendor_no, '')) > 0) AND ap.remaining > 0 THEN 'Cần tách chứng từ'
        ELSE ap.approval_state
    END AS workflow_status
FROM accounts_payable ap
WHERE ap.is_archived_split_source = FALSE;

-- 3. View tổng hợp Công việc kèm danh sách Tương tác (Submissions, Reviews, Discussion, Logs)
CREATE OR REPLACE VIEW vw_tasks_enriched AS
SELECT
    t.*,
    u_assignee.name AS assignee_name,
    u_assignee.email AS assignee_email,
    u_assignee.role AS assignee_role,
    u_assigner.name AS assigner_name,
    u_assigner.role AS assigner_role,
    COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
                'id', ti.id,
                'note', ti.note_or_text,
                'fileIds', ti.file_ids_json,
                'at', ti.created_at
            ) ORDER BY ti.created_at ASC
        )
        FROM task_interactions ti
        WHERE ti.task_id = t.id AND ti.interaction_type = 'submission'),
        '[]'::jsonb
    ) AS submissions_json,
    COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
                'id', ti.id,
                'approve', ti.approve_flag,
                'note', ti.note_or_text,
                'at', ti.created_at
            ) ORDER BY ti.created_at ASC
        )
        FROM task_interactions ti
        WHERE ti.task_id = t.id AND ti.interaction_type = 'review'),
        '[]'::jsonb
    ) AS reviews_json,
    COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
                'id', ti.id,
                'author', ti.actor_name,
                'text', ti.note_or_text,
                'time', ti.created_at
            ) ORDER BY ti.created_at ASC
        )
        FROM task_interactions ti
        WHERE ti.task_id = t.id AND ti.interaction_type = 'discussion'),
        '[]'::jsonb
    ) AS discussion_json,
    COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
                'id', ti.id,
                'author', ti.actor_name,
                'text', ti.note_or_text,
                'time', ti.created_at
            ) ORDER BY ti.created_at ASC
        )
        FROM task_interactions ti
        WHERE ti.task_id = t.id AND ti.interaction_type = 'system_log'),
        '[]'::jsonb
    ) AS comments_json
FROM tasks t
LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
LEFT JOIN users u_assigner ON u_assigner.id = t.assigner_id;

-- 4. Hàm tự động khóa các công việc quá hạn sau 00:00:00 giờ Việt Nam (Midnight Lock)
CREATE OR REPLACE FUNCTION fn_lock_overdue_tasks(p_business_today DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE tasks
    SET status = 'Hết hạn',
        updated_at = CURRENT_TIMESTAMP
    WHERE status <> 'Hoàn tất'
      AND status <> 'Hết hạn'
      AND deadline < p_business_today;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
