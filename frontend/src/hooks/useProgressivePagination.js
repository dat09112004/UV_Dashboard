import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPageAbortSignal, releasePageCacheApi } from '../services/api.js';

/**
 * Hook Phân trang kết hợp Tải trước 1 phần & Cuộn tải dần (Progressive Scroll + Page Eviction):
 * 1. Khi mở trang hoặc đổi bộ lọc: chỉ tải/hiển thị trước 1 phần (`initialChunkSize` mục đầu tiên của trang).
 * 2. Khi người dùng lướt xuống (IntersectionObserver trên `sentinelRef`) hoặc nhấn "Tải thêm":
 *    tự động tải dần từng phần tiếp theo (`stepSize` mục) cho đến hết trang/danh sách.
 * 3. Khi người dùng bấm sang trang khác (`goToPage`) hoặc chuyển sang phân hệ khác (`sectionKey` thay đổi / unmount):
 *    - Hủy ngay các request cũ qua `AbortController`.
 *    - Xóa bộ đệm dữ liệu của trang cũ (`visibleCount` đặt lại về `initialChunkSize`).
 *    - Gửi tín hiệu `releasePageCacheApi` lên Backend để xóa Redis Cache của trang cũ, tránh làm nặng máy chủ.
 */
export function useProgressivePagination(
  allItems = [],
  {
    sectionKey = 'general',
    initialChunkSize = 6,
    stepSize = 6,
    pageSize = 12,
    resetDeps = [],
  } = {}
) {
  const safeItems = Array.isArray(allItems) ? allItems : [];
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
      const previousPage = activePageRef.current;
      createPageAbortSignal(sectionKey);
      releasePageCacheApi({ previousSection: sectionKey, previousPage });
      setCurrentPage(targetPage);
      setVisibleCount(initialChunkSize);
    },
    [totalPages, sectionKey, initialChunkSize]
  );

  // Khi thay đổi từ khóa tìm kiếm / bộ lọc -> Đặt lại về Trang 1 và chỉ tải trước 1 phần đầu
  useEffect(() => {
    setCurrentPage(1);
    setVisibleCount(initialChunkSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, initialChunkSize, ...resetDeps]);

  // Khi người dùng rời khỏi trang/phân hệ hiện tại (unmount hoặc đổi sectionKey) -> Clear cache trang cũ trên Server
  useEffect(() => {
    return () => {
      createPageAbortSignal(sectionKey);
      releasePageCacheApi({ previousSection: sectionKey, previousPage: activePageRef.current });
    };
  }, [sectionKey]);

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
