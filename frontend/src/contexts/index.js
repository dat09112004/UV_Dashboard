import React, { createContext, useContext } from 'react';
import { releasePageCacheApi, createPageAbortSignal } from '../services/api.js';

export const WorkspaceSecurityContext = createContext({
  termsVersion: '2026.1',
  releasePreviousPage: (previousSection, previousPage) => {
    if (previousSection) createPageAbortSignal(previousSection);
    return releasePageCacheApi({ previousSection, previousPage });
  },
});

export function useWorkspaceSecurity() {
  return useContext(WorkspaceSecurityContext);
}
