import { setClientIdentity } from '../utils/permissions.js';
import { clearEntryDrafts } from '../features/dataEntry/drafts.js';

let authToken = null;
let refreshToken = null;
let hasCookieSession = false;
let accessExpiresAt = 0;
let refreshExpiresAt = 0;
let persistedAccountId = null;
let persistedAccount = null;
let refreshInFlight = null;
let expiryTimerId = null;
let sessionVersion = 0;

// QA08 Fix: Giữ cố định retryId cho mỗi refreshToken để khi thử lại sau lỗi mạng/5xx tạm thời,
// Backend nhận diện chính xác biên nhận xoay vòng trong cửa sổ ân hạn 15 giây.
let pendingRefreshRetry = {
  refreshToken: null,
  retryId: null,
};

export const SESSION_EXPIRED_EVENT = 'uv:session-expired';
export const AUTH_SESSION_STORAGE_KEY = 'uv:auth-session-v1';
export const LOGOUT_BROADCAST_KEY = 'uv:auth-logout-broadcast';

export function parseCrossTabLogoutPayload(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      return {
        accountId: parsed.accountId || null,
        serverRevoked: parsed.serverRevoked !== false,
        at: Number(parsed.at || 0),
      };
    }
  } catch {
    // Legacy timestamp string fallback
  }
  return { accountId: null, serverRevoked: true, at: Number(rawValue) || Date.now() };
}

const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROACTIVE_REFRESH_BUFFER_MS = 30 * 1000;

let apiBaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api/v1';

// Quản lý AbortController cho các request theo từng trang/phân hệ để hủy ngay khi người dùng chuyển trang
const activePageControllers = new Map();

// F02 + L02 + L03 Fix: Lưu giữ Idempotency-Key theo ý định thao tác (intent signature) với TTL 24h đồng bộ Backend
// và đồng bộ qua sessionStorage (tối đa 100 mục) để bảo toàn qua F5 hoặc đứt kết nối giữa chừng
const IDEMPOTENCY_STORAGE_KEY = 'uv:pending-idempotency-keys';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 100;
const pendingWriteIdempotencyKeys = new Map();

let refreshTransientFailures = 0;
let refreshBackoffUntil = 0;

// QA08 Fix: Giải mã base64url bằng chuẩn Web API (globalThis.atob + TextDecoder) tương thích cả trình duyệt và Node
export function decodeJwtPayload(jwtToken) {
  if (!jwtToken || typeof jwtToken !== 'string') return null;
  const parts = jwtToken.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    if (typeof globalThis.atob !== 'function') return null;
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    const payload = JSON.parse(jsonStr);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function decodeJwtExpMs(jwtToken) {
  const payload = decodeJwtPayload(jwtToken);
  if (Number.isFinite(payload?.exp) && payload.exp > 0) {
    return Math.round(Number(payload.exp) * 1000);
  }
  return null;
}

function clearExpiryWatchTimer() {
  if (expiryTimerId !== null) {
    clearTimeout(expiryTimerId);
    expiryTimerId = null;
  }
}

function canUseSessionRefresh(now = Date.now()) {
  if (refreshExpiresAt > 0 && refreshExpiresAt <= now) return false;
  if (
    refreshToken ||
    hasCookieSession ||
    persistedAccountId ||
    persistedAccount?.id ||
    (refreshExpiresAt > 0 && refreshExpiresAt > now)
  ) {
    return true;
  }
  const stored = getStoredAuthSession();
  if (stored && (!stored.refreshExpiresAt || stored.refreshExpiresAt > now)) {
    return true;
  }
  return false;
}

// Mục 01 (QA v1.1.0 Bản 2): Kiểm tra đầy đủ cả trạng thái có phiên Cookie / metadata trong sessionStorage
// để ngay cả khi vừa F5 hoặc refresh tạm lỗi (chưa có accessToken/refreshToken trong JS), logout vẫn gọi lên máy chủ thu hồi phiên.
export function hasActiveAuthSession(now = Date.now()) {
  if (authToken || refreshToken) return true;
  if (hasCookieSession || persistedAccountId || persistedAccount?.id) return true;
  if (refreshExpiresAt > 0 && refreshExpiresAt > now) return true;
  if (accessExpiresAt > 0 && accessExpiresAt > now) return true;
  const stored = getStoredAuthSession();
  if (stored) return true;
  return false;
}

// R01 Fix: Giữ access token trong bộ nhớ (authToken) và refresh token trong cookie HttpOnly;
// sessionStorage chỉ lưu metadata phiên (hasSession, accountId, accessExpiresAt, refreshExpiresAt), tuyệt đối không lưu chuỗi JWT hay refreshToken.
function writePersistedAuthSession() {
  try {
    if (globalThis.localStorage && globalThis.localStorage !== globalThis.sessionStorage) {
      globalThis.localStorage.removeItem?.(AUTH_SESSION_STORAGE_KEY);
    }
    if (!authToken && !refreshToken && !hasCookieSession && !persistedAccountId && !(refreshExpiresAt > Date.now())) {
      globalThis.sessionStorage?.removeItem?.(AUTH_SESSION_STORAGE_KEY);
      return;
    }
    const payload = JSON.stringify({
      hasSession: true,
      accessExpiresAt: Number(accessExpiresAt || 0),
      refreshExpiresAt: Number(refreshExpiresAt || 0),
      accountId: persistedAccountId || persistedAccount?.id || null,
      account: persistedAccount || null,
      updatedAt: Date.now(),
    });
    globalThis.sessionStorage?.setItem?.(AUTH_SESSION_STORAGE_KEY, payload);
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function getStoredAuthSession() {
  try {
    if (globalThis.localStorage && globalThis.localStorage !== globalThis.sessionStorage) {
      globalThis.localStorage.removeItem?.(AUTH_SESSION_STORAGE_KEY);
    }
    const raw = globalThis.sessionStorage?.getItem?.(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const hasValidMarker = Boolean(
      parsed.hasSession === true ||
        (typeof parsed.token === 'string' && parsed.token) ||
        parsed.accountId ||
        parsed.account?.id
    );
    if (!hasValidMarker) return null;
    const now = Date.now();
    const refExp = Number(parsed.refreshExpiresAt || 0);
    const accExp = Number(parsed.accessExpiresAt || 0);
    if (refExp > 0 && refExp <= now) {
      globalThis.sessionStorage?.removeItem?.(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    if (!parsed.hasSession && !parsed.refreshToken && refExp === 0 && accExp > 0 && accExp <= now) {
      globalThis.sessionStorage?.removeItem?.(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    return {
      hasSession: true,
      token: authToken || (typeof parsed.token === 'string' ? parsed.token : null),
      refreshToken: refreshToken || null,
      accessExpiresAt: accExp,
      refreshExpiresAt: refExp,
      accountId: parsed.accountId || parsed.account?.id || null,
      account: parsed.account && typeof parsed.account === 'object' ? parsed.account : null,
    };
  } catch {
    return null;
  }
}

// R02 & QA04 Fix: Dùng chung điều kiện nhận diện phiên cookie (canUseSessionRefresh) cho cả timer làm mới chủ động
// lẫn luồng 401, đảm bảo khi chỉ có cookie HttpOnly (refreshToken === null trong JS), timer vẫn đặt đúng tại (accessExpiresAt - 30s).
export function computeProactiveRefreshDelayMs(now = Date.now()) {
  const canRefresh = canUseSessionRefresh(now);
  const baseTargetMs =
    canRefresh && accessExpiresAt > 0
      ? Math.max(1000, accessExpiresAt - now - PROACTIVE_REFRESH_BUFFER_MS)
      : refreshExpiresAt > 0
        ? Math.max(1000, refreshExpiresAt - now)
        : DEFAULT_ACCESS_TTL_MS;
  const backoffRemainingMs = Math.max(0, refreshBackoffUntil - now);
  return Math.min(Math.max(baseTargetMs, backoffRemainingMs), 10 * 60 * 1000);
}

function scheduleSessionExpiryWatch(expectedVersion = sessionVersion) {
  clearExpiryWatchTimer();
  if (typeof globalThis.window === 'undefined' || (!authToken && !canUseSessionRefresh()) || expectedVersion !== sessionVersion) return;
  const now = Date.now();
  if (refreshExpiresAt > 0 && refreshExpiresAt <= now) {
    clearAuthToken();
    globalThis.window?.dispatchEvent?.(new Event(SESSION_EXPIRED_EVENT));
    return;
  }
  const boundedDelay = computeProactiveRefreshDelayMs(now);
  const scheduledVersion = sessionVersion;

  expiryTimerId = setTimeout(async () => {
    expiryTimerId = null;
    if ((!authToken && !canUseSessionRefresh()) || scheduledVersion !== sessionVersion) return;
    const currentNow = Date.now();
    if (refreshExpiresAt > 0 && currentNow >= refreshExpiresAt) {
      clearAuthToken();
      globalThis.window?.dispatchEvent?.(new Event(SESSION_EXPIRED_EVENT));
      return;
    }
    if (
      canUseSessionRefresh(currentNow) &&
      accessExpiresAt > 0 &&
      currentNow >= accessExpiresAt - PROACTIVE_REFRESH_BUFFER_MS &&
      currentNow >= refreshBackoffUntil
    ) {
      const outcome = await refreshSession(scheduledVersion);
      if (scheduledVersion !== sessionVersion) return;
      if (outcome.status === 'expired') {
        clearAuthToken();
        globalThis.window?.dispatchEvent?.(new Event(SESSION_EXPIRED_EVENT));
        return;
      }
    }
    if (scheduledVersion === sessionVersion && authToken) {
      scheduleSessionExpiryWatch(scheduledVersion);
    }
  }, boundedDelay);
}

function loadPersistedIdempotencyKeys() {
  try {
    const raw = globalThis.sessionStorage?.getItem?.(IDEMPOTENCY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const now = Date.now();
    for (const item of parsed) {
      if (
        Array.isArray(item) &&
        typeof item[0] === 'string' &&
        item[1] &&
        typeof item[1].key === 'string' &&
        Number(item[1].expiresAt) > now
      ) {
        pendingWriteIdempotencyKeys.set(item[0], {
          key: item[1].key,
          expiresAt: Number(item[1].expiresAt),
        });
      }
    }
  } catch {
    // Ignore storage read errors
  }
}

function persistIdempotencyKeys() {
  try {
    const now = Date.now();
    for (const [sig, entry] of pendingWriteIdempotencyKeys.entries()) {
      if (!entry || entry.expiresAt <= now) {
        pendingWriteIdempotencyKeys.delete(sig);
      }
    }
    while (pendingWriteIdempotencyKeys.size > IDEMPOTENCY_MAX_ENTRIES) {
      const oldestKey = pendingWriteIdempotencyKeys.keys().next().value;
      if (oldestKey === undefined) break;
      pendingWriteIdempotencyKeys.delete(oldestKey);
    }
    globalThis.sessionStorage?.setItem?.(
      IDEMPOTENCY_STORAGE_KEY,
      JSON.stringify([...pendingWriteIdempotencyKeys.entries()])
    );
  } catch {
    // Ignore storage write errors
  }
}

loadPersistedIdempotencyKeys();

function hydrateStoredSessionOnBoot() {
  const stored = getStoredAuthSession();
  if (!stored) return;
  authToken = stored.token;
  refreshToken = stored.refreshToken || null;
  hasCookieSession = Boolean(stored.hasSession || stored.accountId || stored.account?.id || stored.refreshExpiresAt > 0);
  accessExpiresAt = Number(stored.accessExpiresAt || 0);
  refreshExpiresAt = Number(stored.refreshExpiresAt || 0);
  persistedAccountId = stored.accountId || stored.account?.id || null;
  persistedAccount = stored.account || null;
  if (persistedAccount) {
    setClientIdentity(persistedAccount);
  }
  scheduleSessionExpiryWatch();
}

hydrateStoredSessionOnBoot();

function generateIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalizeClientPath(path = '') {
  return String(path || '').replace(/\?.*$/, '').replace(/\/+$/, '') || '/';
}

function resolveWriteIntentKey(version, method, path, serializedBody, explicitKey) {
  if (explicitKey) return { intentSig: null, key: explicitKey };
  const canonicalPath = canonicalizeClientPath(path);
  const intentSig = `${version}:${method}:${canonicalPath}:${serializedBody ?? ''}`;
  const existing = pendingWriteIdempotencyKeys.get(intentSig);
  if (existing && existing.expiresAt > Date.now()) {
    return { intentSig, key: existing.key };
  }
  const key = generateIdempotencyKey();
  pendingWriteIdempotencyKeys.set(intentSig, {
    key,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
  persistIdempotencyKeys();
  return { intentSig, key };
}

// Mục 05 (QA v1.1.0 Bản 2): Tôn trọng đầy đủ giá trị Retry-After từ máy chủ (ví dụ 30 giây -> 30.000ms),
// không cắt ngắn ở 10 giây.
export function parseRetryAfterMs(responseOrHeader, fallbackMs = 300) {
  const raw =
    typeof responseOrHeader === 'string' || typeof responseOrHeader === 'number'
      ? String(responseOrHeader)
      : String(responseOrHeader?.headers?.get?.('retry-after') || '');
  const trimmed = raw.trim();
  if (!trimmed) return fallbackMs;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(50, Math.round(seconds * 1000));
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(50, parsedDate - Date.now());
  }
  return fallbackMs;
}

function computeBackoffDelayMs(attempt, response, baseDelayMs = 200) {
  const retryAfter = parseRetryAfterMs(response, 0);
  if (retryAfter > 0) return retryAfter;
  const exp = Math.min(4, Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * 60);
  return Math.min(5000, baseDelayMs * (2 ** exp) + jitter);
}

function waitWithAbort(waitMs, signal) {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new DOMException('Thao tác đã bị hủy.', 'AbortError')
    );
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        signal?.reason instanceof Error ? signal.reason : new DOMException('Thao tác đã bị hủy.', 'AbortError')
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, Math.max(0, waitMs));
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function formatRetryAtClock(targetMs) {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(targetMs));
  } catch {
    return new Date(targetMs).toTimeString().slice(0, 8);
  }
}

export function configureApi({ baseURL, token } = {}) {
  if (baseURL) apiBaseUrl = baseURL.replace(/\/+$/, '');
  if (token !== undefined) authToken = token;
}

export function setAuthToken(token, nextRefreshToken, meta = {}) {
  if (token !== undefined) {
    authToken = token;
  }
  if (nextRefreshToken !== undefined) {
    if (nextRefreshToken !== refreshToken) {
      pendingRefreshRetry = { refreshToken: null, retryId: null };
      refreshTransientFailures = 0;
      refreshBackoffUntil = 0;
    }
    refreshToken = nextRefreshToken;
  }
  const now = Date.now();
  const decodedAccExp = decodeJwtExpMs(authToken);
  const decodedRefExp = decodeJwtExpMs(refreshToken);

  if (Number.isFinite(Number(meta?.accessExpiresAt)) && Number(meta.accessExpiresAt) > 0) {
    accessExpiresAt = Number(meta.accessExpiresAt);
  } else if (Number.isFinite(Number(meta?.expiresIn)) && Number(meta.expiresIn) > 0) {
    accessExpiresAt = now + Number(meta.expiresIn) * 1000;
  } else if (decodedAccExp) {
    accessExpiresAt = decodedAccExp;
  } else if (authToken && !accessExpiresAt) {
    accessExpiresAt = now + DEFAULT_ACCESS_TTL_MS;
  } else if (!authToken) {
    accessExpiresAt = 0;
  }

  if (meta?.account !== undefined && meta.account !== null) {
    persistedAccount = meta.account;
    if (meta.account.id) persistedAccountId = meta.account.id;
  }
  if (meta?.accountId !== undefined) {
    persistedAccountId = meta.accountId;
  }
  if (
    authToken ||
    refreshToken ||
    meta?.hasSession === true ||
    meta?.refreshCookie === true ||
    persistedAccountId ||
    persistedAccount?.id ||
    Number(meta?.refreshExpiresAt) > 0 ||
    Number(meta?.refreshExpiresIn) > 0
  ) {
    hasCookieSession = true;
  }

  if (Number.isFinite(Number(meta?.refreshExpiresAt)) && Number(meta.refreshExpiresAt) > 0) {
    refreshExpiresAt = Number(meta.refreshExpiresAt);
  } else if (Number.isFinite(Number(meta?.refreshExpiresIn)) && Number(meta.refreshExpiresIn) > 0) {
    refreshExpiresAt = now + Number(meta.refreshExpiresIn) * 1000;
  } else if (decodedRefExp) {
    refreshExpiresAt = decodedRefExp;
  } else if ((authToken || refreshToken || hasCookieSession || persistedAccountId) && !refreshExpiresAt) {
    refreshExpiresAt = now + DEFAULT_REFRESH_TTL_MS;
  } else if (!authToken && !refreshToken && !hasCookieSession && !persistedAccountId) {
    refreshExpiresAt = 0;
  }

  writePersistedAuthSession();
  scheduleSessionExpiryWatch(sessionVersion);
}

// QA03 Fix: Cập nhật thông tin tài khoản của phiên hiện tại độc lập với việc thay đổi cặp token
export function updateSessionAccount(account) {
  if (!account || typeof account !== 'object') return;
  persistedAccount = account;
  if (account.id) persistedAccountId = account.id;
  writePersistedAuthSession();
}

export function getAuthToken() {
  return authToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function getAuthSessionMetadata() {
  return {
    token: authToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    accountId: persistedAccountId,
  };
}

export function getSessionVersion() {
  return sessionVersion;
}

export function getSessionIdentityKey() {
  const tokenTag = authToken ? String(authToken).slice(-16) : 'anon';
  return `${sessionVersion}:${tokenTag}`;
}

export function clearAuthToken() {
  clearExpiryWatchTimer();
  authToken = null;
  refreshToken = null;
  hasCookieSession = false;
  accessExpiresAt = 0;
  refreshExpiresAt = 0;
  persistedAccountId = null;
  persistedAccount = null;
  pendingRefreshRetry = { refreshToken: null, retryId: null };
  refreshTransientFailures = 0;
  refreshBackoffUntil = 0;
  sessionVersion++;
  pendingWriteIdempotencyKeys.clear();
  try {
    globalThis.sessionStorage?.removeItem?.(IDEMPOTENCY_STORAGE_KEY);
    globalThis.sessionStorage?.removeItem?.(AUTH_SESSION_STORAGE_KEY);
    globalThis.localStorage?.removeItem?.(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage clear errors
  }
  abortAllPageRequests();
  clearEntryDrafts();
  setClientIdentity(null);
}

export function createPageAbortSignal(pageScope = 'default') {
  const existing = activePageControllers.get(pageScope);
  if (existing) {
    try {
      existing.abort();
    } catch {
      // Ignore abort errors
    }
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (controller) {
    activePageControllers.set(pageScope, controller);
  }
  return controller?.signal;
}

export function abortAllPageRequests() {
  for (const controller of activePageControllers.values()) {
    try {
      controller.abort();
    } catch {
      // Ignore abort errors
    }
  }
  activePageControllers.clear();
}

/**
 * QA04 + QA08 + F09 + P1 05 + P2 13 Fix:
 * - Cố định cùng một retryId cho mỗi refreshToken đang xoay vòng để khi gặp lỗi mạng/5xx tạm thời và gọi lại,
 *   Backend khớp đúng retryKey của biên nhận xoay vòng trong cửa sổ 15 giây.
 * - Tôn trọng Retry-After và exponential backoff khi gặp lỗi tạm thời (QA04).
 */
export async function refreshSession(version = sessionVersion) {
  if (refreshInFlight?.version === version) return refreshInFlight.promise;
  const hasCookieOrMemoryRefresh = Boolean(refreshToken || persistedAccountId || refreshExpiresAt > Date.now());
  if (!hasCookieOrMemoryRefresh) return { status: 'expired', token: null };
  if (refreshExpiresAt > 0 && Date.now() >= refreshExpiresAt) {
    return { status: 'expired', token: null };
  }
  const currentRefreshMarker = refreshToken || `cookie:${persistedAccountId || 'session'}:${refreshExpiresAt}`;
  if (pendingRefreshRetry.refreshToken !== currentRefreshMarker || !pendingRefreshRetry.retryId) {
    pendingRefreshRetry = {
      refreshToken: currentRefreshMarker,
      retryId: generateIdempotencyKey(),
    };
  }
  const retryId = pendingRefreshRetry.retryId;

  const recordTransientBackoff = (serverRetryAfterMs = 0) => {
    refreshTransientFailures += 1;
    const expDelay = Math.min(30000, 1500 * Math.pow(2, refreshTransientFailures - 1));
    const delayMs = Math.max(Number(serverRetryAfterMs) || 0, expDelay);
    refreshBackoffUntil = Date.now() + delayMs;
    if (version === sessionVersion && authToken) {
      scheduleSessionExpiryWatch(version);
    }
    return delayMs;
  };

  const promise = (async () => {
    let response;
    try {
      response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Refresh-Retry-Id': retryId,
          'Idempotency-Key': retryId,
        },
        body: JSON.stringify(refreshToken ? { refreshToken, retryKey: retryId } : { retryKey: retryId }),
        signal: AbortSignal.timeout(12000),
      });
    } catch (err) {
      const retryAfterMs = recordTransientBackoff(0);
      return {
        status: 'transient_error',
        token: null,
        error: err,
        retryId,
        retryAfterMs,
        message: 'Kết nối mạng tạm thời gián đoạn khi làm mới phiên đăng nhập.',
      };
    }
    if (version !== sessionVersion) return { status: 'aborted', token: null };
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500 || response.status === 408) {
        const body = await response.json().catch(() => null);
        const parsedRetry = parseRetryAfterMs(response, 1500);
        const retryAfterMs = recordTransientBackoff(parsedRetry);
        return {
          status: 'transient_error',
          token: null,
          httpStatus: response.status,
          retryAfterMs,
          retryId,
          message: body?.message || 'Máy chủ đang bận tạm thời. Vui lòng thử lại sau giây lát.',
        };
      }
      pendingRefreshRetry = { refreshToken: null, retryId: null };
      refreshTransientFailures = 0;
      refreshBackoffUntil = 0;
      return { status: 'expired', token: null, httpStatus: response.status };
    }
    const json = await response.json().catch(() => null);
    if (version !== sessionVersion) return { status: 'aborted', token: null };
    if (!json?.data?.token) {
      const retryAfterMs = recordTransientBackoff(0);
      return { status: 'transient_error', token: null, retryId, retryAfterMs };
    }
    refreshTransientFailures = 0;
    refreshBackoffUntil = 0;
    setAuthToken(json.data.token, json.data.refreshToken ?? null, {
      accessExpiresAt: json.data.accessExpiresAt,
      refreshExpiresAt: json.data.refreshExpiresAt,
      expiresIn: json.data.expiresIn,
      refreshExpiresIn: json.data.refreshExpiresIn,
      accountId: json.data.account?.id ?? persistedAccountId,
      ...(json.data.account ? { account: json.data.account } : {}),
    });
    return { status: 'ok', token: authToken, account: json.data.account || null };
  })();
  refreshInFlight = { version, promise };
  try {
    return await promise;
  } finally {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  }
}

export async function ensureValidSessionToken() {
  const now = Date.now();
  if (refreshExpiresAt > 0 && now >= refreshExpiresAt) {
    clearAuthToken();
    return { status: 'expired', token: null };
  }
  const canRefresh = Boolean(refreshToken || persistedAccountId || refreshExpiresAt > now);
  if (!authToken && !canRefresh) {
    return { status: 'anonymous', token: null };
  }
  const accessExpiredOrNear = accessExpiresAt > 0 && now >= accessExpiresAt - 15000;
  if ((!authToken || accessExpiredOrNear) && canRefresh) {
    return refreshSession(sessionVersion);
  }
  return { status: 'ok', token: authToken };
}

export async function apiRequest(
  method,
  path,
  body,
  {
    allowLocked = false,
    signal,
    idempotencyKey,
    maxRetries = 0,
    retryDelayMs = 200,
    requestTimeoutMs = 15000,
    maxRetryWaitMs = 45000,
    operationDeadlineMs = 0,
  } = {}
) {
  const version = sessionVersion;
  const headers = {};
  const isAuth = path.startsWith('/auth/');

  // Kiểm tra thời hạn Refresh Token / Access Token trước khi gửi request nghiệp vụ
  if (!isAuth && authToken && refreshExpiresAt > 0 && Date.now() >= refreshExpiresAt) {
    clearAuthToken();
    globalThis.window?.dispatchEvent?.(new Event(SESSION_EXPIRED_EVENT));
    const expiredErr = new Error('Phiên đăng nhập đã hết hạn theo thời gian bảo mật. Vui lòng đăng nhập lại.');
    expiredErr.status = 401;
    expiredErr.code = 'SESSION_EXPIRED';
    throw expiredErr;
  }

  const sentToken = authToken;
  const operationStartMs = Date.now();
  const deadlineAt = operationDeadlineMs > 0 ? operationStartMs + operationDeadlineMs : 0;
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  headers['X-Requested-With'] = 'XMLHttpRequest';

  let writeIntentSig = null;
  const isReadOnlyPost = path === '/orders/history/query';
  if (!isAuth && !isReadOnlyPost && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const resolved = resolveWriteIntentKey(version, method, path, serializedBody, idempotencyKey);
    writeIntentSig = resolved.intentSig;
    headers['Idempotency-Key'] = resolved.key;
  }

  // Mục 05 (QA v1.1.0 Bản 2): Tách timeout của từng lần gọi HTTP (requestTimeoutMs = 15s)
  // khỏi ngân sách chờ retry / deadline toàn thao tác (operationDeadlineMs), để khi chờ Retry-After (ví dụ 30s)
  // lần gọi kế tiếp vẫn có đủ timeout riêng và không bị hủy nhầm ở giây thứ 15.
  const send = token => {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new DOMException('Thao tác đã bị hủy.', 'AbortError');
    }
    const now = Date.now();
    if (deadlineAt > 0 && now >= deadlineAt) {
      const deadlineErr = new Error('Thao tác đã vượt quá thời gian chờ cho phép. Vui lòng thử lại.');
      deadlineErr.status = 408;
      deadlineErr.code = 'OPERATION_DEADLINE_EXCEEDED';
      throw deadlineErr;
    }
    const remainingDeadlineMs = deadlineAt > 0 ? Math.max(50, deadlineAt - now) : requestTimeoutMs;
    const perAttemptTimeoutMs = Math.max(50, Math.min(requestTimeoutMs, remainingDeadlineMs));
    const attemptTimeoutSignal = AbortSignal.timeout(perAttemptTimeoutMs);
    const attemptSignal = signal ? AbortSignal.any([signal, attemptTimeoutSignal]) : attemptTimeoutSignal;
    return fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: attemptSignal,
      ...(serializedBody !== undefined ? { body: serializedBody } : {}),
    });
  };

  let response;
  let retryAttempt = 0;
  let retryDeadlineExceededInfo = null;
  let sending = true;
  while (sending) {
    response = await send(sentToken);
    const isTransientStatus =
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;
    if (
      retryAttempt < maxRetries &&
      isTransientStatus &&
      !signal?.aborted &&
      version === sessionVersion
    ) {
      const waitMs = computeBackoffDelayMs(retryAttempt, response, retryDelayMs);
      const now = Date.now();
      const exceedsRetryBudget = maxRetryWaitMs > 0 && waitMs > maxRetryWaitMs;
      const exceedsOperationDeadline = deadlineAt > 0 && now + waitMs > deadlineAt;
      if (exceedsRetryBudget || exceedsOperationDeadline) {
        const retryAtMs = now + waitMs;
        retryDeadlineExceededInfo = {
          waitMs,
          retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
          retryAt: new Date(retryAtMs).toISOString(),
          retryAtClock: formatRetryAtClock(retryAtMs),
        };
        sending = false;
        break;
      }
      retryAttempt += 1;
      await waitWithAbort(waitMs, signal);
      continue;
    }
    sending = false;
  }

  if (!isAuth && response.status === 401 && sentToken && version === sessionVersion) {
    if (authToken !== sentToken && authToken) {
      response = await send(authToken);
    } else if (refreshToken || persistedAccountId || refreshExpiresAt > Date.now()) {
      const refreshOutcome = await refreshSession(version);
      if (refreshOutcome.status === 'ok' && refreshOutcome.token && version === sessionVersion) {
        response = await send(refreshOutcome.token);
      } else if (refreshOutcome.status === 'transient_error') {
        const transientErr = new Error(
          refreshOutcome.message || 'Kết nối tạm thời gián đoạn khi làm mới phiên. Vui lòng thử lại.'
        );
        transientErr.status = refreshOutcome.httpStatus || 503;
        transientErr.code = 'REFRESH_TRANSIENT_ERROR';
        transientErr.retryable = true;
        transientErr.retryAfterMs = refreshOutcome.retryAfterMs || 300;
        throw transientErr;
      }
    }
    if (response.status === 401 && version === sessionVersion) {
      clearAuthToken();
      globalThis.window?.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }

  const envelope = await response.json().catch(() => null);
  if (response.ok && (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))) {
    throw new Error('Máy chủ trả về phản hồi không hợp lệ.');
  }

  // L02 + P1 12 Fix: Chỉ giải phóng Idempotency-Key SAU KHI đã đọc JSON thành công và status là kết quả xác định (không phải 408/429/5xx)
  if (writeIntentSig && response.status < 500 && ![408, 429].includes(response.status)) {
    pendingWriteIdempotencyKeys.delete(writeIntentSig);
    persistIdempotencyKeys();
  }

  if (sentToken && path !== '/auth/logout' && version !== sessionVersion && response.ok) {
    throw new DOMException('Phiên yêu cầu đã thay đổi.', 'AbortError');
  }
  const data = response.ok ? (envelope.data ?? envelope) : envelope ?? {};

  // F10 + P1 08 Fix: Hỗ trợ đọc X-Cache-Invalidated và X-Data-Revision
  const rawCacheInvalidated = String(response.headers?.get?.('x-cache-invalidated') || '').trim();
  const invalidatedNamespaces =
    rawCacheInvalidated && rawCacheInvalidated.toLowerCase() !== 'false'
      ? rawCacheInvalidated.split(',').map(s => s.trim()).filter(Boolean)
      : [];
  const rawDataRevision = response.headers?.get?.('x-data-revision');
  const meta = {
    cache: response.headers?.get?.('x-cache') || null,
    cacheInvalidated: invalidatedNamespaces.length > 0,
    invalidatedNamespaces,
    dataRevision: rawDataRevision !== null && rawDataRevision !== undefined ? Number(rawDataRevision) : null,
    pageCacheCleared: response.headers?.get?.('x-page-cache-cleared') === 'true',
    rateLimitLimit: response.headers?.get?.('x-ratelimit-limit') || null,
    rateLimitRemaining: response.headers?.get?.('x-ratelimit-remaining') || null,
    rateLimitMode: response.headers?.get?.('x-ratelimit-mode') || null,
  };

  if (response.status === 423 && allowLocked) {
    return { status: 423, data, meta };
  }

  // QA07 & P1 12 Fix: Hỗ trợ đọc kết quả replay từ cả data.details.committedResult (chuẩn AppError Backend) lẫn data.committedResult
  if (response.status === 409 && data?.code === 'REQUEST_ALREADY_COMMITTED') {
    const committedResult = data?.details?.committedResult ?? data?.committedResult;
    const committedStatus = Number(data?.details?.committedStatusCode ?? data?.committedStatusCode ?? 200);
    if (committedResult && typeof committedResult === 'object' && Object.keys(committedResult).length > 0) {
      return {
        status: committedStatus,
        data: committedResult,
        meta: { ...meta, replayed: true },
      };
    }
  }

  if (!response.ok) {
    let errorMessage = data.message || `Lỗi kết nối máy chủ (${response.status}).`;
    const headerRetryAfterMs = response.status === 429 ? parseRetryAfterMs(response, 0) : 0;
    const retryInfo =
      retryDeadlineExceededInfo ||
      (headerRetryAfterMs > 0
        ? {
            waitMs: headerRetryAfterMs,
            retryAfterSeconds: Math.max(1, Math.ceil(headerRetryAfterMs / 1000)),
            retryAt: new Date(Date.now() + headerRetryAfterMs).toISOString(),
            retryAtClock: formatRetryAtClock(Date.now() + headerRetryAfterMs),
          }
        : null);
    if (response.status === 429 && retryInfo) {
      errorMessage = `${data.message || 'Hệ thống đang giới hạn tần suất yêu cầu (429).'} Vui lòng thử lại sau ${retryInfo.retryAfterSeconds} giây (lúc ${retryInfo.retryAtClock}).`;
    }
    const err = new Error(errorMessage);
    err.status = response.status;
    err.code = retryDeadlineExceededInfo ? (data.code || 'RETRY_AFTER_EXCEEDS_DEADLINE') : data.code;
    err.details = data;
    if (retryInfo) {
      err.retryAfterMs = retryInfo.waitMs;
      err.retryAfterSeconds = retryInfo.retryAfterSeconds;
      err.retryAt = retryInfo.retryAt;
      err.retryAtClock = retryInfo.retryAtClock;
      err.exceededDeadline = Boolean(retryDeadlineExceededInfo);
    }
    err.alreadyCommitted = data?.code === 'REQUEST_ALREADY_COMMITTED';
    throw err;
  }

  return { status: response.status, data, meta };
}

// =============================================================================
// CÁC HÀM GỌI RESTful API TRỰC TIẾP TỚI BACKEND POSTGRESQL + REDIS CACHE
// =============================================================================
export async function loginApi(email, password, acceptedTerms, policyVersion) {
  return apiRequest(
    'POST',
    '/auth/login',
    { email, password, acceptedTerms: acceptedTerms === true, policyVersion },
    { allowLocked: true }
  );
}

// Mục 01 (QA v1.1.0 Bản 2): Luôn gọi POST /auth/logout cùng origin khi còn phiên (kể cả khi chỉ còn cookie
// và metadata sau F5 hoặc khi refresh bị gián đoạn chưa có token trong JS), hủy các request đang chạy,
// xóa trạng thái phiên cục bộ và báo lỗi rõ nếu máy chủ chưa xác nhận thu hồi.
export async function logoutApi() {
  const shouldCallServer = hasActiveAuthSession();
  const outgoingAccountId = persistedAccountId || persistedAccount?.id || null;
  const bodyPayload = refreshToken ? { refreshToken } : {};
  abortAllPageRequests();
  const logout = shouldCallServer
    ? apiRequest('POST', '/auth/logout', bodyPayload)
    : Promise.resolve({ status: 200, data: { loggedOut: true } });
  clearAuthToken();
  const broadcast = serverRevoked => {
    try {
      globalThis.localStorage?.setItem?.(
        LOGOUT_BROADCAST_KEY,
        JSON.stringify({
          accountId: outgoingAccountId,
          serverRevoked,
          at: Date.now(),
          nonce: Math.random().toString(36).slice(2, 10),
        })
      );
    } catch {
      // Ignore storage errors
    }
  };
  try {
    const res = await logout;
    broadcast(true);
    return res?.data ?? { loggedOut: true };
  } catch (err) {
    clearAuthToken();
    broadcast(false);
    throw err;
  }
}

export async function fetchTermsPolicyApi(signal) {
  const { data } = await apiRequest('GET', '/auth/terms-policy', undefined, { signal });
  return data;
}

export async function changePasswordApi(currentPassword, newPassword) {
  const { data } = await apiRequest('POST', '/auth/change-password', {
    currentPassword,
    newPassword,
  });
  if (data.token) {
    setAuthToken(data.token, data.refreshToken, {
      accessExpiresAt: data.accessExpiresAt,
      refreshExpiresAt: data.refreshExpiresAt,
      expiresIn: data.expiresIn,
      refreshExpiresIn: data.refreshExpiresIn,
    });
  }
  return data;
}

export async function fetchBootstrapApi(signal) {
  const { data } = await apiRequest('GET', '/directory/bootstrap', undefined, { signal });
  return data;
}

export async function fetchAccountsApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/directory/accounts${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchTasksApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/operations/tasks${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchRemindersApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/operations/reminders${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchDashboardSummaryApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/dashboard/summary${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchAuditLogsApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/audit-logs${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchOrdersApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/orders/items${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function previewOrderProgressApi(rowId, payload, signal) {
  const { data } = await apiRequest(
    'POST',
    `/orders/items/${encodeURIComponent(rowId)}/preview-progress`,
    payload,
    { signal }
  );
  return data;
}

export async function updateOrderProgressApi(rowId, payload) {
  const { data } = await apiRequest(
    'PATCH',
    `/orders/items/${encodeURIComponent(rowId)}/progress`,
    payload
  );
  return data;
}

export async function fetchFinanceStateApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/finance/state${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

// RESTful API CRUD Công nợ phải thu (AR) & Công nợ phải trả (AP)
export async function fetchReceivablesApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/finance/receivables${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchReceivableDetailApi(id, signal) {
  const { data } = await apiRequest('GET', `/finance/receivables/${encodeURIComponent(id)}`, undefined, { signal });
  return data;
}

export async function createReceivableApi(payload) {
  const { data } = await apiRequest('POST', '/finance/receivables', payload);
  return data;
}

export async function updateReceivableApi(id, payload) {
  const { data } = await apiRequest('PATCH', `/finance/receivables/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function deleteReceivableApi(id, payload = {}) {
  const { data } = await apiRequest('DELETE', `/finance/receivables/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function fetchPayablesApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/finance/payables${qs ? `?${qs}` : ''}`, undefined, { signal });
  return data;
}

export async function fetchPayableDetailApi(id, signal) {
  const { data } = await apiRequest('GET', `/finance/payables/${encodeURIComponent(id)}`, undefined, { signal });
  return data;
}

export async function createPayableApi(payload) {
  const { data } = await apiRequest('POST', '/finance/payables', payload);
  return data;
}

export async function updatePayableApi(id, payload) {
  const { data } = await apiRequest('PATCH', `/finance/payables/${encodeURIComponent(id)}`, payload);
  return data;
}

export async function deletePayableApi(id, payload = {}) {
  const { data } = await apiRequest('DELETE', `/finance/payables/${encodeURIComponent(id)}`, payload);
  return data;
}

export function isFinanceSnapshotPayload(obj) {
  const candidate = obj?.finance && typeof obj.finance === 'object' ? obj.finance : obj;
  return Boolean(
    candidate &&
    typeof candidate === 'object' &&
    Array.isArray(candidate.revenue) &&
    Array.isArray(candidate.receivables) &&
    Array.isArray(candidate.payables) &&
    Array.isArray(candidate.receipts) &&
    Array.isArray(candidate.audit)
  );
}

async function ensureFinanceSnapshotResult(rawResult) {
  if (isFinanceSnapshotPayload(rawResult)) {
    const fin = rawResult?.finance && isFinanceSnapshotPayload(rawResult.finance) ? rawResult.finance : rawResult;
    return { ...rawResult, finance: fin };
  }
  const reconciled = await fetchFinanceStateApi({});
  if (isFinanceSnapshotPayload(reconciled)) {
    return {
      ...(rawResult && typeof rawResult === 'object' ? rawResult : {}),
      receipt: rawResult,
      finance: reconciled,
      ...reconciled,
    };
  }
  return rawResult;
}

export async function executeFinanceActionApi(action, payload) {
  let result;
  switch (action) {
    case 'invoice': {
      const { data } = await apiRequest('POST', '/finance/invoices', payload);
      result = data;
      break;
    }
    case 'receivable':
    case 'create-receivable': {
      result = await createReceivableApi(payload);
      break;
    }
    case 'update-receivable': {
      result = await updateReceivableApi(payload.id, payload);
      break;
    }
    case 'delete-receivable': {
      result = await deleteReceivableApi(payload.id, payload);
      break;
    }
    case 'receipt': {
      const { data } = await apiRequest('POST', '/finance/receipts', payload);
      result = data;
      break;
    }
    case 'allocate': {
      const { data } = await apiRequest('POST', '/finance/allocations', payload);
      result = data;
      break;
    }
    case 'payable':
    case 'create-payable': {
      result = await createPayableApi(payload);
      break;
    }
    case 'update-payable': {
      result = await updatePayableApi(payload.id, payload);
      break;
    }
    case 'delete-payable': {
      result = await deletePayableApi(payload.id, payload);
      break;
    }
    case 'split': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/split`,
        payload
      );
      result = data;
      break;
    }
    case 'submit': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/submit`,
        payload
      );
      result = data;
      break;
    }
    case 'review': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/review`,
        payload
      );
      result = data;
      break;
    }
    case 'pay': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/payments`,
        payload
      );
      result = data;
      break;
    }
    default:
      throw new Error('Thao tác tài chính không hợp lệ.');
  }
  return ensureFinanceSnapshotResult(result);
}

export async function executeDirectoryOrTaskActionApi(action, payload) {
  switch (action) {
    case 'create-account':
      await apiRequest('POST', '/directory/accounts', payload);
      break;
    case 'update-account':
      await apiRequest('PATCH', `/directory/accounts/${encodeURIComponent(payload.id)}`, payload);
      break;
    case 'set-account-status':
      await apiRequest(
        'POST',
        `/directory/accounts/${encodeURIComponent(payload.id)}/status`,
        payload
      );
      break;
    case 'apply-department-navigation':
      await apiRequest(
        'PUT',
        `/directory/departments/${encodeURIComponent(payload.role)}/navigation`,
        payload
      );
      break;
    case 'create-task':
      await apiRequest('POST', '/operations/tasks', payload);
      break;
    case 'accept':
      await apiRequest('POST', `/operations/tasks/${encodeURIComponent(payload.id)}/accept`, payload);
      break;
    case 'handover':
      await apiRequest(
        'POST',
        `/operations/tasks/${encodeURIComponent(payload.id)}/handover`,
        payload
      );
      break;
    case 'confirm':
      await apiRequest(
        'POST',
        `/operations/tasks/${encodeURIComponent(payload.id)}/confirm`,
        payload
      );
      break;
    case 'assign':
      await apiRequest('POST', `/operations/tasks/${encodeURIComponent(payload.id)}/assign`, payload);
      break;
    case 'comment-task':
      await apiRequest(
        'POST',
        `/operations/tasks/${encodeURIComponent(payload.id)}/comments`,
        payload
      );
      break;
    case 'create-reminder':
      await apiRequest('POST', '/operations/reminders', payload);
      break;
    case 'quick-assign-reminder':
      await apiRequest(
        'POST',
        `/operations/reminders/${encodeURIComponent(payload.reminderId)}/quick-assign`,
        payload
      );
      break;
    case 'dismiss-reminder':
      await apiRequest(
        'POST',
        `/operations/reminders/${encodeURIComponent(payload.reminderId)}/dismiss`,
        payload
      );
      break;
    default:
      throw new Error(`Thao tác không được hỗ trợ: ${action}`);
  }
}

export async function fetchTaskAttachmentApi(taskId, fileId) {
  const { data } = await apiRequest(
    'GET',
    `/operations/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(fileId)}`
  );
  return data.file ?? data;
}

export async function saveEntryBatchApi(sheetId, rows) {
  try {
    const { data } = await apiRequest('POST', `/data-entry/sheets/${encodeURIComponent(sheetId)}/batch`, { rows });
    return data;
  } catch (error) {
    const issues = error.details?.details?.issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return {
        issues: issues.map(item => ({
          line: item.line ?? item.row ?? 1,
          message: item.message || error.message,
        })),
      };
    }
    const row = error.details?.details?.row;
    if (row) return { issues: [{ line: row, message: error.message }] };
    throw error;
  }
}

export async function fetchOrderDetailApi(rowId, signal) {
  const { data } = await apiRequest('GET', `/orders/items/${encodeURIComponent(rowId)}`, undefined, { signal });
  return data.item;
}

export async function readTaskDraftApi(taskId, signal) {
  const { data } = await apiRequest('GET', `/operations/tasks/${encodeURIComponent(taskId)}/draft`, undefined, { signal });
  return data;
}

export async function writeTaskDraftApi(taskId, note, expectedVersion) {
  const { data } = await apiRequest('PUT', `/operations/tasks/${encodeURIComponent(taskId)}/draft`, { note, expectedVersion });
  return data;
}

export default {
  request: apiRequest,
  configureApi,
  setAuthToken,
  getAuthToken,
  getRefreshToken,
  getAuthSessionMetadata,
  getStoredAuthSession,
  ensureValidSessionToken,
  refreshSession,
  getSessionVersion,
  getSessionIdentityKey,
  clearAuthToken,
  logoutApi,
  createPageAbortSignal,
  abortAllPageRequests,
  parseRetryAfterMs,
};
