import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/env.js';
import { formatBusinessDate, dateInputValue } from '../utils/business.js';
import { MOCK_ACCOUNTS, SEED_CREDENTIALS } from './seedData.js';
import { ROLE_PROFILES } from '../utils/roles.js';

let pgPool = null;

/**
 * Khởi tạo kết nối Pool tới PostgreSQL (sử dụng thư viện 'pg').
 * Hỗ trợ đầy đủ Connection String (DATABASE_URL) hoặc cấu hình PGHOST/PGPORT/PGUSER/PGDATABASE.
 */
export async function getPostgresPool() {
  if (pgPool) return pgPool;
  const pgModule = await import('pg');
  const Pool = pgModule.default?.Pool || pgModule.Pool;
  const config = ENV.DATABASE_URL
    ? {
        connectionString: ENV.DATABASE_URL,
        max: ENV.PGPOOL_MAX,
        ssl: ENV.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      }
    : {
        host: ENV.PGHOST || 'localhost',
        port: ENV.PGPORT,
        user: ENV.PGUSER,
        password: ENV.PGPASSWORD,
        database: ENV.PGDATABASE,
        max: ENV.PGPOOL_MAX,
      };
  pgPool = new Pool(config);
  await pgPool.query("SET TIME ZONE 'Asia/Ho_Chi_Minh'");
  return pgPool;
}

export async function closePostgresPool() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

const toIsoDateOrNull = val => {
  if (!val || val === '—') return null;
  const iso = dateInputValue(val);
  return iso || null;
};

/**
 * Đọc toàn bộ trạng thái 15 bảng từ PostgreSQL trong một Transaction (hoặc Read Snapshot)
 * và ánh xạ sang cấu trúc Domain chuẩn của hệ thống.
 */
export async function loadStateFromPostgres(client) {
  const [
    sysRes,
    usersRes,
    deptNavRes,
    poRes,
    poHistRes,
    revRes,
    arRes,
    recRes,
    allocRes,
    apRes,
    payRes,
    audRes,
    tasksRes,
    taskFilesRes,
    taskIntRes,
    remRes,
    draftsRes,
  ] = await Promise.all([
    client.query('SELECT * FROM system_state WHERE id = 1'),
    client.query('SELECT * FROM users ORDER BY created_at ASC'),
    client.query('SELECT * FROM department_navigation'),
    client.query('SELECT * FROM purchase_orders ORDER BY row_id ASC'),
    client.query('SELECT * FROM po_tracking_history ORDER BY occurred_at ASC'),
    client.query('SELECT * FROM revenue_invoices ORDER BY created_at ASC'),
    client.query('SELECT * FROM accounts_receivable ORDER BY created_at ASC'),
    client.query('SELECT * FROM cash_receipts ORDER BY created_at ASC'),
    client.query('SELECT * FROM receipt_allocations ORDER BY created_at ASC'),
    client.query('SELECT * FROM accounts_payable ORDER BY created_at ASC'),
    client.query('SELECT * FROM payable_payments ORDER BY created_at ASC'),
    client.query('SELECT * FROM finance_audit_logs ORDER BY revision ASC, occurred_at ASC'),
    client.query('SELECT * FROM tasks ORDER BY created_at ASC'),
    client.query('SELECT * FROM task_files'),
    client.query('SELECT * FROM task_interactions ORDER BY created_at ASC'),
    client.query('SELECT * FROM work_reminders ORDER BY updated_at DESC'),
    client.query('SELECT * FROM task_handover_drafts'),
  ]);

  const sys = sysRes.rows[0] || {
    opening_date: '2026-10-17',
    finance_revision: 0,
    is_period_locked: false,
  };

  const accounts = {};
  const credentials = {};
  const tokenVersions = {};
  for (const u of usersRes.rows) {
    tokenVersions[u.id] = Number(u.token_version || 1);
    credentials[u.id] = JSON.stringify({
      salt: u.password_salt,
      verifier: u.password_hash,
      iterations: Number(u.password_iterations || 600000),
    });
    accounts[u.id] = {
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      role: u.role,
      status: u.status,
      title: u.title,
      department: u.department,
      employeeCode: u.employee_code,
      initials: u.initials,
      locale: u.locale,
      timezone: u.timezone,
      dataScope: u.data_scope,
      permissionDescription: u.permission_description,
      ...(u.navigation_json ? { navigation: u.navigation_json } : {}),
    };
  }

  const departmentNavigation = {};
  for (const row of deptNavRes.rows) {
    departmentNavigation[row.role] = row.navigation_json;
  }

  const histByPo = new Map();
  for (const h of poHistRes.rows) {
    const key = Number(h.po_row_id);
    if (!histByPo.has(key)) histByPo.set(key, []);
    histByPo.get(key).push({
      id: h.id,
      actorId: h.actor_id,
      actorName: h.actor_name,
      time: new Date(h.occurred_at).toISOString(),
      reason: h.reason,
      ...(h.before_json ? { before: h.before_json } : {}),
      ...(h.after_json ? { after: h.after_json } : {}),
    });
  }

  const orders = poRes.rows.map(r => ({
    rowId: Number(r.row_id),
    poId: r.po_id,
    vendorNo: r.vendor_no,
    vendorName: r.vendor_name,
    vendorItemNo: r.vendor_item_no,
    category: r.category,
    countryOfOrigin: r.country_of_origin,
    releasedPoDate: r.released_po_date ? formatBusinessDate(dateInputValue(r.released_po_date)) : '',
    inboundOnly: Boolean(r.inbound_only),
    unit: r.unit || '',
    orderedQty: r.ordered_qty === null ? null : Number(r.ordered_qty),
    unitPriceVnd: r.unit_price_vnd === null ? null : Number(r.unit_price_vnd),
    totalValueVnd: r.total_value_vnd === null ? null : Number(r.total_value_vnd),
    tonDau: Number(r.ton_dau || 0),
    nhap: r.nhap === null ? null : Number(r.nhap),
    deliveredQty: r.delivered_qty === null ? null : Number(r.delivered_qty),
    ban: r.ban === null ? null : Number(r.ban),
    onProcessPct: r.on_process_pct === null ? null : Number(r.on_process_pct),
    packagingPct: r.packaging_pct === null ? null : Number(r.packaging_pct),
    expectedReceiptDate: r.expected_receipt_date ? formatBusinessDate(dateInputValue(r.expected_receipt_date)) : '',
    shipDateEtd: r.ship_date_etd ? formatBusinessDate(dateInputValue(r.ship_date_etd)) : '',
    etaDate: r.eta_date ? formatBusinessDate(dateInputValue(r.eta_date)) : '',
    actualShipDate: r.actual_ship_date ? formatBusinessDate(dateInputValue(r.actual_ship_date)) : '',
    actualArrivalDate: r.actual_arrival_date ? formatBusinessDate(dateInputValue(r.actual_arrival_date)) : '',
    actualDeliveryDate: r.actual_delivery_date ? formatBusinessDate(dateInputValue(r.actual_delivery_date)) : '',
    manualPriorityRank: Number(r.manual_priority_rank ?? 2),
    manualAlertReason: r.manual_alert_reason || '',
    alertLevel: r.alert_level || 'Đúng hạn',
    lastUpdateDate: r.last_update_date || '',
    lastUpdateTime: r.last_update_time || '',
    trackingVersion: r.tracking_version || null,
    trackingHistory: histByPo.get(Number(r.row_id)) || [],
  }));

  const revenue = revRes.rows.map(r => ({
    id: r.id,
    docNo: r.doc_no,
    poId: r.po_id,
    poLineId: r.po_line_id === null ? undefined : Number(r.po_line_id),
    customerName: r.customer_name,
    vendorName: r.vendor_name,
    sku: r.sku,
    category: r.category,
    currency: r.currency || 'VND',
    recordDate: formatBusinessDate(dateInputValue(r.record_date)),
    dueDate: formatBusinessDate(dateInputValue(r.due_date)),
    shippedQty: Number(r.shipped_qty),
    netRevenue: Number(r.net_revenue),
    cashCollected: Number(r.cash_collected),
    approvalStatus: r.approval_status,
    alertLevel: r.alert_level,
    priorityRank: Number(r.priority_rank ?? 2),
    basis: r.basis,
    statusNote: r.status_note || r.basis,
  }));

  const receivables = arRes.rows.map(r => ({
    id: r.id,
    docNo: r.doc_no,
    poId: r.po_id,
    poLineId: r.po_line_id === null ? undefined : Number(r.po_line_id),
    customerName: r.customer_name,
    vendorRef: r.vendor_ref,
    sku: r.sku,
    category: r.category,
    currency: r.currency || 'VND',
    dueDate: r.due_date ? formatBusinessDate(dateInputValue(r.due_date)) : '—',
    originalAmount: Number(r.original_amount),
    adjustment: Number(r.adjustment || 0),
    allocatedPaid: Number(r.allocated_paid || 0),
    remaining: Number(r.remaining),
    commitmentNote: r.commitment_note || '',
  }));

  const receipts = recRes.rows.map(r => ({
    id: r.id,
    reference: r.reference,
    customerName: r.customer_name,
    date: r.receipt_date ? formatBusinessDate(dateInputValue(r.receipt_date)) : '',
    amount: Number(r.amount),
    allocatedAmount: Number(r.allocated_amount || 0),
    currency: r.currency || 'VND',
    status: r.status,
  }));

  const allocations = allocRes.rows.map(r => ({
    id: r.id,
    ...(r.entry_reference ? { entryReference: r.entry_reference } : {}),
    receiptId: r.receipt_id,
    debtId: r.debt_id,
    docNo: r.doc_no,
    amount: Number(r.amount),
    date: formatBusinessDate(dateInputValue(r.allocation_date)),
  }));

  const payables = [];
  const payableSplitSources = [];
  for (const r of apRes.rows) {
    const mapped = {
      id: r.id,
      docNo: r.doc_no,
      vendorNo: r.vendor_no,
      supplierName: r.supplier_name,
      poId: r.po_id,
      ...(r.po_ids_json ? { poIds: r.po_ids_json } : {}),
      ...(r.po_line_id !== null ? { poLineId: Number(r.po_line_id) } : {}),
      sku: r.sku,
      category: r.category,
      currency: r.currency || 'VND',
      dueDate: r.due_date ? formatBusinessDate(dateInputValue(r.due_date)) : '—',
      originalAmount: Number(r.original_amount),
      adjustment: Number(r.adjustment || 0),
      allocatedPaid: Number(r.allocated_paid || 0),
      remaining: Number(r.remaining),
      approvalState: r.approval_state,
      approvalOrigin: r.approval_origin || 'workflow',
      approvedRemaining: Number(r.approved_remaining || 0),
      requestAmount: r.request_amount === null ? null : Number(r.request_amount),
      ...(r.requested_due_date ? { requestedDueDate: formatBusinessDate(dateInputValue(r.requested_due_date)) } : {}),
      ...(r.request_note ? { requestNote: r.request_note } : {}),
      ...(r.requested_by ? { requestedBy: r.requested_by } : {}),
      ...(r.reviewed_by ? { reviewedBy: r.reviewed_by } : {}),
      ...(r.reviewed_date ? { reviewedDate: formatBusinessDate(dateInputValue(r.reviewed_date)) } : {}),
      ...(r.reviewed_at ? { reviewedAt: new Date(r.reviewed_at).toISOString() } : {}),
      ...(r.review_note ? { reviewNote: r.review_note } : {}),
      ...(r.split_source_doc_no ? { splitSourceDocNo: r.split_source_doc_no } : {}),
      ...(r.split_into ? { splitInto: r.split_into } : {}),
      ...(r.pic ? { pic: r.pic } : {}),
    };
    if (r.is_archived_split_source) payableSplitSources.push(mapped);
    else payables.push(mapped);
  }

  const payments = payRes.rows.map(r => ({
    id: r.id,
    payableId: r.payable_id,
    docNo: r.doc_no,
    reference: r.reference,
    amount: Number(r.amount),
    date: formatBusinessDate(dateInputValue(r.paid_date)),
    approvedBy: r.approved_by,
  }));

  const audit = audRes.rows.map(r => ({
    id: r.id,
    type: r.event_type,
    reference: r.reference,
    actorId: r.actor_id,
    actorName: r.actor_name,
    occurredAt: new Date(r.occurred_at).toISOString(),
    detail: r.detail,
    amount: r.amount === null ? null : Number(r.amount),
    revision: Number(r.revision),
  }));

  const taskFiles = {};
  for (const f of taskFilesRes.rows) {
    taskFiles[f.id] = {
      id: f.id,
      name: f.file_name,
      content: f.storage_key_or_base64,
    };
  }

  const intByTask = new Map();
  for (const i of taskIntRes.rows) {
    if (!intByTask.has(i.task_id)) {
      intByTask.set(i.task_id, { submissions: [], reviews: [], discussion: [], comments: [] });
    }
    const bucket = intByTask.get(i.task_id);
    const iso = new Date(i.created_at).toISOString();
    if (i.interaction_type === 'submission') {
      bucket.submissions.push({
        note: i.note_or_text,
        fileIds: i.file_ids_json || [],
        at: iso,
      });
    } else if (i.interaction_type === 'review') {
      bucket.reviews.push({
        approve: Boolean(i.approve_flag),
        at: iso,
      });
    } else if (i.interaction_type === 'discussion') {
      bucket.discussion.push({
        id: i.id,
        author: i.actor_name,
        time: iso,
        text: i.note_or_text,
      });
    } else if (i.interaction_type === 'system_log') {
      bucket.comments.push({
        id: i.id,
        author: i.actor_name,
        time: iso,
        text: i.note_or_text,
      });
    }
  }

  const tasks = tasksRes.rows.map(t => {
    const ints = intByTask.get(t.id) || {
      submissions: [],
      reviews: [],
      discussion: [],
      comments: [],
    };
    return {
      id: t.id,
      assignerId: t.assigner_id,
      assigneeId: t.assignee_id,
      ...(t.department ? { department: t.department } : {}),
      ...(t.batch_id ? { batchId: t.batch_id } : {}),
      title: t.title,
      description: t.description,
      ...(t.manager_note ? { managerNote: t.manager_note } : {}),
      deadline: formatBusinessDate(dateInputValue(t.deadline)),
      status: t.status,
      requiresFile: Boolean(t.requires_file),
      fileIds: t.file_ids_json || [],
      ...(t.source_alert_type && t.source_alert_id && t.source_alert_ref
        ? {
            sourceAlert: {
              type: t.source_alert_type,
              id: t.source_alert_id,
              reference: t.source_alert_ref,
            },
          }
        : {}),
      ...(t.legacy_manager_assignment ? { legacyManagerAssignment: true } : {}),
      ...(Array.isArray(t.previous_assignments_json) && t.previous_assignments_json.length
        ? { previousAssignments: t.previous_assignments_json }
        : {}),
      comments: ints.comments,
      submissions: ints.submissions,
      reviews: ints.reviews,
      ...(ints.discussion.length ? { discussion: ints.discussion } : {}),
    };
  });

  const reminders = remRes.rows.map(r => ({
    id: r.id,
    alertId: r.alert_id,
    alertType: r.alert_type,
    reference: r.reference,
    subject: r.subject,
    issue: r.issue,
    message: r.message,
    senderId: r.sender_id,
    senderName: r.sender_name,
    senderRole: r.sender_role,
    remindCount: Number(r.remind_count || 1),
    status: r.status,
    ...(r.assigned_by_id ? { assignedById: r.assigned_by_id } : {}),
    ...(r.assigned_by_name ? { assignedByName: r.assigned_by_name } : {}),
    ...(r.assigned_at ? { assignedAt: new Date(r.assigned_at).toISOString() } : {}),
    ...(r.assigned_scope ? { assignedScope: r.assigned_scope } : {}),
    ...(r.assigned_target_label ? { assignedTargetLabel: r.assigned_target_label } : {}),
    ...(Array.isArray(r.assigned_task_ids_json) && r.assigned_task_ids_json.length
      ? { assignedTaskIds: r.assigned_task_ids_json }
      : {}),
    ...(r.resolved_by_id ? { resolvedById: r.resolved_by_id } : {}),
    ...(r.resolved_by_name ? { resolvedByName: r.resolved_by_name } : {}),
    ...(r.resolved_at ? { resolvedAt: new Date(r.resolved_at).toISOString() } : {}),
    ...(r.manager_note ? { managerNote: r.manager_note } : {}),
    history: r.history_json || [],
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));

  const handoverDrafts = {};
  for (const d of draftsRes.rows) {
    handoverDrafts[`${d.actor_id}:${d.task_id}`] = d.draft_note;
  }

  return {
    directory: {
      version: 1,
      accounts,
      credentials,
      tokenVersions,
      departmentNavigation,
      tasks,
      taskFiles,
      reminders,
      handoverDrafts,
    },
    orders,
    finance: {
      version: 1,
      openingDate: dateInputValue(sys.opening_date) || '2026-10-17',
      revision: Number(sys.finance_revision || 0),
      isPeriodLocked: Boolean(sys.is_period_locked),
      revenue,
      receivables,
      payables,
      receipts,
      allocations,
      payments,
      audit,
      payableSplitSources,
    },
  };
}

/**
 * Đồng bộ trạng thái Domain sau khi thực thi nghiệp vụ xuống đầy đủ 15 bảng PostgreSQL
 * bên trong cùng một Transaction nguyên tử (BEGIN ... COMMIT).
 */
export async function saveStateToPostgres(client, dbState) {
  const { directory, orders, finance } = dbState;

  // 0. system_state
  await client.query(
    `INSERT INTO system_state (id, opening_date, finance_revision, is_period_locked)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       opening_date = EXCLUDED.opening_date,
       finance_revision = EXCLUDED.finance_revision,
       is_period_locked = EXCLUDED.is_period_locked`,
    [toIsoDateOrNull(finance.openingDate) || '2026-10-17', finance.revision || 0, Boolean(finance.isPeriodLocked)]
  );

  // 1. users
  const mergedUsers = new Map();
  for (const seedAcc of MOCK_ACCOUNTS) {
    mergedUsers.set(seedAcc.id, { ...seedAcc, ...(directory.accounts?.[seedAcc.id] || {}) });
  }
  for (const [id, acc] of Object.entries(directory.accounts || {})) {
    if (!mergedUsers.has(id)) mergedUsers.set(id, acc);
  }

  for (const [id, acc] of mergedUsers.entries()) {
    const credRaw = directory.credentials?.[id] || SEED_CREDENTIALS[id];
    const cred = credRaw ? JSON.parse(credRaw) : { salt: '0'.repeat(32), verifier: '0'.repeat(64), iterations: 600000 };
    const tokenVer = directory.tokenVersions?.[id] || 1;
    await client.query(
      `INSERT INTO users (
         id, email, username, password_hash, password_salt, password_iterations,
         name, role, status, title, department, employee_code, initials,
         navigation_json, token_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         password_salt = EXCLUDED.password_salt,
         password_iterations = EXCLUDED.password_iterations,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         department = EXCLUDED.department,
         navigation_json = EXCLUDED.navigation_json,
         token_version = EXCLUDED.token_version`,
      [
        id,
        acc.email,
        acc.username || acc.email,
        cred.verifier,
        cred.salt,
        cred.iterations || 600000,
        acc.name,
        acc.role,
        acc.status || 'active',
        acc.title || ROLE_PROFILES[acc.role]?.title || '',
        acc.department || ROLE_PROFILES[acc.role]?.label || '',
        acc.employeeCode || id,
        acc.initials || '',
        acc.navigation ? JSON.stringify(acc.navigation) : null,
        tokenVer,
      ]
    );
  }

  // 2. department_navigation
  for (const [role, nav] of Object.entries(directory.departmentNavigation || {})) {
    await client.query(
      `INSERT INTO department_navigation (role, navigation_json)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (role) DO UPDATE SET navigation_json = EXCLUDED.navigation_json`,
      [role, JSON.stringify(nav)]
    );
  }

  // 3 & 4. purchase_orders & po_tracking_history
  for (const po of orders || []) {
    await client.query(
      `INSERT INTO purchase_orders (
         row_id, po_id, vendor_no, vendor_name, vendor_item_no, category, country_of_origin,
         released_po_date, inbound_only, unit, ordered_qty, unit_price_vnd, total_value_vnd,
         ton_dau, nhap, delivered_qty, ban, on_process_pct, packaging_pct,
         expected_receipt_date, ship_date_etd, eta_date, actual_ship_date, actual_arrival_date, actual_delivery_date,
         manual_priority_rank, manual_alert_reason, alert_level, last_update_date, last_update_time, tracking_version
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
       )
       ON CONFLICT (row_id) DO UPDATE SET
         unit = EXCLUDED.unit,
         ordered_qty = EXCLUDED.ordered_qty,
         total_value_vnd = EXCLUDED.total_value_vnd,
         nhap = EXCLUDED.nhap,
         delivered_qty = EXCLUDED.delivered_qty,
         ban = EXCLUDED.ban,
         on_process_pct = EXCLUDED.on_process_pct,
         packaging_pct = EXCLUDED.packaging_pct,
         expected_receipt_date = EXCLUDED.expected_receipt_date,
         ship_date_etd = EXCLUDED.ship_date_etd,
         eta_date = EXCLUDED.eta_date,
         actual_ship_date = EXCLUDED.actual_ship_date,
         actual_arrival_date = EXCLUDED.actual_arrival_date,
         actual_delivery_date = EXCLUDED.actual_delivery_date,
         manual_priority_rank = EXCLUDED.manual_priority_rank,
         manual_alert_reason = EXCLUDED.manual_alert_reason,
         alert_level = EXCLUDED.alert_level,
         last_update_date = EXCLUDED.last_update_date,
         last_update_time = EXCLUDED.last_update_time,
         tracking_version = EXCLUDED.tracking_version`,
      [
        Number(po.rowId),
        po.poId,
        po.vendorNo,
        po.vendorName,
        po.vendorItemNo,
        po.category,
        po.countryOfOrigin || 'VIETNAM',
        toIsoDateOrNull(po.releasedPoDate),
        Boolean(po.inboundOnly),
        po.unit || '',
        po.orderedQty ?? null,
        po.unitPriceVnd ?? null,
        po.totalValueVnd ?? null,
        Number(po.tonDau || 0),
        po.nhap ?? null,
        po.deliveredQty ?? null,
        po.ban ?? null,
        po.onProcessPct ?? null,
        po.packagingPct ?? null,
        toIsoDateOrNull(po.expectedReceiptDate),
        toIsoDateOrNull(po.shipDateEtd),
        toIsoDateOrNull(po.etaDate),
        toIsoDateOrNull(po.actualShipDate),
        toIsoDateOrNull(po.actualArrivalDate),
        toIsoDateOrNull(po.actualDeliveryDate),
        Number(po.manualPriorityRank ?? 2),
        po.manualAlertReason || '',
        po.alertLevel || 'Đúng hạn',
        po.lastUpdateDate || null,
        po.lastUpdateTime || null,
        po.trackingVersion || null,
      ]
    );

    for (const h of po.trackingHistory || []) {
      await client.query(
        `INSERT INTO po_tracking_history (id, po_row_id, actor_id, actor_name, occurred_at, reason, before_json, after_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [
          h.id,
          Number(po.rowId),
          h.actorId || null,
          h.actorName || '',
          h.time || new Date().toISOString(),
          h.reason,
          h.before ? JSON.stringify(h.before) : null,
          h.after ? JSON.stringify(h.after) : null,
        ]
      );
    }
  }

  // 5. revenue_invoices
  for (const rev of finance.revenue || []) {
    await client.query(
      `INSERT INTO revenue_invoices (
         id, doc_no, po_id, po_line_id, customer_name, vendor_name, sku, category, currency,
         record_date, due_date, shipped_qty, net_revenue, cash_collected, approval_status, alert_level, priority_rank, basis, status_note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET
         cash_collected = EXCLUDED.cash_collected,
         approval_status = EXCLUDED.approval_status`,
      [
        rev.id,
        rev.docNo,
        rev.poId,
        rev.poLineId ?? null,
        rev.customerName,
        rev.vendorName,
        rev.sku,
        rev.category,
        rev.currency || 'VND',
        toIsoDateOrNull(rev.recordDate),
        toIsoDateOrNull(rev.dueDate),
        Number(rev.shippedQty || 0),
        Number(rev.netRevenue),
        Number(rev.cashCollected || 0),
        rev.approvalStatus || 'Đã ghi nhận',
        rev.alertLevel || 'Đúng hạn',
        Number(rev.priorityRank ?? 2),
        rev.basis,
        rev.statusNote || rev.basis,
      ]
    );
  }

  // 6. accounts_receivable
  for (const ar of finance.receivables || []) {
    await client.query(
      `INSERT INTO accounts_receivable (
         id, doc_no, po_id, po_line_id, customer_name, vendor_ref, sku, category, currency,
         due_date, original_amount, adjustment, allocated_paid, remaining, commitment_note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         adjustment = EXCLUDED.adjustment,
         allocated_paid = EXCLUDED.allocated_paid,
         remaining = EXCLUDED.remaining,
         commitment_note = EXCLUDED.commitment_note`,
      [
        ar.id,
        ar.docNo,
        ar.poId,
        ar.poLineId ?? null,
        ar.customerName,
        ar.vendorRef,
        ar.sku,
        ar.category,
        ar.currency || 'VND',
        toIsoDateOrNull(ar.dueDate),
        Number(ar.originalAmount),
        Number(ar.adjustment || 0),
        Number(ar.allocatedPaid || 0),
        Number(ar.remaining),
        ar.commitmentNote || '',
      ]
    );
  }

  // 7. cash_receipts
  for (const rec of finance.receipts || []) {
    await client.query(
      `INSERT INTO cash_receipts (
         id, reference, customer_name, receipt_date, amount, allocated_amount, currency, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         reference = EXCLUDED.reference,
         customer_name = EXCLUDED.customer_name,
         receipt_date = EXCLUDED.receipt_date,
         allocated_amount = EXCLUDED.allocated_amount,
         status = EXCLUDED.status`,
      [
        rec.id,
        rec.reference || '',
        rec.customerName || null,
        toIsoDateOrNull(rec.date),
        Number(rec.amount),
        Number(rec.allocatedAmount || 0),
        rec.currency || 'VND',
        rec.status,
      ]
    );
  }

  // 8. receipt_allocations
  for (const al of finance.allocations || []) {
    await client.query(
      `INSERT INTO receipt_allocations (id, entry_reference, receipt_id, debt_id, doc_no, amount, allocation_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        al.id,
        al.entryReference || al.id,
        al.receiptId,
        al.debtId,
        al.docNo,
        Number(al.amount),
        toIsoDateOrNull(al.date),
      ]
    );
  }

  // 9. accounts_payable (active + archived split sources)
  const allAp = [
    ...(finance.payables || []).map(r => ({ ...r, isArchived: false })),
    ...(finance.payableSplitSources || []).map(r => ({ ...r, isArchived: true })),
  ];
  for (const ap of allAp) {
    await client.query(
      `INSERT INTO accounts_payable (
         id, doc_no, vendor_no, supplier_name, po_id, po_ids_json, po_line_id, sku, category, currency,
         due_date, original_amount, adjustment, allocated_paid, remaining,
         approval_state, approval_origin, approved_remaining,
         request_amount, requested_due_date, request_note, requested_by,
         reviewed_by, reviewed_date, reviewed_at, review_note,
         split_source_doc_no, split_into, is_archived_split_source, pic
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
       )
       ON CONFLICT (id) DO UPDATE SET
         due_date = EXCLUDED.due_date,
         adjustment = EXCLUDED.adjustment,
         allocated_paid = EXCLUDED.allocated_paid,
         remaining = EXCLUDED.remaining,
         approval_state = EXCLUDED.approval_state,
         approval_origin = EXCLUDED.approval_origin,
         approved_remaining = EXCLUDED.approved_remaining,
         request_amount = EXCLUDED.request_amount,
         requested_due_date = EXCLUDED.requested_due_date,
         request_note = EXCLUDED.request_note,
         requested_by = EXCLUDED.requested_by,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_date = EXCLUDED.reviewed_date,
         reviewed_at = EXCLUDED.reviewed_at,
         review_note = EXCLUDED.review_note,
         split_into = EXCLUDED.split_into,
         is_archived_split_source = EXCLUDED.is_archived_split_source`,
      [
        ap.id,
        ap.docNo,
        ap.vendorNo,
        ap.supplierName,
        ap.poId,
        ap.poIds ? JSON.stringify(ap.poIds) : null,
        ap.poLineId ?? null,
        ap.sku,
        ap.category,
        ap.currency || 'VND',
        toIsoDateOrNull(ap.dueDate),
        Number(ap.originalAmount),
        Number(ap.adjustment || 0),
        Number(ap.allocatedPaid || 0),
        Number(ap.remaining),
        ap.approvalState,
        ap.approvalOrigin || 'workflow',
        Number(ap.approvedRemaining || 0),
        ap.requestAmount ?? null,
        toIsoDateOrNull(ap.requestedDueDate),
        ap.requestNote || null,
        ap.requestedBy || null,
        ap.reviewedBy || null,
        toIsoDateOrNull(ap.reviewedDate),
        ap.reviewedAt || null,
        ap.reviewNote || null,
        ap.splitSourceDocNo || null,
        ap.splitInto || null,
        Boolean(ap.isArchived),
        ap.pic || null,
      ]
    );
  }

  // 10. payable_payments
  for (const p of finance.payments || []) {
    await client.query(
      `INSERT INTO payable_payments (id, payable_id, doc_no, reference, amount, paid_date, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id,
        p.payableId,
        p.docNo,
        p.reference,
        Number(p.amount),
        toIsoDateOrNull(p.date),
        p.approvedBy || 'opening',
      ]
    );
  }

  // 11. finance_audit_logs
  for (const [idx, aud] of (finance.audit || []).entries()) {
    await client.query(
      `INSERT INTO finance_audit_logs (id, event_type, reference, actor_id, actor_name, occurred_at, detail, amount, revision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        aud.id,
        aud.type,
        aud.reference,
        aud.actorId || null,
        aud.actorName || '',
        aud.occurredAt || new Date().toISOString(),
        aud.detail || '',
        aud.amount ?? null,
        aud.revision ?? idx + 1,
      ]
    );
  }

  // 12, 13 & 14. tasks, task_files & task_interactions
  for (const [fileId, fileObj] of Object.entries(directory.taskFiles || {})) {
    const content = fileObj.content || '';
    const size = Math.max(
      1,
      Math.floor((content.length / 4) * 3) - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0)
    );
    await client.query(
      `INSERT INTO task_files (id, file_name, size_bytes, storage_key_or_base64)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      [fileId, fileObj.name, size, content]
    );
  }

  for (const t of directory.tasks || []) {
    await client.query(
      `INSERT INTO tasks (
         id, assigner_id, assignee_id, department, batch_id, title, description, manager_note,
         deadline, status, requires_file, file_ids_json,
         source_alert_type, source_alert_id, source_alert_ref,
         legacy_manager_assignment, previous_assignments_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET
         assignee_id = EXCLUDED.assignee_id,
         deadline = EXCLUDED.deadline,
         status = EXCLUDED.status,
         legacy_manager_assignment = EXCLUDED.legacy_manager_assignment,
         previous_assignments_json = EXCLUDED.previous_assignments_json`,
      [
        t.id,
        t.assignerId,
        t.assigneeId,
        t.department || null,
        t.batchId || null,
        t.title,
        t.description,
        t.managerNote || null,
        toIsoDateOrNull(t.deadline),
        t.status,
        Boolean(t.requiresFile),
        JSON.stringify(t.fileIds || []),
        t.sourceAlert?.type || null,
        t.sourceAlert?.id || null,
        t.sourceAlert?.reference || null,
        Boolean(t.legacyManagerAssignment),
        JSON.stringify(t.previousAssignments || []),
      ]
    );

    await client.query('DELETE FROM task_interactions WHERE task_id = $1', [t.id]);
    for (const [idx, sub] of (t.submissions || []).entries()) {
      await client.query(
        `INSERT INTO task_interactions (id, task_id, interaction_type, actor_id, actor_name, note_or_text, file_ids_json, created_at)
         VALUES ($1,$2,'submission',$3,$4,$5,$6,$7)`,
        [
          `${t.id}-SUB-${idx + 1}`,
          t.id,
          t.assigneeId,
          '',
          sub.note,
          JSON.stringify(sub.fileIds || []),
          sub.at || new Date().toISOString(),
        ]
      );
    }
    for (const [idx, rev] of (t.reviews || []).entries()) {
      await client.query(
        `INSERT INTO task_interactions (id, task_id, interaction_type, actor_id, actor_name, approve_flag, created_at)
         VALUES ($1,$2,'review',$3,$4,$5,$6)`,
        [
          `${t.id}-REV-${idx + 1}`,
          t.id,
          t.assignerId,
          '',
          Boolean(rev.approve),
          rev.at || new Date().toISOString(),
        ]
      );
    }
    for (const [idx, disc] of (t.discussion || []).entries()) {
      await client.query(
        `INSERT INTO task_interactions (id, task_id, interaction_type, actor_name, note_or_text, created_at)
         VALUES ($1,$2,'discussion',$3,$4,$5)`,
        [disc.id || `${t.id}-DISC-${idx + 1}`, t.id, disc.author || '', disc.text, disc.time || new Date().toISOString()]
      );
    }
    for (const [idx, log] of (t.comments || []).entries()) {
      await client.query(
        `INSERT INTO task_interactions (id, task_id, interaction_type, actor_name, note_or_text, created_at)
         VALUES ($1,$2,'system_log',$3,$4,$5)`,
        [log.id || `${t.id}-LOG-${idx + 1}`, t.id, log.author || '', log.text, log.time || new Date().toISOString()]
      );
    }
  }

  // 15. work_reminders
  for (const rem of directory.reminders || []) {
    await client.query(
      `INSERT INTO work_reminders (
         id, alert_id, alert_type, reference, subject, issue, message,
         sender_id, sender_name, sender_role, remind_count, status,
         assigned_by_id, assigned_by_name, assigned_at, assigned_scope, assigned_target_label,
         assigned_task_ids_json, resolved_by_id, resolved_by_name, resolved_at,
         manager_note, history_json, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
       )
       ON CONFLICT (id) DO UPDATE SET
         message = EXCLUDED.message,
         sender_id = EXCLUDED.sender_id,
         sender_name = EXCLUDED.sender_name,
         sender_role = EXCLUDED.sender_role,
         remind_count = EXCLUDED.remind_count,
         status = EXCLUDED.status,
         assigned_by_id = EXCLUDED.assigned_by_id,
         assigned_by_name = EXCLUDED.assigned_by_name,
         assigned_at = EXCLUDED.assigned_at,
         assigned_scope = EXCLUDED.assigned_scope,
         assigned_target_label = EXCLUDED.assigned_target_label,
         assigned_task_ids_json = EXCLUDED.assigned_task_ids_json,
         resolved_by_id = EXCLUDED.resolved_by_id,
         resolved_by_name = EXCLUDED.resolved_by_name,
         resolved_at = EXCLUDED.resolved_at,
         manager_note = EXCLUDED.manager_note,
         history_json = EXCLUDED.history_json,
         updated_at = EXCLUDED.updated_at`,
      [
        rem.id,
        rem.alertId,
        rem.alertType || 'orders',
        rem.reference,
        rem.subject,
        rem.issue,
        rem.message,
        rem.senderId,
        rem.senderName,
        rem.senderRole,
        Number(rem.remindCount || 1),
        rem.status,
        rem.assignedById || null,
        rem.assignedByName || null,
        rem.assignedAt || null,
        rem.assignedScope || null,
        rem.assignedTargetLabel || null,
        JSON.stringify(rem.assignedTaskIds || []),
        rem.resolvedById || null,
        rem.resolvedByName || null,
        rem.resolvedAt || null,
        rem.managerNote || null,
        JSON.stringify(rem.history || []),
        rem.createdAt || new Date().toISOString(),
        rem.updatedAt || new Date().toISOString(),
      ]
    );
  }
}

/**
 * Thực thi file SQL (schema.sql, views_and_procedures.sql, seed.sql) trên PostgreSQL
 */
export async function executeSqlFile(pool, relativeFilePath) {
  const fullPath = path.resolve(process.cwd(), relativeFilePath);
  const sql = fs.readFileSync(fullPath, 'utf8');
  await pool.query(sql);
}
