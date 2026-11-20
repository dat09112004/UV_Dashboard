import React from 'react';
import { isExecutiveRole } from '../../utils/roles.js';

// Chức năng: Thành phần giao diện (React Component RoleGate) hiển thị và xử lý tương tác người dùng trong RoleGate.jsx
export default function RoleGate({ currentRole, allowedRoles = ['CEO', 'Admin'], fallback = null, children }) {
  if (allowedRoles.includes('CEO') && isExecutiveRole(currentRole)) return <>{children}</>;
  return allowedRoles.includes(currentRole) ? <>{children}</> : fallback;
}
