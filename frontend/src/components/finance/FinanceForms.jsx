import { locale, t } from '../../locales/i18n.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatMoney } from '../../utils/dashboardMetrics.js';
import { businessToday, dateInputValue } from '../../utils/business.js';
import {
  financeCustomers,
  needsPayableSplit,
  OPENING_RECEIPT_ID,
  payableSplitVendors,
  receivableForAllocation,
} from '../../utils/financeWorkflow.js';
import { fetchOrdersPage } from '../../features/orders/services/ordersService.js';
import { loadTrackedItems } from '../../utils/orderFulfillment.js';
import MoneyField from './MoneyField.jsx';
import { useDebouncedValue } from '../../hooks/useDebounce.js';

// Chức năng: Xử lý nghiệp vụ (values - values) phục vụ xử lý dữ liệu trong FinanceForms.jsx
const values = event => {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
};

// Chức năng: Thành phần giao diện (React Component Footer) hiển thị và xử lý tương tác người dùng trong FinanceForms.jsx
const Footer = ({ onClose, label, disabled }) => <div className="workflow-footer">
  <button type="button" onClick={onClose}>{t("Hủy")}</button>
  <button type="submit" className="primary" disabled={disabled}>{t(label)}</button>
</div>;

// Chức năng: React Custom Hook (useResolvedOrderItems) quản lý trạng thái và tối ưu hiệu năng giao diện
function useResolvedOrderItems(items = [], finance = null) {
  const [fetchedItems, setFetchedItems] = useState([]);
  useEffect(() => {
    if (Array.isArray(items) && items.length > 0) return;
    let active = true;
    const ctrl = new AbortController();
    fetchOrdersPage({ view: 'reference', limit: 100 }, ctrl.signal)
      .then(page => {
        if (active && Array.isArray(page?.items) && page.items.length > 0) {
          setFetchedItems(loadTrackedItems(page.items));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [items]);

  return useMemo(() => {
    if (Array.isArray(items) && items.length > 0) return items;
    if (fetchedItems.length > 0) return fetchedItems;
    const map = new Map();
    let syntheticId = 9000001;
    for (const rev of finance?.revenue || []) {
      if (!rev?.poId) continue;
      const key = `${rev.poId}::${rev.sku || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          rowId: rev.poLineId || syntheticId++,
          poId: rev.poId,
          vendorItemNo: rev.sku || '',
          category: rev.category || '',
          vendorNo: rev.vendorNo || '',
          vendorName: rev.vendorName || '',
          customerName: rev.customerName || '',
          orderedQty: rev.shippedQty || 1,
          deliveredQty: rev.shippedQty || 1,
          totalValueVnd: Number(rev.netRevenue || 0),
          etaDate: rev.dueDate || rev.recordDate || '',
        });
      }
    }
    for (const ar of finance?.receivables || []) {
      if (!ar?.poId) continue;
      const key = `${ar.poId}::${ar.sku || ''}`;
      if (!map.has(key)) {
        const [vNo = '', vName = ''] = String(ar.vendorRef || '').split(' - ');
        map.set(key, {
          rowId: ar.poLineId || syntheticId++,
          poId: ar.poId,
          vendorItemNo: ar.sku || '',
          category: ar.category || '',
          vendorNo: vNo.trim(),
          vendorName: vName.trim(),
          customerName: ar.customerName || '',
          orderedQty: 1,
          totalValueVnd: Number(ar.originalAmount || 0),
          etaDate: ar.dueDate || '',
        });
      }
    }
    for (const ap of finance?.payables || []) {
      if (!ap?.poId) continue;
      const key = `${ap.poId}::${ap.sku || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          rowId: ap.poLineId || syntheticId++,
          poId: ap.poId,
          vendorItemNo: ap.sku || '',
          category: ap.category || '',
          vendorNo: ap.vendorNo || '',
          vendorName: ap.supplierName || '',
          orderedQty: 1,
          totalValueVnd: Number(ap.originalAmount || 0),
          etaDate: ap.dueDate || '',
        });
      }
    }
    return [...map.values()];
  }, [items, fetchedItems, finance]);
}

// Chức năng: Xử lý nghiệp vụ (deriveExistingCategories - Existing Categories) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function deriveExistingCategories(items = [], finance = null, extraCategory = '') {
  const raw = [
    ...(items || []).map(item => item?.category),
    ...(finance?.receivables || []).map(r => r?.category),
    ...(finance?.payables || []).map(p => p?.category),
    ...(finance?.revenue || []).map(rev => rev?.category),
    extraCategory,
  ];
  return [...new Set(raw.map(v => String(v || '').trim()).filter(Boolean))];
}

// Chức năng: Lọc (filterPoItems - Po Items) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function filterPoItems(items = [], debouncedQuery = '', categoryFilter = 'all') {
  const q = String(debouncedQuery || '').trim().toLowerCase();
  return (items || []).filter(item => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (!q) return true;
    return [item.poId, item.vendorItemNo, item.vendorNo, item.vendorName, item.category]
      .some(val => String(val || '').toLowerCase().includes(q));
  });
}

// Chức năng: Tính toán (computeOrderTotalVnd - Order Total Vnd) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function computeOrderTotalVnd(order) {
  if (!order) return '';
  if (Number.isSafeInteger(order.totalValueVnd) && order.totalValueVnd > 0) {
    return order.totalValueVnd;
  }
  const qty = Number(order.orderedQty || 0);
  const price = Number(order.unitPriceVnd || 0);
  if (qty > 0 && price > 0) return Math.round(qty * price);
  return '';
}

// Chức năng: Xử lý nghiệp vụ (suggestUniqueDocNo - Unique Doc No) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function suggestUniqueDocNo(prefix, order, existingDocs = []) {
  if (!order?.poId) return '';
  const used = new Set(
    (existingDocs || []).map(d => String(d?.docNo || '').trim().toUpperCase()).filter(Boolean)
  );
  const base = `${prefix}-${order.poId}`.toUpperCase();
  if (!used.has(base)) return base;
  let seq = 2;
  while (used.has(`${base}-${seq}`)) seq += 1;
  return `${base}-${seq}`;
}

// Chức năng: Kiểm tra trạng thái (isSupplierName - Supplier Name) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function isSupplierName(name, items = [], finance = null) {
  const clean = String(name || '').trim().toLowerCase();
  if (!clean) return false;
  for (const item of items || []) {
    if (String(item?.vendorName || '').trim().toLowerCase() === clean) return true;
    if (`${item?.vendorNo || ''} - ${item?.vendorName || ''}`.trim().toLowerCase() === clean) return true;
  }
  for (const ap of finance?.payables || []) {
    if (String(ap?.supplierName || '').trim().toLowerCase() === clean) return true;
  }
  return false;
}

// Chức năng: Xử lý nghiệp vụ (knownBuyerCustomers - Buyer Customers) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function knownBuyerCustomers(finance, items = []) {
  return financeCustomers(finance).filter(name => !isSupplierName(name, items, finance));
}

// Chức năng: Xử lý nghiệp vụ (findUnlinkedArForOrder - Unlinked Ar For Order) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function findUnlinkedArForOrder(order, finance) {
  if (!order || !finance?.receivables) return null;
  const revDocs = new Set(
    (finance?.revenue || []).map(r => String(r?.docNo || '').trim().toUpperCase()).filter(Boolean)
  );
  return (
    (finance.receivables || []).find(
      r =>
        !revDocs.has(String(r?.docNo || '').trim().toUpperCase()) &&
        ((r.poLineId && Number(r.poLineId) === Number(order.rowId)) ||
          (r.poId === order.poId && (!r.sku || r.sku === order.vendorItemNo)) ||
          r.poId === order.poId)
    ) || null
  );
}

// Chức năng: Xử lý nghiệp vụ (findLinkedCustomerForOrder - Linked Customer For Order) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function findLinkedCustomerForOrder(order, finance, items = []) {
  if (!order) return '';
  if (order.customerName && !isSupplierName(order.customerName, items, finance)) {
    return order.customerName;
  }
  const revMatch = (finance?.revenue || []).find(
    r => (r.poLineId && Number(r.poLineId) === Number(order.rowId)) || r.poId === order.poId
  );
  if (revMatch?.customerName && !isSupplierName(revMatch.customerName, items, finance)) {
    return revMatch.customerName;
  }
  const arMatch = (finance?.receivables || []).find(
    r => (r.poLineId && Number(r.poLineId) === Number(order.rowId)) || r.poId === order.poId
  );
  if (arMatch?.customerName && !isSupplierName(arMatch.customerName, items, finance)) {
    return arMatch.customerName;
  }
  const buyers = knownBuyerCustomers(finance, items);
  return buyers[0] || '';
}

// Chức năng: Tổng hợp (summarizeOrderFinance - Order Finance) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function summarizeOrderFinance(order, finance) {
  if (!order) return { poTotal: 0, invoicedTotal: 0, arTotal: 0, remainingToCreate: 0, deliveredValue: 0 };
  const poTotal = Number(computeOrderTotalVnd(order) || 0);
  const deliveredQty = Number(order.deliveredQty || 0);
  const unitPrice = Number(order.unitPriceVnd || 0);
  const deliveredValue = deliveredQty > 0 && unitPrice > 0 ? Math.round(deliveredQty * unitPrice) : poTotal;
  const invoicedTotal = (finance?.revenue || [])
    .filter(r => (r.poLineId && Number(r.poLineId) === Number(order.rowId)) || r.poId === order.poId)
    .reduce((sum, r) => sum + Number(r.netRevenue || 0), 0);
  const arTotal = (finance?.receivables || [])
    .filter(r => (r.poLineId && Number(r.poLineId) === Number(order.rowId)) || r.poId === order.poId)
    .reduce((sum, r) => sum + Number(r.originalAmount || 0) + Number(r.adjustment || 0), 0);
  const remainingToCreate = Math.max(0, poTotal - arTotal);
  return { poTotal, invoicedTotal, arTotal, remainingToCreate, deliveredValue };
}

// Chức năng: Xử lý nghiệp vụ (findLinkedReceivableAmountForOrder - Linked Receivable Amount For Order) phục vụ xử lý dữ liệu trong FinanceForms.jsx
function findLinkedReceivableAmountForOrder(order, finance) {
  if (!order) return '';
  const { poTotal, arTotal, remainingToCreate, deliveredValue } = summarizeOrderFinance(order, finance);
  if (arTotal > 0 && remainingToCreate > 0) {
    return remainingToCreate;
  }
  if (deliveredValue > 0 && arTotal === 0) {
    return deliveredValue;
  }
  return poTotal || '';
}

// Chức năng: Biểu mẫu Ghi nhận doanh thu: chọn đơn hàng PO, tự động tính giá trị theo SL đã giao/toàn bộ PO và đồng bộ 2 chiều với Công nợ phải thu
// Chức năng: Hiển thị thanh thông tin người Kế toán tạo tự động nhận chứng từ hoặc Sếp tạo chứng từ
function FinanceCreatorOwnershipBanner({ actor, isEdit = false, row = null }) {
  const effectiveRole = isEdit ? (row?.createdByRole || actor?.role) : actor?.role;
  const effectiveName = isEdit
    ? (row?.assignedAccountantName || row?.createdByName || row?.pic || actor?.name)
    : actor?.name;
  const effectiveEmail = isEdit ? (row?.createdByEmail || '') : (actor?.email || '');
  if (!effectiveName && !effectiveRole) return null;
  const isAccountantCreator =
    effectiveRole === 'Accountant' || row?.ownerType === 'accountant_self_owned';
  return (
    <div
      className={`workflow-wide flex flex-wrap items-center gap-2 px-3 py-2.5 mb-2 rounded-lg border text-xs ${
        isAccountantCreator
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : 'bg-sky-50 border-sky-200 text-sky-900'
      }`}
      data-finance-creator-role={effectiveRole || 'CEO'}
      role="status"
    >
      {isAccountantCreator ? (
        <span>
          <strong>{t('Người Kế toán tạo & tự động nhận chứng từ:')}</strong>{' '}
          <b>{effectiveName}</b> ({t('Phòng Kế toán')})
        </span>
      ) : (
        <span>
          <strong>{t('Người tạo chứng từ (Ban Giám đốc):')}</strong>{' '}
          <b>{effectiveRole === 'Admin' ? t('Ban Giám đốc') : effectiveName}</b>
        </span>
      )}
    </div>
  );
}

export function InvoiceForm({ actor = null, items = [], finance, onAction, onClose }) {
  const effectiveItems = useResolvedOrderItems(items, finance);
  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const debouncedItemSearch = useDebouncedValue(itemSearch, 300);
  const existingCategories = useMemo(
    () => deriveExistingCategories(effectiveItems, finance),
    [effectiveItems, finance]
  );
  const filteredItems = useMemo(
    () => filterPoItems(effectiveItems, debouncedItemSearch, categoryFilter),
    [effectiveItems, debouncedItemSearch, categoryFilter]
  );

  const initialOrder = effectiveItems[0] || null;
  const initialUnlinkedAr = findUnlinkedArForOrder(initialOrder, finance);
  const [rowId, setRowId] = useState(() => String(initialOrder?.rowId ?? ''));
  const selectedOrder =
    effectiveItems.find(item => String(item.rowId) === String(rowId)) ||
    filteredItems[0] ||
    effectiveItems[0] ||
    null;

  const unlinkedAr = useMemo(
    () => findUnlinkedArForOrder(selectedOrder, finance),
    [selectedOrder, finance]
  );

  const allRevenueDocs = useMemo(() => finance?.revenue || [], [finance]);
  const buyerSuggestions = useMemo(
    () => knownBuyerCustomers(finance, effectiveItems),
    [finance, effectiveItems]
  );

  const [docNoVal, setDocNoVal] = useState(() =>
    initialUnlinkedAr?.docNo || suggestUniqueDocNo('HD', initialOrder, allRevenueDocs)
  );
  const [customerNameVal, setCustomerNameVal] = useState(() => {
    if (initialUnlinkedAr?.customerName && !isSupplierName(initialUnlinkedAr.customerName, effectiveItems, finance)) {
      return initialUnlinkedAr.customerName;
    }
    return findLinkedCustomerForOrder(initialOrder, finance, effectiveItems);
  });
  const [recordDate, setRecordDate] = useState(businessToday);
  const [dueDate, setDueDate] = useState(
    () =>
      dateInputValue(initialUnlinkedAr?.dueDate) ||
      dateInputValue(initialOrder?.etaDate) ||
      businessToday()
  );
  const initialShippedQty =
    Number(initialOrder?.deliveredQty || 0) > 0
      ? initialOrder.deliveredQty
      : initialOrder?.orderedQty ?? initialOrder?.nhap ?? 0;
  const [shippedQtyVal, setShippedQtyVal] = useState(() => String(initialShippedQty));
  const [netRevenueVal, setNetRevenueVal] = useState(() => {
    if (initialUnlinkedAr) {
      return Number(initialUnlinkedAr.originalAmount || 0) + Number(initialUnlinkedAr.adjustment || 0);
    }
    const qty = Number(initialShippedQty || 0);
    const price = Number(initialOrder?.unitPriceVnd || 0);
    if (qty > 0 && price > 0) return Math.round(qty * price);
    return computeOrderTotalVnd(initialOrder);
  });
  const [basisVal, setBasisVal] = useState(() =>
    initialUnlinkedAr?.commitmentNote ||
    (initialOrder ? `Nghiệm thu & xuất hóa đơn đơn hàng ${initialOrder.poId} - ${initialOrder.vendorItemNo}` : '')
  );

  // Chức năng: Áp dụng (applyOrderToInvoice - Order To Invoice) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const applyOrderToInvoice = nextOrder => {
    if (!nextOrder) return;
    setRowId(String(nextOrder.rowId));
    const pendingAr = findUnlinkedArForOrder(nextOrder, finance);
    setDocNoVal(pendingAr?.docNo || suggestUniqueDocNo('HD', nextOrder, allRevenueDocs));
    const linkedCust =
      pendingAr?.customerName && !isSupplierName(pendingAr.customerName, effectiveItems, finance)
        ? pendingAr.customerName
        : findLinkedCustomerForOrder(nextOrder, finance, effectiveItems);
    setCustomerNameVal(linkedCust || '');
    const nextDue =
      dateInputValue(pendingAr?.dueDate) ||
      dateInputValue(nextOrder.etaDate) ||
      recordDate ||
      businessToday();
    setDueDate(nextDue < recordDate ? recordDate : nextDue);
    const nextQty =
      Number(nextOrder.deliveredQty || 0) > 0
        ? nextOrder.deliveredQty
        : nextOrder.orderedQty ?? nextOrder.nhap ?? 0;
    setShippedQtyVal(String(nextQty));
    if (pendingAr) {
      setNetRevenueVal(Number(pendingAr.originalAmount || 0) + Number(pendingAr.adjustment || 0));
      setBasisVal(
        pendingAr.commitmentNote ||
          `Nghiệm thu & đồng bộ công nợ phải thu ${pendingAr.docNo} (${nextOrder.poId})`
      );
    } else {
      const price = Number(nextOrder.unitPriceVnd || 0);
      setNetRevenueVal(
        Number(nextQty) > 0 && price > 0
          ? Math.round(Number(nextQty) * price)
          : computeOrderTotalVnd(nextOrder)
      );
      setBasisVal(`Nghiệm thu & xuất hóa đơn đơn hàng ${nextOrder.poId} - ${nextOrder.vendorItemNo}`);
    }
  };

  useEffect(() => {
    if (!rowId && effectiveItems.length > 0) {
      applyOrderToInvoice(effectiveItems[0]);
    }
  }, [effectiveItems.length]);

  useEffect(() => {
    if (debouncedItemSearch.trim() && filteredItems.length > 0) {
      if (!filteredItems.some(i => String(i.rowId) === String(rowId))) {
        applyOrderToInvoice(filteredItems[0]);
      }
    }
  }, [debouncedItemSearch, filteredItems]);

  const maxQty = selectedOrder
    ? Math.max(
        Number(selectedOrder.orderedQty || 0),
        Number(selectedOrder.tonDau || 0) + Number(selectedOrder.nhap || 0)
      )
    : 0;
  const maxDate = businessToday();
  const minDate = dateInputValue(finance.openingDate) || undefined;
  // Chức năng: Xử lý sự kiện (handleRecordDateChange - Record Date Change) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const handleRecordDateChange = event => {
    const nextDate = event.target.value;
    setRecordDate(nextDate);
    if (nextDate && (!dueDate || dueDate < nextDate)) setDueDate(nextDate);
  };

  const orderSummary = summarizeOrderFinance(selectedOrder, finance);

  return <form className="workflow-form" onSubmit={event => onAction('invoice', values(event))}>
    {unlinkedAr && (
      <input type="hidden" name="linkedArId" value={unlinkedAr.id} />
    )}
    <div className="workflow-grid">
      <label>
        {t("Lọc ngành hàng")}
        <select
          value={categoryFilter}
          onChange={event => {
            const nextCat = event.target.value;
            setCategoryFilter(nextCat);
            const nextList = filterPoItems(effectiveItems, debouncedItemSearch, nextCat);
            if (nextList.length > 0) applyOrderToInvoice(nextList[0]);
          }}
        >
          <option value="all">{t("Tất cả ngành hàng")}</option>
          {existingCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </label>
      <label>
        {t("Tìm đơn hàng / mã hàng")}
        <input
          type="search"
          value={itemSearch}
          onChange={event => setItemSearch(event.target.value)}
        />
      </label>
      <label className="workflow-wide">
        {t("Đơn hàng PO")} <span className="required-mark" aria-hidden="true">*</span>
        <select
          name="rowId"
          required
          value={selectedOrder ? String(selectedOrder.rowId) : ''}
          onChange={event => {
            const found = effectiveItems.find(i => String(i.rowId) === String(event.target.value));
            if (found) applyOrderToInvoice(found);
          }}
        >
          {filteredItems.map(item => (
            <option key={item.rowId} value={item.rowId}>
              {item.poId} · {t(item.vendorItemNo)} · {item.category} · SL đặt: {item.orderedQty || 0} {item.unit || 'pcs'} (Đã giao: {item.deliveredQty || 0}) · {formatMoney(computeOrderTotalVnd(item) || 0)}
            </option>
          ))}
        </select>
      </label>

      {selectedOrder && (
        <div className="po-sync-banner">
          <div>
            <strong>{selectedOrder.poId} · {t(selectedOrder.vendorItemNo)}</strong>
            <span>
              {' '}· {t("NCC gốc:")} <b>{selectedOrder.vendorNo} - {t(selectedOrder.vendorName)}</b>
              {' '}· {t("Tổng PO:")} <b>{formatMoney(orderSummary.poTotal)}</b>
              {unlinkedAr
                ? ` · ${t("Đồng bộ trực tiếp với Công nợ phải thu:")} ${unlinkedAr.docNo} (${formatMoney(unlinkedAr.originalAmount)})`
                : ` · ${t("Khi lưu sẽ tự động sinh khoản Công nợ phải thu tương ứng")}`}
            </span>
          </div>
          {Number(selectedOrder.unitPriceVnd || 0) > 0 && (
            <div className="po-sync-actions">
              {Number(selectedOrder.deliveredQty || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const q = Number(selectedOrder.deliveredQty);
                    setShippedQtyVal(String(q));
                    setNetRevenueVal(Math.round(q * Number(selectedOrder.unitPriceVnd)));
                  }}
                >
                  {t("Theo SL đã giao")} ({selectedOrder.deliveredQty} {selectedOrder.unit || 'pcs'} = {formatMoney(orderSummary.deliveredValue)})
                </button>
              )}
              {Number(selectedOrder.orderedQty || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const q = Number(selectedOrder.orderedQty);
                    setShippedQtyVal(String(q));
                    setNetRevenueVal(orderSummary.poTotal);
                  }}
                >
                  {t("Theo toàn bộ PO")} ({selectedOrder.orderedQty} {selectedOrder.unit || 'pcs'} = {formatMoney(orderSummary.poTotal)})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <label>
        {t("Số hóa đơn")} <span className="required-mark" aria-hidden="true">*</span>
        <input
          name="docNo"
          required
          maxLength={64}
          value={docNoVal}
          onChange={e => setDocNoVal(e.target.value)}
        />
      </label>
      <label>
        {t("Khách hàng")} <span className="required-mark" aria-hidden="true">*</span>
        <input
          name="customerName"
          required
          list="uv-customers"
          maxLength={255}
          value={customerNameVal}
          onChange={e => setCustomerNameVal(e.target.value)}
        />
      </label>
      <datalist id="uv-customers">{buyerSuggestions.map(name => <option key={name} value={name} />)}</datalist>
      <label>
        {t("Ngày ghi nhận")} <span className="required-mark" aria-hidden="true">*</span>
        <input name="recordDate" type="date" required min={minDate} max={maxDate} value={recordDate} onChange={handleRecordDateChange} />
      </label>
      <label>
        {t("Hạn thanh toán")} <span className="required-mark" aria-hidden="true">*</span>
        <input name="dueDate" type="date" required min={recordDate || minDate} value={dueDate} onChange={event => setDueDate(event.target.value)} />
      </label>
      <label>
        {t("Số lượng giao")}{maxQty > 0 ? ` (${t('tối đa')} ${maxQty} ${selectedOrder?.unit || 'pcs'})` : ''} <span className="required-mark" aria-hidden="true">*</span>
        <input
          name="shippedQty"
          type="number"
          required
          min="0"
          max={maxQty || undefined}
          step="any"
          value={shippedQtyVal}
          onChange={e => {
            const nextQty = e.target.value;
            setShippedQtyVal(nextQty);
            const numQty = Number(nextQty);
            const price = Number(selectedOrder?.unitPriceVnd || 0);
            if (Number.isFinite(numQty) && numQty > 0 && price > 0) {
              setNetRevenueVal(Math.round(numQty * price));
            }
          }}
        />
      </label>
      <MoneyField
        name="netRevenue"
        label={t("Doanh thu thuần")}
        defaultValue={netRevenueVal}
      />
      <label className="workflow-wide">
        {t("Căn cứ ghi nhận")} <span className="required-mark" aria-hidden="true">*</span>
        <textarea
          name="basis"
          required
          maxLength={500}
          value={basisVal}
          onChange={e => setBasisVal(e.target.value)}
        />
      </label>
    </div>
    <Footer onClose={onClose} label={t("Ghi nhận doanh thu")} disabled={!selectedOrder} />
  </form>;
}

/**
 * Form Công nợ phải thu (AR): Thu tiền từ Khách hàng mua đơn hàng PO.
 * Hỗ trợ đồng bộ hai chiều với bảng Doanh thu (tự động ghi nhận vào Doanh thu hoặc liên kết khi xuất hóa đơn).
 */
export function ReceivableCrudForm({ actor = null, mode = 'create', row = null, items = [], finance, onAction, onClose }) {
  const effectiveItems = useResolvedOrderItems(items, finance);
  const isEdit = mode === 'edit' && Boolean(row);
  const initialMatched = row
    ? effectiveItems.find(
        item =>
          (row.poLineId && Number(item.rowId) === Number(row.poLineId)) ||
          (item.poId === row.poId && item.vendorItemNo === row.sku) ||
          item.poId === row.poId
      )
    : effectiveItems[0] || null;

  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [syncRevenue, setSyncRevenue] = useState(() => Boolean(!isEdit && initialMatched && !row?.isStandalone));
  const debouncedItemSearch = useDebouncedValue(itemSearch, 300);

  const existingCategories = useMemo(
    () => deriveExistingCategories(effectiveItems, finance, row?.category),
    [effectiveItems, finance, row?.category]
  );
  const filteredItems = useMemo(
    () => filterPoItems(effectiveItems, debouncedItemSearch, categoryFilter),
    [effectiveItems, debouncedItemSearch, categoryFilter]
  );
  const buyerSuggestions = useMemo(
    () => knownBuyerCustomers(finance, effectiveItems),
    [finance, effectiveItems]
  );

  const [isStandalone, setIsStandalone] = useState(() => Boolean(row?.isStandalone || (isEdit && !row?.poLineId && row?.poId === 'NGOAI-PO')));
  const [selectedRowId, setSelectedRowId] = useState(
    initialMatched ? String(initialMatched.rowId) : ''
  );
  const selectedOrder = useMemo(
    () => effectiveItems.find(item => String(item.rowId) === String(selectedRowId)) || null,
    [effectiveItems, selectedRowId]
  );

  const allArAndRevDocs = useMemo(
    () => [...(finance?.receivables || []), ...(finance?.revenue || [])],
    [finance]
  );

  const [docNoVal, setDocNoVal] = useState(() =>
    isEdit
      ? row?.docNo || ''
      : suggestUniqueDocNo('HD', initialMatched, allArAndRevDocs)
  );
  const [customerNameVal, setCustomerNameVal] = useState(() =>
    isEdit
      ? row?.customerName || ''
      : findLinkedCustomerForOrder(initialMatched, finance, effectiveItems)
  );
  const [poIdVal, setPoIdVal] = useState(() => initialMatched?.poId || row?.poId || '');
  const [skuVal, setSkuVal] = useState(() => initialMatched?.vendorItemNo || row?.sku || '');
  const [categoryVal, setCategoryVal] = useState(
    () => initialMatched?.category || row?.category || existingCategories[0] || ''
  );
  const [vendorRefVal, setVendorRefVal] = useState(() =>
    initialMatched
      ? `${initialMatched.vendorNo} - ${initialMatched.vendorName}`
      : row?.vendorRef || ''
  );
  const [dueDateVal, setDueDateVal] = useState(() =>
    dateInputValue(row?.dueDate) ||
    dateInputValue(initialMatched?.etaDate || initialMatched?.actualDeliveryDate || initialMatched?.expectedReceiptDate) ||
    businessToday()
  );
  const [originalAmountVal, setOriginalAmountVal] = useState(() =>
    isEdit
      ? row?.originalAmount ?? ''
      : findLinkedReceivableAmountForOrder(initialMatched, finance)
  );
  const [adjustmentVal] = useState(() => row?.adjustment ?? 0);
  const [commitmentNoteVal, setCommitmentNoteVal] = useState(() =>
    isEdit
      ? row?.commitmentNote || ''
      : initialMatched
        ? `Thu công nợ đơn hàng PO ${initialMatched.poId} - ${initialMatched.vendorItemNo}`
        : ''
  );

  // Chức năng: Áp dụng (applySelectedOrder - Selected Order) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const applySelectedOrder = nextRowId => {
    setSelectedRowId(nextRowId);
    const found = effectiveItems.find(item => String(item.rowId) === String(nextRowId));
    if (!found) {
      setIsStandalone(true);
      setSyncRevenue(false);
      setPoIdVal('NGOAI-PO');
      setSkuVal('');
      setVendorRefVal('');
    } else {
      setIsStandalone(false);
    }
    if (found) {
      if (!isEdit) {
        setDocNoVal(suggestUniqueDocNo('HD', found, allArAndRevDocs));
      }
      const linkedCust = findLinkedCustomerForOrder(found, finance, effectiveItems);
      setCustomerNameVal(linkedCust || '');
      setPoIdVal(found.poId || '');
      setSkuVal(found.vendorItemNo || '');
      setCategoryVal(found.category || '');
      setVendorRefVal(`${found.vendorNo} - ${found.vendorName}`);
      const nextDue = dateInputValue(
        found.etaDate || found.actualDeliveryDate || found.expectedReceiptDate
      );
      if (nextDue) setDueDateVal(nextDue);
      if (!isEdit) {
        setOriginalAmountVal(findLinkedReceivableAmountForOrder(found, finance));
        setCommitmentNoteVal(`Thu công nợ đơn hàng PO ${found.poId} - ${found.vendorItemNo}`);
      }
    }
  };

  useEffect(() => {
    if (!isEdit && !selectedRowId && effectiveItems.length > 0) {
      applySelectedOrder(String(effectiveItems[0].rowId));
    }
  }, [effectiveItems.length]);

  useEffect(() => {
    if (!isEdit && debouncedItemSearch.trim() && filteredItems.length > 0) {
      if (!filteredItems.some(i => String(i.rowId) === String(selectedRowId))) {
        applySelectedOrder(String(filteredItems[0].rowId));
      }
    }
  }, [debouncedItemSearch, filteredItems]);

  // Chức năng: Xử lý sự kiện (handleCategoryFilterChange - Category Filter Change) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const handleCategoryFilterChange = event => {
    const nextCat = event.target.value;
    setCategoryFilter(nextCat);
    if (nextCat !== 'all') {
      const matching = filterPoItems(effectiveItems, debouncedItemSearch, nextCat);
      if (matching.length > 0) {
        applySelectedOrder(String(matching[0].rowId));
      } else {
        setCategoryVal(nextCat);
      }
    } else if (effectiveItems.length > 0) {
      applySelectedOrder(String(effectiveItems[0].rowId));
    }
  };

  const orderSummary = summarizeOrderFinance(selectedOrder, finance);

  return (
    <form
      className="workflow-form"
      onSubmit={event => {
        const raw = values(event);
        const unlinkPo = isEdit && Boolean(initialMatched) && !selectedRowId;
        const payload = {
          ...(isEdit ? { id: row.id } : {}),
          docNo: raw.docNo,
          customerName: raw.customerName,
          rowId: !isStandalone && selectedOrder ? selectedRowId : undefined,
          ...(unlinkPo ? { unlinkPo: true } : {}),
          isStandalone: Boolean(isStandalone || !selectedOrder),
          ...(!isEdit && !isStandalone && Boolean(selectedOrder) && syncRevenue ? { syncRevenue: true } : {}),
          poId: !isStandalone && selectedOrder ? selectedOrder.poId : 'NGOAI-PO',
          sku: !isStandalone && selectedOrder ? selectedOrder.vendorItemNo : (skuVal || 'Ngoài PO'),
          category: !isStandalone && selectedOrder ? selectedOrder.category : categoryVal,
          vendorRef: !isStandalone && selectedOrder
            ? `${selectedOrder.vendorNo} - ${selectedOrder.vendorName}`
            : vendorRefVal,
          dueDate: raw.dueDate,
          originalAmount: raw.originalAmount,
          adjustment: raw.adjustment || 0,
          commitmentNote: raw.commitmentNote || '',
        };
        onAction(isEdit ? 'update-receivable' : 'create-receivable', payload);
      }}
    >
      <FinanceCreatorOwnershipBanner actor={actor} isEdit={isEdit} row={row} />
      <div className="workflow-grid">
        <label>
          {t("Lọc ngành hàng")}
          <select value={categoryFilter} onChange={handleCategoryFilterChange}>
            <option value="all">{t("Tất cả ngành hàng")}</option>
            {existingCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Tìm đơn hàng / mã hàng")}
          <input
            type="search"
            value={itemSearch}
            onChange={event => setItemSearch(event.target.value)}
          />
        </label>

        <label className="workflow-wide">
          {t("Chọn đơn hàng PO (tự điền công nợ)")}
          <select
            name="poLineId"
            value={selectedRowId}
            onChange={e => applySelectedOrder(e.target.value)}
          >
            <option value="">{t("— Nhập thủ công —")}</option>
            {filteredItems.map(item => (
              <option key={item.rowId} value={item.rowId}>
                {item.poId} · {t(item.vendorItemNo)} · {item.category} · SL đặt: {item.orderedQty || 0} {item.unit || 'pcs'} (Đã giao: {item.deliveredQty || 0}) · {formatMoney(computeOrderTotalVnd(item) || 0)}
              </option>
            ))}
          </select>
        </label>

        {selectedOrder && !isEdit && (
          <div className="po-sync-banner">
            <div>
              <strong>{selectedOrder.poId} · {t(selectedOrder.vendorItemNo)}</strong>
              <span>
                {' '}· {t("Tổng PO:")} <b>{formatMoney(orderSummary.poTotal)}</b>
                {' '}· {t("Đã tạo phải thu:")} <b>{formatMoney(orderSummary.arTotal)}</b>
                {' '}· {t("Còn lại:")} <b>{formatMoney(orderSummary.remainingToCreate)}</b>
              </span>
            </div>
            <div className="po-sync-actions">
              {orderSummary.deliveredValue > 0 && (
                <button
                  type="button"
                  onClick={() => setOriginalAmountVal(orderSummary.deliveredValue)}
                >
                  {t("Theo SL đã giao")} ({formatMoney(orderSummary.deliveredValue)})
                </button>
              )}
              {orderSummary.remainingToCreate > 0 && orderSummary.remainingToCreate !== orderSummary.poTotal && (
                <button
                  type="button"
                  onClick={() => setOriginalAmountVal(orderSummary.remainingToCreate)}
                >
                  {t("Phần còn lại")} ({formatMoney(orderSummary.remainingToCreate)})
                </button>
              )}
              {orderSummary.poTotal > 0 && (
                <button
                  type="button"
                  onClick={() => setOriginalAmountVal(orderSummary.poTotal)}
                >
                  {t("Toàn bộ PO")} ({formatMoney(orderSummary.poTotal)})
                </button>
              )}
            </div>
          </div>
        )}

        <label>
          {t("Số chứng từ phải thu")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="docNo"
            required
            maxLength={64}
            value={docNoVal}
            onChange={e => setDocNoVal(e.target.value)}
          />
        </label>
        <label>
          {t("Khách hàng")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="customerName"
            required
            list="uv-ar-customers"
            maxLength={255}
            value={customerNameVal}
            onChange={e => setCustomerNameVal(e.target.value)}
          />
        </label>
        <datalist id="uv-ar-customers">{buyerSuggestions.map(name => <option key={name} value={name} />)}</datalist>

        <label>
          {t("Số PO")}
          <input
            name="poId"
            maxLength={64}
            value={selectedOrder ? selectedOrder.poId : poIdVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => {
              const nextPo = e.target.value;
              setPoIdVal(nextPo);
              const byPo = effectiveItems.find(i => i.poId.toLowerCase() === nextPo.trim().toLowerCase());
              if (byPo) applySelectedOrder(String(byPo.rowId));
            }}
          />
        </label>
        <label>
          {t("SKU / Mã hàng")}
          <input
            name="sku"
            maxLength={120}
            value={selectedOrder ? selectedOrder.vendorItemNo : skuVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => {
              const nextSku = e.target.value;
              setSkuVal(nextSku);
              const bySku = effectiveItems.find(
                i => String(i.vendorItemNo || '').toLowerCase() === nextSku.trim().toLowerCase()
              );
              if (bySku?.category) setCategoryVal(bySku.category);
            }}
          />
        </label>
        <label>
          {t("Ngành hàng")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="category"
            list="uv-ar-categories"
            required
            maxLength={120}
            value={selectedOrder ? selectedOrder.category || '' : categoryVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => setCategoryVal(e.target.value)}
          />
          <datalist id="uv-ar-categories">
            {existingCategories.map(cat => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </label>
        <label>
          {t("Nhà cung cấp theo PO")}
          <input
            name="vendorRef"
            maxLength={255}
            value={
              selectedOrder
                ? `${selectedOrder.vendorNo} - ${selectedOrder.vendorName}`
                : vendorRefVal
            }
            readOnly={Boolean(selectedOrder)}
            onChange={e => setVendorRefVal(e.target.value)}
          />
        </label>

        <label>
          {t("Hạn thanh toán")}
          <input
            name="dueDate"
            type="date"
            value={dueDateVal}
            onChange={e => setDueDateVal(e.target.value)}
          />
        </label>
        <MoneyField
          name="originalAmount"
          label={t("Số tiền phải thu gốc")}
          defaultValue={originalAmountVal}
        />
        <MoneyField
          name="adjustment"
          label={t("Điều chỉnh tăng/giảm")}
          required={false}
          allowNegative={true}
          defaultValue={adjustmentVal}
        />
        {!isEdit && !isStandalone && (
          <label className="workflow-wide task-file-required">
            <input
              type="checkbox"
              checked={syncRevenue}
              onChange={e => setSyncRevenue(e.target.checked)}
            />
            <span>{t("Đồng thời ghi nhận luôn vào bảng Doanh thu (đồng bộ tự động Công nợ phải thu ↔ Doanh thu)")}</span>
          </label>
        )}
        <label className="workflow-wide">
          {t("Ghi chú")}
          <textarea
            name="commitmentNote"
            maxLength={500}
            value={commitmentNoteVal}
            onChange={e => setCommitmentNoteVal(e.target.value)}
          />
        </label>
      </div>
      <Footer onClose={onClose} label={t(isEdit ? 'Lưu cập nhật phải thu' : 'Tạo khoản phải thu')} />
    </form>
  );
}

/**
 * Form Công nợ phải trả (AP): Trả tiền mua hàng cho Nhà cung cấp của đơn hàng PO.
 * Khi chọn hoặc lọc đơn hàng PO, tự động điền toàn bộ Số chứng từ, Số PO, Mã NCC, Tên nhà cung cấp, Mã hàng, Ngành hàng, Hạn thanh toán, Số tiền gốc (= Giá trị PO) và Ghi chú.
 */
export function PayableCrudForm({ actor = null, mode = 'create', row = null, items = [], finance = null, onAction, onClose }) {
  const effectiveItems = useResolvedOrderItems(items, finance);
  const isEdit = mode === 'edit' && Boolean(row);
  const initialMatched = row
    ? effectiveItems.find(
        item =>
          (row.poLineId && Number(item.rowId) === Number(row.poLineId)) ||
          (item.poId === row.poId && item.vendorItemNo === row.sku) ||
          item.poId === row.poId
      )
    : effectiveItems[0] || null;

  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const debouncedItemSearch = useDebouncedValue(itemSearch, 300);

  const existingCategories = useMemo(
    () => deriveExistingCategories(effectiveItems, finance, row?.category),
    [effectiveItems, finance, row?.category]
  );
  const filteredItems = useMemo(
    () => filterPoItems(effectiveItems, debouncedItemSearch, categoryFilter),
    [effectiveItems, debouncedItemSearch, categoryFilter]
  );

  const [isStandalone, setIsStandalone] = useState(() => Boolean(row?.isStandalone || (isEdit && !row?.poLineId && row?.poId === 'NGOAI-PO')));
  const [selectedRowId, setSelectedRowId] = useState(
    initialMatched ? String(initialMatched.rowId) : ''
  );
  const selectedOrder = useMemo(
    () => effectiveItems.find(item => String(item.rowId) === String(selectedRowId)) || null,
    [effectiveItems, selectedRowId]
  );

  const allApDocs = useMemo(
    () => [...(finance?.payables || []), ...(finance?.payableSplitSources || [])],
    [finance]
  );

  const [docNoVal, setDocNoVal] = useState(() =>
    isEdit ? row?.docNo || '' : suggestUniqueDocNo('AP', initialMatched, allApDocs)
  );
  const [poIdVal, setPoIdVal] = useState(() => initialMatched?.poId || row?.poId || '');
  const [vendorNoVal, setVendorNoVal] = useState(() => initialMatched?.vendorNo || row?.vendorNo || '');
  const [supplierNameVal, setSupplierNameVal] = useState(() => initialMatched?.vendorName || row?.supplierName || '');
  const [skuVal, setSkuVal] = useState(() => initialMatched?.vendorItemNo || row?.sku || '');
  const [categoryVal, setCategoryVal] = useState(
    () => initialMatched?.category || row?.category || existingCategories[0] || ''
  );
  const [dueDateVal, setDueDateVal] = useState(() =>
    dateInputValue(row?.dueDate) ||
    dateInputValue(initialMatched?.etaDate || initialMatched?.expectedReceiptDate) ||
    businessToday()
  );
  const [originalAmountVal, setOriginalAmountVal] = useState(() =>
    isEdit ? row?.originalAmount ?? '' : computeOrderTotalVnd(initialMatched)
  );
  const [adjustmentVal] = useState(() => row?.adjustment ?? 0);
  const [picVal, setPicVal] = useState(() => row?.pic || (actor?.role === 'Accountant' ? actor.name : '') || '');
  const [requestNoteVal, setRequestNoteVal] = useState(() =>
    isEdit
      ? row?.requestNote || ''
      : initialMatched
        ? `Thanh toán PO ${initialMatched.poId} - ${initialMatched.vendorItemNo} (${initialMatched.vendorName})`
        : ''
  );

  // Chức năng: Áp dụng (applySelectedOrder - Selected Order) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const applySelectedOrder = nextRowId => {
    setSelectedRowId(nextRowId);
    const found = effectiveItems.find(item => String(item.rowId) === String(nextRowId));
    if (found) {
      if (!isEdit) {
        setDocNoVal(suggestUniqueDocNo('AP', found, allApDocs));
      }
      setPoIdVal(found.poId || '');
      setVendorNoVal(found.vendorNo || '');
      setSupplierNameVal(found.vendorName || '');
      setSkuVal(found.vendorItemNo || '');
      setCategoryVal(found.category || '');
      const nextDue = dateInputValue(found.etaDate || found.expectedReceiptDate);
      if (nextDue) setDueDateVal(nextDue);
      if (!isEdit) {
        setOriginalAmountVal(computeOrderTotalVnd(found));
        setRequestNoteVal(
          `Thanh toán PO ${found.poId} - ${found.vendorItemNo} (${found.vendorName})`
        );
      }
    }
  };

  useEffect(() => {
    if (!isEdit && !selectedRowId && effectiveItems.length > 0) {
      applySelectedOrder(String(effectiveItems[0].rowId));
    }
  }, [effectiveItems.length]);

  useEffect(() => {
    if (!isEdit && debouncedItemSearch.trim() && filteredItems.length > 0) {
      if (!filteredItems.some(i => String(i.rowId) === String(selectedRowId))) {
        applySelectedOrder(String(filteredItems[0].rowId));
      }
    }
  }, [debouncedItemSearch, filteredItems]);

  // Chức năng: Xử lý sự kiện (handleCategoryFilterChange - Category Filter Change) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const handleCategoryFilterChange = event => {
    const nextCat = event.target.value;
    setCategoryFilter(nextCat);
    if (nextCat !== 'all') {
      const matching = filterPoItems(effectiveItems, debouncedItemSearch, nextCat);
      if (matching.length > 0) {
        applySelectedOrder(String(matching[0].rowId));
      } else {
        setCategoryVal(nextCat);
      }
    } else if (effectiveItems.length > 0) {
      applySelectedOrder(String(effectiveItems[0].rowId));
    }
  };

  return (
    <form
      className="workflow-form"
      onSubmit={event => {
        const raw = values(event);
        const payload = {
          ...(isEdit ? { id: row.id } : {}),
          docNo: raw.docNo,
          rowId: selectedRowId || undefined,
          poId: selectedOrder ? selectedOrder.poId : poIdVal,
          vendorNo: selectedOrder ? selectedOrder.vendorNo : vendorNoVal,
          supplierName: selectedOrder ? selectedOrder.vendorName : supplierNameVal,
          sku: selectedOrder ? selectedOrder.vendorItemNo : skuVal,
          category: selectedOrder ? selectedOrder.category : categoryVal,
          dueDate: raw.dueDate,
          originalAmount: raw.originalAmount,
          adjustment: raw.adjustment || 0,
          pic: raw.pic || '',
          requestNote: raw.requestNote || '',
        };
        onAction(isEdit ? 'update-payable' : 'create-payable', payload);
      }}
    >
      <FinanceCreatorOwnershipBanner actor={actor} isEdit={isEdit} row={row} />
      <div className="workflow-grid">
        <label>
          {t("Lọc ngành hàng")}
          <select value={categoryFilter} onChange={handleCategoryFilterChange}>
            <option value="all">{t("Tất cả ngành hàng")}</option>
            {existingCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Tìm đơn hàng / mã hàng")}
          <input
            type="search"
            value={itemSearch}
            onChange={event => setItemSearch(event.target.value)}
          />
        </label>

        <label className="workflow-wide">
          {t("Chọn đơn hàng PO (tự điền công nợ)")}
          <select
            name="poLineId"
            value={selectedRowId}
            onChange={e => applySelectedOrder(e.target.value)}
          >
            <option value="">{t("— Nhập thủ công —")}</option>
            {filteredItems.map(item => (
              <option key={item.rowId} value={item.rowId}>
                {item.poId} · {t(item.vendorItemNo)} · {item.category} · {item.vendorNo} - {t(item.vendorName)} ({formatMoney(computeOrderTotalVnd(item) || 0)})
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("Số chứng từ phải trả")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="docNo"
            required
            maxLength={64}
            value={docNoVal}
            onChange={e => setDocNoVal(e.target.value)}
          />
        </label>
        <label>
          {t("Hạn thanh toán")}
          <input
            name="dueDate"
            type="date"
            value={dueDateVal}
            onChange={e => setDueDateVal(e.target.value)}
          />
        </label>

        <label>
          {t("Số PO")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="poId"
            required
            maxLength={64}
            value={selectedOrder ? selectedOrder.poId : poIdVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => {
              const nextPo = e.target.value;
              setPoIdVal(nextPo);
              const byPo = effectiveItems.find(i => i.poId.toLowerCase() === nextPo.trim().toLowerCase());
              if (byPo) applySelectedOrder(String(byPo.rowId));
            }}
          />
        </label>
        <label>
          {t("Mã NCC")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="vendorNo"
            required
            maxLength={64}
            value={selectedOrder ? selectedOrder.vendorNo : vendorNoVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => setVendorNoVal(e.target.value)}
          />
        </label>
        <label>
          {t("Nhà cung cấp")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="supplierName"
            required
            maxLength={255}
            value={selectedOrder ? selectedOrder.vendorName : supplierNameVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => setSupplierNameVal(e.target.value)}
          />
        </label>
        <label>
          {t("SKU / Mã hàng")}
          <input
            name="sku"
            maxLength={120}
            value={selectedOrder ? selectedOrder.vendorItemNo : skuVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => {
              const nextSku = e.target.value;
              setSkuVal(nextSku);
              const bySku = effectiveItems.find(
                i => String(i.vendorItemNo || '').toLowerCase() === nextSku.trim().toLowerCase()
              );
              if (bySku?.category) setCategoryVal(bySku.category);
            }}
          />
        </label>
        <label>
          {t("Ngành hàng")} <span className="required-mark" aria-hidden="true">*</span>
          <input
            name="category"
            list="uv-ap-categories"
            required
            maxLength={120}
            value={selectedOrder ? selectedOrder.category || '' : categoryVal}
            readOnly={Boolean(selectedOrder)}
            onChange={e => setCategoryVal(e.target.value)}
          />
          <datalist id="uv-ap-categories">
            {existingCategories.map(cat => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </label>
        <label>
          {t("Người phụ trách (PIC)")}
          <input
            name="pic"
            maxLength={100}
            value={picVal}
            onChange={e => setPicVal(e.target.value)}
          />
        </label>

        <MoneyField
          name="originalAmount"
          label={t("Số tiền phải trả gốc")}
          defaultValue={originalAmountVal}
        />
        <MoneyField
          name="adjustment"
          label={t("Điều chỉnh tăng/giảm")}
          required={false}
          allowNegative={true}
          defaultValue={adjustmentVal}
        />
        <label className="workflow-wide">
          {t("Ghi chú")}
          <textarea
            name="requestNote"
            maxLength={500}
            value={requestNoteVal}
            onChange={e => setRequestNoteVal(e.target.value)}
          />
        </label>
      </div>
      <Footer onClose={onClose} label={t(isEdit ? 'Lưu cập nhật phải trả' : 'Tạo khoản phải trả')} />
    </form>
  );
}

// Chức năng: Không gian làm việc Thu tiền & Phân bổ thu: ghi nhận phiếu thu tiền mặt/chuyển khoản và phân bổ vào từng hóa đơn phải thu
export function ReceiptWorkspace({ finance, initialDebtId, onAction, onClose }) {
  const targetDebt = finance.receivables.find(row => row.id === initialDebtId);
  const customers = financeCustomers(finance);
  const receipts = finance.receipts.filter(row => row.amount - row.allocatedAmount > 0 &&
    (!targetDebt || !row.customerName || row.customerName === targetDebt.customerName));
  const [receiptId, setReceiptId] = useState(receipts[0]?.id || 'new');
  const receipt = receipts.find(row => row.id === receiptId);
  const [correcting, setCorrecting] = useState(false);
  const canCorrect = receipt && receipt.allocatedAmount === 0 && receipt.status === 'identified';
  const debts = finance.receivables.filter(row => receivableForAllocation(row, receipt?.customerName) &&
    (!targetDebt || row.id === targetDebt.id));
  const [debtId, setDebtId] = useState(targetDebt?.id || debts[0]?.id || '');
  const selectedDebt = debts.find(row => row.id === debtId) || debts[0];
  const remainingReceipt = receipt ? receipt.amount - receipt.allocatedAmount : 0;
  const remainingDebt = selectedDebt ? selectedDebt.originalAmount + (selectedDebt.adjustment || 0) - selectedDebt.allocatedPaid : 0;
  const limit = Math.max(0, Math.min(remainingReceipt, remainingDebt));
  // Chức năng: Xử lý nghiệp vụ (receiptForm - Form) phục vụ xử lý dữ liệu trong FinanceForms.jsx
  const receiptForm = async event => {
    const payload = values(event);
    const next = await onAction('receipt', {
      ...payload,
      customerName: targetDebt?.customerName || payload.customerName,
      id: receipt && (receipt.status === 'unidentified' || correcting) ? receipt.id : undefined,
    }, false);
    if (!next) return;
    setCorrecting(false);
    if (!receipt) setReceiptId(next.receipts.at(-1).id);
  };

  return <div className="workflow-form">
    {targetDebt && <p className="workflow-context"><strong>{targetDebt.docNo}</strong> · {t(targetDebt.customerName)}</p>}
    <ol className="workflow-steps" aria-label={t("Các bước xử lý tiền thu")}><li className="is-done">{t("Chọn khoản thu")}</li><li className={!receipt || receipt.status === 'unidentified' ? 'is-current' : 'is-done'}>{t("Xác định khách hàng")}</li><li className={receipt?.status === 'identified' ? 'is-current' : ''}>{t("Phân bổ hóa đơn")}</li></ol>
    <label>{t("Khoản thu")}<select value={receipt?.id || 'new'} onChange={event => { setReceiptId(event.target.value); setDebtId(''); setCorrecting(false); }}>
      {receipts.map(row => <option key={row.id} value={row.id}>{row.reference || row.id} · {t(row.customerName || 'Chưa xác định khách hàng')}{t(" · Còn ")}{formatMoney(row.amount - row.allocatedAmount)}</option>)}<option value="new">{t("Ghi nhận khoản thu mới")}</option>
    </select></label>
    {receipt && <p className="workflow-summary">{t("Đã nhận ")}{formatMoney(receipt.amount)}{t(" · Đã phân bổ ")}{formatMoney(receipt.allocatedAmount)}</p>}
    {canCorrect && !correcting && <button type="button" className="row-detail-button" onClick={() => setCorrecting(true)}>{t("Sửa đối soát")}</button>}
    {(!receipt || receipt.status === 'unidentified' || correcting) ? <form onSubmit={receiptForm} key={receiptId}>
      <h4>{t(correcting ? 'Sửa đối soát khoản thu' : receipt ? 'Đối soát khoản thu' : 'Ghi nhận tiền đã nhận')}</h4>
      <div className="workflow-grid">
        <label>{t("Khách hàng")}{Boolean(receipt) && <> <span className="required-mark" aria-hidden="true">*</span></>}{targetDebt ? <input value={t(targetDebt.customerName)} readOnly /> :
          <select name="customerName" required={Boolean(receipt)} defaultValue={customers.includes(receipt?.customerName) ? receipt.customerName : (customers[0] || '')}>
            <option value="">{t(receipt ? 'Chọn khách hàng' : 'Chưa xác định khách hàng')}</option>
            {customers.map(name => <option key={name} value={name}>{t(name)}</option>)}
          </select>}</label>
        <label>{t("Tham chiếu ngân hàng hoặc phiếu thu")} <span className="required-mark" aria-hidden="true">*</span><input name="reference" required maxLength={120} defaultValue={receipt?.reference || ''} /></label>
        <label>{t("Ngày nhận tiền")} <span className="required-mark" aria-hidden="true">*</span><input name="date" type="date" required max={businessToday()} min={receipt?.id === OPENING_RECEIPT_ID ? undefined : dateInputValue(finance.openingDate) || undefined} defaultValue={dateInputValue(receipt?.date) || businessToday()} /></label>
        {!receipt && <MoneyField name="amount" label={t("Số tiền đã nhận")} />}
        {correcting && <label className="workflow-wide">{t("Lý do sửa đối soát")} <span className="required-mark" aria-hidden="true">*</span><textarea name="correctionReason" required maxLength={500} /></label>}
      </div><Footer onClose={onClose} label={t(correcting ? 'Lưu đối soát đã sửa' : receipt ? 'Xác nhận đối soát' : 'Lưu khoản thu')} />
    </form> : <form key={receiptId} onSubmit={event => {
      const payload = values(event);
      if (selectedDebt && limit > 0) onAction('allocate', { ...payload, debtId: selectedDebt.id, receiptId: receipt.id });
    }}>
      <h4>{t("Phân bổ vào hóa đơn cùng khách hàng")}</h4>
      <div className="workflow-grid">
        <label className="workflow-wide">{t("Hóa đơn phải thu")} <span className="required-mark" aria-hidden="true">*</span><select name="debtId" required value={selectedDebt?.id || ''} onChange={event => setDebtId(event.target.value)}>{!debts.length && <option value="">{t("Không có hóa đơn còn dư nợ cùng khách hàng")}</option>}{debts.map(row => <option key={row.id} value={row.id}>{row.docNo}{t(" · Còn ")}{formatMoney(row.originalAmount + (row.adjustment || 0) - row.allocatedPaid)}</option>)}</select></label>
        <MoneyField name="amount" label={t("Số tiền phân bổ")} max={limit} key={`${receiptId}-${selectedDebt?.id}-${limit}`} defaultValue={limit || ''} />
        <label>{t("Ngày phân bổ")} <span className="required-mark" aria-hidden="true">*</span><input name="date" type="date" required min={[dateInputValue(finance.openingDate), dateInputValue(receipt.date), dateInputValue(finance.revenue.find(row => row.docNo === selectedDebt?.docNo)?.recordDate)].filter(Boolean).sort().at(-1)} max={businessToday()} defaultValue={businessToday()} /></label>
      </div><Footer onClose={onClose} label={t("Xác nhận phân bổ")} disabled={!selectedDebt || limit <= 0} />
    </form>}
    <FinanceHistory entries={finance.audit.filter(row => row.type.startsWith('RECEIPT'))} />
  </div>;
}

// Chức năng: Biểu mẫu xử lý Công nợ phải trả 3 bước: Lập đề nghị chi (Kế toán) -> Phê duyệt/Yêu cầu bổ sung (CEO/Admin độc lập) -> Ghi nhận đã chi UNC (Kế toán)
export function PayableForm({ type, row, onAction, onClose, actorId }) {
  const remaining = row.originalAmount + (row.adjustment || 0) - row.allocatedPaid;
  const action = type === 'SUBMIT_AP' ? 'submit' : type === 'REVIEW_AP' ? 'review' : 'pay';
  const reviewDecisionRef = useRef(null);
  const [decisionError, setDecisionError] = useState('');
  // SEC-02 Fix: Áp dụng quy tắc 2 người (Maker-Checker) cho mọi vai trò, bao gồm cả CEO và Admin
  const selfApprovalBlocked = Boolean(row.requestedBy && row.requestedBy === actorId);
  const proposalVersion = Number(row.proposalVersion || 1);
  return <form className="workflow-form" onSubmit={event => {
    const submitterVal = event.nativeEvent?.submitter?.value;
    if (action === 'review') {
      const explicitDecision = submitterVal ?? reviewDecisionRef.current;
      reviewDecisionRef.current = null;
      if (explicitDecision !== 'approve' && explicitDecision !== 'return') {
        event.preventDefault();
        setDecisionError('Vui lòng bấm rõ nút "Duyệt đề nghị" hoặc "Yêu cầu bổ sung".');
        return;
      }
      const approve = explicitDecision === 'approve';
      if (approve && (needsPayableSplit(row) || selfApprovalBlocked)) {
        event.preventDefault();
        return;
      }
      setDecisionError('');
      // SEC-01 Fix: Gửi kèm phiên bản đề nghị và số tiền/hạn thanh toán đang hiển thị để Backend đối chiếu chống phê duyệt nhầm phiên bản
      onAction(action, {
        ...values(event),
        id: row.id,
        approve,
        expectedProposalVersion: proposalVersion,
        expectedRequestedAmount: row.requestAmount,
        expectedProposedDueDate: row.requestedDueDate || row.dueDate,
        expectedRequestNote: row.requestNote || '',
      });
      return;
    }
    onAction(action, { ...values(event), id: row.id });
  }}>
    <p className="workflow-summary"><strong>{row.docNo} · {t(row.supplierName)}</strong><br />{t("Còn phải trả ")}{formatMoney(remaining)} · {t(row.approvalState)}</p>
    {needsPayableSplit(row) && <p className="workflow-callout">{t("Kế toán cần tách và đối soát chứng từ trước khi CEO duyệt chi.")}</p>}
    {action === 'submit' && <div className="workflow-grid"><MoneyField name="amount" label={t("Số tiền đề nghị")} max={remaining} defaultValue={remaining} /><label>{t("Hạn thanh toán đề nghị")} <span className="required-mark" aria-hidden="true">*</span><input name="dueDate" type="date" required defaultValue={dateInputValue(row.dueDate)} /></label><label className="workflow-wide">{t("Nội dung đề nghị")} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={500} /></label></div>}
    {action === 'review' && <><p className="review-amount">{t("Đề nghị ")}<strong>{formatMoney(row.requestAmount)}</strong>{t(" · Hạn đề nghị ")}{formatDate(row.requestedDueDate || row.dueDate)} · <small>v{proposalVersion}</small></p><p>{t(row.requestNote || 'Hồ sơ chờ duyệt được chuyển từ dữ liệu mở đầu.')}</p>{selfApprovalBlocked && <p className="workflow-callout">{t('Người lập đề nghị không được tự duyệt.')}</p>}<label>{t("Ý kiến xử lý")} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={500} onChange={() => { if (decisionError) setDecisionError(''); }} /></label>{decisionError && <small className="field-hint is-error" role="alert">{t(decisionError)}</small>}<div className="workflow-footer"><button type="button" onClick={onClose}>{t("Hủy")}</button><button type="submit" name="reviewDecision" value="return" onClick={() => { reviewDecisionRef.current = 'return'; }}>{t("Yêu cầu bổ sung")}</button><button className="primary" type="submit" name="reviewDecision" value="approve" onClick={() => { reviewDecisionRef.current = 'approve'; }} disabled={needsPayableSplit(row) || selfApprovalBlocked}>{t("Duyệt đề nghị")}</button></div></>}
    {action === 'pay' && <div className="workflow-grid"><MoneyField name="amount" label={t("Số tiền đã chi")} max={Math.min(remaining, row.approvedRemaining)} defaultValue={Math.min(remaining, row.approvedRemaining)} /><label>{t("Ngày chi")} <span className="required-mark" aria-hidden="true">*</span><input name="date" type="date" required min={dateInputValue(row.reviewedDate) || undefined} max={businessToday()} defaultValue={businessToday()} /></label><label className="workflow-wide">{t("Tham chiếu ngân hàng hoặc phiếu chi")} <span className="required-mark" aria-hidden="true">*</span><input name="reference" required maxLength={120} /></label></div>}
    {action === 'submit' && <Footer onClose={onClose} label={t("Trình CEO duyệt")} />}
    {action === 'pay' && <Footer onClose={onClose} label={t("Xác nhận đã chi trả")} />}
  </form>;
}


// Chức năng: Biểu mẫu xử lý Công nợ phải thu 3 bước: Lập đề nghị thu (Kế toán) -> CEO xác nhận thu -> Xác nhận đã thu tiền
export function ReceivableWorkflowForm({ type, row, onAction, onClose, actorId }) {
  const remaining = Number(row.originalAmount || 0) + Number(row.adjustment || 0) - Number(row.allocatedPaid || 0);
  const action = type === 'SUBMIT_AR' ? 'submit-receivable' : type === 'REVIEW_AR' ? 'review-receivable' : 'confirm-receivable';
  const reviewDecisionRef = useRef(null);
  const [decisionError, setDecisionError] = useState('');
  const selfApprovalBlocked = Boolean(row.collectionRequestedBy && row.collectionRequestedBy === actorId);

  return <form className="workflow-form" onSubmit={event => {
    const submitterVal = event.nativeEvent?.submitter?.value;
    if (action === 'review-receivable') {
      const explicitDecision = submitterVal ?? reviewDecisionRef.current;
      reviewDecisionRef.current = null;
      if (explicitDecision !== 'approve' && explicitDecision !== 'return') {
        event.preventDefault();
        setDecisionError('Vui lòng bấm rõ nút "Xác nhận đề nghị thu" hoặc "Yêu cầu bổ sung".');
        return;
      }
      const approve = explicitDecision === 'approve';
      if (approve && selfApprovalBlocked) {
        event.preventDefault();
        return;
      }
      setDecisionError('');
      onAction(action, { ...values(event), id: row.id, approve });
      return;
    }
    onAction(action, { ...values(event), id: row.id });
  }}>
    <p className="workflow-summary">
      <strong>{row.docNo} · {t(row.customerName)}</strong><br />
      {t("Còn phải thu ")}{formatMoney(remaining)} · {t(row.collectionState || 'Chưa lập đề nghị thu')}
    </p>
    {action === 'submit-receivable' && (
      <div className="workflow-grid">
        <MoneyField name="amount" label={t("Số tiền đề nghị thu")} max={remaining} defaultValue={remaining} />
        <label>{t("Hạn thu dự kiến")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="dueDate" type="date" required defaultValue={dateInputValue(row.dueDate) || businessToday()} />
        </label>
        <label className="workflow-wide">{t("Nội dung đề nghị thu")} <span className="required-mark" aria-hidden="true">*</span>
          <textarea name="note" required maxLength={500} />
        </label>
      </div>
    )}
    {action === 'review-receivable' && (
      <>
        <p className="review-amount">
          {t("Đề nghị thu ")}<strong>{formatMoney(row.collectionRequestAmount || remaining)}</strong>
          {t(" · Hạn thu ")}{formatDate(row.collectionRequestedDueDate || row.dueDate)}
        </p>
        <p>{t(row.collectionRequestNote || 'Đề nghị CEO xác nhận tiến hành thu hồi công nợ.')}</p>
        {selfApprovalBlocked && <p className="workflow-callout">{t('Người lập đề nghị thu không được tự xác nhận.')}</p>}
        <label>{t("Ý kiến xác nhận")} <span className="required-mark" aria-hidden="true">*</span>
          <textarea name="note" required maxLength={500} onChange={() => { if (decisionError) setDecisionError(''); }} />
        </label>
        {decisionError && <small className="field-hint is-error" role="alert">{t(decisionError)}</small>}
        <div className="workflow-footer">
          <button type="button" onClick={onClose}>{t("Hủy")}</button>
          <button type="submit" name="reviewDecision" value="return" onClick={() => { reviewDecisionRef.current = 'return'; }}>{t("Yêu cầu bổ sung")}</button>
          <button className="primary" type="submit" name="reviewDecision" value="approve" onClick={() => { reviewDecisionRef.current = 'approve'; }} disabled={selfApprovalBlocked}>{t("Xác nhận đề nghị thu")}</button>
        </div>
      </>
    )}
    {action === 'confirm-receivable' && (
      <div className="workflow-grid">
        <MoneyField name="amount" label={t("Số tiền đã thu")} max={remaining} defaultValue={Math.min(remaining, row.collectionRequestAmount || remaining)} />
        <label>{t("Ngày thu tiền")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="date" type="date" required max={businessToday()} defaultValue={businessToday()} />
        </label>
        <label className="workflow-wide">{t("Tham chiếu ngân hàng / Phiếu thu")} <span className="required-mark" aria-hidden="true">*</span>
          <input name="reference" required maxLength={120} defaultValue={`THU-${row.docNo}`} />
        </label>
      </div>
    )}
    {action === 'submit-receivable' && <Footer onClose={onClose} label={t("Gửi xác nhận")} />}
    {action === 'confirm-receivable' && <Footer onClose={onClose} label={t("Xác nhận đã thu tiền")} />}
  </form>;
}

// Chức năng: Biểu mẫu tách chứng từ công nợ phải trả gộp nhiều nhà cung cấp thành từng khoản công nợ riêng biệt trước khi trình duyệt
export function SplitPayableForm({ row, items, onAction, onClose }) {
  const effectiveItems = useResolvedOrderItems(items, null);
  const vendors = payableSplitVendors(row, effectiveItems);
  const missing = vendors.some(vendor => !vendor.lines.length);
  return <form className="workflow-form" onSubmit={event => {
    const input = values(event);
    const parts = Object.fromEntries(vendors.map(({ code }) => [code, {
      docNo: input[`docNo-${code}`], dueDate: input[`dueDate-${code}`], originalAmount: input[`original-${code}`],
      adjustment: input[`adjustment-${code}`], allocatedPaid: input[`paid-${code}`],
    }]));
    onAction('split', { id: row.id, parts, note: input.note });
  }}>
    <p className="workflow-summary"><strong>{row.docNo}</strong><br />{t("Tiền gốc ")}{formatMoney(row.originalAmount)}{t(" · Điều chỉnh ")}{formatMoney(row.adjustment)}{t(" · Đã trả ")}{formatMoney(row.allocatedPaid)}</p>
    {missing ? <p className="workflow-callout">{t("Thiếu dữ liệu PO để xác định nhà cung cấp cho chứng từ này.")}</p> : vendors.map(({ code, name, lines }) => <fieldset key={code}>
      <legend className="font-semibold">{code} · {t(name)}</legend>
      <p className="mb-2 text-xs text-slate-600">{[...new Set(lines.map(line => line.poId))].join(' · ')}</p>
      <div className="workflow-grid">
        <label>{t("Số chứng từ riêng")} <span className="required-mark" aria-hidden="true">*</span><input name={`docNo-${code}`} required maxLength={64} /></label>
        <label>{t("Hạn thanh toán đã xác minh")}<input name={`dueDate-${code}`} type="date" /></label>
        <MoneyField name={`original-${code}`} label={t("Số tiền gốc")} max={row.originalAmount} />
        {row.adjustment > 0 && <MoneyField name={`adjustment-${code}`} label={t("Tiền điều chỉnh")} max={row.adjustment} required={false} />}
        {row.allocatedPaid > 0 && <MoneyField name={`paid-${code}`} label={t("Số đã trả")} max={row.allocatedPaid} required={false} />}
      </div>
    </fieldset>)}
    <label>{t("Căn cứ tách và đối soát")} <span className="required-mark" aria-hidden="true">*</span><textarea name="note" required maxLength={500} /></label>
    <Footer onClose={onClose} label={t("Lưu chứng từ đã tách")} disabled={missing} />
  </form>;
}

// Chức năng: Bảng nhật ký kiểm toán tài chính (Audit Log): hiển thị toàn bộ lịch sử tạo hóa đơn, thu tiền, phân bổ và duyệt chi
export function FinanceHistory({ entries }) {
  if (!entries.length) return null;
  return <details className="workflow-history"><summary>{t("Lịch sử xử lý gần đây")}</summary><ul>{entries.slice(-12).reverse().map(row => <li key={row.id}><strong>{t(({
    INVOICE_RECORDED: 'Ghi nhận doanh thu',
    RECEIVABLE_CREATED: 'Tạo công nợ phải thu',
    RECEIVABLE_UPDATED: 'Cập nhật phải thu',
    RECEIVABLE_DELETED: 'Xóa phải thu',
    RECEIVABLE_SUBMITTED: 'Lập đề nghị thu',
    RECEIVABLE_APPROVED: 'CEO xác nhận đề nghị thu',
    RECEIVABLE_RETURNED: 'Yêu cầu bổ sung hồ sơ thu',
    RECEIVABLE_CONFIRMED_COLLECTED: 'Xác nhận đã thu tiền',
    RECEIPT_IDENTIFIED: 'Đối soát khoản thu',
    RECEIPT_CORRECTED: 'Sửa đối soát khoản thu',
    RECEIPT_RECORDED: 'Ghi nhận khoản thu',
    RECEIPT_ALLOCATED: 'Phân bổ tiền thu',
    PAYABLE_RECORDED: 'Ghi nhận phải trả',
    PAYABLE_UPDATED: 'Cập nhật phải trả',
    PAYABLE_DELETED: 'Xóa phải trả',
    PAYABLE_SUBMITTED: 'Trình đề nghị chi',
    PAYABLE_APPROVED: 'Duyệt chi',
    PAYABLE_RETURNED: 'Yêu cầu bổ sung',
    PAYABLE_PAID: 'Ghi nhận đã chi',
    PAYABLE_SPLIT: 'Tách chứng từ gộp',
  })[row.type] || row.type)}</strong> · {row.reference} · {row.actorName === 'Quản trị Demo' || row.actorName === 'Admin' ? t('Ban Giám đốc') : row.actorName} · {new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.occurredAt))}<br />{t(row.detail)}{row.amount !== null && ` · ${formatMoney(row.amount)}`}</li>)}</ul></details>;
}
