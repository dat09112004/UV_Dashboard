import { getPostgresPool, executeSqlFile, closePostgresPool } from './postgresRepository.js';

async function runMigrations() {
  const isReset = process.argv.includes('--reset');
  console.log('[DB Migrate] Đang kết nối tới PostgreSQL...');
  const pool = await getPostgresPool();
  try {
    if (isReset) {
      console.log('[DB Migrate] Đang xóa các bảng cũ (--reset)...');
      await pool.query(`
        DROP VIEW IF EXISTS vw_tasks_enriched CASCADE;
        DROP VIEW IF EXISTS vw_active_accounts_payable CASCADE;
        DROP VIEW IF EXISTS vw_accounts_receivable_aging CASCADE;
        DROP TABLE IF EXISTS
          task_handover_drafts,
          work_reminders,
          task_interactions,
          task_files,
          tasks,
          finance_audit_logs,
          payable_payments,
          accounts_payable,
          receipt_allocations,
          cash_receipts,
          accounts_receivable,
          revenue_invoices,
          po_tracking_history,
          purchase_orders,
          department_navigation,
          users,
          system_state
        CASCADE;
      `);
    }
    console.log('[DB Migrate] Đang thực thi database/schema.sql (15 bảng 3NF)...');
    await executeSqlFile(pool, 'database/schema.sql');
    console.log('[DB Migrate] Đang thực thi database/views_and_procedures.sql...');
    await executeSqlFile(pool, 'database/views_and_procedures.sql');
    console.log('[DB Migrate] Hoàn tất khởi tạo cấu trúc cơ sở dữ liệu PostgreSQL thành công!');
  } finally {
    await closePostgresPool();
  }
}

runMigrations().catch(err => {
  console.error('[DB Migrate Error]:', err.message);
  process.exit(1);
});
