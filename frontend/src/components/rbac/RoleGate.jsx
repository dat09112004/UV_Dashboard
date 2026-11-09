import React from 'react';
import { isExecutiveRole } from '../../utils/roles.js';

export default function RoleGate({ currentRole, allowedRoles = ['CEO', 'Admin'], fallback = null, children }) {
  if (allowedRoles.includes('CEO') && isExecutiveRole(currentRole)) return <>{children}</>;
  return allowedRoles.includes(currentRole) ? <>{children}</> : fallback;
}
