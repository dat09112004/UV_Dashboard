// Định dạng chuẩn DD/MM/YYYY theo Mục 3.3 BA
export const formatDateVN = (dateStr) => {
  if (!dateStr || dateStr === '—') return '—';
  return dateStr;
};
