import { useEffect, useState } from 'react';

export function useRemotePage(load, params, enabled, revision, limit = 10) {
  const filterKey = JSON.stringify(params);
  const [selection, setSelection] = useState({ filterKey, page: 1 });
  const page = selection.filterKey === filterKey ? selection.page : 1;
  useEffect(() => {
    setSelection(previous => previous.filterKey === filterKey ? previous : { filterKey, page: 1 });
  }, [filterKey]);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([filterKey, page, revision, attempt, limit]);
  const validResult = enabled && result?.requestKey === requestKey ? result.data : null;
  const error = enabled && failure?.requestKey === requestKey ? failure.message : '';

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setFailure(previous => previous?.requestKey === requestKey ? null : previous);
    load({ ...JSON.parse(filterKey), page, limit }, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setResult({ requestKey, data });
      })
      .catch(err => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setResult(previous => previous?.requestKey === requestKey ? null : previous);
        setFailure({ requestKey, message: err.message });
      });
    return () => controller.abort();
  }, [load, enabled, filterKey, page, limit, requestKey]);

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
    goToPage: next => setSelection({ filterKey, page: next }),
  };
}
