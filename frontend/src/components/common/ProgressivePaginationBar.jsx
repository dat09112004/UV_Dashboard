import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { phrase, t } from '../../locales/i18n.js';

/**
 * Thanh điều khiển Phân trang & Tải dần khi cuộn (Progressive Scroll + Page Switcher Bar).
 * - Đặt `sentinelRef` ngay dưới danh sách/bảng để tự động tải thêm dữ liệu khi người dùng lướt xuống.
 * - Khi người dùng bấm sang trang khác (Trang 1, 2, 3...), hàm `goToPage` lập tức xóa bộ đệm của trang cũ
 *   trên trình duyệt và gọi API giải phóng cache trang cũ trên máy chủ.
 */
export default function ProgressivePaginationBar({
  pagination,
  itemUnit = 'mục',
  className = '',
}) {
  if (!pagination || pagination.totalItems === 0) return null;

  const {
    currentPage,
    totalPages,
    totalItems,
    visibleCount,
    pageTotalCount,
    pageStartIndex,
    hasMoreInPage,
    hasNextPage,
    hasPrevPage,
    loadMoreChunk,
    goToPage,
    sentinelRef,
  } = pagination;

  const startNumber = totalItems === 0 ? 0 : pageStartIndex + 1;
  const endNumber = pageStartIndex + visibleCount;

  const pageNumbers = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
      pageNumbers.push(p);
    }
  }

  return (
    <div className={`progressive-pagination-wrapper ${className}`}>
      {/* Sentinel tự động kích hoạt tải dần (Progressive Load) khi người dùng lướt xuống */}
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="h-1 w-full pointer-events-none"
      />
      <div
        className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-200 text-xs text-slate-600"
        role="navigation"
        aria-label={t('Phân trang và tải dữ liệu từng phần')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {phrase('Đang hiển thị §–§ / §', startNumber, endNumber, totalItems)} {t(itemUnit)}
          </span>
          {hasMoreInPage && (
            <button
              type="button"
              onClick={loadMoreChunk}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-semibold cursor-pointer"
            >
              <ChevronDown size={13} />
              <span>
                {phrase('Tải thêm (§ còn lại trong trang)', pageTotalCount - visibleCount)}
              </span>
            </button>
          )}
        </div>

        {totalPages > 1 && (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={!hasPrevPage}
              onClick={() => goToPage(currentPage - 1)}
              aria-label={t('Trang trước')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft size={13} />
              <span>{t('Trước')}</span>
            </button>
            {pageNumbers.map(pageNum => (
              <button
                key={pageNum}
                type="button"
                aria-current={pageNum === currentPage ? 'page' : undefined}
                onClick={() => goToPage(pageNum)}
                className={`px-2.5 py-1 rounded border font-semibold cursor-pointer ${
                  pageNum === currentPage
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => goToPage(currentPage + 1)}
              aria-label={t('Trang sau')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <span>{t('Sau')}</span>
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
