import { useEffect, useState } from 'react';
import { getSessionIdentityKey } from '../services/api.js';

// Chức năng: Xây dựng (buildRemotePageRequestKey - Remote Page Request Key) phục vụ xử lý dữ liệu trong useRemotePage.js
export function buildRemotePageRequestKey({
  params = {},
  page = 1,
  revision = 0,
  attempt = 0,
  limit = 10,
  sessionKey = getSessionIdentityKey(),
  sessionScope = '',
} = {}) {
  const filterKey = typeof params === 'string' ? params : JSON.stringify(params ?? {});
  const identity = `${sessionKey}:${sessionScope || ''}`;
  return JSON.stringify([identity, filterKey, page, revision, attempt, limit]);
}

// Chức năng: React Custom Hook (useRemotePage) quản lý trạng thái và tối ưu hiệu năng giao diện
export function useRemotePage(load, params, enabled, revision, limit = 10, sessionScope = '') {
  const sessionKey = `${getSessionIdentityKey()}:${sessionScope || ''}`;
  const filterKey = JSON.stringify(params);
  const scopedFilterKey = JSON.stringify([sessionKey, filterKey]);
  const [selection, setSelection] = useState({ scopedFilterKey, page: 1 });
  const page = selection.scopedFilterKey === scopedFilterKey ? selection.page : 1;

  useEffect(() => {
    setSelection(previous =>
      previous.scopedFilterKey === scopedFilterKey ? previous : { scopedFilterKey, page: 1 }
    );
  }, [scopedFilterKey]);

  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = buildRemotePageRequestKey({
    params: filterKey,
    page,
    revision,
    attempt,
    limit,
    sessionKey: getSessionIdentityKey(),
    sessionScope,
  });

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setFailure(null);
    }
  }, [enabled, sessionKey]);

  const validResult = enabled && result && result.scopedFilterKey === scopedFilterKey ? result.data : null;
  const error = enabled && failure?.requestKey === requestKey ? failure.message : '';

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setFailure(previous => (previous?.requestKey === requestKey ? null : previous));
    load({ ...JSON.parse(filterKey), page, limit }, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setResult({ requestKey, scopedFilterKey, data });
      })
      .catch(err => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setResult(previous => (previous?.requestKey === requestKey ? null : previous));
        setFailure({ requestKey, message: err.message });
      });
    return () => controller.abort();
  }, [load, enabled, filterKey, page, limit, requestKey, scopedFilterKey]);

  const metadata = validResult?.pagination;
  const items = validResult?.items ?? [];
  const currentPage = metadata?.page ?? page;
  const totalPages = metadata?.totalPages ?? 1;
  return {
    visibleItems: items,
    pageItems: items,
    currentPage,
    totalPages,
    totalItems: metadata?.totalItems ?? 0,
    visibleCount: items.length,
    pageTotalCount: items.length,
    pageStartIndex: metadata?.startIndex ?? 0,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    hasMoreInPage: false,
    loading: enabled && !validResult && !error,
    error,
    retry: () => setAttempt(value => value + 1),
    goToPage: next => setSelection({ scopedFilterKey, page: next }),
  };
}
