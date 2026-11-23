import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { t } from '../../locales/i18n.js';

// Chức năng: Chuẩn hóa chuỗi không dấu tiếng Việt để gõ lọc nhanh chính xác
function normalizeFilterText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// Chức năng: Ô chọn bộ lọc có hỗ trợ gõ chữ để tìm kiếm nhanh (tương thích tên, mã nhân viên UV..., ngành hàng, xuất xứ, trạng thái)
export default function SearchableSelect({
  id,
  name,
  value = '',
  options = [],
  onChange,
  ariaLabel,
  placeholder = 'Gõ để lọc nhanh…',
  disabled = false,
  className = '',
  allowClear = false,
  clearValue = '',
}) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  const normalizedOptions = useMemo(
    () =>
      (options || []).map(opt =>
        typeof opt === 'string'
          ? { value: opt, label: opt, keywords: opt }
          : {
              value: String(opt.value ?? ''),
              label: String(opt.label ?? opt.value ?? ''),
              keywords: String(opt.keywords ?? `${opt.label ?? ''} ${opt.value ?? ''}`),
            }
      ),
    [options]
  );

  const selectedOption = useMemo(
    () => normalizedOptions.find(opt => opt.value === String(value ?? '')) || null,
    [normalizedOptions, value]
  );

  const filteredOptions = useMemo(() => {
    const q = normalizeFilterText(query);
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(opt => {
      const hay = normalizeFilterText(`${opt.label} ${opt.keywords}`);
      return hay.includes(q);
    });
  }, [normalizedOptions, query]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pickOption = opt => {
    onChange?.(opt.value);
    setOpen(false);
    setQuery('');
  };

  const displayValue = open ? query : (selectedOption?.label ?? '');

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center min-w-[160px] ${className}`}
      style={{ position: 'relative' }}
    >
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        value={displayValue}
        placeholder={open ? t(placeholder) : (selectedOption?.label || t(placeholder))}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery('');
        }}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
        onChange={event => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setHighlightIdx(idx => Math.min(filteredOptions.length - 1, idx + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightIdx(idx => Math.max(0, idx - 1));
          } else if (event.key === 'Enter' && open) {
            if (filteredOptions[highlightIdx]) {
              event.preventDefault();
              pickOption(filteredOptions[highlightIdx]);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
            inputRef.current?.blur();
          }
        }}
        style={{ width: '100%', paddingRight: allowClear && value !== clearValue ? 46 : 28 }}
      />
      {allowClear && !disabled && value !== clearValue && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('Xóa lựa chọn')}
          onClick={event => {
            event.stopPropagation();
            onChange?.(clearValue);
            setQuery('');
            setOpen(false);
          }}
          style={{
            position: 'absolute',
            right: 24,
            background: 'transparent',
            border: 0,
            padding: 2,
            cursor: 'pointer',
            color: '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <X size={13} />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={t('Mở danh sách chọn')}
        onClick={() => {
          if (disabled) return;
          setOpen(prev => {
            const next = !prev;
            if (next) {
              setQuery('');
              requestAnimationFrame(() => inputRef.current?.focus());
            }
            return next;
          });
        }}
        style={{
          position: 'absolute',
          right: 6,
          background: 'transparent',
          border: 0,
          padding: 2,
          cursor: disabled ? 'default' : 'pointer',
          color: '#64748b',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <ChevronDown size={15} />
      </button>
      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            minWidth: 210,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.14)',
            zIndex: 60,
            margin: 0,
            padding: 4,
            listStyle: 'none',
          }}
        >
          {filteredOptions.length === 0 ? (
            <li style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>
              {t('Không tìm thấy mục phù hợp')}
            </li>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === String(value ?? '');
              const isHighlighted = idx === highlightIdx;
              return (
                <li
                  key={`${opt.value}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={event => {
                    event.preventDefault();
                    pickOption(opt);
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 7,
                    fontSize: 13,
                    cursor: 'pointer',
                    background: isHighlighted ? '#eff6ff' : isSelected ? '#f8fafc' : 'transparent',
                    color: isSelected ? '#1d4ed8' : '#0f172a',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {opt.label}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
