import { evictUserPageCache, invalidateCacheNamespaces } from '../cache/redisCache.js';

/**
 * Hàng đợi xử lý Xóa Cache & Giải phóng Trang Cũ (`src/queues/index.js`):
 * Đảm bảo mọi yêu cầu xóa Redis cũ khi cập nhật dữ liệu (`enqueueCacheInvalidation`)
 * và giải phóng bộ nhớ trang cũ khi chuyển trang (`enqueuePageEviction`) được thực thi tuần tự, không nghẽn.
 */
const pendingQueue = [];

export async function enqueueCacheInvalidation(namespaces = ['*']) {
  const job = { type: 'INVALIDATE_NAMESPACES', namespaces, enqueuedAt: Date.now() };
  pendingQueue.push(job);
  try {
    return await invalidateCacheNamespaces(namespaces);
  } finally {
    const idx = pendingQueue.indexOf(job);
    if (idx !== -1) pendingQueue.splice(idx, 1);
  }
}

export async function enqueuePageEviction(userId, { section = null, page = null } = {}) {
  const job = { type: 'EVICT_USER_PAGE', userId, section, page, enqueuedAt: Date.now() };
  pendingQueue.push(job);
  try {
    return await evictUserPageCache(userId, { section, page });
  } finally {
    const idx = pendingQueue.indexOf(job);
    if (idx !== -1) pendingQueue.splice(idx, 1);
  }
}

export function getQueueStatus() {
  return {
    pendingCount: pendingQueue.length,
    jobs: [...pendingQueue],
  };
}
