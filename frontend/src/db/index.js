import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/env.js';
import { createInitialDatabaseState } from './seedData.js';
import {
  getPostgresPool,
  loadStateFromPostgres,
  saveStateToPostgres,
} from './postgresRepository.js';

/**
 * Cơ chế Khóa Hàng đợi Giao dịch Nguyên tử (Mutex / Serialized Transaction Lock)
 * Đảm bảo tính chất ACID (Atomicity, Consistency, Isolation, Durability)
 * kết hợp với PostgreSQL BEGIN ... SELECT FOR UPDATE ... COMMIT / ROLLBACK.
 */
class TransactionLock {
  constructor() {
    this._queue = Promise.resolve();
  }

  acquire(fn) {
    const run = this._queue.then(() => fn());
    this._queue = run.catch(() => {});
    return run;
  }
}

const txLock = new TransactionLock();
let memoryState = null;

function loadEngineState() {
  if (memoryState) return memoryState;
  if (ENV.ENGINE_SNAPSHOT_FILE) {
    try {
      const filePath = path.resolve(process.cwd(), ENV.ENGINE_SNAPSHOT_FILE);
      if (fs.existsSync(filePath)) {
        memoryState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return memoryState;
      }
    } catch {
      // Fallback to clean seed state if snapshot cannot be read
    }
  }
  memoryState = createInitialDatabaseState();
  return memoryState;
}

function persistEngineState(nextState) {
  memoryState = nextState;
  if (ENV.ENGINE_SNAPSHOT_FILE) {
    try {
      const filePath = path.resolve(process.cwd(), ENV.ENGINE_SNAPSHOT_FILE);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2), 'utf8');
    } catch {
      // Ignore disk write issues in read-only environments
    }
  }
}

export async function isPostgresAvailable() {
  if (ENV.DB_DRIVER === 'engine') return false;
  if (ENV.DB_DRIVER !== 'postgres' && !ENV.DATABASE_URL && !ENV.PGHOST) return false;
  try {
    const pool = await getPostgresPool();
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    if (ENV.DB_DRIVER === 'postgres') throw err;
    return false;
  }
}

/**
 * Đọc bản chụp trạng thái dữ liệu hiện tại (Read-only Snapshot)
 */
export async function readDatabaseSnapshot() {
  if (await isPostgresAvailable()) {
    const pool = await getPostgresPool();
    const client = await pool.connect();
    try {
      return await loadStateFromPostgres(client);
    } finally {
      client.release();
    }
  }
  return structuredClone(loadEngineState());
}

/**
 * Thực thi một giao dịch nguyên tử (ACID Transaction):
 * - Trên PostgreSQL: Mở BEGIN, khóa dòng system_state (SELECT ... FOR UPDATE), nạp trạng thái,
 *   chạy nghiệp vụ, ghi xuống 15 bảng và COMMIT (hoặc ROLLBACK nếu có bất kỳ lỗi nào).
 * - Trên Transactional Engine: Tạo bản sao sâu (draft), nếu lỗi tự động hủy bỏ, nếu thành công mới lưu.
 */
export async function withDatabaseTransaction(work) {
  return txLock.acquire(async () => {
    if (await isPostgresAvailable()) {
      const pool = await getPostgresPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT * FROM system_state WHERE id = 1 FOR UPDATE');
        const draft = await loadStateFromPostgres(client);
        const result = await work(draft);
        await saveStateToPostgres(client, draft);
        await client.query('COMMIT');
        return result !== undefined ? result : draft;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const current = loadEngineState();
    const draft = structuredClone(current);
    const result = await work(draft);
    persistEngineState(draft);
    return result !== undefined ? result : draft;
  });
}

/**
 * Đặt lại cơ sở dữ liệu về trạng thái Seed chuẩn BM41
 */
export async function resetDatabaseToSeed(customState = null) {
  return txLock.acquire(async () => {
    const fresh = customState ? structuredClone(customState) : createInitialDatabaseState();
    persistEngineState(fresh);
    return structuredClone(fresh);
  });
}
