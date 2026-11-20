import { lazy } from 'react';

// Chức năng: Xử lý nghiệp vụ (chart - chart) phục vụ xử lý dữ liệu trong LazyCharts.jsx
const chart = name => lazy(() => import('./DashboardCharts.jsx')
  .then(module => ({ default: module[name] })));

export const CategoryProgressChart = chart('CategoryProgressChart');
export const RevenueChart = chart('RevenueChart');
export const DebtChart = chart('DebtChart');
export const CashPriorityChart = chart('CashPriorityChart');
export const RevenueTaxProfitabilityPanel = chart('RevenueTaxProfitabilityPanel');
