// Chức năng: Kiểm tra tính hợp lệ của (validateAllocation - Allocation) phục vụ xử lý dữ liệu trong validation.js
export const validateAllocation = (allocations, maxAmount) => {
  const sum = allocations.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  return sum <= maxAmount;
};
