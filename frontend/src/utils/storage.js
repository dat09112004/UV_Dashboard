// Chức năng: Xử lý nghiệp vụ (safeGetStorage - Get Storage) phục vụ xử lý dữ liệu trong storage.js
export const safeGetStorage = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
