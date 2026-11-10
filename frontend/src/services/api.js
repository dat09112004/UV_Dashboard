import { setClientIdentity } from '../utils/permissions.js';

let authToken = null;
let apiBaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api/v1';

// Quản lý AbortController cho các request theo từng trang/phân hệ để hủy ngay khi người dùng chuyển trang
const activePageControllers = new Map();

export function configureApi({ baseURL, token } = {}) {
  if (baseURL) apiBaseUrl = baseURL.replace(/\/+$/, '');
  if (token !== undefined) authToken = token;
}

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  abortAllPageRequests();
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
 * Gửi HTTP Request chuẩn tới Backend RESTful API kèm JWT Bearer Token.
 * Tự động chuẩn hóa lỗi nghiệp vụ tiếng Việt, headers Redis Cache, Phân trang và Rate Limit.
 */
export async function apiRequest(
  method,
  path,
  body = undefined,
  { allowLocked = false, signal = undefined } = {}
) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: method.toUpperCase(),
    headers,
    ...(signal ? { signal } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));
  const meta = {
    cache: response.headers?.get?.('x-cache') || null,
    cacheInvalidated: response.headers?.get?.('x-cache-invalidated') === 'true',
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
export async function loginApi(email, password, acceptedTerms = true) {
  return apiRequest(
    'POST',
    '/auth/login',
    { email, password, acceptedTerms: Boolean(acceptedTerms) },
    { allowLocked: true }
  );
}

export async function logoutApi() {
  try {
    if (authToken) {
      await apiRequest('POST', '/auth/logout', {});
    }
  } catch {
    // Luôn xóa token ở trình duyệt ngay cả khi kết nối mạng gián đoạn
  } finally {
    clearAuthToken();
  }
}

/**
 * Báo cho Backend giải phóng bộ nhớ đệm (Redis/Memory) của trang/phân hệ cũ khi người dùng chuyển trang
 * ("khi người dùng bấm trang khác thì clear trang cũ đi để tránh bị nặng server").
 */
export async function releasePageCacheApi({ previousSection = null, previousPage = null } = {}) {
  if (!authToken) return null;
  try {
    const { data } = await apiRequest('POST', '/cache/release-page', {
      previousSection,
      previousPage,
    });
    return data;
  } catch {
    return null;
  }
}

export async function refreshTokenApi() {
  const { data } = await apiRequest('POST', '/auth/refresh', {});
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function fetchTermsPolicyApi() {
  const { data } = await apiRequest('GET', '/auth/terms-policy');
  return data;
}

export async function changePasswordApi(currentPassword, newPassword) {
  const { data } = await apiRequest('POST', '/auth/change-password', {
    currentPassword,
    newPassword,
  });
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function fetchBootstrapApi() {
  const { data } = await apiRequest('GET', '/directory/bootstrap');
  return data;
}

export async function fetchOrdersApi(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/orders/items${qs ? `?${qs}` : ''}`);
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

export async function fetchFinanceStateApi(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const { data } = await apiRequest('GET', `/finance/state${qs ? `?${qs}` : ''}`);
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
  return fetchBootstrapApi();
}

export async function fetchTaskAttachmentApi(taskId, fileId) {
  const { data } = await apiRequest(
    'GET',
    `/operations/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(fileId)}`
  );
  return data.file;
}

export async function saveEntryBatchApi(sheetId, drafts, { orderBaseline, now } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(
    `${apiBaseUrl}/data-entry/sheets/${encodeURIComponent(sheetId)}/batch`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ drafts, orderBaseline, now }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (response.status === 422 && data.issues) {
    return { issues: data.issues, ...(data.warnings ? { warnings: data.warnings } : {}) };
  }
  if (!response.ok) {
    throw new Error(data.message || 'Không thể lưu lô dữ liệu.');
  }
  return data;
}

export default {
  request: apiRequest,
  configureApi,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  logoutApi,
  refreshTokenApi,
  releasePageCacheApi,
  createPageAbortSignal,
  abortAllPageRequests,
};
