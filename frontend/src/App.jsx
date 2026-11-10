import { AlertAssignmentLine, ProgressivePaginationBar } from './components/common/index.js';
import LanguageSwitch from './locales/LanguageSwitch.jsx';
import { localizeInvalidInput, clearLocalizedValidation } from './locales/formValidation.js';
import { t, locale, getLanguage, subscribeLanguage, phrase, translate } from './locales/i18n.js';
import React, { useState, useMemo, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  Search, CheckCircle2, ChevronRight, Eye, X, Lock, ArrowRight, Flame,
  EyeOff, Maximize2, Minimize2, ArrowLeft, Download, RotateCcw, CalendarDays, AlertTriangle, ShieldCheck
} from 'lucide-react';

import { useDebouncedValue } from './hooks/useDebounce.js';
import { useProgressivePagination } from './hooks/useProgressivePagination.js';
import { can, canOpenSection, homeSection, isExecutiveRole } from './utils/roles.js';
import { createEmptyDirectoryState, directoryProfiles, saveDirectoryAction, taskWorkspace } from './features/users/services/demoDirectory.js';
import AccountsPage from './features/users/components/AccountsPage.jsx';
import { canAssignTasks, isTaskEmployee, REMINDER_PENDING } from './features/operations/services/taskWorkflow.js';
import DataEntryPage from './features/dataEntry/DataEntryPage.jsx';
import { saveEntryBatch } from './features/dataEntry/service.js';
import TasksPage from './features/operations/components/TasksPage.jsx';
import RemindersPage from './features/operations/components/RemindersPage.jsx';
import { attemptMockSignIn } from './features/auth/services/mockAuth.js';
import {
  abortAllPageRequests,
  createPageAbortSignal,
  executeFinanceActionApi,
  logoutApi,
  releasePageCacheApi,
  updateOrderProgressApi,
} from './services/api.js';
import AppHeader, { NAV_ITEMS } from './components/layout/AppHeader.jsx';
import DashboardOverview, { OverviewKpis, AttentionSummary, EmployeeAlertReminder } from './components/dashboard/DashboardOverview.jsx';
import { CategoryProgressChart, RevenueChart, RevenueTaxProfitabilityPanel } from './components/dashboard/DashboardCharts.jsx';
import { comparePriority, classifyDebt, classifyProgress, debtSummary, summarizeCategories, buildAlertQueue, debtMatchesFilter, matchesOrigin, monthlyRevenueSeries, formatDate } from './utils/dashboardMetrics.js';
import { exportExcel } from './utils/exportExcel.js';
import { parseBusinessDate } from './utils/business.js';
import FulfillmentTable from './components/orders/FulfillmentTable.jsx';
import ItemDetailPanel from './components/orders/ItemDetailPanel.jsx';
import DebtStatusOverview from './components/finance/DebtStatusOverview.jsx';
import DebtDetailPanel from './components/finance/DebtDetailPanel.jsx';
import { getRoleLayout, presentAlert } from './utils/dashboardPresentation.js';
import { alertDestination, payableAction } from './utils/workspaceUi.js';
import { InvoiceForm, ReceiptWorkspace, PayableForm, SplitPayableForm, FinanceHistory } from './components/finance/FinanceForms.jsx';
import { initialFinanceState, unallocatedTotal, payableWorkflowStatus, itemFinancialSummary, businessToday, AP_REVIEW, AP_PENDING, AP_APPROVED, AP_RETURNED, AP_SPLIT_REQUIRED } from './utils/financeWorkflow.js';
import { setClientIdentity } from './utils/permissions.js';
import { loadTrackedItems, getFulfillment, formatPercent } from './utils/orderFulfillment.js';
const BRAND_LOGO = '/logo.png';
const LOCKED_ACCOUNT_MESSAGE = 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để mở khóa.';
const TERMS_REQUIRED_MESSAGE = 'Vui lòng tích chọn đồng ý Chính sách bảo mật và Điều khoản sử dụng trước khi đăng nhập.';
const matchesSearch = (value, query) => typeof value === 'string' &&
  (value.toLowerCase().includes(query) || translate(value, 'en').toLowerCase().includes(query));
const createEmptyFinance = () => initialFinanceState([], [], [], businessToday(), { includeOpeningReceipt: false });
const panelSection = panel => ({
  ITEM_DETAIL: 'orders', RECORD_REV: 'revenue', ALLOCATE_AR: 'receivables',
  SPLIT_AP: 'payables', SUBMIT_AP: 'payables', REVIEW_AP: 'payables', PAY_AP: 'payables',
})[panel.type] || panel.debtType;
const canOpenPanel = (user, panel) => canOpenSection(user, panelSection(panel)) &&
  (!['RECORD_REV', 'SPLIT_AP'].includes(panel.type) || canOpenSection(user, 'orders'));

const formatVnd = (val) => {
  if (val === null || val === undefined || val === '—') return '—';
  if (val === 0) return '0 VND';
  return new Intl.NumberFormat(locale()).format(val) + ' VND';
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('UYEN VU INTERNATIONAL • Hệ thống Điều hành PO, Tiến độ, Doanh thu & Công nợ');
    document.querySelectorAll('input, select, textarea').forEach(field => field.setCustomValidity(''));
  }, [language]);

  // Authentication & Login State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState(() => { try { return localStorage.getItem('uv-remembered-email') || ''; } catch { return ''; } });
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const loginLockDialog = useRef(null);
  const termsPolicyDialog = useRef(null);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  const [currentAccountId, setCurrentAccountId] = useState(null);
  const [directory, setDirectory] = useState(createEmptyDirectoryState);
  const accounts = useMemo(() => directoryProfiles(directory), [directory]);
  const currentUser = accounts.find(account => account.id === currentAccountId && account.status === 'active') || null;
  const currentRole = currentUser?.role;
  const canUpdateProgress = can(currentUser, 'orders.update') && canOpenSection(currentUser, 'orders');
  const showOrders = canOpenSection(currentUser, 'orders');
  const showRevenue = canOpenSection(currentUser, 'revenue');
  const showReceivables = canOpenSection(currentUser, 'receivables');
  const showPayables = canOpenSection(currentUser, 'payables');
  const fullReport = showOrders && showRevenue && showReceivables && showPayables;
  const [selectedSection, setActiveSection] = useState('overview');
  const activeSection = canOpenSection(currentUser, selectedSection) ? selectedSection : homeSection(currentUser);
  const previousSectionRef = useRef(activeSection);
  const reviewingResubmissions = activeSection === 'assignment-reviews';
  const [alertTaskDraft, setAlertTaskDraft] = useState(null);
  const [reminderDraft, setReminderDraft] = useState(null);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const directorySaving = useRef(false);
  const entrySaving = useRef(false);

  const allDirectoryTasks = useMemo(() => directory?.tasks || [], [directory]);
  const allReminders = useMemo(() => directory?.reminders || [], [directory]);
  const pendingRemindersCount = useMemo(
    () => allReminders.filter(r => r.status === REMINDER_PENDING).length,
    [allReminders],
  );

  useEffect(() => {
    setClientIdentity(currentUser);
    if (currentAccountId && !currentUser) {
      setCurrentAccountId(null);
      setIsAuthenticated(false);
    }
  }, [currentUser, currentAccountId]);

  // Khi người dùng bấm sang trang/phân hệ khác -> Hủy request trang cũ & giải phóng cache trang cũ trên máy chủ
  useEffect(() => {
    const prevSection = previousSectionRef.current;
    if (prevSection && prevSection !== activeSection && isAuthenticated) {
      createPageAbortSignal(prevSection);
      releasePageCacheApi({ previousSection: prevSection });
    }
    previousSectionRef.current = activeSection;
  }, [activeSection, isAuthenticated]);

  const [orderView, setOrderView] = useState('fulfillment');
  const [orderFilter, setOrderFilter] = useState('all');
  const [reportDate, setReportDate] = useState(() => businessToday());
  const [debtFilter, setDebtFilter] = useState('all');
  const [payableWorkflowFilter, setPayableWorkflowFilter] = useState('all');
  const [isExporting, setIsExporting] = useState(false);

  // Filter States + Debounced Search & Filter States
  const [selectedCategory, setSelectedCategory] = useState('Tất cả ngành hàng');
  const [selectedOrigin, setSelectedOrigin] = useState('Tất cả xuất xứ');
  const [onlyMyRoleRedAlerts, setOnlyMyRoleRedAlerts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const debouncedCategory = useDebouncedValue(selectedCategory, 150);
  const debouncedOrigin = useDebouncedValue(selectedOrigin, 150);
  const debouncedDebtFilter = useDebouncedValue(debtFilter, 150);
  const debouncedPayableWorkflowFilter = useDebouncedValue(payableWorkflowFilter, 150);
  const debouncedOrderFilter = useDebouncedValue(orderFilter, 150);

  // Business Data States (Loaded 100% from Backend API upon authentication — Zero Mock Data)
  const [vendorItems, setVendorItems] = useState([]);
  const [finance, setFinance] = useState(createEmptyFinance);
  const { revenue: revenueRecords, receivables, payables } = finance;
  const unallocatedCash = unallocatedTotal(finance);

  // Centered workspace dialog with optional full-screen mode.
  const [workspacePanel, setWorkspacePanel] = useState(null);
  const [isFullScreenPanel, setIsFullScreenPanel] = useState(false);
  useEffect(() => {
    setWorkspacePanel(panel => panel && !canOpenPanel(currentUser, panel) ? null : panel);
  }, [currentUser]);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const workspaceSavingRef = useRef(false);
  const workspaceDirtyRef = useRef(false);
  workspaceDirtyRef.current = workspaceDirty;
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const openWorkspace = panel => {
    if (!canOpenPanel(currentUser, panel)) return;
    setWorkspaceDirty(false); setWorkspaceError(''); setShowDiscardDialog(false); setWorkspacePanel(panel);
  };
  const requestCloseWorkspace = () => {
    if (workspaceSavingRef.current) return;
    if (workspaceDirtyRef.current) setShowDiscardDialog(true);
    else setWorkspacePanel(null);
  };
  const openWorkAlert = alert => openWorkspace(alertDestination(alert, currentRole, showOrders));
  const resetFilters = () => {
    setSelectedCategory('Tất cả ngành hàng'); setSelectedOrigin('Tất cả xuất xứ');
    setSearchQuery(''); setOnlyMyRoleRedAlerts(false); setDebtFilter('all'); setPayableWorkflowFilter('all'); setOrderFilter('all');
  };
  const activeFilters = [
    selectedCategory !== 'Tất cả ngành hàng' && { label: selectedCategory, clear: () => setSelectedCategory('Tất cả ngành hàng') },
    selectedOrigin !== 'Tất cả xuất xứ' && { label: selectedOrigin, clear: () => setSelectedOrigin('Tất cả xuất xứ') },
    searchQuery && { label: phrase('Tìm: §', searchQuery), clear: () => setSearchQuery('') },
    onlyMyRoleRedAlerts && { label: 'Chỉ báo động đỏ', clear: () => setOnlyMyRoleRedAlerts(false) },
  ].filter(Boolean);
  useEffect(() => { if (showDiscardDialog) document.querySelector('[role="alertdialog"] button')?.focus(); }, [showDiscardDialog]);
  useEffect(() => { if (workspaceError) document.querySelector('.workspace-error')?.focus(); }, [workspaceError]);

  useEffect(() => {
    if (!workspacePanel) { setIsFullScreenPanel(false); return; }
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector('[role="dialog"]');
    (dialog?.querySelector('input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)') || dialog?.querySelector('button'))?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (workspaceSavingRef.current) return;
        if (document.querySelector('[role="alertdialog"]')) setShowDiscardDialog(false);
        else if (workspaceDirtyRef.current) setShowDiscardDialog(true);
        else setWorkspacePanel(null);
      }
      const activeDialog = document.querySelector('[role="alertdialog"]') || dialog;
      if (event.key !== 'Tab' || !activeDialog) return;
      const focusable = [...activeDialog.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!activeDialog.contains(document.activeElement)) { event.preventDefault(); first?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [workspacePanel]);

  useEffect(() => {
    if (!workspaceDirty) return;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [workspaceDirty]);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = (msg, type = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const handleDirectoryAction = async (action, payload, reportError) => {
    if (directorySaving.current || !currentUser) return false;
    directorySaving.current = true;
    setDirectoryBusy(true);
    try {
      const next = await saveDirectoryAction(currentUser.id, action, payload);
      setDirectory(next);
      showToast(
        action === 'create-reminder' ? 'Đã gửi nhắc việc đến CEO và Admin.' :
        action === 'quick-assign-reminder' ? 'Đã giao việc nhanh và cập nhật trạng thái cảnh báo đỏ.' :
        'Đã lưu thay đổi.'
      );
      return true;
    } catch (error) {
      if (reportError) reportError(error.message);
      else showToast(error.message, 'error');
      return false;
    } finally {
      directorySaving.current = false;
      setDirectoryBusy(false);
    }
  };

  // Handle Login Submit (Enforces mandatory Terms & Privacy Policy Checkbox)
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (isSigningIn) return;
    setLoginError('');
    setLoginNotice('');
    if (!acceptedTerms) {
      setLoginError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    setIsSigningIn(true);
    let result;
    try {
      result = await attemptMockSignIn(loginEmail, loginPassword, acceptedTerms);
    } catch (err) {
      setLoginError(err?.message || 'Không thể xác minh tài khoản trong trình duyệt này.');
      return;
    } finally {
      setIsSigningIn(false);
    }
    if (result.status === 'terms_required') {
      setLoginError(result.message || TERMS_REQUIRED_MESSAGE);
      return;
    }
    if (result.status === 'locked') {
      setLoginError(LOCKED_ACCOUNT_MESSAGE);
      setLoginPassword('');
      setShowPassword(false);
      setForgotPasswordSent(false);
      loginLockDialog.current?.showModal();
      return;
    }
    if (result.status !== 'authenticated') {
      setLoginError('Email hoặc mật khẩu không đúng.');
      return;
    }
    const matched = result.account;
    try {
      if (rememberMe) localStorage.setItem('uv-remembered-email', matched.email);
      else localStorage.removeItem('uv-remembered-email');
    } catch { /* Storage may be unavailable in private browsing. */ }
    if (result.directory) setDirectory(result.directory);
    if (Array.isArray(result.orders)) setVendorItems(loadTrackedItems(result.orders));
    if (result.finance) setFinance(result.finance);
    if (result.finance?.reportDate) setReportDate(result.finance.reportDate);
    setCurrentAccountId(matched.id);
    setActiveSection(result.homeSection || homeSection(matched));
    setLoginError('');
    setIsAuthenticated(true);
    setLoginPassword('');
    setForgotPasswordSent(false);
    showToast(`Đăng nhập thành công với vai trò: ${matched.title}`, 'info');
  };

  const classifiedItems = useMemo(() => showOrders ? vendorItems.map(row => classifyProgress(row, reportDate)) : [], [showOrders, vendorItems, reportDate]);
  const classifiedAr = useMemo(() => showReceivables ? receivables.map(row => classifyDebt(row, reportDate)) : [], [showReceivables, receivables, reportDate]);
  const classifiedAp = useMemo(() => showPayables ? payables.map(row => classifyDebt(row, reportDate)) : [], [showPayables, payables, reportDate]);

  const sortedVendorItems = useMemo(() => classifiedItems.filter(item => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return (debouncedCategory === 'Tất cả ngành hàng' || item.category === debouncedCategory) &&
      matchesOrigin(item, debouncedOrigin, vendorItems) &&
      (!onlyMyRoleRedAlerts || item.priorityRank === 0) &&
      (!q || [item.poId, item.vendorNo, item.vendorName, item.vendorItemNo, item.category].some(value => matchesSearch(value, q)));
  }).sort(comparePriority),
  [classifiedItems, debouncedCategory, debouncedOrigin, vendorItems, onlyMyRoleRedAlerts, debouncedSearchQuery]);

  const sortedRevenueRecords = useMemo(() => (showRevenue ? revenueRecords : []).filter(row => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return (debouncedCategory === 'Tất cả ngành hàng' || row.category === debouncedCategory) &&
      matchesOrigin(row, debouncedOrigin, vendorItems) && (!onlyMyRoleRedAlerts || row.priorityRank === 0) &&
      (!q || [row.docNo, row.poId, row.sku, row.customerName, row.vendorName].some(value => matchesSearch(value, q)));
  }).sort((a, b) => a.priorityRank - b.priorityRank),
  [showRevenue, revenueRecords, debouncedCategory, debouncedOrigin, vendorItems, onlyMyRoleRedAlerts, debouncedSearchQuery]);

  const sortedReceivables = useMemo(() => classifiedAr.filter(row => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return (debouncedCategory === 'Tất cả ngành hàng' || row.category === debouncedCategory) &&
      matchesOrigin(row, debouncedOrigin, vendorItems) && (!onlyMyRoleRedAlerts || row.priorityRank === 0) &&
      (!q || [row.docNo, row.poId, row.sku, row.customerName, row.vendorRef].some(value => matchesSearch(value, q)));
  }).sort(comparePriority),
  [classifiedAr, debouncedCategory, debouncedOrigin, vendorItems, onlyMyRoleRedAlerts, debouncedSearchQuery]);

  const sortedPayables = useMemo(() => classifiedAp.filter(row => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return (debouncedCategory === 'Tất cả ngành hàng' || row.category === debouncedCategory) &&
      matchesOrigin(row, debouncedOrigin, vendorItems) && (!onlyMyRoleRedAlerts || row.priorityRank === 0) &&
      (!q || [row.docNo, row.poId, row.sku, row.supplierName, row.vendorNo].some(value => matchesSearch(value, q)));
  }).sort(comparePriority),
  [classifiedAp, debouncedCategory, debouncedOrigin, vendorItems, onlyMyRoleRedAlerts, debouncedSearchQuery]);

  const orderCategories = useMemo(() => [...new Set([...classifiedItems, ...classifiedAr, ...classifiedAp,
    ...(showRevenue ? revenueRecords : [])].map(row => row.category).filter(Boolean))],
  [classifiedItems, classifiedAr, classifiedAp, showRevenue, revenueRecords]);
  const categoryStats = useMemo(() => summarizeCategories(sortedVendorItems, sortedRevenueRecords, classifiedAr, orderCategories),
    [sortedVendorItems, sortedRevenueRecords, classifiedAr, orderCategories]);
  const visibleFinanceHistory = finance.audit.filter(row => row.type.startsWith('INVOICE') ? showRevenue :
    row.type.startsWith('RECEIPT') ? showReceivables : row.type.startsWith('PAYABLE') && showPayables);
  const arSummary = useMemo(() => debtSummary(sortedReceivables), [sortedReceivables]);
  const apSummary = useMemo(() => debtSummary(sortedPayables), [sortedPayables]);
  const alerts = useMemo(() => buildAlertQueue(sortedVendorItems, sortedReceivables, sortedPayables, { includeWarnings: true }), [sortedVendorItems, sortedReceivables, sortedPayables]);
  const tableReceivables = sortedReceivables.filter(row => activeSection !== 'receivables' || debtMatchesFilter(row, debouncedDebtFilter));
  const payableScope = sortedPayables.filter(row => debouncedPayableWorkflowFilter === 'all' || payableWorkflowStatus(row) === debouncedPayableWorkflowFilter);
  const tablePayables = activeSection === 'payables' ? payableScope.filter(row => debtMatchesFilter(row, debouncedDebtFilter)) : sortedPayables;
  const monthlyData = useMemo(() => monthlyRevenueSeries(sortedRevenueRecords), [sortedRevenueRecords]);

  // Phân trang + Tải trước 1 phần & Cuộn tải dần cho 4 bảng điều hành chính
  const productionPagination = useProgressivePagination(sortedVendorItems, {
    sectionKey: 'orders-production',
    initialChunkSize: 5,
    stepSize: 5,
    pageSize: 10,
    resetDeps: [debouncedCategory, debouncedOrigin, debouncedSearchQuery, onlyMyRoleRedAlerts, reportDate],
  });
  const revenuePagination = useProgressivePagination(sortedRevenueRecords, {
    sectionKey: 'revenue',
    initialChunkSize: 5,
    stepSize: 5,
    pageSize: 10,
    resetDeps: [debouncedCategory, debouncedOrigin, debouncedSearchQuery, onlyMyRoleRedAlerts, reportDate],
  });
  const arPagination = useProgressivePagination(tableReceivables, {
    sectionKey: 'receivables',
    initialChunkSize: 5,
    stepSize: 5,
    pageSize: 10,
    resetDeps: [debouncedCategory, debouncedOrigin, debouncedSearchQuery, debouncedDebtFilter, onlyMyRoleRedAlerts, reportDate],
  });
  const apPagination = useProgressivePagination(tablePayables, {
    sectionKey: 'payables',
    initialChunkSize: 5,
    stepSize: 5,
    pageSize: 10,
    resetDeps: [debouncedCategory, debouncedOrigin, debouncedSearchQuery, debouncedDebtFilter, debouncedPayableWorkflowFilter, onlyMyRoleRedAlerts, reportDate],
  });

  const onNavigate = (section, filter = 'all', query) => {
    if (entrySaving.current) {
      showToast('Đang lưu dữ liệu. Vui lòng chờ.');
      return;
    }
    if (!canOpenSection(currentUser, section)) return;
    if (section !== activeSection) {
      createPageAbortSignal(activeSection);
      releasePageCacheApi({ previousSection: activeSection });
    }
    setAlertTaskDraft(null);
    setActiveSection(section);
    if (section === 'orders') {
      setOrderView(filter === 'production' ? 'production' : 'fulfillment');
      setOrderFilter(['production', 'red'].includes(filter) ? 'all' : filter);
    }
    setDebtFilter(['receivables', 'payables'].includes(section) ? filter : 'all');
    if (query !== undefined) setSearchQuery(query);
    if (filter === 'red' && section === 'orders') setOnlyMyRoleRedAlerts(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const assignWorkAlert = alert => {
    if (!canAssignAlert || alert.data.priorityRank !== 0) return;
    const view = presentAlert(alert, currentRole);
    onNavigate('assignments');
    setAlertTaskDraft({
      sourceAlert: { type: alert.type, id: alert.id, reference: alert.reference },
      title: phrase('Xử lý báo động đỏ §', alert.reference).slice(0, 160),
      description: [t(view.subject), t(view.issue), t(view.action)].join('\n').slice(0, 1000),
    });
  };
  const remindWorkAlert = alert => {
    if (!alert) return;
    const view = presentAlert(alert, currentRole);
    setWorkspacePanel(null);
    setReminderDraft({
      alertId: alert.id,
      alertType: alert.type || 'orders',
      reference: alert.reference,
      subject: view.subject || alert.label || alert.reference,
      issue: view.issue || alert.status || 'Báo động đỏ cần xử lý',
      message: `Cảnh báo đỏ ${alert.reference} (${view.issue || alert.status}) đã cảnh báo nhưng chưa thấy xử lý xong. Nhờ CEO / Admin kiểm tra và giao việc cho bộ phận phụ trách.`,
    });
    setActiveSection('reminders');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const canAssignAlert = canAssignTasks(currentUser) && canOpenSection(currentUser, 'assignments');
  const alertReminderType = getRoleLayout(currentRole).alertType;
  const reminderAlerts = useMemo(() => isTaskEmployee(currentUser)
    ? buildAlertQueue(classifiedItems, classifiedAr, classifiedAp).filter(alert =>
      alertReminderType === 'finance' ? alert.type !== 'orders' : alert.type === alertReminderType)
    : [], [currentUser, alertReminderType, classifiedItems, classifiedAr, classifiedAp]);
  const showEmployeeReminders = activeSection === 'overview' ||
    (alertReminderType === 'orders' && activeSection === 'orders') ||
    (alertReminderType === 'finance' && ['receivables', 'payables'].includes(activeSection));
  const openItem = item => openWorkspace({ type: 'ITEM_DETAIL', data: item });
  const handleExport = async () => {
    if (isExporting || !fullReport) return;
    setIsExporting(true);
    try {
      await exportExcel({ Tien_do: sortedVendorItems, Doanh_thu: sortedRevenueRecords,
        Phai_thu: tableReceivables, Phai_tra: tablePayables,
        ...(finance.payableSplitSources?.length ? { Nguon_chung_tu_tach: finance.payableSplitSources } : {}),
        Nhat_ky_tien_do: sortedVendorItems.flatMap(item => item.trackingHistory.map(({ id, actorName, time, reason }) => ({
          id, poId: item.poId, actorName, occurredAt: time, detail: reason,
        }))),
        Thu_tien: finance.receipts, Phan_bo_thu: finance.allocations, Chi_tien: finance.payments, Nhat_ky_tai_chinh: finance.audit,
        Nhap_giao_hang: sortedVendorItems.map(item => ({ poId: item.poId, itemName: item.vendorItemNo, category: item.category, unit: item.unit,
          unitPriceVnd: item.unitPriceVnd, totalValueVnd: item.totalValueVnd,
          orderedQty: item.orderedQty, receivedQty: item.nhap, deliveredQty: item.deliveredQty,
          receivedPct: getFulfillment(item, reportDate).receivedPct, deliveredPct: getFulfillment(item, reportDate).deliveredPct,
          expectedReceiptDate: item.expectedReceiptDate, expectedDeliveryDate: item.etaDate, actualDeliveryDate: item.actualDeliveryDate,
          fulfillmentStatus: getFulfillment(item, reportDate).label })) },
        { 'Nguồn dữ liệu': 'BM41 và giao dịch mô phỏng', 'Ngày theo dõi': formatDate(reportDate), 'Ngành hàng': selectedCategory, 'Xuất xứ': selectedOrigin, 'Tìm kiếm': debouncedSearchQuery || t('Tất cả'), 'Chỉ báo động đỏ': onlyMyRoleRedAlerts ? 'Có' : 'Không', 'Sổ thu chi và nhật ký': 'Toàn bộ giao dịch trên máy, không áp dụng bộ lọc PO', 'Phân hệ': activeSection, 'Nhóm công nợ': ['receivables', 'payables'].includes(activeSection) ? debtFilter : 'all' }, language);
      showToast('Đã xuất báo cáo Excel.');
    } catch { showToast('Không thể xuất báo cáo. Vui lòng thử lại.', 'error'); }
    finally { setIsExporting(false); }
  };

  const handleSaveEntry = async (sheetId, rows, orderBaseline) => {
    entrySaving.current = true;
    try {
      const result = await saveEntryBatch(currentUser.id, sheetId, rows, { orderBaseline });
      if (result.items) setVendorItems(result.items);
      if (result.finance) setFinance(result.finance);
      if (result.directory) setDirectory(result.directory);
      return result;
    } finally {
      entrySaving.current = false;
    }
  };

  // Update production and cumulative receipt/delivery quantities via Backend RESTful API.
  const handleUpdateItemProgress = async (e) => {
    e.preventDefault();
    if (!canUpdateProgress || workspacePanel?.type !== 'ITEM_DETAIL' || workspaceSavingRef.current) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    workspaceSavingRef.current = true;
    setIsSavingWorkspace(true);
    try {
      const target = workspacePanel.data;
      const res = await updateOrderProgressApi(target.rowId, {
        ...values,
        reportDate,
        expectedTrackingVersion: target.trackingVersion ?? null,
      });
      const updated = res.item;
      setVendorItems(prev => prev.map(row => row.rowId === updated.rowId ? updated : row));
      setWorkspaceDirty(false); setWorkspaceError('');
      setWorkspacePanel({ type: 'ITEM_DETAIL', data: classifyProgress(updated, reportDate) });
      showToast(`Đã lưu cập nhật và lịch sử ${target.poId}`);
    } catch (error) { setWorkspaceError(error.message); }
    finally { workspaceSavingRef.current = false; setIsSavingWorkspace(false); }
  };

  const handleFinanceAction = async (action, payload, close = true) => {
    if (workspaceSavingRef.current) return null;
    workspaceSavingRef.current = true;
    setIsSavingWorkspace(true);
    try {
      const apiRes = await executeFinanceActionApi(action, {
        ...payload,
        expectedRevision: finance.revision,
      });
      const next = apiRes.finance;
      if (!next) throw new Error('Không nhận được trạng thái tài chính mới từ máy chủ.');
      setFinance(next);
      if (action === 'split' && payableWorkflowFilter === AP_SPLIT_REQUIRED) setPayableWorkflowFilter(AP_REVIEW);
      setWorkspaceDirty(false); setWorkspaceError('');
      if (close) setWorkspacePanel(null);
      showToast(action === 'invoice' ? 'Đã ghi nhận doanh thu và khoản phải thu tương ứng.' :
        action === 'split' ? 'Đã lưu các chứng từ riêng. Có thể lập đề nghị chi cho từng chứng từ.' : 'Đã lưu giao dịch và lịch sử xử lý.');
      return next;
    } catch (error) { setWorkspaceError(error.message || 'Không thể lưu giao dịch.'); return null; }
    finally { workspaceSavingRef.current = false; setIsSavingWorkspace(false); }
  };

  const renderPriorityBadge = (level) => {
    if (level === 'Báo động đỏ') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-600 text-white">
          <Flame className="w-3 h-3" />{t(" Báo động đỏ")}</span>
      );
    }
    if (level === 'Cần xử lý') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">{t("Cần xử lý")}</span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">{t("Đúng hạn")}</span>
    );
  };

  // ============================================================================
  // RENDER LOGIN PAGE WHEN NOT AUTHENTICATED
  // ============================================================================
  const logout = () => {
    if (entrySaving.current) {
      showToast('Đang lưu dữ liệu. Vui lòng chờ.');
      return;
    }
    abortAllPageRequests();
    logoutApi();
    setAlertTaskDraft(null);
    setReminderDraft(null);
    setPayableWorkflowFilter('all');
    setIsAuthenticated(false);
    setCurrentAccountId(null);
    setVendorItems([]);
    setFinance(createEmptyFinance());
    setDirectory(createEmptyDirectoryState());
    setSearchQuery('');
    setSelectedCategory('Tất cả ngành hàng');
    setSelectedOrigin('Tất cả xuất xứ');
    setOnlyMyRoleRedAlerts(false);
    setDebtFilter('all');
    setOrderFilter('all');
    setReportDate(businessToday());
    setLoginPassword('');
    setLoginError('');
    setLoginNotice('');
    setForgotPasswordSent(false);
    setWorkspacePanel(null);
    setActiveSection('overview');
    setToast(null);
  };

  const handlePasswordChanged = () => {
    logout();
    setLoginNotice('Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.');
  };

  if (!isAuthenticated || !currentUser) {
    return (
      <div className="login-screen" onInvalidCapture={localizeInvalidInput} onInputCapture={clearLocalizedValidation} onChangeCapture={clearLocalizedValidation}>
        <header className="login-brand">
          <div className="brand-mark"><img src={BRAND_LOGO} alt="" /></div>
          <span>UYEN VU <span className="brand-secondary">INTERNATIONAL</span></span>
          <LanguageSwitch />
        </header>
        <main className="login-main">
          <section className="login-card" aria-labelledby="login-title">
            <div className="login-emblem"><Lock size={24} strokeWidth={1.6} /></div>
            <h1 id="login-title">{t("Đăng nhập")}</h1>
            <p className="login-caption">{t("Hệ thống quản lý điều hành")}</p>
            {loginError && <div className="login-message login-error" role="alert">{t(loginError)}</div>}
            {loginNotice && <div className="login-message" role="status">{t(loginNotice)}</div>}
            {forgotPasswordSent && <div className="login-message" role="status">{t("Vui lòng liên hệ quản trị viên để cấp lại mật khẩu.")}</div>}
            <form onSubmit={handleLoginSubmit} className="login-form">
              <div>
                <label htmlFor="login-email">Email</label>
                <input id="login-email" name="email" type="email" required autoComplete="username"
                  value={loginEmail} onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }}
                  placeholder={t("Nhập email công việc")} />
              </div>
              <div>
                <label htmlFor="login-password">{t("Mật khẩu")}</label>
                <div className="password-field">
                  <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} required
                    autoComplete="current-password" value={loginPassword}
                    onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }} placeholder={t("Nhập mật khẩu")} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    aria-label={t(showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu')} aria-pressed={showPassword}>
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>
              <div className="login-options">
                <label className="remember-email"><input type="checkbox" checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)} />{t("Ghi nhớ email")}</label>
                <button type="button" onClick={() => setForgotPasswordSent(true)}>{t("Quên mật khẩu?")}</button>
              </div>
              <div className="login-terms-box rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700 space-y-1.5">
                <label htmlFor="login-accept-terms" className="flex items-start gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    id="login-accept-terms"
                    name="acceptedTerms"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => {
                      setAcceptedTerms(e.target.checked);
                      if (e.target.checked && loginError === TERMS_REQUIRED_MESSAGE) {
                        setLoginError('');
                      }
                    }}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    {t("Tôi đã đọc và đồng ý với Chính sách bảo mật và Điều khoản sử dụng hệ thống")}
                    <span className="text-rose-600 font-bold" aria-hidden="true"> *</span>
                  </span>
                </label>
                <div className="pl-5">
                  <button
                    type="button"
                    onClick={() => termsPolicyDialog.current?.showModal()}
                    className="text-sky-700 hover:text-sky-900 underline font-semibold cursor-pointer text-[11px]"
                  >
                    {t("Xem chi tiết Chính sách bảo mật & Điều khoản sử dụng")}
                  </button>
                </div>
              </div>
              <button type="submit" className="login-submit" disabled={isSigningIn}>{t(isSigningIn ? 'Đang đăng nhập…' : 'Đăng nhập')} <ArrowRight size={18} /></button>
            </form>
          </section>
        </main>
        <dialog className="account-confirm-dialog login-lock-dialog" ref={loginLockDialog}
          aria-labelledby="login-lock-title" aria-describedby="login-lock-description">
          <div className="login-lock-icon"><Lock size={24} aria-hidden="true" /></div>
          <h2 id="login-lock-title">{t('Tài khoản đã bị khóa')}</h2>
          <p id="login-lock-description">{t('Vui lòng liên hệ quản trị viên để mở khóa trước khi đăng nhập lại.')}</p>
          <form method="dialog" className="workflow-footer">
            <button type="submit" className="primary">{t('Đã hiểu')}</button>
          </form>
        </dialog>
        <dialog
          className="account-confirm-dialog terms-policy-dialog max-w-lg"
          ref={termsPolicyDialog}
          aria-labelledby="terms-policy-title"
        >
          <div className="flex items-center gap-2 text-slate-900 mb-2">
            <ShieldCheck size={22} className="text-sky-700 shrink-0" />
            <h2 id="terms-policy-title" className="m-0 text-base font-bold">
              {t('Chính sách bảo mật & Điều khoản sử dụng')}
            </h2>
          </div>
          <div className="text-xs text-slate-700 space-y-2.5 max-h-72 overflow-y-auto pr-1 leading-relaxed">
            <p>
              <strong>1. {t('Bảo mật dữ liệu kinh doanh & tài chính:')}</strong>{' '}
              {t('Mọi thông tin đơn hàng mua (PO), đơn giá nhà cung cấp, chứng từ doanh thu, công nợ phải thu (AR) và công nợ phải trả (AP) là tài sản mật của Uyen Vu International. Nghiêm cấm sao chép hoặc chia sẻ trái phép ra ngoài phạm vi công việc.')}
            </p>
            <p>
              <strong>2. {t('Phân quyền truy cập nghiêm ngặt (RBAC):')}</strong>{' '}
              {t('Tài khoản chỉ được phép truy cập các phân hệ, chứng từ và tệp đính kèm đúng với vai trò được CEO hoặc Quản trị viên cấp phép. Không chia sẻ mật khẩu hoặc mã phiên đăng nhập JWT cho bất kỳ ai.')}
            </p>
            <p>
              <strong>3. {t('Ghi vết kiểm toán & trách nhiệm giải trình:')}</strong>{' '}
              {t('Mọi thao tác cập nhật tiến độ, lập hóa đơn, phân bổ tiền thu, tách chứng từ phải trả, duyệt chi và bàn giao công việc đều được lưu vết kiểm toán tự động theo giờ Việt Nam (Asia/Ho_Chi_Minh).')}
            </p>
          </div>
          <div className="workflow-footer mt-4">
            <button type="button" onClick={() => termsPolicyDialog.current?.close()}>{t('Đóng')}</button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setAcceptedTerms(true);
                if (loginError === TERMS_REQUIRED_MESSAGE) setLoginError('');
                termsPolicyDialog.current?.close();
              }}
            >
              {t('Tôi đồng ý')}
            </button>
          </div>
        </dialog>
        <footer className="login-footer">© {new Date().getFullYear()} Uyen Vu International</footer>
      </div>
    );
  }

  // ============================================================================
  // RENDER AUTHENTICATED WORKSPACE
  // ============================================================================
  return (
    <div className="app-shell min-h-screen text-slate-800 font-sans antialiased flex flex-col" onInvalidCapture={localizeInvalidInput} onInputCapture={clearLocalizedValidation} onChangeCapture={clearLocalizedValidation}>
      {toast && (
        <div className={`app-toast fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
          toast.type === 'error' ? 'bg-rose-900 text-white border-rose-700' : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4 text-rose-200 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span className="text-xs sm:text-sm font-medium">{t(toast.msg)}</span>
          <button aria-label={t("Đóng thông báo")} onClick={() => setToast(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <AppHeader
        language={language}
        activeSection={reviewingResubmissions ? 'assignments' : activeSection}
        onNavigate={onNavigate}
        user={currentUser}
        onLogout={logout}
        onPasswordChanged={handlePasswordChanged}
        pendingRemindersCount={pendingRemindersCount}
      />
      {activeSection === 'data-entry' ? <main className="dashboard-workspace entry-page">
        <DataEntryPage key={currentUser.id} actor={currentUser} data={{ items: vendorItems, finance, directory }} onSave={handleSaveEntry} />
      </main> : activeSection === 'reminders' ? <main className="dashboard-workspace management-workspace tasks-workspace">
        <RemindersPage
          reminders={allReminders}
          tasks={allDirectoryTasks}
          accounts={accounts}
          alerts={alerts}
          actor={currentUser}
          busy={directoryBusy}
          onAction={handleDirectoryAction}
          onOpenAlert={openWorkAlert}
          onNavigate={onNavigate}
          initialDraft={reminderDraft}
          onClearDraft={() => setReminderDraft(null)}
        />
      </main> : ['users', 'tasks', 'assignments', 'assignment-reviews'].includes(activeSection) ? <main className={`dashboard-workspace management-workspace${activeSection === 'users' ? '' : ' tasks-workspace'}`}>
        {activeSection === 'users' ? <>
          <div className="page-heading"><div><p className="page-eyebrow">UYEN VU INTERNATIONAL</p>
            <h1>{t('Quản lý tài khoản')}</h1></div></div>
          <AccountsPage accounts={accounts} departmentNavigation={directory.departmentNavigation} actor={currentUser} onAction={handleDirectoryAction} busy={directoryBusy} />
        </> :
          <><TasksPage key={activeSection} {...taskWorkspace(directory, currentUser)}
            accounts={accounts} actor={currentUser} managing={activeSection !== 'tasks'}
            reReviewOnly={reviewingResubmissions} alertDraft={alertTaskDraft} onClearAlertDraft={() => setAlertTaskDraft(null)}
            onNavigate={onNavigate} onAction={handleDirectoryAction} busy={directoryBusy} /></>}
      </main> : <main className={`dashboard-workspace${activeSection === 'revenue' ? ' revenue-workspace' : ''}`}>
        <div className="page-heading"><div><p className="page-eyebrow">UYEN VU INTERNATIONAL</p><h1>{t(activeSection === 'overview' ? 'Tổng quan điều hành' : NAV_ITEMS.find(item => item.id === activeSection)?.label)}</h1></div><div className="page-heading-actions"><label className="report-date">{t("Ngày theo dõi")}<span className="report-date-control"><span>{formatDate(reportDate)}</span><CalendarDays size={14} /><input lang={locale()} aria-label={t("Ngày theo dõi")} type="date" min={finance.openingDate || '2020-01-01'} value={reportDate} onChange={e => { if (parseBusinessDate(e.target.value) && e.target.value >= (finance.openingDate || '2020-01-01')) setReportDate(e.target.value); }} /></span></label>{fullReport && <button className="export-button" onClick={handleExport} disabled={isExporting}><Download size={16} />{t(isExporting ? 'Đang xuất…' : 'Xuất báo cáo')}</button>}</div></div>
        <p className="mt-2 text-xs text-slate-600">{t('Hệ thống Điều hành Uyen Vu International · Dữ liệu đồng bộ trực tiếp từ máy chủ PostgreSQL & Redis Cache.')}</p>
        
        <AttentionSummary
          activeSection={activeSection}
          alerts={alerts}
          role={currentRole}
          onNavigate={onNavigate}
          onOpenAlert={openWorkAlert}
          canNavigate={section => canOpenSection(currentUser, section)}
          onAssignAlert={canAssignAlert ? assignWorkAlert : undefined}
          onRemindAlert={remindWorkAlert}
          tasks={allDirectoryTasks}
          accounts={accounts}
          reminders={allReminders}
        />
        {showEmployeeReminders && (
          <EmployeeAlertReminder
            alerts={reminderAlerts}
            role={currentRole}
            onOpen={openWorkAlert}
            onRemindAlert={remindWorkAlert}
            tasks={allDirectoryTasks}
            accounts={accounts}
            reminders={allReminders}
          />
        )}
        <section className="dashboard-filters" aria-label={t("Bộ lọc dữ liệu")}>
          <label htmlFor="category-filter">{t("Ngành hàng")}<select id="category-filter" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="Tất cả ngành hàng">{t("Tất cả ngành hàng")}</option>{orderCategories.map(category => <option key={category}>{category}</option>)}
          </select></label>
          <label htmlFor="origin-filter">{t("Xuất xứ")}<select id="origin-filter" value={selectedOrigin} onChange={e => setSelectedOrigin(e.target.value)}>
            <option value="Tất cả xuất xứ">{t("Tất cả xuất xứ")}</option>{[...new Set(classifiedItems.map(row => row.countryOfOrigin).filter(Boolean))].map(origin => <option key={origin}>{origin}</option>)}
          </select></label>
          <label htmlFor="workspace-search" className="filter-search">{t("Tìm kiếm")}<span><Search size={16} /><input id="workspace-search" type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t(activeSection === 'orders' ? 'Tìm PO, mã hàng, nhà cung cấp…' : activeSection === 'receivables' ? 'Tìm hóa đơn, khách hàng…' : activeSection === 'payables' ? 'Tìm chứng từ, nhà cung cấp…' : 'PO, mã hàng, chứng từ, đối tác…')} /></span></label>
          <button className={onlyMyRoleRedAlerts ? 'red-filter active' : 'red-filter'} aria-pressed={onlyMyRoleRedAlerts} onClick={() => setOnlyMyRoleRedAlerts(!onlyMyRoleRedAlerts)}><Flame size={16} />{t("Báo động đỏ")}</button>
          <button className="reset-filters" title={t("Xóa bộ lọc")} aria-label={t("Xóa bộ lọc")} onClick={resetFilters}><RotateCcw size={17} /><span>{t("Xóa lọc")}</span></button>
        </section>

        {activeFilters.length > 0 && <div className="active-filters" aria-label={t("Bộ lọc đang áp dụng")}><span>{t("Đang lọc")}</span>{activeFilters.map(filter => <button key={filter.label} onClick={filter.clear} aria-label={phrase('Bỏ lọc §', t(filter.label))}>{t(filter.label)}<X size={13} /></button>)}</div>}
        <OverviewKpis role={currentRole} items={sortedVendorItems} revenue={sortedRevenueRecords} ar={arSummary} ap={apSummary} onNavigate={onNavigate} canNavigate={section => canOpenSection(currentUser, section)} />
        <div className="page-content" key={activeSection}>
        {['receivables', 'payables'].includes(activeSection) && <div className="debt-detail-filter"><span>{phrase('§ chứng từ', activeSection === 'receivables' ? tableReceivables.length : tablePayables.length)}</span><label htmlFor="debt-status-filter">{t("Trạng thái")}<select id="debt-status-filter" value={debtFilter} onChange={e => setDebtFilter(e.target.value)}>
          <option value="all">{t("Tất cả công nợ")}</option><option value="due">{t("Đến hạn & quá hạn")}</option><option value="red">{t("Báo động đỏ")}</option><option value="today">{t("Đến hạn hôm nay")}</option><option value="overdue">{t("Quá hạn")}</option><option value="upcoming">{t("Chưa đến hạn")}</option><option value="near">{t("Sắp đến hạn (1–7 ngày)")}</option><option value="future">{t("Chưa tới hạn (>7 ngày)")}</option><option value="attention">{t("Cần xử lý")}</option><option value="unknown">{t("Chưa có hạn")}</option><option value="paid">{t("Đã tất toán")}</option>
        </select></label></div>}
        {activeSection === 'overview' && <DashboardOverview role={currentRole} items={sortedVendorItems} revenue={sortedRevenueRecords} categoryStats={categoryStats}
          reportDate={reportDate} ar={arSummary} ap={apSummary} alerts={alerts} monthlyData={monthlyData} onNavigate={onNavigate} onOpenItem={openItem} onResetFilters={resetFilters} onOpenAlert={openWorkAlert}
          onAssignAlert={canAssignAlert ? assignWorkAlert : undefined} onRemindAlert={remindWorkAlert} tasks={allDirectoryTasks} accounts={accounts} reminders={allReminders} />}
        {activeSection === 'orders' && <div className="order-view-tabs" aria-label={t("Chế độ tiến độ đơn hàng")}><button aria-pressed={orderView === 'fulfillment'} onClick={() => setOrderView('fulfillment')}>{t("Nhập & giao hàng")}</button><button aria-pressed={orderView === 'production'} onClick={() => setOrderView('production')}>{t("Sản xuất & đóng gói")}</button></div>}
        {activeSection === 'orders' && orderView === 'fulfillment' && <FulfillmentTable onResetFilters={resetFilters} items={sortedVendorItems} reportDate={reportDate} onOpenItem={openItem} selectedFilter={debouncedOrderFilter} onFilterChange={setOrderFilter} tasks={allDirectoryTasks} accounts={accounts} reminders={allReminders} onRemindAlert={remindWorkAlert} />}
        {activeSection === 'orders' && orderView === 'production' && (
          <section className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">{t("Tiến độ mã hàng & ngành hàng")}</h2>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                <div className="lg:col-span-5 min-w-0">
                  <CategoryProgressChart stats={categoryStats} />

                </div>

                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {categoryStats.map(cat => (
                    <button type="button" aria-pressed={selectedCategory === cat.category}
                      key={cat.category}
                      onClick={() => setSelectedCategory(selectedCategory === cat.category ? 'Tất cả ngành hàng' : cat.category)}
                      className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                        selectedCategory === cat.category
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold truncate">{cat.category}</span>
                        {cat.redCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white shrink-0">
                            {cat.redCount}{t(" Đỏ")}</span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="opacity-75">{t("Số dòng mã hàng:")}</span>
                          <strong>{cat.totalItems}{t(" mã")}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-75">{t("TB Sản xuất / Đóng gói:")}</span>
                          <strong>{formatPercent(cat.avgOnProcess)} / {formatPercent(cat.avgPackaging)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-75">{t("Mã có hàng về:")}</span>
                          <strong>{cat.receivedItems} / {cat.totalItems}{t(" mã")}</strong>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200/40">
                          <span className="opacity-75">{t("Doanh thu:")}</span>
                          <strong>{formatVnd(cat.revenue)}</strong>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200 whitespace-nowrap">
                      <th className="py-3 px-3">{t("Ưu tiên")}</th>
                      <th className="py-3 px-2.5">{t("PO / Nhà cung cấp")}</th>
                      <th className="py-3 px-3">{t("Nhà cung cấp & Ngành hàng")}</th>
                      <th className="py-3 px-3">{t("Mã hàng")}</th>
                      <th className="py-3 px-2.5 text-center">{t("Ngày phát hành PO")}</th>
                      <th className="py-3 px-3">{t("Sản xuất (%)")}</th>
                      <th className="py-3 px-3">{t("Đóng gói (%)")}</th>
                      <th className="py-3 px-3 text-center">{t("Lịch xuất / giao (ETD / ETA)")}</th>
                      <th className="py-3 px-2.5 text-right">{t("Tồn đầu")}</th>
                      <th className="py-3 px-2.5 text-right">{t("Nhập")}</th>
                      <th className="py-3 px-2.5 text-right">{t("Bán")}</th>
                      <th className="py-3 px-2.5 text-center">{t("Tồn kho")}</th>
                      <th className="py-3 px-2.5">{t("Xuất xứ / Mùa hàng")}</th>
                      <th className="py-3 px-3 text-right">{t("Chi tiết")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {!sortedVendorItems.length && <tr><td colSpan={14} className="empty-table">{t("Không có mã hàng phù hợp")}</td></tr>}
                    {productionPagination.visibleItems.map((row) => {
                      const isRed = row.priorityRank === 0;
                      const alertObj = { id: `order-${row.rowId}`, type: 'orders', reference: row.poId, label: row.vendorItemNo, status: row.alertLabel, data: row };
                      return (
                        <tr
                          key={row.rowId}
                          onClick={() => openItem(row)}
                          className={`${
                            isRed ? 'business-data-row has-alert bg-white hover:bg-slate-50' : 'business-data-row bg-white hover:bg-slate-50'
                          } transition cursor-pointer`}
                        >
                          <td className="py-3 px-3 whitespace-nowrap">
                            {renderPriorityBadge(row.alertLevel)}
                          </td>
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{row.poId}</div>
                            <div className="text-[11px] font-mono text-slate-500">{t("NCC:")} {row.vendorNo}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800">{t(row.vendorName)}</div>
                            <div className="text-[11px] text-slate-500">{row.category}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{t(row.vendorItemNo)}</div>
                            {isRed && (
                              <AlertAssignmentLine
                                alertRef={{ id: alertObj.id, type: 'orders', reference: row.poId }}
                                tasks={allDirectoryTasks}
                                accounts={accounts}
                                reminders={allReminders}
                                canRemind={true}
                                onRemind={() => remindWorkAlert(alertObj)}
                                compact={true}
                              />
                            )}
                          </td>
                          <td className="py-3 px-2.5 text-center font-medium text-slate-700 whitespace-nowrap">
                            {row.releasedPoDate}
                          </td>
                          <td className="py-3 px-3 min-w-[110px]">
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-sky-700"
                                style={{ width: `${row.onProcessPct ?? 0}%` }}
                              />
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 mt-1">{formatPercent(row.onProcessPct)}</div>
                          </td>
                          <td className="py-3 px-3 min-w-[110px]">
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-teal-600"
                                style={{ width: `${row.packagingPct ?? 0}%` }}
                              />
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 mt-1">{formatPercent(row.packagingPct)}</div>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              ETD: {row.shipDateEtd}
                            </div>
                            <div className="text-[11px] text-slate-500">ETA: {row.etaDate}</div>
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono text-slate-700">
                            {row.tonDau ? row.tonDau.toLocaleString(locale()) : '-'}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono font-bold text-slate-800">
                            {row.nhap ? row.nhap.toLocaleString(locale()) : '-'}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono font-bold text-slate-800">
                            {row.ban ? row.ban.toLocaleString(locale()) : '-'}
                          </td>
                          <td className="py-3 px-2.5 text-center font-mono text-slate-500">
                            {row.nhap != null && row.deliveredQty != null
                              ? (Number(row.tonDau || 0) + row.nhap - row.deliveredQty).toLocaleString(locale()) : '—'}
                          </td>
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            <div className="font-semibold text-slate-700">{row.countryOfOrigin || '—'}</div>
                            <div className="text-[10px] text-slate-500">{[row.seasonCode, t(row.seasonDesc)].filter(Boolean).join(' • ')}</div>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button onClick={event => { event.stopPropagation(); openItem(row); }} aria-label={t(`Chi tiết ${row.poId}`)} className="row-detail-button">
                              <span>{t("Chi tiết")}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ProgressivePaginationBar pagination={productionPagination} itemUnit="mã hàng" />
            </div>
          </section>
        )}
        {activeSection === 'revenue' && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-6 revenue-section-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">{t("Doanh thu")}</h2>
              </div>
              <div className="flex items-center gap-2">
                {showOrders && can(currentUser, 'revenue.create') && <button
                  onClick={() => openWorkspace({ type: 'RECORD_REV', data: null })}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
                >{t("+ Ghi nhận doanh thu")}</button>}
              </div>
            </div>

            <RevenueChart stats={categoryStats} monthlyData={monthlyData} />
            <RevenueTaxProfitabilityPanel revenueRecords={sortedRevenueRecords} items={sortedVendorItems} />
            <div className="space-y-3">
              <h3 className="text-base font-bold text-slate-900">{t("Chứng từ doanh thu")}</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full min-w-[760px] text-left border-collapse text-sm revenue-data-table" aria-label={t("Chứng từ doanh thu")}>
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                      <th className="py-3 px-3.5">{t("Mức độ")}</th>
                      <th className="py-3 px-3.5">{t("Chứng từ / Ngày")}</th>
                      <th className="py-3 px-3.5">{t("Khách hàng & Mã hàng")}</th>
                      <th className="py-3 px-3.5 text-right">{t("Doanh thu ghi nhận")}</th>
                      <th className="py-3 px-3.5 text-right">{t("Đã thực thu")}</th>
                      <th className="py-3 px-3.5">{t("Đánh giá Kế toán")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {!sortedRevenueRecords.length && <tr><td colSpan={6} className="empty-table">{t("Không có chứng từ doanh thu phù hợp")}</td></tr>}
                    {revenuePagination.visibleItems.map(rev => {
                      const isRed = rev.priorityRank === 0;
                      const alertObj = { id: `receivables-${rev.id}`, type: 'receivables', reference: rev.docNo, label: rev.customerName, status: rev.alertLevel, data: rev };
                      return (
                        <tr key={rev.id} className={isRed ? 'business-data-row has-alert bg-white' : 'business-data-row bg-white'}>
                          <td className="py-3 px-3.5 whitespace-nowrap">{renderPriorityBadge(rev.alertLevel)}</td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-bold text-slate-900 text-sm">{rev.docNo}</div>
                            <div className="text-xs text-slate-500">{rev.recordDate} • {rev.poId}</div>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-800 text-sm">{t(rev.customerName)}</div>
                            <div className="text-xs text-slate-500">{t(rev.sku)}</div>
                            {isRed && (
                              <AlertAssignmentLine
                                alertRef={{ id: alertObj.id, type: 'receivables', reference: rev.docNo }}
                                tasks={allDirectoryTasks}
                                accounts={accounts}
                                reminders={allReminders}
                                canRemind={true}
                                onRemind={() => remindWorkAlert(alertObj)}
                                compact={true}
                              />
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 text-sm whitespace-nowrap">
                            {formatVnd(rev.netRevenue)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-700 text-sm whitespace-nowrap">
                            {formatVnd(rev.cashCollected)}
                          </td>
                          <td className="py-3 px-3.5 text-xs text-slate-600 max-w-xs">
                            {t(rev.statusNote)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ProgressivePaginationBar pagination={revenuePagination} itemUnit="chứng từ doanh thu" />
            </div>
          </section>
        )}
        {activeSection === 'receivables' && (
          <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{t("Công nợ phải thu")}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">{t("Tiền thu chưa phân bổ giữ riêng: ")}<strong className="text-slate-900">{formatVnd(unallocatedCash)}</strong>
                </span>
                {can(currentUser, 'receivables.allocate') && <button
                  onClick={() => openWorkspace({ type: 'ALLOCATE_AR', data: null })}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                >{t("Thu tiền & phân bổ")}</button>}
              </div>
            </div>

            <DebtStatusOverview rows={sortedReceivables} debtType="receivables" role={currentRole}
              filter={debouncedDebtFilter} onFilter={setDebtFilter} onOpen={openWorkspace}
              redOnly={onlyMyRoleRedAlerts} onClearRed={() => { setOnlyMyRoleRedAlerts(false); setDebtFilter('all'); }}
              tasks={allDirectoryTasks} accounts={accounts} reminders={allReminders} onRemindAlert={remindWorkAlert} />
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-xs border-b border-slate-200">
                    <th className="py-3 px-4">{t("Mức độ ưu tiên")}</th>
                    <th className="py-3 px-4">{t("Hóa đơn / PO")}</th>
                    <th className="py-3 px-4">{t("Khách hàng / Nhà cung cấp")}</th>
                    <th className="py-3 px-4">{t("Mã hàng")}</th>
                    <th className="py-3 px-4 text-center">{t("Hạn thanh toán")}</th>
                    <th className="py-3 px-4 text-right">{t("Phải thu gốc")}</th>
                    <th className="py-3 px-4 text-right">{t("Đã phân bổ")}</th>
                    <th className="py-3 px-4 text-right">{t("Còn phải thu")}</th>
                    <th className="py-3 px-4">{t("Ghi chú / Cam kết")}</th><th className="sticky-action">{t("Thao tác")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {!tableReceivables.length && <tr><td colSpan={10} className="empty-table">{t("Không có khoản phải thu phù hợp. ")}<button onClick={resetFilters}>{t("Xóa bộ lọc")}</button></td></tr>}
                  {arPagination.visibleItems.map(ar => {
                    const isRed = ar.priorityRank === 0;
                    const alertObj = { id: `receivables-${ar.id}`, type: 'receivables', reference: ar.docNo, label: ar.customerName, status: ar.alertLabel, data: ar };
                    return (
                      <tr key={ar.id} className={isRed ? 'business-data-row has-alert bg-white hover:bg-slate-50' : 'business-data-row bg-white hover:bg-slate-50'}>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {renderPriorityBadge(ar.alertLevel)}
                          <div className="text-[11px] text-slate-500 mt-0.5">{t(ar.agingBucket)}</div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          <div>{ar.docNo}</div>
                          <div className="text-xs text-slate-500">{ar.poId}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{t(ar.customerName)}</div>
                          <div className="text-xs text-slate-500">{t(ar.vendorRef)}</div>
                          {isRed && (
                            <AlertAssignmentLine
                              alertRef={{ id: alertObj.id, type: 'receivables', reference: ar.docNo }}
                              tasks={allDirectoryTasks}
                              accounts={accounts}
                              reminders={allReminders}
                              canRemind={true}
                              onRemind={() => remindWorkAlert(alertObj)}
                              compact={true}
                            />
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          <div>{t(ar.sku)}</div>
                          <div className="text-xs text-slate-500">{ar.category}</div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="font-bold text-slate-800">{ar.dueDate}</div>
                          {ar.overdueDays > 0 && (
                            <span className="text-xs font-bold text-rose-600">{phrase('Quá hạn § ngày', ar.overdueDays)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{formatVnd(ar.originalAmount)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700 font-semibold">{formatVnd(ar.allocatedPaid)}</td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${isRed ? 'text-rose-700' : 'text-slate-900'}`}>{formatVnd(ar.remaining)}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                          {t(ar.commitmentNote || '—')}
                        </td><td className="sticky-action"><button className="row-detail-button" onClick={() => openWorkspace({ type: 'DEBT_DETAIL', debtType: 'receivables', data: ar })}>{t("Chi tiết")}<ChevronRight size={15} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ProgressivePaginationBar pagination={arPagination} itemUnit="khoản phải thu" />
          </section>
        )}
        {activeSection === 'payables' && (
          <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{t("Công nợ phải trả")}</h2>
              </div>
            </div>

            <div className="workflow-filter-tabs" aria-label={t("Lọc quy trình chi")}>{[['all', 'Tất cả hồ sơ'], [AP_SPLIT_REQUIRED, AP_SPLIT_REQUIRED], [AP_PENDING, 'Chờ CEO duyệt'], [AP_APPROVED, 'Đã duyệt chi'], [AP_REVIEW, 'Cần lập đề nghị'], [AP_RETURNED, 'Cần bổ sung']].map(([value, label]) => <button key={value} aria-pressed={payableWorkflowFilter === value} onClick={() => setPayableWorkflowFilter(value)}>{t(label)}<span>{value === 'all' ? sortedPayables.length : sortedPayables.filter(row => payableWorkflowStatus(row) === value).length}</span></button>)}</div>
            <DebtStatusOverview rows={payableScope} debtType="payables" role={currentRole} canSplit={showOrders}
              filter={debouncedDebtFilter} onFilter={setDebtFilter} onOpen={openWorkspace}
              redOnly={onlyMyRoleRedAlerts} onClearRed={() => { setOnlyMyRoleRedAlerts(false); setDebtFilter('all'); }}
              tasks={allDirectoryTasks} accounts={accounts} reminders={allReminders} onRemindAlert={remindWorkAlert} />
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-xs border-b border-slate-200">
                    <th className="py-3 px-4">{t("Mức độ ưu tiên")}</th>
                    <th className="py-3 px-4">{t("Chứng từ / Mã NCC")}</th>
                    <th className="py-3 px-4">{t("Nhà cung cấp")}</th>
                    <th className="py-3 px-4">{t("Mã hàng & PO")}</th>
                    <th className="py-3 px-4 text-center">{t("Hạn thanh toán")}</th>
                    <th className="py-3 px-4 text-right">{t("Đã trả")}</th>
                    <th className="py-3 px-4 text-right">{t("Còn phải trả")}</th>
                    <th className="py-3 px-4 text-center">{t("Trạng thái hồ sơ")}</th>
                    <th className="py-3 px-4 text-right sticky-action">{t("Thao tác (")}{t(currentUser.roleLabel)})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {!tablePayables.length && <tr><td colSpan={9} className="empty-table">{t("Không có khoản phải trả phù hợp. ")}<button onClick={resetFilters}>{t("Xóa bộ lọc")}</button></td></tr>}
                  {apPagination.visibleItems.map(ap => {
                    const isRed = ap.priorityRank === 0;
                    const action = payableAction(ap, currentRole, showOrders);
                    const status = payableWorkflowStatus(ap);
                    const alertObj = { id: `payables-${ap.id}`, type: 'payables', reference: ap.docNo, label: ap.supplierName, status: ap.alertLabel, data: ap };
                    return (
                      <tr key={ap.id} className={isRed ? 'business-data-row has-alert bg-white hover:bg-slate-50' : 'business-data-row bg-white hover:bg-slate-50'}>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {renderPriorityBadge(ap.alertLevel)}
                          <div className="text-[11px] text-slate-500 mt-0.5">{t(ap.agingBucket)}</div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          <div>{ap.docNo}</div>
                          <div className="text-xs font-mono text-slate-500">NCC: {ap.vendorNo}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <div>{t(ap.supplierName)}</div>
                          <div className="text-xs text-slate-500">{ap.category}</div>
                          {isRed && (
                            <AlertAssignmentLine
                              alertRef={{ id: alertObj.id, type: 'payables', reference: ap.docNo }}
                              tasks={allDirectoryTasks}
                              accounts={accounts}
                              reminders={allReminders}
                              canRemind={true}
                              onRemind={() => remindWorkAlert(alertObj)}
                              compact={true}
                            />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{t(ap.sku)}</div>
                          <div className="text-xs text-slate-500">{ap.poId}</div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="font-bold text-slate-800">{ap.dueDate}</div>
                          {ap.overdueDays > 0 && (
                            <span className="text-xs font-bold text-rose-600">{phrase('Quá hạn § ngày', arSummary && ap.overdueDays)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">{formatVnd(ap.allocatedPaid)}</td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${isRed ? 'text-rose-700' : 'text-slate-900'}`}>{formatVnd(ap.remaining)}</td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                            status === AP_APPROVED
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-800'
                          }`}>
                            {t(status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 sticky-action"><div className="row-actions">{action && <button onClick={() => openWorkspace({ type: action.type, data: ap })} className="row-primary-button">{t(action.label)}</button>}<button className="row-detail-button" onClick={() => openWorkspace({ type: 'DEBT_DETAIL', debtType: 'payables', data: ap })}>{t("Chi tiết")}<ChevronRight size={15} /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ProgressivePaginationBar pagination={apPagination} itemUnit="khoản phải trả" />
          </section>
        )}
        </div>
        {['revenue', 'receivables', 'payables'].includes(activeSection) && <FinanceHistory entries={visibleFinanceHistory} />}
      </main>}
      {workspacePanel && can(currentUser, 'dashboard.read') && (
        <div className={`workspace-overlay ${isFullScreenPanel ? 'is-fullscreen' : ''}`}>
          <div
            role="dialog" aria-modal="true" aria-labelledby="workspace-title"
            className={`workspace-dialog ${isFullScreenPanel ? 'is-fullscreen' : ''}`}
          >
            <div className="workspace-header">
              <div className="workspace-header-main">
                <button
                  onClick={requestCloseWorkspace}
                  aria-label={t("Quay lại bảng")}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer flex items-center gap-1 text-xs font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{t("Quay lại bảng")}</span>
                </button>
                <div className="workspace-title-block">
                  {workspacePanel.type === 'ITEM_DETAIL' && <p>{workspacePanel.data.poId} · {t(workspacePanel.data.vendorName)}</p>}
                  <h3 id="workspace-title" className="text-base sm:text-lg font-bold">
                    {workspacePanel.type === 'ITEM_DETAIL' && t(workspacePanel.data.vendorItemNo)}
                    {t(workspacePanel.type === 'ALLOCATE_AR' && 'Phân bổ tiền thu')}
                    {t(workspacePanel.type === 'RECORD_REV' && 'Ghi nhận doanh thu')}
                    {t(workspacePanel.type === 'SUBMIT_AP' && 'Lập đề nghị chi')}
                    {t(workspacePanel.type === 'SPLIT_AP' && 'Tách chứng từ phải trả')}
                    {t(workspacePanel.type === 'REVIEW_AP' && 'Xem xét đề nghị chi')}
                    {t(workspacePanel.type === 'PAY_AP' && 'Ghi nhận khoản đã chi')}
                    {workspacePanel.type === 'DEBT_DETAIL' && workspacePanel.data.docNo}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullScreenPanel(!isFullScreenPanel)}
                  aria-label={t(isFullScreenPanel ? 'Thu gọn cửa sổ' : 'Mở toàn màn hình')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {isFullScreenPanel ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span>{t(isFullScreenPanel ? 'Thu gọn' : 'Toàn màn hình')}</span>
                </button>
                <button
                  onClick={requestCloseWorkspace}
                  aria-label={t("Đóng chi tiết")}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="workspace-body" onChangeCapture={event => { if (event.target.closest('form')) { setWorkspaceDirty(true); setWorkspaceError(''); } }}>
              {workspaceError && <div className="workspace-error" role="alert" tabIndex={-1}><AlertTriangle size={18} /><span>{t(workspaceError)}</span></div>}
              {workspacePanel.type === 'ITEM_DETAIL' && <ItemDetailPanel item={workspacePanel.data} reportDate={reportDate} canEdit={canUpdateProgress} canLowerAlerts={isExecutiveRole(currentRole)} financials={itemFinancialSummary(workspacePanel.data, { revenue: showRevenue ? revenueRecords : [], receivables: classifiedAr, payables: classifiedAp })} isSaving={isSavingWorkspace} onSubmit={handleUpdateItemProgress} onClose={requestCloseWorkspace} tasks={allDirectoryTasks} accounts={accounts} reminders={allReminders} onRemindAlert={remindWorkAlert} />}
              {['ALLOCATE_AR', 'RECORD_REV', 'SPLIT_AP', 'SUBMIT_AP', 'REVIEW_AP', 'PAY_AP'].includes(workspacePanel.type) && <fieldset className="min-w-0" disabled={isSavingWorkspace} aria-busy={isSavingWorkspace}>
                {workspacePanel.type === 'ALLOCATE_AR' && <ReceiptWorkspace initialDebtId={workspacePanel.data?.id} finance={finance} onAction={handleFinanceAction} onClose={requestCloseWorkspace} />}
                {workspacePanel.type === 'RECORD_REV' && <InvoiceForm finance={finance} items={vendorItems} onAction={handleFinanceAction} onClose={requestCloseWorkspace} />}
                {workspacePanel.type === 'SPLIT_AP' && <SplitPayableForm row={finance.payables.find(row => row.id === workspacePanel.data.id)} items={vendorItems} onAction={handleFinanceAction} onClose={requestCloseWorkspace} />}
                {['SUBMIT_AP', 'REVIEW_AP', 'PAY_AP'].includes(workspacePanel.type) && <PayableForm actorId={currentUser.id} type={workspacePanel.type} row={finance.payables.find(row => row.id === workspacePanel.data.id)} onAction={handleFinanceAction} onClose={requestCloseWorkspace} />}
              </fieldset>}
              {workspacePanel.type === 'DEBT_DETAIL' && <DebtDetailPanel row={classifyDebt((workspacePanel.debtType === 'receivables' ? receivables : payables).find(row => row.id === workspacePanel.data.id), reportDate)} debtType={workspacePanel.debtType} role={currentRole} canSplit={showOrders} history={visibleFinanceHistory} onOpen={openWorkspace} onClose={requestCloseWorkspace} tasks={allDirectoryTasks} accounts={accounts} reminders={allReminders} onRemindAlert={remindWorkAlert} />}
            </div>
          </div>
          {showDiscardDialog && <div className="discard-overlay"><section role="alertdialog" aria-modal="true" aria-labelledby="discard-title" className="discard-dialog"><h3 id="discard-title">{t("Bạn chưa lưu thay đổi")}</h3><p>{t("Giữ cửa sổ này để tiếp tục chỉnh sửa hoặc bỏ phần chưa lưu.")}</p><div><button className="primary" onClick={() => { setShowDiscardDialog(false); document.querySelector('.workspace-dialog input:not([type=hidden]), .workspace-dialog textarea')?.focus(); }}>{t("Tiếp tục chỉnh sửa")}</button><button onClick={() => { setShowDiscardDialog(false); setWorkspaceDirty(false); setWorkspacePanel(null); }}>{t("Bỏ thay đổi")}</button></div></section></div>}
        </div>
      )}
    </div>
  );
}
