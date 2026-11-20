// Chức năng: Xử lý nghiệp vụ (calcMilestonePercentage - Milestone Percentage) phục vụ xử lý dữ liệu trong helpers.js
export const calcMilestonePercentage = (actualQty, effectiveQty) => {
  if (!effectiveQty || effectiveQty <= 0) return 0;
  return Math.min(100, Math.round((actualQty / effectiveQty) * 100));
};
