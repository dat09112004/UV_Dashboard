import { apiRequest, fetchOrdersApi } from '../../../services/api.js';

export async function fetchOrderCollection(signal) {
  const items = [];
  let cursor;
  do {
    const data = await fetchOrdersApi({ view: 'reference', cursor, limit: 100 }, signal);
    const next = data.nextCursor;
    if (!Array.isArray(data.items) || (next !== null && (!Number.isSafeInteger(next) || next <= (cursor ?? 0)))) {
      throw new Error('Máy chủ trả về danh sách PO không hợp lệ.');
    }
    items.push(...data.items);
    cursor = next;
  } while (cursor !== null);
  return items;
}

export async function fetchOrderHistory(items) {
  const history = [];
  for (let index = 0; index < items.length; index += 100) {
    const rowIds = items.slice(index, index + 100).map(item => item.rowId);
    const { data } = await apiRequest('POST', '/orders/history/query', { rowIds });
    history.push(...data.items);
  }
  return history.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
