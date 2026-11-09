import { getClientIdentity, canSendTaskRequest } from '../utils/permissions.js';

// A client guard catches accidental requests; the server must authenticate and authorize again.
export const setupInterceptors = (apiInstance) => {
  apiInstance.interceptors.request.use((config) => {
    const path = String(config.url || '').split('?')[0];
    if (/\/auth\/(login|refresh|forgot-password|reset-password)$/.test(path)) return config;
    const identity = getClientIdentity();
    if (!identity?.id) throw new Error('401: Cần đăng nhập trước khi gửi yêu cầu.');
    if (/\/(?:operations\/)?tasks(?:\/|$)/.test(path) && !canSendTaskRequest(identity.role, config.method, path, config.data)) throw new Error('403: Không có quyền thực hiện thao tác công việc.');
    return config;
  });
};
