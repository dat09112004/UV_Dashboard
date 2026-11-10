import { EventEmitter } from 'node:events';
import { evictUserPageCache, invalidateCacheNamespaces } from '../cache/redisCache.js';

/**
 * Hệ thống Event Bus trung tâm (`src/events/systemEvents.js`):
 * - Sự kiện `DATA_MUTATED`: Tự động xóa (Invalidate) các khóa Redis cũ của phân hệ vừa thay đổi.
 * - Sự kiện `PAGE_SWITCHED`: Tự động giải phóng bộ nhớ đệm của trang/phân hệ cũ khi người dùng chuyển trang.
 * - Sự kiện `SECURITY_AUDIT`: Ghi vết các sự kiện bảo mật (đăng nhập, đăng xuất, khóa tài khoản, vi phạm RBAC).
 */
class UyenVuEventBus extends EventEmitter {}

export const systemEvents = new UyenVuEventBus();
systemEvents.setMaxListeners(50);

export const EVENT_TYPES = Object.freeze({
  DATA_MUTATED: 'DATA_MUTATED',
  PAGE_SWITCHED: 'PAGE_SWITCHED',
  SECURITY_AUDIT: 'SECURITY_AUDIT',
});

systemEvents.on(EVENT_TYPES.DATA_MUTATED, async ({ namespaces = ['*'] } = {}) => {
  try {
    await invalidateCacheNamespaces(namespaces);
  } catch {
    // Ignore background event errors
  }
});

systemEvents.on(EVENT_TYPES.PAGE_SWITCHED, async ({ userId, previousSection, previousPage } = {}) => {
  if (!userId) return;
  try {
    await evictUserPageCache(userId, { section: previousSection, page: previousPage });
  } catch {
    // Ignore background event errors
  }
});

export function emitDataMutated(namespaces = ['*'], meta = {}) {
  systemEvents.emit(EVENT_TYPES.DATA_MUTATED, { namespaces, ...meta, at: new Date().toISOString() });
}

export function emitPageSwitched(userId, previousSection, previousPage = null) {
  systemEvents.emit(EVENT_TYPES.PAGE_SWITCHED, {
    userId,
    previousSection,
    previousPage,
    at: new Date().toISOString(),
  });
}
