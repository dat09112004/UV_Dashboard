import test from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_ACCOUNTS } from '../src/mock/accounts.js';
import { authenticateMockAccount, changeMockPassword } from '../src/features/auth/services/mockAuth.js';
import { INITIAL_VENDOR_ITEMS as items, INITIAL_REVENUE_RECORDS as revenue, INITIAL_RECEIVABLES as ar, INITIAL_PAYABLES as ap, MONTHLY_REVENUE_CHART as history, DATA_AS_OF as date } from '../src/mock/dashboard.js';
import { comparePriority, classifyDebt, classifyProgress, debtSummary, summarizeCategories, buildAlertQueue, sumBy, monthlyRevenueSeries, matchesOrigin, debtMatchesFilter } from '../src/utils/dashboardMetrics.js';

const classifiedAr = ar.map(row => classifyDebt(row, date));
const classifiedAp = ap.map(row => classifyDebt(row, date));
const classifiedItems = items.map(row => classifyProgress(row, date));

test('mock accounts are complete, distinct, and give task assignment to CEO and Admin', async () => {
  assert.equal(new Set(MOCK_ACCOUNTS.map(a => a.id)).size, 4);
  assert.equal(new Set(MOCK_ACCOUNTS.map(a => a.email)).size, 4);
  for (const account of MOCK_ACCOUNTS) {
    for (const key of ['id', 'email', 'username', 'password', 'name', 'role', 'roleLabel', 'title', 'department', 'employeeCode', 'status', 'dataScope', 'timezone']) assert.ok(account[key]);
    assert.equal(account.permissions.includes('tasks.assign'), ['CEO', 'Admin'].includes(account.role));
    assert.equal((await authenticateMockAccount(` ${account.email.toUpperCase()} `, account.password))?.id, account.id);
    assert.equal(await authenticateMockAccount(account.email, 'invalid-password'), null);
  }
  assert.equal(await authenticateMockAccount('unknown@uyenvu.vn', '123'), null);
});

test('demo password change requires the current password, replaces only that account, and stores no plaintext', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  });
  const [account, other] = MOCK_ACCOUNTS;
  const password = 'example-demo-replacement';
  assert.match(await changeMockPassword(account.id, account.password, 'short'), /8 đến 128/);
  assert.match(await changeMockPassword(account.id, 'incorrect', password), /không đúng/);
  assert.equal(saved.size, 0);
  assert.equal(await changeMockPassword(account.id, account.password, password), null);
  assert.equal(saved.size, 1);
  assert.equal([...saved.values()][0].includes(password), false);
  assert.equal(await authenticateMockAccount(account.email, account.password), null);
  const profile = await authenticateMockAccount(account.email, password);
  assert.equal(profile?.id, account.id);
  assert.equal('password' in profile, false);
  assert.equal((await authenticateMockAccount(other.email, other.password))?.id, other.id);
  const [key] = saved.keys();
  saved.set(key, '{}');
  await assert.rejects(authenticateMockAccount(account.email, account.password), /Invalid demo credential/);
});

test('source amounts and exact industry names stay intact', () => {
  assert.equal(items.length, 20);
  assert.equal(revenue.length, 6);
  assert.equal(sumBy(revenue, 'netRevenue'), 986350000);
  assert.equal(sumBy(revenue, 'cashCollected'), 596350000);
  assert.deepEqual(summarizeCategories(items, revenue).map(c => [c.category, c.totalItems]), [
    ['Garment', 7], ['Recycle Bag', 11], ['Volkswagen Ipin Touch Cable', 2],
  ]);
});

test('today and overdue balances are red, future and unknown dates do not inflate due KPI', () => {
  const ars = debtSummary(classifiedAr), aps = debtSummary(classifiedAp);
  assert.deepEqual(ars, { total: 390000000, overdue: 147000000, today: 118000000, upcoming: 125000000, unknown: 0, due: 265000000 });
  assert.deepEqual(aps, { total: 668000000, overdue: 183000000, today: 275000000, upcoming: 0, unknown: 210000000, due: 458000000 });
  for (const row of [...classifiedAr, ...classifiedAp].filter(row => ['today', 'overdue'].includes(row.debtStatus))) assert.equal(row.priorityRank, 0);
  assert.equal(classifiedAp.find(row => row.debtStatus === 'unknown').priorityRank, 0);
});

test('date changes refresh alerts and fully paid balances leave the alert queue', () => {
  const futureDebt = ar.find(row => row.dueDate === '12/11/2026');
  assert.equal(classifyDebt(futureDebt, date).debtStatus, 'upcoming');
  assert.equal(classifyDebt(futureDebt, '2026-11-12').debtStatus, 'today');
  assert.equal(classifyDebt(futureDebt, '2026-11-13').overdueDays, 1);
  const paid = classifyDebt({ ...ar[0], allocatedPaid: ar[0].originalAmount }, date);
  assert.equal(paid.remaining, 0); assert.equal(paid.debtStatus, 'paid'); assert.equal(paid.priorityRank, 2);
  assert.equal(buildAlertQueue([], [paid], []).length, 0);
});

test('ETD alerts cover late production, due-today shipments and missing schedules', () => {
  const base = { rowId: 1, priorityRank: 2, onProcessPct: 50, packagingPct: 20, shipDateEtd: '04/11/2026', etaDate: '12/11/2026' };
  const late = classifyProgress(base, date);
  assert.equal(late.priorityRank, 0); assert.equal(late.alertLabel, 'Trễ ETD 1 ngày');
  assert.equal(classifyProgress({ ...base, shipDateEtd: '05/11/2026' }, date).alertLabel, 'Đến hạn xuất vào ngày theo dõi');
  assert.equal(classifyProgress({ ...base, shipDateEtd: '08/11/2026' }, date).priorityRank, 1);
  assert.equal(classifyProgress({ ...base, etaDate: '—' }, date).priorityRank, 0);
  assert.equal(classifyProgress({ ...base, onProcessPct: 100, packagingPct: 100 }, date).priorityRank, 1);
  assert.equal(classifyProgress({ ...base, actualShipDate: '03/11/2026', etaDate: '04/11/2026' }, date).alertLabel, 'Quá ETA 1 ngày, chờ xác nhận');
});

test('alert queue includes due-today collections and payments, sorted by overdue days', () => {
  const queue = buildAlertQueue(classifiedItems, classifiedAr, classifiedAp);
  assert.equal(queue.length, 16);
  assert.equal(queue.filter(a => a.type === 'orders').length, 7);
  assert.equal(queue.filter(a => a.type === 'receivables').length, 4);
  assert.equal(queue.filter(a => a.type === 'payables').length, 5);
  assert.ok(queue.some(a => a.type === 'receivables' && a.status === 'Đến hạn hôm nay'));
  assert.ok(queue.some(a => a.type === 'payables' && a.status === 'Đến hạn hôm nay'));
  assert.ok(queue.every((row, index) => !index || queue[index - 1].overdueDays >= row.overdueDays));
});

test('industry and origin filters can feed charts, tables and KPIs from the same records', () => {
  const garments = summarizeCategories(classifiedItems.filter(row => row.category === 'Garment'), revenue.filter(row => row.category === 'Garment'));
  assert.equal(sumBy(garments, 'revenue'), 420350000);
  assert.equal(garments.find(row => row.category === 'Garment').totalItems, 7);
  assert.equal(matchesOrigin(ar.find(row => row.poId === 'PO-2026-089'), 'LTH VIETNAM', items), true);
  assert.equal(matchesOrigin(ar.find(row => row.poId === 'PO-2026-089'), 'BNH VIETNAM', items), false);
  assert.equal(classifiedAr.filter(row => debtMatchesFilter(row, 'due')).length, 4);
  assert.equal(classifiedAr.filter(row => debtMatchesFilter(row, 'today')).length, 2);
  assert.equal(classifiedAp.filter(row => debtMatchesFilter(row, 'unknown')).length, 1);
});

test('monthly chart reconciles actual document dates without changing supplied historical aggregates', () => {
  const series = monthlyRevenueSeries(revenue);
  assert.equal(series.find(row => row.month === 'T11/2026').doanhThu, 884.35);
  assert.equal(series.find(row => row.month === 'T11/2026').thucThu, 561.35);
  assert.equal(series.find(row => row.month === 'T10/2026').doanhThu, 102);
  assert.equal(sumBy(series, 'doanhThu'), 986.35);
  const filtered = monthlyRevenueSeries(revenue.filter(row => row.category === 'Garment'));
  assert.equal(filtered.length, 1); assert.equal(filtered[0].doanhThu, 420.35);
  assert.equal(history.find(row => row.month === 'T11/2026').doanhThu, 986);
});

test('today shipments precede future manual red flags and missing schedules in the progress table', () => {
 const sorted = [...classifiedItems].sort(comparePriority);
 const today = sorted.findIndex(row => row.poId === 'PO-2026-109');
 assert.ok(today < sorted.findIndex(row => row.poId === 'PO-2026-090'));
 assert.ok(today < sorted.findIndex(row => row.poId === 'PO-2026-095A'));
});
