import { locale } from '../locales/i18n.js';
// Chức năng: Định dạng (formatVnd - Vnd) phục vụ xử lý dữ liệu trong formatCurrency.js
export const formatVnd = (val) => {
  if (val === null || val === undefined || val === '—') return '—';
  if (val === 0) return '0 VND';
  return new Intl.NumberFormat(locale()).format(val) + ' VND';
};
