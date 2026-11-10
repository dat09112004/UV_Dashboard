import { getPostgresPool, executeSqlFile, closePostgresPool } from './postgresRepository.js';

async function runSeed() {
  console.log('[DB Seed] Đang nạp dữ liệu mẫu chuẩn BM41 & Kịch bản Nghiệp vụ vào PostgreSQL...');
  const pool = await getPostgresPool();
  try {
    await executeSqlFile(pool, 'database/seed.sql');
    console.log('[DB Seed] Đã nạp thành công toàn bộ dữ liệu mẫu (Tài khoản, PO, Doanh thu, AR, AP, Công việc, Nhắc việc)!');
  } finally {
    await closePostgresPool();
  }
}

runSeed().catch(err => {
  console.error('[DB Seed Error]:', err.message);
  process.exit(1);
});
