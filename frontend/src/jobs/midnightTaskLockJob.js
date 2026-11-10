import { resetAllCacheAndBlacklists, getCacheStats } from '../cache/redisCache.js';
import { businessToday } from '../utils/business.js';

/**
 * Tác vụ định kỳ (`src/jobs/midnightTaskLockJob.js`):
 * 1. Kiểm tra mốc 00:00 theo múi giờ `Asia/Ho_Chi_Minh` để khóa tự động các công việc quá hạn
 *    (Midnight Task Lock — `TASK_EXPIRED`) và làm mới Redis Cache sang ngày làm việc mới.
 * 2. Dọn dẹp định kỳ các khóa cache và cửa sổ Rate Limit đã hết hạn để giữ máy chủ luôn nhẹ.
 */
let lastCheckedBusinessDate = businessToday();
let jobIntervalId = null;

export function runMidnightTaskCheck() {
  const currentDay = businessToday();
  if (currentDay !== lastCheckedBusinessDate) {
    lastCheckedBusinessDate = currentDay;
    resetAllCacheAndBlacklists();
    return {
      dateRolledOver: true,
      businessToday: currentDay,
      cacheCleared: true,
    };
  }
  return {
    dateRolledOver: false,
    businessToday: currentDay,
    cacheStats: getCacheStats(),
  };
}

export function startBackgroundJobs(intervalMs = 60_000) {
  if (jobIntervalId) return jobIntervalId;
  jobIntervalId = setInterval(() => {
    runMidnightTaskCheck();
  }, intervalMs);
  if (typeof jobIntervalId.unref === 'function') {
    jobIntervalId.unref();
  }
  return jobIntervalId;
}

export function stopBackgroundJobs() {
  if (jobIntervalId) {
    clearInterval(jobIntervalId);
    jobIntervalId = null;
  }
}
