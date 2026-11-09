export const validateAllocation = (allocations, maxAmount) => {
  const sum = allocations.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  return sum <= maxAmount;
};
