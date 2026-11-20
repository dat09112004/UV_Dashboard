import React from 'react';

// Chức năng: Thành phần giao diện (React Component PermissionGate) hiển thị và xử lý tương tác người dùng trong PermissionGate.jsx
export default function PermissionGate({ hasPermission, fallback = null, children }) {
  return hasPermission ? <>{children}</> : fallback;
}
