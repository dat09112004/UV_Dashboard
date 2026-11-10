import { ENV } from '../config/env.js';
import { incrementRedisRateCounter, resetAllCacheAndBlacklists } from '../cache/redisCache.js';
import { AppError } from '../utils/errors.js';

const loginFailures = new Map();

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function loginKey(req, email) {
  const ip = getClientIp(req);
  const normalizedEmail = String(email || '').trim().toLowerCase() || 'unknown';
  return `${ip}:${normalizedEmail}`;
}

/**
 * Phân tầng giới hạn tần suất gọi API (Tiered Rate Limiting trên Redis + Memory Fallback):
 * - Tầng Auth (`/api/v1/auth/login`, `/api/v1/auth/refresh`): tối đa AUTH_RATE_LIMIT_PER_MIN (mặc định 30 req/phút/IP)
 * - Tầng Write (`POST`, `PUT`, `PATCH`, `DELETE`): tối đa WRITE_RATE_LIMIT_PER_MIN (mặc định 120 req/phút/IP)
 * - Tầng Read (`GET`): tối đa API_RATE_LIMIT_PER_MIN (mặc định 300 req/phút/IP)
 */
export async function apiRateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const windowMs = 60 * 1000;
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || req.url || '');

  let tier = 'read';
  let maxRequests = ENV.API_RATE_LIMIT_PER_MIN || 300;

  if (path.startsWith('/api/v1/auth/login') || path.startsWith('/api/v1/auth/refresh')) {
    tier = 'auth';
    maxRequests = ENV.AUTH_RATE_LIMIT_PER_MIN || 30;
  } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    tier = 'write';
    maxRequests = ENV.WRITE_RATE_LIMIT_PER_MIN || 120;
  }

  // Kiểm tra cả giới hạn tổng theo IP và giới hạn theo phân tầng
  const [globalCounter, tierCounter] = await Promise.all([
    incrementRedisRateCounter(`global:${ip}`, windowMs),
    tier === 'read'
      ? Promise.resolve(null)
      : incrementRedisRateCounter(`${tier}:${ip}`, windowMs),
  ]);

  const activeCounter = tierCounter || globalCounter;
  const effectiveLimit = tier === 'read' ? ENV.API_RATE_LIMIT_PER_MIN || 300 : maxRequests;
  const remaining = Math.max(0, effectiveLimit - activeCounter.count);
  const resetSeconds = Math.max(1, Math.ceil((activeCounter.resetAt - Date.now()) / 1000));

  res.setHeader('X-RateLimit-Tier', tier);
  res.setHeader('X-RateLimit-Limit', String(effectiveLimit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));

  if (
    globalCounter.count > (ENV.API_RATE_LIMIT_PER_MIN || 300) ||
    (tierCounter && tierCounter.count > maxRequests)
  ) {
    res.setHeader('Retry-After', String(resetSeconds));
    throw new AppError(
      'Quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau ít phút.',
      429,
      'RATE_LIMIT_EXCEEDED',
      { tier, limit: effectiveLimit, retryAfterSeconds: resetSeconds }
    );
  }

  await next();
}

/**
 * Kiểm tra khóa tạm thời do Brute-force mật khẩu trên /api/v1/auth/login
 */
export function checkLoginBruteForce(req, email) {
  const key = loginKey(req, email);
  const entry = loginFailures.get(key);
  if (!entry) return;
  const now = Date.now();
  if (now - entry.firstAttemptAt > ENV.LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return;
  }
  if (entry.count >= ENV.LOGIN_MAX_ATTEMPTS) {
    throw new AppError(
      'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.',
      429,
      'TOO_MANY_LOGIN_ATTEMPTS'
    );
  }
}

export function recordLoginFailure(req, email) {
  const key = loginKey(req, email);
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || now - entry.firstAttemptAt > ENV.LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(req, email) {
  loginFailures.delete(loginKey(req, email));
}

export function resetSecurityCounters() {
  loginFailures.clear();
  resetAllCacheAndBlacklists();
}
