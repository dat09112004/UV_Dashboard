import React from 'react';

// Chức năng: Nút chức năng dạng icon gọn gàng, chỉ hiển thị chữ chú thích khi di chuột hoặc focus vào icon
export default function IconActionButton({
  icon: Icon,
  label,
  variant = 'default',
  disabled = false,
  onClick,
  size = 15,
}) {
  return (
    <button
      type="button"
      className={`icon-action-btn is-${variant}`}
      aria-label={label}
      data-tooltip={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}
