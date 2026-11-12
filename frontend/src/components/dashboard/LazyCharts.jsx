import { lazy } from 'react';

const chart = name => lazy(() => import('./DashboardCharts.jsx')
  .then(module => ({ default: module[name] })));

export const CategoryProgressChart = chart('CategoryProgressChart');
export const RevenueChart = chart('RevenueChart');
export const DebtChart = chart('DebtChart');
export const CashPriorityChart = chart('CashPriorityChart');
export const RevenueTaxProfitabilityPanel = chart('RevenueTaxProfitabilityPanel');
