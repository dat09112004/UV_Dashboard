import { setClientIdentity } from '../utils/permissions.js';
import { clearEntryDrafts } from '../features/dataEntry/drafts.js';

let authToken = null;
let refreshToken = null;
let refreshInFlight;
let sessionVersion = 0;
export const SESSION_EXPIRED_EVENT = 'uv:session-expired';
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

function resolveWriteIntentKey(version, method, path, serializedBody, explicitKey) {
  if (explicitKey) return { intentSig: null, key: explicitKey };
  const intentSig = `${version}:${method}:${path}:${serializedBody ?? ''}`;
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

export function configureApi({ baseURL, token } = {}) {
  if (baseURL) apiBaseUrl = baseURL.replace(/\/+$/, '');
  if (token !== undefined) authToken = token;
}

export function setAuthToken(token, nextRefreshToken) {
  authToken = token;
  if (nextRefreshToken !== undefined) refreshToken = nextRefreshToken;
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  refreshToken = null;
  sessionVersion++;
  pendingWriteIdempotencyKeys.clear();
  try {
    globalThis.sessionStorage?.removeItem?.(IDEMPOTENCY_STORAGE_KEY);
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
 * F09 Fix: Phân biệt rõ lỗi xác thực phiên hết hạn/thu hồi (401/403/400) với lỗi tạm thời (429/5xx/mạng)
 * để không đăng xuất nhầm người dùng khi máy chủ hoặc mạng bận tạm thời.
 */
async function refreshSession(version) {
  if (refreshInFlight?.version === version) return refreshInFlight.promise;
  const promise = (async () => {
    let response;
    try {
      response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(12000),
      });
    } catch (err) {
      return { status: 'transient_error', token: null, error: err };
    }
    if (version !== sessionVersion) return { status: 'aborted', token: null };
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500 || response.status === 408) {
        const body = await response.json().catch(() => null);
        return {
          status: 'transient_error',
          token: null,
          httpStatus: response.status,
          message: body?.message || 'Máy chủ đang bận tạm thời. Vui lòng thử lại sau giây lát.',
        };
      }
      return { status: 'expired', token: null, httpStatus: response.status };
    }
    const json = await response.json().catch(() => null);
    if (version !== sessionVersion) return { status: 'aborted', token: null };
    if (!json?.data?.token || !json?.data?.refreshToken) {
      return { status: 'transient_error', token: null };
    }
    setAuthToken(json.data.token, json.data.refreshToken);
    return { status: 'ok', token: authToken };
  })();
  refreshInFlight = { version, promise };
  try {
    return await promise;
  } finally {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  }
}

export async function apiRequest(
  method, path, body, { allowLocked = false, signal, idempotencyKey } = {}
) {
  const version = sessionVersion;
  const headers = {};
  const isAuth = path.startsWith('/auth/');
  const sentToken = authToken;
  const timeoutSignal = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let writeIntentSig = null;
  if (!isAuth && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const resolved = resolveWriteIntentKey(version, method, path, serializedBody, idempotencyKey);
    writeIntentSig = resolved.intentSig;
    headers['Idempotency-Key'] = resolved.key;
  }

  const send = token => fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: requestSignal,
    ...(serializedBody !== undefined ? { body: serializedBody } : {}),
  });

  let response = await send(sentToken);
  if (!isAuth && response.status === 401 && sentToken && version === sessionVersion) {
    if (authToken !== sentToken && authToken) {
      response = await send(authToken);
    } else if (refreshToken) {
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

  // L02 Fix: Chỉ giải phóng Idempotency-Key SAU KHI đã đọc JSON thành công và status là kết quả xác định (không phải 408/429/5xx)
  if (writeIntentSig && response.status < 500 && ![408, 429].includes(response.status)) {
    pendingWriteIdempotencyKeys.delete(writeIntentSig);
    persistIdempotencyKeys();
  }

  if (sentToken && path !== '/auth/logout' && version !== sessionVersion && response.ok) {
    throw new DOMException('Phiên yêu cầu đã thay đổi.', 'AbortError');
  }
  const data = response.ok ? (envelope.data ?? envelope) : envelope ?? {};

  // F10 Fix: Hỗ trợ đọc X-Cache-Invalidated cả dạng boolean ('true') lẫn danh sách phân hệ ('finance,dashboard,...')
  const rawCacheInvalidated = String(response.headers?.get?.('x-cache-invalidated') || '').trim();
  const invalidatedNamespaces =
    rawCacheInvalidated && rawCacheInvalidated.toLowerCase() !== 'false'
      ? rawCacheInvalidated.split(',').map(s => s.trim()).filter(Boolean)
      : [];
  const meta = {
    cache: response.headers?.get?.('x-cache') || null,
    cacheInvalidated: invalidatedNamespaces.length > 0,
    invalidatedNamespaces,
    pageCacheCleared: response.headers?.get?.('x-page-cache-cleared') === 'true',
    rateLimitLimit: response.headers?.get?.('x-ratelimit-limit') || null,
    rateLimitRemaining: response.headers?.get?.('x-ratelimit-remaining') || null,
  };

  if (response.status === 423 && allowLocked) {
    return { status: 423, data, meta };
  }

  if (!response.ok) {
    const err = new Error(data.message || `Lỗi kết nối máy chủ (${response.status}).`);
    err.status = response.status;
    err.code = data.code;
    err.details = data;
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

export async function logoutApi() {
  const logout = authToken || refreshToken
    ? apiRequest('POST', '/auth/logout', refreshToken ? { refreshToken } : {})
    : Promise.resolve();
  clearAuthToken();
  await logout;
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
  if (data.token) setAuthToken(data.token, data.refreshToken);
  return data;
}

export async function fetchBootstrapApi() {
  const { data } = await apiRequest('GET', '/directory/bootstrap');
  return data;
}

export async function fetchOrdersApi(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/orders/items${qs ? `?${qs}` : ''}`, undefined, { signal });
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

export async function executeFinanceActionApi(action, payload) {
  switch (action) {
    case 'invoice': {
      const { data } = await apiRequest('POST', '/finance/invoices', payload);
      return data;
    }
    case 'receipt': {
      const { data } = await apiRequest('POST', '/finance/receipts', payload);
      return data;
    }
    case 'allocate': {
      const { data } = await apiRequest('POST', '/finance/allocations', payload);
      return data;
    }
    case 'payable': {
      const { data } = await apiRequest('POST', '/finance/payables', payload);
      return data;
    }
    case 'split': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/split`,
        payload
      );
      return data;
    }
    case 'submit': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/submit`,
        payload
      );
      return data;
    }
    case 'review': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/review`,
        payload
      );
      return data;
    }
    case 'pay': {
      const { data } = await apiRequest(
        'POST',
        `/finance/payables/${encodeURIComponent(payload.id)}/payments`,
        payload
      );
      return data;
    }
    default:
      throw new Error('Thao tác tài chính không hợp lệ.');
  }
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
  clearAuthToken,
  logoutApi,
  createPageAbortSignal,
  abortAllPageRequests,
};
