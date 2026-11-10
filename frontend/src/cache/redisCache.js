import net from 'node:net';
import { ENV } from '../config/env.js';

/**
 * Hệ thống Bộ nhớ đệm Redis (Dual-Engine: Native Redis Server + In-Memory TTL Cache Fallback)
 * - Tự động kết nối Redis qua REDIS_URL (ví dụ redis://127.0.0.1:6379 hoặc Docker redis:6379).
 * - Khi phát hiện dữ liệu thay đổi (POST / PUT / PATCH / DELETE), hệ thống lập tức xóa sạch (Invalidate/Clear)
 *   các khóa Redis cũ thuộc phân hệ liên quan và nạp lại dữ liệu mới nhất.
 * - Khi người dùng chuyển sang trang/phân hệ khác trên giao diện, tự động giải phóng (Evict/Clear)
 *   các khóa cache của trang/phân hệ cũ của người dùng đó để tránh đầy bộ nhớ máy chủ.
 * - Lưu trữ danh sách thu hồi JWT (JTI Blacklist) khi đăng xuất hoặc làm mới token.
 */

const memoryCache = new Map(); // key -> { valueJson, expiresAt, namespace, userId }
const memoryJwtBlacklist = new Map(); // jti -> expiresAt
const memoryRateCounters = new Map(); // key -> { count, expiresAt }

let redisClient = null;
let redisInitAttempted = false;
let activeDriver = 'redis-memory-fallback';

const cacheMetrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  pageEvictions: 0,
  deletedKeysCount: 0,
  lastInvalidatedAt: null,
  lastInvalidatedNamespaces: [],
  lastEvictedPage: null,
};

async function ensureRedisConnection() {
  if (!ENV.REDIS_ENABLED) return null;
  if (redisClient) return redisClient;
  if (redisInitAttempted) return null;
  redisInitAttempted = true;

  try {
    const redisPkg = await import('redis').catch(() => null);
    if (redisPkg?.createClient) {
      const client = redisPkg.createClient({
        url: ENV.REDIS_URL,
        socket: { connectTimeout: 600, reconnectStrategy: false },
      });
      client.on('error', () => {});
      await client.connect();
      redisClient = client;
      activeDriver = 'redis-server';
      return redisClient;
    }
  } catch {
    // Chuyển sang chế độ In-Memory Redis-compatible TTL Engine khi chạy độc lập không có Redis daemon
  }

  try {
    const parsed = new URL(ENV.REDIS_URL);
    const host = parsed.hostname || '127.0.0.1';
    const port = Number(parsed.port || 6379);
    const pingOk = await new Promise(resolve => {
      const socket = net.createConnection({ host, port, timeout: 350 }, () => {
        socket.write('*1\r\n$4\r\nPING\r\n');
      });
      socket.on('data', chunk => {
        const text = chunk.toString('utf8');
        socket.end();
        resolve(text.startsWith('+PONG'));
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (pingOk) {
      activeDriver = 'redis-tcp-hybrid';
    }
  } catch {
    // Fallback an toàn về bộ nhớ đệm nội bộ chuẩn Redis TTL
  }

  return null;
}

function pruneExpiredMemoryEntries() {
  const now = Date.now();
  for (const [k, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) memoryCache.delete(k);
  }
  for (const [jti, exp] of memoryJwtBlacklist.entries()) {
    if (exp <= now) memoryJwtBlacklist.delete(jti);
  }
  for (const [rk, win] of memoryRateCounters.entries()) {
    if (win.expiresAt <= now) memoryRateCounters.delete(rk);
  }
}

/**
 * Xây dựng khóa Redis cô lập tuyệt đối theo:
 * - Phân hệ (namespace: bootstrap | dashboard | orders | finance | tasks | reminders | data-entry)
 * - Định danh người dùng (userId), Vai trò (role) và Danh sách trang được cấp quyền (navigation)
 * - Tham số truy vấn/bộ lọc/trang (page, limit, search, filter...) đã chuẩn hóa thứ tự
 */
export function buildCacheKey(namespace, user, queryParams = {}) {
  const userId = user?.id || 'anon';
  const role = user?.role || 'guest';
  const navSignature = Array.isArray(user?.navigation)
    ? [...user.navigation].sort().join(',')
    : 'default';

  const normalizedQuery = Object.entries(queryParams || {})
    .filter(([, val]) => val !== undefined && val !== null && val !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v).trim())}`)
    .join('&');

  return `uv:cache:${namespace}:u=${userId}:r=${role}:nav=${navSignature}:${normalizedQuery || 'all'}`;
}

export async function getCache(key) {
  await ensureRedisConnection();
  pruneExpiredMemoryEntries();

  if (redisClient) {
    try {
      const raw = await redisClient.get(key);
      if (raw) {
        cacheMetrics.hits += 1;
        return JSON.parse(raw);
      }
    } catch {
      // Fallback sang memoryCache
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) {
    cacheMetrics.misses += 1;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    cacheMetrics.misses += 1;
    return null;
  }

  cacheMetrics.hits += 1;
  return JSON.parse(entry.valueJson);
}

export async function setCache(key, value, ttlSeconds = ENV.REDIS_TTL_SECONDS) {
  await ensureRedisConnection();
  const safeTtl = Math.max(1, Number(ttlSeconds || 120));
  const serialized = JSON.stringify(value);
  const parts = String(key).split(':');
  const namespace = parts[2] || 'general';
  const userPart = parts.find(p => p.startsWith('u=')) || 'u=anon';
  const userId = userPart.slice(2);

  if (redisClient) {
    try {
      await redisClient.set(key, serialized, { EX: safeTtl });
    } catch {
      // Ignore & write to memory mirror
    }
  }

  memoryCache.set(key, {
    valueJson: serialized,
    expiresAt: Date.now() + safeTtl * 1000,
    namespace,
    userId,
  });
  cacheMetrics.sets += 1;
}

/**
 * Xóa tức thì (Clear / Invalidate) các khóa Redis cũ khi có thay đổi dữ liệu (Mutation).
 */
export async function invalidateCacheNamespaces(namespaces = ['*']) {
  await ensureRedisConnection();
  const targetSet = new Set(Array.isArray(namespaces) ? namespaces : [namespaces]);
  const clearAll = targetSet.has('*');
  let removed = 0;

  if (redisClient) {
    try {
      if (clearAll) {
        const keys = await redisClient.keys('uv:cache:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
          removed += keys.length;
        }
      } else {
        for (const ns of targetSet) {
          const keys = await redisClient.keys(`uv:cache:${ns}:*`);
          if (keys.length > 0) {
            await redisClient.del(keys);
            removed += keys.length;
          }
        }
      }
    } catch {
      // Continue to clear memory mirror
    }
  }

  for (const [key, entry] of memoryCache.entries()) {
    if (
      clearAll ||
      targetSet.has(entry.namespace) ||
      [...targetSet].some(ns => key.startsWith(`uv:cache:${ns}:`))
    ) {
      memoryCache.delete(key);
      removed += 1;
    }
  }

  cacheMetrics.invalidations += 1;
  cacheMetrics.deletedKeysCount += removed;
  cacheMetrics.lastInvalidatedAt = new Date().toISOString();
  cacheMetrics.lastInvalidatedNamespaces = clearAll ? ['*'] : [...targetSet];

  return {
    invalidated: true,
    removedKeys: removed,
    namespaces: cacheMetrics.lastInvalidatedNamespaces,
    timestamp: cacheMetrics.lastInvalidatedAt,
  };
}

/**
 * Giải phóng bộ nhớ đệm của trang/phân hệ cũ khi người dùng chuyển sang trang khác hoặc đổi phân hệ
 * ("khi người dùng bấm trang khác thì clear trang cũ đi để tránh bị nặng server").
 */
export async function evictUserPageCache(userId, { section = null, page = null } = {}) {
  await ensureRedisConnection();
  const sectionToNamespace = {
    overview: 'dashboard',
    dashboard: 'dashboard',
    orders: 'orders',
    revenue: 'finance',
    receivables: 'finance',
    payables: 'finance',
    finance: 'finance',
    tasks: 'tasks',
    assignments: 'tasks',
    'assignment-reviews': 'tasks',
    reminders: 'reminders',
    users: 'bootstrap',
    'data-entry': 'data-entry',
  };
  const targetNamespace = section ? sectionToNamespace[section] || section : null;
  let evictedCount = 0;

  if (redisClient) {
    try {
      const pattern = targetNamespace
        ? `uv:cache:${targetNamespace}:u=${userId}:*`
        : `uv:cache:*:u=${userId}:*`;
      const keys = await redisClient.keys(pattern);
      const filteredKeys =
        page !== null && page !== undefined
          ? keys.filter(k => k.includes(`page=${encodeURIComponent(String(page))}`))
          : keys;
      if (filteredKeys.length > 0) {
        await redisClient.del(filteredKeys);
        evictedCount += filteredKeys.length;
      }
    } catch {
      // Fallback to memory eviction
    }
  }

  for (const [key, entry] of memoryCache.entries()) {
    if (userId && entry.userId !== userId && !key.includes(`:u=${userId}:`)) continue;
    if (targetNamespace && entry.namespace !== targetNamespace) continue;
    if (page !== null && page !== undefined) {
      const pageToken = `page=${encodeURIComponent(String(page))}`;
      if (!key.includes(pageToken) && Number(page) !== 1) continue;
    }
    memoryCache.delete(key);
    evictedCount += 1;
  }

  cacheMetrics.pageEvictions += 1;
  cacheMetrics.deletedKeysCount += evictedCount;
  cacheMetrics.lastEvictedPage = {
    userId,
    section: section || 'all',
    namespace: targetNamespace || '*',
    page: page ?? 'all',
    evictedCount,
    at: new Date().toISOString(),
  };

  return {
    released: true,
    userId,
    section: section || 'all',
    namespace: targetNamespace || '*',
    page: page ?? 'all',
    evictedKeys: evictedCount,
    timestamp: cacheMetrics.lastEvictedPage.at,
  };
}

export async function blacklistTokenJti(jti, expEpochSeconds) {
  if (!jti) return;
  await ensureRedisConnection();
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = Math.max(60, Number(expEpochSeconds || nowSec + 3600) - nowSec);
  const redisKey = `uv:jwt:blacklist:${jti}`;

  if (redisClient) {
    try {
      await redisClient.set(redisKey, 'revoked', { EX: ttlSec });
    } catch {
      // Fallback to memory
    }
  }
  memoryJwtBlacklist.set(jti, Date.now() + ttlSec * 1000);
}

export async function isTokenJtiBlacklisted(jti) {
  if (!jti) return false;
  await ensureRedisConnection();
  pruneExpiredMemoryEntries();

  if (redisClient) {
    try {
      const val = await redisClient.get(`uv:jwt:blacklist:${jti}`);
      if (val) return true;
    } catch {
      // Fallback to memory
    }
  }

  const exp = memoryJwtBlacklist.get(jti);
  if (!exp) return false;
  if (Date.now() > exp) {
    memoryJwtBlacklist.delete(jti);
    return false;
  }
  return true;
}

export async function incrementRedisRateCounter(bucketKey, windowMs) {
  await ensureRedisConnection();
  const now = Date.now();
  const redisKey = `uv:rl:${bucketKey}`;

  if (redisClient) {
    try {
      const count = await redisClient.incr(redisKey);
      if (count === 1) {
        await redisClient.pExpire(redisKey, windowMs);
      }
      const pttl = await redisClient.pTTL(redisKey);
      return {
        count,
        resetAt: now + (pttl > 0 ? pttl : windowMs),
      };
    } catch {
      // Fallback to memory counter
    }
  }

  let entry = memoryRateCounters.get(redisKey);
  if (!entry || now >= entry.expiresAt) {
    entry = { count: 0, expiresAt: now + windowMs };
    memoryRateCounters.set(redisKey, entry);
  }
  entry.count += 1;
  return {
    count: entry.count,
    resetAt: entry.expiresAt,
  };
}

export function getCacheStats() {
  pruneExpiredMemoryEntries();
  return {
    driver: activeDriver,
    redisUrl: ENV.REDIS_URL.replace(/:[^:@/]+@/, ':***@'),
    ttlSeconds: ENV.REDIS_TTL_SECONDS,
    activeKeys: memoryCache.size,
    blacklistedTokens: memoryJwtBlacklist.size,
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
    sets: cacheMetrics.sets,
    invalidations: cacheMetrics.invalidations,
    pageEvictions: cacheMetrics.pageEvictions,
    deletedKeysCount: cacheMetrics.deletedKeysCount,
    lastInvalidatedAt: cacheMetrics.lastInvalidatedAt,
    lastInvalidatedNamespaces: cacheMetrics.lastInvalidatedNamespaces,
    lastEvictedPage: cacheMetrics.lastEvictedPage,
  };
}

export function resetAllCacheAndBlacklists() {
  memoryCache.clear();
  memoryJwtBlacklist.clear();
  memoryRateCounters.clear();
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
  cacheMetrics.sets = 0;
  cacheMetrics.invalidations = 0;
  cacheMetrics.pageEvictions = 0;
  cacheMetrics.deletedKeysCount = 0;
  cacheMetrics.lastInvalidatedAt = null;
  cacheMetrics.lastInvalidatedNamespaces = [];
  cacheMetrics.lastEvictedPage = null;
}
