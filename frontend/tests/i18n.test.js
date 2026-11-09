import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, locale, phrase, setLanguage, subscribeLanguage, t, translate } from '../src/locales/i18n.js';
import { INITIAL_VENDOR_ITEMS, INITIAL_REVENUE_RECORDS, INITIAL_RECEIVABLES, INITIAL_PAYABLES } from '../src/mock/dashboard.js';
import { classifyDebt, formatMoney } from '../src/utils/dashboardMetrics.js';

test('language switches update localized labels and formatters while preserving business codes', () => {
  const savedLanguage = getLanguage();
  const observed = [];
  const unsubscribe = subscribeLanguage(() => observed.push(getLanguage()));
  try {
    setLanguage('vi');
    const record = { originalAmount: 1000000, allocatedPaid: 0, dueDate: '04/11/2026' };
    const balance = classifyDebt(record, '2026-11-05');
    assert.equal(t('Đăng nhập'), 'Đăng nhập');
    assert.equal(formatMoney(balance.remaining), '1.000.000 VND');
    setLanguage('en');
    assert.equal(locale(), 'en-GB');
    assert.equal(t('Đăng nhập'), 'Sign in');
    assert.equal(t(balance.alertLabel), '1 day overdue');
    assert.equal(t(balance.agingBucket), '1–30 days overdue');
    assert.equal(balance.debtStatus, 'overdue');
    assert.equal(formatMoney(balance.remaining), '1,000,000 VND');
    assert.equal(phrase('§ chứng từ', 1), '1 document');
    assert.equal(phrase('§ chứng từ', 2), '2 documents');
    setLanguage('vi');
    assert.deepEqual(observed.slice(-2), ['en', 'vi']);
  } finally {
    unsubscribe();
    setLanguage(savedLanguage);
  }
});

test('translates specific errors and alerts before broader patterns', () => {
  assert.equal(translate('Chi tiết nhập giao PO-2026-089', 'en'), 'View receiving and delivery details for PO-2026-089');
  assert.equal(translate('Số tiền đề nghị phải là số nguyên VND lớn hơn 0.', 'en'),
    'Requested amount must be a whole number in VND and must be greater than zero.');
  assert.equal(translate('Quá hạn 51 ngày', 'en'), '51 days overdue');
  assert.equal(translate('Đăng nhập thành công với vai trò: Kế toán trưởng (Doanh thu & Công nợ)', 'en'),
    'Signed in as Chief Accountant (Revenue and Balances).');
  assert.equal(translate('CÔNG TY TNHH MẪU MỚI', 'en'), 'CÔNG TY TNHH MẪU MỚI');
  assert.equal(translate('PO-2026-089', 'en'), 'PO-2026-089');
});

test('known company names display in English without changing the source name or vendor code', () => {
  const names = new Set(
    [...INITIAL_VENDOR_ITEMS, ...INITIAL_REVENUE_RECORDS, ...INITIAL_RECEIVABLES, ...INITIAL_PAYABLES]
      .flatMap(row => [row.vendorName, row.vendorRef, row.supplierName, row.customerName])
      .filter(name => name && /[À-ỹ]/.test(name)),
  );
  assert.ok(names.size > 0);
  for (const name of names) {
    assert.doesNotMatch(translate(name, 'en'), /[À-ỹ]/, name);
    assert.equal(translate(name, 'vi'), name);
  }
  assert.equal(translate('15089 - CTY SX TM TỔNG HỢP II', 'en'), '15089 - Tong Hop II Manufacturing and Trading Co., Ltd.');
  assert.equal(translate('CÔNG TY TNHH ALDY HUTA & HUBEI ROCKY', 'en'), 'Aldy Huta Co., Ltd. & Hubei Rocky');
  assert.equal(translate('Volkswagen AG Procurement', 'en'), 'Volkswagen AG Procurement');
});
