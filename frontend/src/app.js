import { Router } from './lib/router.js';
import {
  blacklistTokenJti,
  buildCacheKey,
  evictUserPageCache,
  getCache,
  getCacheStats,
  invalidateCacheNamespaces,
  setCache,
} from './cache/redisCache.js';
import {
  requireAuth,
  requireExecutive,
  requirePermission,
  requireSectionAccess,
} from './middleware/authMiddleware.js';
import {
  apiRateLimiter,
  checkLoginBruteForce,
  clearLoginFailures,
  recordLoginFailure,
  resetSecurityCounters,
} from './middleware/securityMiddleware.js';
import {
  readDatabaseSnapshot,
  resetDatabaseToSeed,
  withDatabaseTransaction,
  isPostgresAvailable,
} from './db/index.js';
import {
  applyDirectoryAction,
  authenticateUser,
  buildTaskWorkspace,
  changeUserPassword,
  directoryProfiles,
  getTaskAttachment,
} from './services/authDirectoryService.js';
import {
  listClassifiedOrders,
  updateOrderProgressInState,
} from './services/orderService.js';
import {
  applyFinanceOperation,
  buildFinanceSnapshot,
} from './services/financeService.js';
import {
  canReadSheet,
  ENTRY_SHEETS,
  inspectEntryCell,
  processEntryBatchInState,
  readEntryRows,
} from './services/dataEntryService.js';
import { buildDashboardSummary } from './services/dashboardService.js';
import { computeProjectedProgress } from './utils/workspaceUi.js';
import {
  filterTaskRows,
  resolveAlertAssignmentInfo,
} from './utils/taskWorkflow.js';
import {
  sanitizeAccountsForActor,
  sanitizeBootstrapForActor,
  sanitizeFinanceSnapshotForActor,
} from './utils/dataIsolation.js';
import { paginateCollection } from './utils/pagination.js';
import { signJwt } from './utils/cryptoAuth.js';
import { businessToday } from './utils/business.js';
import { AppError } from './utils/errors.js';

export function createApp() {
  const router = new Router();

  // Áp dụng Tiered Rate Limiter toàn cục (Redis + Memory Fallback) cho mọi API
  router.use(apiRateLimiter);

  // ===========================================================================
  // 0. HEALTH CHECK, TERMS POLICY & REDIS CACHE / PAGE MEMORY MANAGEMENT
  // ===========================================================================
  router.get('/api/v1/health', async (_req, res) => {
    const pgConnected = await isPostgresAvailable();
    const cacheStats = getCacheStats();
    res.json(200, {
      status: 'ok',
      system: 'Uyen Vu International — Executive PO, Progress, Finance & Task Dispatch System',
      version: '2.3.0-redis-pagination-rbac-hardened',
      targetNodeRuntime: '26.12.1',
      activeNodeRuntime: process.version,
      timezone: 'Asia/Ho_Chi_Minh',
      businessToday: businessToday(),
      databaseDriver: pgConnected ? 'postgresql-3nf' : 'transactional-engine-3nf',
      cache: {
        driver: cacheStats.driver,
        activeKeys: cacheStats.activeKeys,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        invalidations: cacheStats.invalidations,
        pageEvictions: cacheStats.pageEvictions,
      },
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/api/v1/auth/terms-policy', async (_req, res) => {
    res.json(200, {
      version: '2026.1',
      effectiveDate: '2026-01-01',
      title: 'Chính sách bảo mật và Điều khoản sử dụng Hệ thống Điều hành Uyen Vu International',
      sections: [
        {
          heading: '1. Bảo mật dữ liệu đơn hàng PO, doanh thu và công nợ',
          body: 'Mọi dữ liệu đơn hàng mua (PO), đơn giá nhà cung cấp, hóa đơn doanh thu, công nợ phải thu (AR) và công nợ phải trả (AP) là tài sản bí mật kinh doanh của Uyen Vu International. Người dùng tuyệt đối không sao chép hoặc tiết lộ ra bên ngoài phạm vi công việc được phân công.',
        },
        {
          heading: '2. Phân quyền truy cập theo vai trò (Strict RBAC)',
          body: 'Mỗi cá nhân chỉ được truy cập đúng các phân hệ và chứng từ thuộc vai trò được Tổng Giám Đốc (CEO) hoặc Quản trị viên (Admin) cấp phép. Nghiêm cấm chia sẻ tài khoản, mật khẩu hoặc mã phiên JWT cho người khác.',
        },
        {
          heading: '3. Ghi vết kiểm toán và trách nhiệm giải trình',
          body: 'Mọi thao tác cập nhật tiến độ, lập hóa đơn, phân bổ khoản thu, tách chứng từ phải trả, trình duyệt chi và bàn giao công việc đều được hệ thống ghi nhận tự động kèm định danh người thực hiện và dấu thời gian chuẩn Asia/Ho_Chi_Minh.',
        },
      ],
    });
  });

  router.get('/api/v1/cache/status', requireAuth, requireExecutive, async (_req, res) => {
    res.json(200, {
      status: 'ok',
      cache: getCacheStats(),
    });
  });

  router.post('/api/v1/cache/clear', requireAuth, requireExecutive, async (req, res) => {
    const namespaces = Array.isArray(req.body?.namespaces) ? req.body.namespaces : ['*'];
    const result = await invalidateCacheNamespaces(namespaces);
    res.setHeader('X-Cache-Invalidated', 'true');
    res.json(200, {
      status: 'ok',
      message: 'Đã xóa bộ nhớ đệm Redis và đồng bộ lại dữ liệu mới nhất.',
      ...result,
    });
  });

  /**
   * Giải phóng cache của trang/phân hệ cũ khi người dùng chuyển sang trang khác hoặc bấm sang phân hệ khác
   * giúp máy chủ luôn nhẹ, không lưu các trang cũ không còn sử dụng trong Redis/RAM.
   */
  router.post('/api/v1/cache/release-page', requireAuth, async (req, res) => {
    const { previousSection, previousPage } = req.body || {};
    const result = await evictUserPageCache(req.user.id, {
      section: previousSection || null,
      page: previousPage ?? null,
    });
    res.setHeader('X-Page-Cache-Cleared', 'true');
    res.json(200, {
      status: 'ok',
      message: 'Đã giải phóng bộ nhớ đệm của trang cũ trên máy chủ.',
      ...result,
    });
  });

  // ===========================================================================
  // 1. AUTHENTICATION, JWT REFRESH, LOGOUT & PASSWORD MANAGEMENT (UC-01 & UC-02)
  // ===========================================================================
  router.post('/api/v1/auth/login', async (req, res) => {
    const { email, password, acceptedTerms } = req.body || {};

    if (
      (req.body && Object.hasOwn(req.body, 'acceptedTerms') && acceptedTerms !== true) ||
      req.body?.requireTerms === true
    ) {
      if (acceptedTerms !== true) {
        throw new AppError(
          'Vui lòng tích chọn đồng ý Chính sách bảo mật và Điều khoản sử dụng trước khi đăng nhập.',
          400,
          'TERMS_NOT_ACCEPTED'
        );
      }
    }

    checkLoginBruteForce(req, email);

    const snapshot = await readDatabaseSnapshot();
    const result = await authenticateUser(snapshot.directory, email, password);

    if (result.status === 'locked') {
      recordLoginFailure(req, email);
      res.json(423, {
        status: 'locked',
        code: 'ACCOUNT_LOCKED',
        message: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để mở khóa.',
      });
      return;
    }

    if (result.status !== 'authenticated') {
      recordLoginFailure(req, email);
      res.json(401, {
        status: 'invalid',
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng.',
      });
      return;
    }

    clearLoginFailures(req, email);
    res.json(200, {
      ...result,
      termsAccepted: true,
      termsVersion: '2026.1',
      termsAcceptedAt: new Date().toISOString(),
    });
  });

  router.post('/api/v1/auth/logout', requireAuth, async (req, res) => {
    if (req.jwtPayload?.jti) {
      await blacklistTokenJti(req.jwtPayload.jti, req.jwtPayload.exp);
    }
    await evictUserPageCache(req.user.id);
    res.json(200, {
      status: 'ok',
      message: 'Đã đăng xuất, thu hồi mã phiên JWT và giải phóng bộ nhớ đệm trên Redis.',
    });
  });

  router.post('/api/v1/auth/refresh', requireAuth, async (req, res) => {
    if (req.jwtPayload?.jti) {
      await blacklistTokenJti(req.jwtPayload.jti, req.jwtPayload.exp);
    }
    const tokenVersion = req.dbSnapshot.directory.tokenVersions?.[req.user.id] || 1;
    const newToken = signJwt({
      sub: req.user.id,
      email: req.user.email,
      role: req.user.role,
      tokenVersion,
    });
    res.json(200, {
      status: 'ok',
      token: newToken,
      account: req.user,
    });
  });

  router.post('/api/v1/auth/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (req.jwtPayload?.jti) {
      await blacklistTokenJti(req.jwtPayload.jti, req.jwtPayload.exp);
    }
    const updated = await withDatabaseTransaction(async dbState => {
      return changeUserPassword(dbState.directory, req.user.id, currentPassword, newPassword);
    });
    await invalidateCacheNamespaces(['bootstrap']);
    res.setHeader('X-Cache-Invalidated', 'true');
    res.json(200, {
      status: 'ok',
      message: 'Đổi mật khẩu thành công.',
      token: updated.token,
      account: updated.account,
    });
  });

  router.get('/api/v1/auth/me', requireAuth, async (req, res) => {
    res.json(200, {
      status: 'ok',
      account: req.user,
    });
  });

  // ===========================================================================
  // 2. DIRECTORY, ACCOUNTS & RBAC NAVIGATION MANAGEMENT (UC-03 to UC-06)
  // ===========================================================================
  router.get('/api/v1/directory/bootstrap', requireAuth, async (req, res) => {
    const cacheKey = buildCacheKey('bootstrap', req.user, req.query);
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(200, cached);
      return;
    }

    const allAccounts = directoryProfiles(req.dbSnapshot.directory);
    const workspace = buildTaskWorkspace(req.dbSnapshot.directory, req.user, allAccounts);
    const rawPayload = {
      accounts: allAccounts,
      departmentNavigation: req.dbSnapshot.directory.departmentNavigation || {},
      tasks: workspace.tasks,
      allTasksSummary: workspace.allTasksSummary,
      reminders: workspace.reminders,
      fileNames: workspace.fileNames,
    };
    const safePayload = sanitizeBootstrapForActor(rawPayload, req.user, allAccounts);
    await setCache(cacheKey, safePayload);
    res.setHeader('X-Cache', 'MISS');
    res.json(200, safePayload);
  });

  router.post('/api/v1/directory/accounts', requireAuth, requireExecutive, async (req, res) => {
    const nextDir = await withDatabaseTransaction(async dbState => {
      dbState.directory = await applyDirectoryAction(
        dbState.directory,
        req.user.id,
        'create-account',
        req.body || {}
      );
      return dbState.directory;
    });
    await invalidateCacheNamespaces(['bootstrap', 'tasks', 'reminders', 'data-entry']);
    res.setHeader('X-Cache-Invalidated', 'true');

    const accounts = directoryProfiles(nextDir);
    const ws = buildTaskWorkspace(nextDir, req.user, accounts);
    const freshBootstrap = sanitizeBootstrapForActor(
      {
        accounts,
        departmentNavigation: nextDir.departmentNavigation || {},
        tasks: ws.tasks,
        allTasksSummary: ws.allTasksSummary,
        reminders: nextDir.reminders || [],
        fileNames: ws.fileNames,
      },
      req.user,
      accounts
    );
    await setCache(buildCacheKey('bootstrap', req.user), freshBootstrap);

    res.json(201, {
      status: 'ok',
      message: 'Đã tạo tài khoản nhân sự mới.',
      accounts: freshBootstrap.accounts,
      account: accounts.at(-1),
      directory: freshBootstrap,
    });
  });

  router.patch(
    '/api/v1/directory/accounts/:id',
    requireAuth,
    requireExecutive,
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'update-account',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['*']);
      res.setHeader('X-Cache-Invalidated', 'true');

      const accounts = directoryProfiles(nextDir);
      const ws = buildTaskWorkspace(nextDir, req.user, accounts);
      const freshBootstrap = sanitizeBootstrapForActor(
        {
          accounts,
          departmentNavigation: nextDir.departmentNavigation || {},
          tasks: ws.tasks,
          allTasksSummary: ws.allTasksSummary,
          reminders: nextDir.reminders || [],
          fileNames: ws.fileNames,
        },
        req.user,
        accounts
      );
      await setCache(buildCacheKey('bootstrap', req.user), freshBootstrap);

      res.json(200, {
        status: 'ok',
        message: 'Đã cập nhật thông tin tài khoản.',
        accounts: freshBootstrap.accounts,
        account: accounts.find(a => a.id === req.params.id),
        directory: freshBootstrap,
      });
    }
  );

  router.post(
    '/api/v1/directory/accounts/:id/status',
    requireAuth,
    requireExecutive,
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'set-account-status',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['*']);
      res.setHeader('X-Cache-Invalidated', 'true');

      const accounts = directoryProfiles(nextDir);
      const ws = buildTaskWorkspace(nextDir, req.user, accounts);
      const freshBootstrap = sanitizeBootstrapForActor(
        {
          accounts,
          departmentNavigation: nextDir.departmentNavigation || {},
          tasks: ws.tasks,
          allTasksSummary: ws.allTasksSummary,
          reminders: nextDir.reminders || [],
          fileNames: ws.fileNames,
        },
        req.user,
        accounts
      );
      await setCache(buildCacheKey('bootstrap', req.user), freshBootstrap);

      res.json(200, {
        status: 'ok',
        message: 'Đã cập nhật trạng thái tài khoản.',
        accounts: freshBootstrap.accounts,
        account: accounts.find(a => a.id === req.params.id),
        directory: freshBootstrap,
      });
    }
  );

  router.put(
    '/api/v1/directory/departments/:role/navigation',
    requireAuth,
    requireExecutive,
    async (req, res) => {
      const payload = {
        role: req.params.role,
        navigation: req.body?.navigation,
      };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'apply-department-navigation',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['*']);
      res.setHeader('X-Cache-Invalidated', 'true');

      const accounts = directoryProfiles(nextDir);
      const ws = buildTaskWorkspace(nextDir, req.user, accounts);
      const freshBootstrap = sanitizeBootstrapForActor(
        {
          accounts,
          departmentNavigation: nextDir.departmentNavigation || {},
          tasks: ws.tasks,
          allTasksSummary: ws.allTasksSummary,
          reminders: nextDir.reminders || [],
          fileNames: ws.fileNames,
        },
        req.user,
        accounts
      );
      await setCache(buildCacheKey('bootstrap', req.user), freshBootstrap);

      res.json(200, {
        status: 'ok',
        message: 'Đã áp dụng quyền điều hướng cho toàn bộ phòng ban.',
        departmentNavigation: nextDir.departmentNavigation,
        accounts: freshBootstrap.accounts,
        directory: freshBootstrap,
      });
    }
  );

  // ===========================================================================
  // 3. DASHBOARD OVERVIEW & RED ALERT ITALIC STATUS LINE (UC-07 & UC-08)
  // ===========================================================================
  router.get(
    '/api/v1/dashboard/summary',
    requireAuth,
    requirePermission('dashboard.read'),
    async (req, res) => {
      if (req.query.previousSection) {
        await evictUserPageCache(req.user.id, { section: req.query.previousSection });
      }
      const cacheKey = buildCacheKey('dashboard', req.user, req.query);
      const cached = await getCache(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(200, cached);
        return;
      }

      const summary = buildDashboardSummary(req.dbSnapshot, req.user, {
        reportDate: req.query.reportDate,
        category: req.query.category,
        origin: req.query.origin,
        search: req.query.search,
        includeWarnings: req.query.includeWarnings === 'true',
        periodMode: req.query.periodMode || 'month',
      });
      await setCache(cacheKey, summary);
      res.setHeader('X-Cache', 'MISS');
      res.json(200, summary);
    }
  );

  router.post('/api/v1/operations/alerts/resolve-status', requireAuth, async (req, res) => {
    const { alertRef, alertRefs, reportDate } = req.body || {};
    const accounts = sanitizeAccountsForActor(
      directoryProfiles(req.dbSnapshot.directory),
      req.user
    );
    const tasks = req.dbSnapshot.directory?.tasks || [];
    const reminders = req.dbSnapshot.directory?.reminders || [];
    const today = reportDate || businessToday();

    if (Array.isArray(alertRefs)) {
      const results = alertRefs.map(ref =>
        resolveAlertAssignmentInfo(ref, tasks, accounts, reminders, today)
      );
      res.json(200, { results });
      return;
    }

    const info = resolveAlertAssignmentInfo(alertRef, tasks, accounts, reminders, today);
    res.json(200, info);
  });

  // ===========================================================================
  // 4. PURCHASE ORDERS & PROGRESS TRACKING WITH PROGRESSIVE PAGINATION (UC-09 & UC-10)
  // ===========================================================================
  const handleGetOrders = async (req, res) => {
    if (req.query.previousPage || req.query.previousSection) {
      await evictUserPageCache(req.user.id, {
        section: req.query.previousSection || 'orders',
        page: req.query.previousPage,
      });
    }
    const cacheKey = buildCacheKey('orders', req.user, req.query);
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(200, cached);
      return;
    }

    const data = listClassifiedOrders(req.dbSnapshot, {
      reportDate: req.query.reportDate,
      category: req.query.category,
      origin: req.query.origin,
      search: req.query.search,
      fulfillmentFilter: req.query.filter,
      onlyRedAlerts: req.query.onlyRedAlerts === 'true',
    });
    const paginated = paginateCollection(data.items, req.query, { defaultLimit: 15 });
    const payload = {
      ...data,
      items: paginated.items,
      pagination: paginated.pagination,
    };
    await setCache(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json(200, payload);
  };

  router.get(
    '/api/v1/orders/items',
    requireAuth,
    requirePermission('orders.read'),
    requireSectionAccess('orders'),
    handleGetOrders
  );
  router.get(
    '/api/v1/orders/pos',
    requireAuth,
    requirePermission('orders.read'),
    requireSectionAccess('orders'),
    handleGetOrders
  );

  router.post(
    '/api/v1/orders/items/:rowId/preview-progress',
    requireAuth,
    requirePermission('orders.read'),
    requireSectionAccess('orders'),
    async (req, res) => {
      const rowId = Number(req.params.rowId);
      const item = (req.dbSnapshot.orders || []).find(r => Number(r.rowId) === rowId);
      if (!item) {
        throw new AppError('Không tìm thấy dòng đơn hàng PO.', 404, 'PO_NOT_FOUND');
      }
      const preview = computeProjectedProgress(item, req.body || {});
      res.json(200, preview);
    }
  );

  const handlePatchOrderProgress = async (req, res) => {
    const updatedItem = await withDatabaseTransaction(async dbState => {
      return updateOrderProgressInState(dbState, req.user, req.params.rowId, req.body || {});
    });
    await invalidateCacheNamespaces(['orders', 'dashboard', 'finance', 'data-entry']);
    res.setHeader('X-Cache-Invalidated', 'true');
    res.json(200, {
      status: 'ok',
      message: 'Đã lưu cập nhật tiến độ đơn hàng PO.',
      item: updatedItem,
    });
  };

  router.patch(
    '/api/v1/orders/items/:rowId/progress',
    requireAuth,
    requirePermission('orders.update'),
    requireSectionAccess('orders'),
    handlePatchOrderProgress
  );
  router.patch(
    '/api/v1/operations/progress/:rowId',
    requireAuth,
    requirePermission('orders.update'),
    requireSectionAccess('orders'),
    handlePatchOrderProgress
  );

  // ===========================================================================
  // 5. FINANCE: REVENUE, AR, RECEIPTS, ALLOCATIONS, AP, SPLIT, REVIEW & PAYMENTS (UC-11 to UC-19)
  // ===========================================================================
  router.get('/api/v1/finance/state', requireAuth, async (req, res) => {
    if (req.query.previousSection) {
      await evictUserPageCache(req.user.id, { section: req.query.previousSection });
    }
    const cacheKey = buildCacheKey('finance', req.user, req.query);
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(200, cached);
      return;
    }

    const rawSnapshot = buildFinanceSnapshot(req.dbSnapshot, {
      reportDate: req.query.reportDate,
      debtFilter: req.query.debtFilter,
      payableWorkflowFilter: req.query.payableWorkflowFilter,
      periodMode: req.query.periodMode,
    });
    const safeSnapshot = sanitizeFinanceSnapshotForActor(rawSnapshot, req.user);
    await setCache(cacheKey, safeSnapshot);
    res.setHeader('X-Cache', 'MISS');
    res.json(200, safeSnapshot);
  });

  router.get(
    '/api/v1/finance/revenue',
    requireAuth,
    requirePermission('revenue.read'),
    requireSectionAccess('revenue'),
    async (req, res) => {
      if (req.query.previousPage || req.query.previousSection) {
        await evictUserPageCache(req.user.id, {
          section: req.query.previousSection || 'revenue',
          page: req.query.previousPage,
        });
      }
      const cacheKey = buildCacheKey('finance', req.user, {
        sub: 'revenue',
        ...req.query,
      });
      const cached = await getCache(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(200, cached);
        return;
      }

      const snapshot = buildFinanceSnapshot(req.dbSnapshot, { reportDate: req.query.reportDate });
      const paginated = paginateCollection(snapshot.revenue, req.query, { defaultLimit: 15 });
      const payload = {
        revision: snapshot.revision,
        revenue: paginated.items,
        pagination: paginated.pagination,
        monthlyRevenue: snapshot.monthlyRevenue,
        profitability: snapshot.profitability,
      };
      await setCache(cacheKey, payload);
      res.setHeader('X-Cache', 'MISS');
      res.json(200, payload);
    }
  );

  router.get(
    '/api/v1/finance/receivables',
    requireAuth,
    requirePermission('receivables.read'),
    requireSectionAccess('receivables'),
    async (req, res) => {
      if (req.query.previousPage || req.query.previousSection) {
        await evictUserPageCache(req.user.id, {
          section: req.query.previousSection || 'receivables',
          page: req.query.previousPage,
        });
      }
      const cacheKey = buildCacheKey('finance', req.user, {
        sub: 'receivables',
        ...req.query,
      });
      const cached = await getCache(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(200, cached);
        return;
      }

      const snapshot = buildFinanceSnapshot(req.dbSnapshot, {
        reportDate: req.query.reportDate,
        debtFilter: req.query.debtFilter,
      });
      const paginated = paginateCollection(snapshot.receivables, req.query, { defaultLimit: 15 });
      const payload = {
        revision: snapshot.revision,
        receivables: paginated.items,
        pagination: paginated.pagination,
        receipts: snapshot.receipts,
        allocations: snapshot.allocations,
        unallocatedCash: snapshot.unallocatedCash,
        summary: snapshot.receivablesSummary,
      };
      await setCache(cacheKey, payload);
      res.setHeader('X-Cache', 'MISS');
      res.json(200, payload);
    }
  );

  router.get(
    '/api/v1/finance/payables',
    requireAuth,
    requirePermission('payables.read'),
    requireSectionAccess('payables'),
    async (req, res) => {
      if (req.query.previousPage || req.query.previousSection) {
        await evictUserPageCache(req.user.id, {
          section: req.query.previousSection || 'payables',
          page: req.query.previousPage,
        });
      }
      const cacheKey = buildCacheKey('finance', req.user, {
        sub: 'payables',
        ...req.query,
      });
      const cached = await getCache(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(200, cached);
        return;
      }

      const snapshot = buildFinanceSnapshot(req.dbSnapshot, {
        reportDate: req.query.reportDate,
        debtFilter: req.query.debtFilter,
        payableWorkflowFilter: req.query.payableWorkflowFilter,
      });
      const paginated = paginateCollection(snapshot.payables, req.query, { defaultLimit: 15 });
      const payload = {
        revision: snapshot.revision,
        payables: paginated.items,
        pagination: paginated.pagination,
        payments: snapshot.payments,
        payableSplitSources: snapshot.payableSplitSources,
        summary: snapshot.payablesSummary,
      };
      await setCache(cacheKey, payload);
      res.setHeader('X-Cache', 'MISS');
      res.json(200, payload);
    }
  );

  router.get('/api/v1/admin/audit-logs', requireAuth, async (req, res) => {
    const safeFinance = sanitizeFinanceSnapshotForActor(req.dbSnapshot.finance, req.user);
    const paginated = paginateCollection(safeFinance.audit, req.query, { defaultLimit: 25 });
    res.json(200, {
      revision: req.dbSnapshot.finance.revision,
      audit: paginated.items,
      pagination: paginated.pagination,
    });
  });

  // UC-11: Ghi nhận Hóa đơn Doanh thu & Sinh tự động Phải thu (AR)
  router.post(
    '/api/v1/finance/invoices',
    requireAuth,
    requirePermission('revenue.create'),
    requireSectionAccess('revenue'),
    async (req, res) => {
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'record-invoice', req.body || {});
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(201, {
        status: 'ok',
        message: 'Đã ghi nhận hóa đơn doanh thu và sinh khoản phải thu AR tương ứng.',
        revision: nextFinance.revision,
        invoice: nextFinance.revenue.at(-1),
        receivable: safeFinance.receivables.at(-1) || null,
        finance: safeFinance,
      });
    }
  );

  // UC-12 & UC-13: Ghi nhận Khoản thu Ngân hàng & Đối soát Khách hàng
  router.post(
    '/api/v1/finance/receipts',
    requireAuth,
    requirePermission('receivables.allocate'),
    requireSectionAccess('receivables'),
    async (req, res) => {
      const isUpdate = Boolean(req.body?.id);
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'save-receipt', req.body || {});
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const receipt = isUpdate
        ? nextFinance.receipts.find(r => r.id === req.body.id)
        : nextFinance.receipts.at(-1);
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(isUpdate ? 200 : 201, {
        status: 'ok',
        message: isUpdate
          ? 'Đã cập nhật đối soát khoản thu ngân hàng.'
          : 'Đã ghi nhận khoản thu ngân hàng mới.',
        revision: nextFinance.revision,
        receipt,
        finance: safeFinance,
      });
    }
  );

  // UC-14: Phân bổ Tiền thu vào Hóa đơn Công nợ Phải thu (AR)
  router.post(
    '/api/v1/finance/allocations',
    requireAuth,
    requirePermission('receivables.allocate'),
    requireSectionAccess('receivables'),
    async (req, res) => {
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'allocate-receipt', req.body || {});
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(201, {
        status: 'ok',
        message: 'Đã phân bổ tiền thu vào hóa đơn phải thu AR.',
        revision: nextFinance.revision,
        allocation: nextFinance.allocations.at(-1),
        finance: safeFinance,
      });
    }
  );

  // UC-15: Ghi nhận Chứng từ Công nợ Phải trả (AP) theo dòng PO
  router.post(
    '/api/v1/finance/payables',
    requireAuth,
    requirePermission('payables.submit'),
    requireSectionAccess('payables'),
    async (req, res) => {
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'record-payable', req.body || {});
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(201, {
        status: 'ok',
        message: 'Đã ghi nhận chứng từ công nợ phải trả AP.',
        revision: nextFinance.revision,
        payable: nextFinance.payables.at(-1),
        finance: safeFinance,
      });
    }
  );

  // UC-16: Tách Chứng từ Phải trả Gộp nhiều Nhà cung cấp
  router.post(
    '/api/v1/finance/payables/:id/split',
    requireAuth,
    requirePermission('payables.submit'),
    requirePermission('orders.read'),
    requireSectionAccess('payables'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'split-payable', payload);
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(200, {
        status: 'ok',
        message: 'Đã tách chứng từ phải trả gộp thành các chứng từ riêng cho từng nhà cung cấp.',
        revision: nextFinance.revision,
        finance: safeFinance,
      });
    }
  );

  // UC-17: Lập Đề nghị Duyệt chi Công nợ Phải trả (AP)
  router.post(
    '/api/v1/finance/payables/:id/submit',
    requireAuth,
    requirePermission('payables.submit'),
    requireSectionAccess('payables'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'submit-payable', payload);
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(200, {
        status: 'ok',
        message: 'Đã trình đề nghị duyệt chi công nợ phải trả.',
        revision: nextFinance.revision,
        payable: nextFinance.payables.find(p => p.id === req.params.id),
        finance: safeFinance,
      });
    }
  );

  // UC-18: Phê duyệt hoặc Yêu cầu Bổ sung Đề nghị Chi (AP) — CEO & Admin
  router.post(
    '/api/v1/finance/payables/:id/review',
    requireAuth,
    requirePermission('payables.approve'),
    requireSectionAccess('payables'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'review-payable', payload);
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(200, {
        status: 'ok',
        message: payload.approve
          ? 'Đã phê duyệt đề nghị chi công nợ phải trả.'
          : 'Đã trả lại đề nghị chi để yêu cầu bổ sung.',
        revision: nextFinance.revision,
        payable: nextFinance.payables.find(p => p.id === req.params.id),
        finance: safeFinance,
      });
    }
  );

  // UC-19: Ghi nhận Khoản Thực chi cho Nhà cung cấp
  router.post(
    '/api/v1/finance/payables/:id/payments',
    requireAuth,
    requirePermission('payables.record-payment'),
    requireSectionAccess('payables'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextFinance = await withDatabaseTransaction(async dbState => {
        return applyFinanceOperation(dbState, req.user, 'record-payable-payment', payload);
      });
      await invalidateCacheNamespaces(['finance', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const safeFinance = sanitizeFinanceSnapshotForActor(nextFinance, req.user);
      res.json(201, {
        status: 'ok',
        message: 'Đã ghi nhận bút toán thực chi cho nhà cung cấp.',
        revision: nextFinance.revision,
        payment: nextFinance.payments.at(-1),
        payable: nextFinance.payables.find(p => p.id === req.params.id),
        finance: safeFinance,
      });
    }
  );

  // ===========================================================================
  // 6. OPERATIONS: TASKS, HANDOVER, PRIVATE FILES & REMINDERS (UC-20 to UC-25)
  // ===========================================================================
  router.get('/api/v1/operations/tasks', requireAuth, async (req, res) => {
    if (req.query.previousPage || req.query.previousSection) {
      await evictUserPageCache(req.user.id, {
        section: req.query.previousSection || 'tasks',
        page: req.query.previousPage,
      });
    }
    const cacheKey = buildCacheKey('tasks', req.user, req.query);
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(200, cached);
      return;
    }

    const accounts = directoryProfiles(req.dbSnapshot.directory);
    const workspace = buildTaskWorkspace(req.dbSnapshot.directory, req.user, accounts);
    const filtered = filterTaskRows(workspace.tasks, {
      statusFilter: req.query.statusFilter || 'all',
      searchQuery: req.query.search || '',
      assigneeFilter: req.query.assigneeFilter || 'all',
      deadlineFilter: req.query.deadlineFilter || 'all',
      accounts,
      today: req.query.today || businessToday(),
    });
    const safeBootstrap = sanitizeBootstrapForActor(
      {
        accounts,
        departmentNavigation: req.dbSnapshot.directory.departmentNavigation || {},
        tasks: filtered,
        allTasksSummary: workspace.allTasksSummary,
        reminders: workspace.reminders,
        fileNames: workspace.fileNames,
      },
      req.user,
      accounts
    );
    const paginated = paginateCollection(safeBootstrap.tasks, req.query, { defaultLimit: 15 });
    const payload = {
      tasks: paginated.items,
      pagination: paginated.pagination,
      fileNames: safeBootstrap.fileNames,
      reminders: safeBootstrap.reminders,
      allTasksSummary: safeBootstrap.allTasksSummary,
    };
    await setCache(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json(200, payload);
  });

  // UC-20: Giao việc mới (Cho 1 Nhân viên hoặc Toàn bộ Phòng ban)
  router.post(
    '/api/v1/operations/tasks',
    requireAuth,
    requirePermission('tasks.assign'),
    async (req, res) => {
      const beforeCount = req.dbSnapshot.directory.tasks.length;
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'create-task',
          req.body || {}
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'tasks', 'reminders', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');

      const createdTasks = nextDir.tasks.slice(beforeCount);
      const accounts = directoryProfiles(nextDir);
      const ws = buildTaskWorkspace(nextDir, req.user, accounts);
      res.json(201, {
        status: 'ok',
        message: 'Đã giao việc thành công.',
        createdTasks,
        tasks: ws.tasks,
        reminders: nextDir.reminders,
        fileNames: ws.fileNames,
      });
    }
  );

  // UC-21: Tiếp nhận Công việc (accept)
  router.post(
    '/api/v1/operations/tasks/:id/accept',
    requireAuth,
    requirePermission('tasks.handover'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'accept',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'tasks', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const workspace = buildTaskWorkspace(nextDir, req.user);
      res.json(200, {
        status: 'ok',
        message: 'Đã tiếp nhận công việc.',
        task: workspace.tasks.find(t => t.id === req.params.id),
      });
    }
  );

  // UC-21b: Lưu nháp tự động nội dung bàn giao theo tài khoản & mã việc
  router.get('/api/v1/operations/tasks/:id/draft', requireAuth, async (req, res) => {
    const key = `${req.user.id}:${req.params.id}`;
    const note = req.dbSnapshot.directory.handoverDrafts?.[key] || '';
    res.json(200, { taskId: req.params.id, note });
  });

  router.put('/api/v1/operations/tasks/:id/draft', requireAuth, async (req, res) => {
    const key = `${req.user.id}:${req.params.id}`;
    const note = String(req.body?.note ?? '');
    await withDatabaseTransaction(async dbState => {
      dbState.directory.handoverDrafts ||= {};
      if (!note.trim()) delete dbState.directory.handoverDrafts[key];
      else dbState.directory.handoverDrafts[key] = note.slice(0, 1000);
    });
    res.json(200, { status: 'ok', taskId: req.params.id, note });
  });

  router.delete('/api/v1/operations/tasks/:id/draft', requireAuth, async (req, res) => {
    const key = `${req.user.id}:${req.params.id}`;
    await withDatabaseTransaction(async dbState => {
      if (dbState.directory.handoverDrafts) {
        delete dbState.directory.handoverDrafts[key];
      }
    });
    res.json(200, { status: 'ok', taskId: req.params.id, note: '' });
  });

  // UC-22: Nộp kết quả bàn giao kèm Tệp đính kèm (handover)
  router.post(
    '/api/v1/operations/tasks/:id/handover',
    requireAuth,
    requirePermission('tasks.handover'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'handover',
          payload
        );
        if (dbState.directory.handoverDrafts) {
          delete dbState.directory.handoverDrafts[`${req.user.id}:${req.params.id}`];
        }
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'tasks', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const workspace = buildTaskWorkspace(nextDir, req.user);
      res.json(200, {
        status: 'ok',
        message: 'Đã gửi kết quả bàn giao công việc.',
        task: workspace.tasks.find(t => t.id === req.params.id),
        fileNames: workspace.fileNames,
      });
    }
  );

  // UC-23: Duyệt hoàn thành hoặc Đánh dấu Không đạt yêu cầu công việc (confirm)
  router.post(
    '/api/v1/operations/tasks/:id/confirm',
    requireAuth,
    requirePermission('tasks.confirm'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'confirm',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'tasks', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const workspace = buildTaskWorkspace(nextDir, req.user);
      res.json(200, {
        status: 'ok',
        message: payload.approve
          ? 'Đã chấp nhận hoàn thành công việc.'
          : 'Đã trả lại công việc với trạng thái Không đạt yêu cầu.',
        task: workspace.tasks.find(t => t.id === req.params.id),
      });
    }
  );

  // UC-24a: Đổi người phụ trách / Gia hạn hạn hoàn thành (assign)
  router.post(
    '/api/v1/operations/tasks/:id/assign',
    requireAuth,
    requirePermission('tasks.assign'),
    async (req, res) => {
      const payload = { ...(req.body || {}), id: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'assign',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'tasks', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const workspace = buildTaskWorkspace(nextDir, req.user);
      res.json(200, {
        status: 'ok',
        message: 'Đã cập nhật phân công công việc.',
        task: workspace.tasks.find(t => t.id === req.params.id),
      });
    }
  );

  // UC-24b: Bình luận trao đổi trong công việc (comment-task)
  router.post('/api/v1/operations/tasks/:id/comments', requireAuth, async (req, res) => {
    const payload = { ...(req.body || {}), id: req.params.id };
    const nextDir = await withDatabaseTransaction(async dbState => {
      dbState.directory = await applyDirectoryAction(
        dbState.directory,
        req.user.id,
        'comment-task',
        payload
      );
      return dbState.directory;
    });
    await invalidateCacheNamespaces(['bootstrap', 'tasks']);
    res.setHeader('X-Cache-Invalidated', 'true');
    const workspace = buildTaskWorkspace(nextDir, req.user);
    res.json(201, {
      status: 'ok',
      message: 'Đã thêm bình luận công việc.',
      task: workspace.tasks.find(t => t.id === req.params.id),
    });
  });

  // Tải tệp đính kèm công việc có kiểm soát quyền riêng tư (Private Task Attachments)
  router.get('/api/v1/operations/tasks/:id/files/:fileId', requireAuth, async (req, res) => {
    const attachment = getTaskAttachment(
      req.dbSnapshot.directory,
      req.user.id,
      req.params.id,
      req.params.fileId
    );
    res.json(200, {
      status: 'ok',
      file: attachment,
    });
  });

  // UC-25: Nhắc việc Cảnh báo đỏ & Admin/CEO Giao việc Nhanh kèm Note
  router.get('/api/v1/operations/reminders', requireAuth, async (req, res) => {
    if (req.query.previousPage || req.query.previousSection) {
      await evictUserPageCache(req.user.id, {
        section: req.query.previousSection || 'reminders',
        page: req.query.previousPage,
      });
    }
    const cacheKey = buildCacheKey('reminders', req.user, req.query);
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(200, cached);
      return;
    }

    const allAccounts = directoryProfiles(req.dbSnapshot.directory);
    const safeBootstrap = sanitizeBootstrapForActor(
      {
        accounts: allAccounts,
        departmentNavigation: req.dbSnapshot.directory.departmentNavigation || {},
        tasks: [],
        allTasksSummary: [],
        reminders: req.dbSnapshot.directory.reminders || [],
        fileNames: {},
      },
      req.user,
      allAccounts
    );
    const paginated = paginateCollection(safeBootstrap.reminders, req.query, { defaultLimit: 15 });
    const payload = {
      reminders: paginated.items,
      pagination: paginated.pagination,
    };
    await setCache(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json(200, payload);
  });

  router.post('/api/v1/operations/reminders', requireAuth, async (req, res) => {
    const nextDir = await withDatabaseTransaction(async dbState => {
      dbState.directory = await applyDirectoryAction(
        dbState.directory,
        req.user.id,
        'create-reminder',
        req.body || {}
      );
      return dbState.directory;
    });
    await invalidateCacheNamespaces(['bootstrap', 'reminders', 'dashboard']);
    res.setHeader('X-Cache-Invalidated', 'true');
    res.json(201, {
      status: 'ok',
      message: 'Đã gửi nhắc việc đến CEO và Admin.',
      reminders: nextDir.reminders,
      reminder: nextDir.reminders[0],
    });
  });

  router.post(
    '/api/v1/operations/reminders/:id/quick-assign',
    requireAuth,
    requireExecutive,
    async (req, res) => {
      const payload = { ...(req.body || {}), reminderId: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'quick-assign-reminder',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'tasks', 'reminders', 'dashboard', 'data-entry']);
      res.setHeader('X-Cache-Invalidated', 'true');
      const updatedReminder = nextDir.reminders.find(r => r.id === req.params.id);
      const createdTasks = nextDir.tasks.filter(t =>
        (updatedReminder?.assignedTaskIds || []).includes(t.id)
      );
      res.json(200, {
        status: 'ok',
        message: 'Đã giao việc nhanh và cập nhật trạng thái cảnh báo đỏ.',
        reminder: updatedReminder,
        createdTasks,
        reminders: nextDir.reminders,
      });
    }
  );

  router.post(
    '/api/v1/operations/reminders/:id/dismiss',
    requireAuth,
    requireExecutive,
    async (req, res) => {
      const payload = { ...(req.body || {}), reminderId: req.params.id };
      const nextDir = await withDatabaseTransaction(async dbState => {
        dbState.directory = await applyDirectoryAction(
          dbState.directory,
          req.user.id,
          'dismiss-reminder',
          payload
        );
        return dbState.directory;
      });
      await invalidateCacheNamespaces(['bootstrap', 'reminders', 'dashboard']);
      res.setHeader('X-Cache-Invalidated', 'true');
      res.json(200, {
        status: 'ok',
        message: 'Đã đánh dấu nhắc việc là Đã xử lý.',
        reminder: nextDir.reminders.find(r => r.id === req.params.id),
        reminders: nextDir.reminders,
      });
    }
  );

  // ===========================================================================
  // 7. EXCEL / GRID BATCH DATA ENTRY WITH PROGRESSIVE PAGINATION (UC-26)
  // ===========================================================================
  router.get('/api/v1/data-entry/sheets', requireAuth, async (req, res) => {
    const sheets = ENTRY_SHEETS.filter(sheet => canReadSheet(req.user, sheet));
    res.json(200, { sheets });
  });

  router.get('/api/v1/data-entry/sheets/:sheetId/rows', requireAuth, async (req, res) => {
    const sheet = ENTRY_SHEETS.find(s => s.id === req.params.sheetId);
    if (!sheet) {
      throw new AppError('Không tìm thấy bảng dữ liệu.', 404, 'SHEET_NOT_FOUND');
    }
    if (!canReadSheet(req.user, sheet)) {
      throw new AppError(
        'Bạn không có quyền truy cập bảng dữ liệu này.',
        403,
        'FORBIDDEN_SHEET_READ'
      );
    }

    if (req.query.previousPage || req.query.previousSheetId) {
      await evictUserPageCache(req.user.id, {
        section: 'data-entry',
        page: req.query.previousPage,
      });
    }

    const cacheKey = buildCacheKey('data-entry', req.user, {
      sheetId: sheet.id,
      search: req.query.search || '',
      page: req.query.page,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(200, cached);
      return;
    }

    const rows = readEntryRows(sheet, req.user, {
      items: req.dbSnapshot.orders,
      finance: req.dbSnapshot.finance,
      directory: req.dbSnapshot.directory,
    });
    const q = String(req.query.search || '').trim().toLowerCase();
    const filteredRows = q
      ? rows.filter(row =>
          Object.values(row).some(val => String(val ?? '').toLowerCase().includes(q))
        )
      : rows;
    const paginated = paginateCollection(filteredRows, req.query, { defaultLimit: 20 });
    const payload = {
      sheetId: sheet.id,
      rows: paginated.items,
      pagination: paginated.pagination,
    };
    await setCache(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json(200, payload);
  });

  router.post('/api/v1/data-entry/sheets/:sheetId/inspect-cell', requireAuth, async (req, res) => {
    const { columnKey, rawValue, rowValues } = req.body || {};
    const result = inspectEntryCell(columnKey, rawValue, rowValues);
    res.json(200, result);
  });

  router.post('/api/v1/data-entry/sheets/:sheetId/batch', requireAuth, async (req, res) => {
    const { drafts, orderBaseline, now } = req.body || {};
    const result = await withDatabaseTransaction(async dbState => {
      return processEntryBatchInState(dbState, req.user.id, req.params.sheetId, drafts, {
        now: now ? new Date(now) : new Date(),
        orderBaseline,
      });
    });

    if (result.issues?.length) {
      res.json(422, {
        status: 'validation_failed',
        message: 'Có dòng dữ liệu chưa hợp lệ. Toàn bộ lô nhập chưa được lưu để bạn kiểm tra và sửa lại.',
        issues: result.issues,
        ...(result.warnings ? { warnings: result.warnings } : {}),
      });
      return;
    }

    await invalidateCacheNamespaces(['*']);
    res.setHeader('X-Cache-Invalidated', 'true');

    const safeFinance = result.finance
      ? sanitizeFinanceSnapshotForActor(result.finance, req.user)
      : undefined;
    const allAccounts = result.directory ? directoryProfiles(result.directory) : [];
    const safeDirectory = result.directory
      ? sanitizeBootstrapForActor(
          {
            accounts: allAccounts,
            departmentNavigation: result.directory.departmentNavigation || {},
            tasks: buildTaskWorkspace(result.directory, req.user, allAccounts).tasks,
            allTasksSummary: buildTaskWorkspace(result.directory, req.user, allAccounts)
              .allTasksSummary,
            reminders: result.directory.reminders || [],
            fileNames: buildTaskWorkspace(result.directory, req.user, allAccounts).fileNames,
          },
          req.user,
          allAccounts
        )
      : undefined;

    res.json(200, {
      status: 'ok',
      message: 'Đã lưu toàn bộ lô dữ liệu thành công.',
      ...result,
      ...(safeFinance ? { finance: safeFinance } : {}),
      ...(safeDirectory ? { directory: safeDirectory } : {}),
    });
  });

  // ===========================================================================
  // 8. TESTING RESET ENDPOINT (STRICTLY LOCKED OUTSIDE EXPLICIT TEST RUNNER)
  // ===========================================================================
  router.post('/api/v1/testing/reset', async (_req, res) => {
    if (process.env.NODE_ENV !== 'test' || process.env.ALLOW_TEST_RESET !== 'true') {
      throw new AppError(
        '403: Đường dẫn khởi tạo lại dữ liệu kiểm thử đã bị khóa vì lý do bảo mật.',
        403,
        'TEST_RESET_DISABLED'
      );
    }
    resetSecurityCounters();
    const state = await resetDatabaseToSeed();
    res.json(200, {
      status: 'ok',
      message: 'Đã khôi phục dữ liệu kiểm thử.',
      ordersCount: state.orders.length,
    });
  });

  return router;
}
