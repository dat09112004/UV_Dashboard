export const SYSTEM_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const TERMS_POLICY_VERSION = '2026.1';

export const DEBOUNCE_DELAYS = Object.freeze({
  SEARCH_INPUT_MS: 300,
  FILTER_SELECT_MS: 150,
  CLEAR_INSTANT_MS: 0,
});

export const PAGINATION_DEFAULTS = Object.freeze({
  INITIAL_CHUNK_SIZE: 6,
  STEP_CHUNK_SIZE: 6,
  DEFAULT_PAGE_SIZE: 12,
  MAX_PAGE_SIZE: 100,
});

export const CACHE_NAMESPACES = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  DASHBOARD: 'dashboard',
  ORDERS: 'orders',
  FINANCE: 'finance',
  TASKS: 'tasks',
  REMINDERS: 'reminders',
  DATA_ENTRY: 'data-entry',
});

export const RATE_LIMIT_TIERS = Object.freeze({
  AUTH: { name: 'auth', maxPerMinute: 30 },
  WRITE: { name: 'write', maxPerMinute: 120 },
  READ: { name: 'read', maxPerMinute: 300 },
});
