import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_ITEMS = [];

export function useProgressivePagination(
  allItems = EMPTY_ITEMS,
  {
    sectionKey = 'general',
    initialChunkSize = 6,
    stepSize = 6,
    pageSize = 12,
    resetDeps = [],
  } = {}
) {
  const safeItems = Array.isArray(allItems) ? allItems : EMPTY_ITEMS;
  const totalItems = safeItems.length;
  const effectivePageSize = Math.max(initialChunkSize, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));

  const [currentPage, setCurrentPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(initialChunkSize);
  const sentinelRef = useRef(null);
  const activePageRef = useRef(1);
  activePageRef.current = currentPage;

  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * effectivePageSize;
  const pageItems = useMemo(
    () => safeItems.slice(pageStartIndex, pageStartIndex + effectivePageSize),
    [safeItems, pageStartIndex, effectivePageSize]
  );

  // Chỉ hiển thị trước 1 phần (visibleCount) và tải dần khi người dùng cuộn xuống
  const visibleItems = useMemo(
    () => pageItems.slice(0, visibleCount),
    [pageItems, visibleCount]
  );

  const hasMoreInPage = visibleCount < pageItems.length;
  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;

  // Tải thêm phần tiếp theo khi người dùng lướt xuống cuối bảng hoặc bấm nút "Tải thêm"
  const loadMoreChunk = useCallback(() => {
    setVisibleCount(prev => Math.min(pageItems.length, prev + stepSize));
  }, [pageItems.length, stepSize]);

  // Chuyển sang trang khác -> Xóa ngay trang cũ trên cả Client và Server
  const goToPage = useCallback(
    nextPage => {
      const targetPage = Math.max(1, Math.min(totalPages, Number(nextPage) || 1));
      if (targetPage === activePageRef.current) return;
      setCurrentPage(targetPage);
      setVisibleCount(initialChunkSize);
    },
    [totalPages, initialChunkSize]
  );

  // Khi thay đổi từ khóa tìm kiếm / bộ lọc -> Đặt lại về Trang 1 và chỉ tải trước 1 phần đầu
  useEffect(() => {
    setCurrentPage(1);
    setVisibleCount(initialChunkSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, initialChunkSize, ...resetDeps]);

  // Tự động tải dần (Progressive Infinite Scroll trong phạm vi trang) khi người dùng lướt xuống chạm sentinel
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMoreInPage || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          loadMoreChunk();
        }
      },
      { rootMargin: '140px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreInPage, loadMoreChunk]);

  return {
    visibleItems,
    pageItems,
    currentPage: safePage,
    totalPages,
    totalItems,
    visibleCount: visibleItems.length,
    pageTotalCount: pageItems.length,
    pageStartIndex,
    hasMoreInPage,
    hasNextPage,
    hasPrevPage,
    loadMoreChunk,
    goToPage,
    sentinelRef,
  };
}

export default useProgressivePagination;
