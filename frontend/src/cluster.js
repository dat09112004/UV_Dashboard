import cluster from 'node:cluster';
import os from 'node:os';
import { ENV } from './config/env.js';
import { startServer } from './server.js';

/**
 * Quản lý Đa tiến trình (`src/cluster.js` — Node.js 26.12.1 Multi-Core Cluster):
 * - Phân tải tự động qua các nhân CPU (`os.availableParallelism()`).
 * - Tự động khởi động lại Worker nếu gặp sự cố bất ngờ (Zero-Downtime Worker Recovery).
 */
export async function startClusterServer() {
  const numWorkers = Number(
    process.env.WEB_CONCURRENCY ||
      (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length) ||
      2
  );

  if (cluster.isPrimary) {
    console.log(
      `[Uyen Vu Cluster Master] PID ${process.pid} đang khởi tạo ${numWorkers} workers (Node ${process.version})...`
    );
    for (let i = 0; i < numWorkers; i += 1) {
      cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
      console.warn(
        `[Uyen Vu Cluster Master] Worker PID ${worker.process.pid} dừng (${signal || code}). Đang khởi tạo lại...`
      );
      cluster.fork();
    });
    return { isPrimary: true, workersCount: numWorkers };
  }

  return startServer(ENV.PORT, ENV.HOST);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startClusterServer();
}
