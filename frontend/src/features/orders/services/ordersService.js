import { apiRequest, fetchOrdersApi } from '../../../services/api.js';

// Chức năng: Tải một trang dữ liệu đơn hàng PO từ Backend API kèm theo con trỏ phân trang (cursor)
export async function fetchOrdersPage(params = {}, signal) {
  const data = await fetchOrdersApi({ limit: 50, ...params }, signal);
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Máy chủ trả về danh sách PO không hợp lệ.');
  }
  return {
    items: data.items,
    pagination: data.pagination || null,
    nextCursor: data.nextCursor ?? data.pagination?.nextCursor ?? null,
    hasMore: Boolean(data.hasMore ?? data.pagination?.hasMore ?? (data.nextCursor !== null && data.nextCursor !== undefined)),
  };
}

/**
 * QA06 Fix:
 * - Hỗ trợ tải đầy đủ danh sách PO nhiều trang (mặc định tối đa 100 trang = 10.000 dòng PO).
 * - Nếu xảy ra lỗi ở trang sau hoặc vượt giới hạn trang an toàn, đính kèm danh sách đã tải được (err.partialItems)
 *   để giao diện giữ lại dữ liệu đã tải và hiển thị cảnh báo thiếu dữ liệu rõ ràng thay vì rơi về 100 dòng đầu.
 */
export async function fetchOrderCollection(signal, options = {}) {
  const {
    maxPages = 100,
    limit = 100,
    initialItems = [],
    startCursor = undefined,
    ...filters
  } = options || {};
  const items = Array.isArray(initialItems) && initialItems.length > 0 ? [...initialItems] : [];
  let cursor = startCursor;
  let pageCount = items.length > 0 ? 1 : 0;
  if (items.length > 0 && cursor === null) {
    return items;
  }
  try {
    do {
      pageCount += 1;
      if (pageCount > maxPages) {
        const limitErr = new Error(`Danh sách PO vượt quá giới hạn ${maxPages} trang (${items.length} dòng PO đầu đã được giữ lại).`);
        limitErr.code = 'PO_COLLECTION_TRUNCATED';
        limitErr.partialItems = [...items];
        limitErr.nextCursor = cursor ?? null;
        limitErr.truncated = true;
        throw limitErr;
      }
      const data = await fetchOrdersApi({ view: 'reference', ...filters, cursor, limit }, signal);
      const next = data?.nextCursor ?? null;
      if (!data || !Array.isArray(data.items) || (next !== null && (!Number.isSafeInteger(next) || next <= (cursor ?? 0)))) {
        const invalidErr = new Error('Máy chủ trả về danh sách PO không hợp lệ.');
        invalidErr.code = 'PO_INVALID_PAGE';
        if (items.length > 0) {
          invalidErr.partialItems = [...items];
          invalidErr.nextCursor = cursor ?? null;
          invalidErr.truncated = true;
        }
        throw invalidErr;
      }
      items.push(...data.items);
      cursor = next;
    } while (cursor !== null);
  } catch (err) {
    if (items.length > 0 && !err.partialItems) {
      err.partialItems = [...items];
      err.nextCursor = cursor ?? null;
      err.truncated = true;
    }
    throw err;
  }
  return items;
}

// Chức năng: Truy vấn lịch sử cập nhật tiến độ của danh sách dòng đơn hàng theo từng lô (tối đa 500 dòng/lần) có tự động thử lại khi 429
export async function fetchOrderHistory(
  items,
  signal,
  {
    batchSize = 500,
    maxRetries = 3,
    retryDelayMs = 300,
    requestTimeoutMs = 15000,
    maxRetryWaitMs = 45000,
    operationDeadlineMs = 120000,
  } = {}
) {
  const history = [];
  const safeBatchSize = Math.min(500, Math.max(1, Math.trunc(Number(batchSize) || 500)));
  const uniqueIds = [...new Set((items || []).map(item => item?.rowId).filter(id => id !== undefined && id !== null))];
  const startedAt = Date.now();
  const totalDeadlineAt = operationDeadlineMs > 0 ? startedAt + operationDeadlineMs : 0;

  for (let index = 0; index < uniqueIds.length; index += safeBatchSize) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new DOMException('Đã hủy xuất lịch sử đơn hàng.', 'AbortError');
    }
    const now = Date.now();
    if (totalDeadlineAt > 0 && now >= totalDeadlineAt) {
      const deadlineErr = new Error('Đã hết thời gian chờ xuất lịch sử đơn hàng. Vui lòng thử lại.');
      deadlineErr.status = 408;
      deadlineErr.code = 'OPERATION_DEADLINE_EXCEEDED';
      throw deadlineErr;
    }
    const remainingDeadlineMs = totalDeadlineAt > 0 ? totalDeadlineAt - now : 0;
    const rowIds = uniqueIds.slice(index, index + safeBatchSize);
    const { data } = await apiRequest(
      'POST',
      '/orders/history/query',
      { rowIds },
      {
        signal,
        maxRetries,
        retryDelayMs,
        requestTimeoutMs,
        maxRetryWaitMs,
        operationDeadlineMs: remainingDeadlineMs,
      }
    );
    if (!data || !Array.isArray(data.items)) {
      throw new Error('Máy chủ trả về lịch sử đơn hàng PO không hợp lệ.');
    }
    history.push(...data.items);
  }
  return history.sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')));
}
