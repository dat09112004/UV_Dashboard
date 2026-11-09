export const calcMilestonePercentage = (actualQty, effectiveQty) => {
  if (!effectiveQty || effectiveQty <= 0) return 0;
  return Math.min(100, Math.round((actualQty / effectiveQty) * 100));
};
