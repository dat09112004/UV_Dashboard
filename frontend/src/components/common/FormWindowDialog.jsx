import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2, X } from 'lucide-react';
import { t } from '../../locales/i18n.js';

// Chức năng: Cửa sổ nhập liệu dùng chung (Modal Window) chuẩn responsive cho cả máy tính (Desktop/Laptop) và điện thoại (Mobile/Tablet)
export default function FormWindowDialog({
  open = true,
  title,
  subtitle = '',
  size = 'lg',
  busy = false,
  onClose,
  backLabel = 'Quay lại bảng',
  children,
  dataTestId,
}) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className={`workspace-overlay form-window-overlay ${isFullScreen ? 'is-fullscreen' : ''}`}
      onClick={event => {
        if (event.target === event.currentTarget && !busy) {
          onClose?.();
        }
      }}
      data-testid={dataTestId}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`workspace-dialog form-window-dialog form-window-dialog--${size} ${isFullScreen ? 'is-fullscreen' : ''}`}
      >
        <div className="workspace-header">
          <div className="workspace-header-main">
            <button
              type="button"
              disabled={busy}
              onClick={() => onClose?.()}
              aria-label={t(backLabel)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer flex items-center gap-1 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t(backLabel)}</span>
            </button>
            <div className="workspace-title-block">
              {subtitle && <p>{t(subtitle)}</p>}
              <h3 id={titleId} className="text-base sm:text-lg font-bold">
                {t(title)}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFullScreen(prev => !prev)}
              aria-label={t(isFullScreen ? 'Thu gọn cửa sổ' : 'Mở toàn màn hình')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{t(isFullScreen ? 'Thu gọn' : 'Toàn màn hình')}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onClose?.()}
              aria-label={t('Đóng cửa sổ')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="workspace-body form-window-body">
          {children}
        </div>
      </div>
    </div>
  );
}
