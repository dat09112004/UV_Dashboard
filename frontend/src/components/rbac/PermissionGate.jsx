import React from 'react';

export default function PermissionGate({ hasPermission, fallback = null, children }) {
  return hasPermission ? <>{children}</> : fallback;
}
