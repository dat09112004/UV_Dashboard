import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_VENDOR_ITEMS as items, INITIAL_REVENUE_RECORDS as revenue, INITIAL_RECEIVABLES as ar, INITIAL_PAYABLES as ap, DATA_AS_OF as today } from '../src/mock/dashboard.js';
import { MOCK_ACCOUNTS } from '../src/mock/accounts.js';
import { initialFinanceState, recordInvoice, saveReceipt, allocateReceipt, submitPayable, splitPayable, reviewPayable, recordPayablePayment, persistFinanceState, loadFinanceState, validateFinanceState, FINANCE_STORAGE_KEY, AP_PENDING, AP_APPROVED, AP_REVIEW, AP_RETURNED, itemFinancialSummary } from '../src/utils/financeWorkflow.js';
import { classifyDebt, debtSummary, classifyProgress, matchesOrigin } from '../src/utils/dashboardMetrics.js';
import { updateProgressRecord, loadTrackedItems } from '../src/utils/orderFulfillment.js';
import { setupInterceptors } from '../src/services/interceptors.js';
import { setClientIdentity } from '../src/utils/permissions.js';
const [ceo, sale, accountant, admin] = MOCK_ACCOUNTS;
const base=()=>initialFinanceState(revenue,ar,ap,today);
const invoice={rowId:19,docNo:'INV-TEST',customerName:ar[0].customerName,recordDate:today,dueDate:'2026-11-12',shippedQty:0,netRevenue:48000000,basis:'Biên bản nghiệm thu mẫu đã xác nhận'};
const identified=()=>saveReceipt(base(),accountant,{id:'PMT-2026-001',customerName:ar[0].customerName,reference:'BANK-IN-001',date:today},today);
const memory=()=>{ const map=new Map(); return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}; };

test('invoice recognition creates the matching AR atomically and preserves source records',()=>{
 const state=base(),next=recordInvoice(state,accountant,invoice,items,today);
 assert.equal(next.revenue.length,7);assert.equal(next.receivables.length,6);assert.equal(next.receivables.at(-1).originalAmount,48000000);
 assert.equal(next.revenue.at(-1).cashCollected,0);assert.equal(next.revenue.at(-1).poId,items[18].poId);assert.equal(state.revenue.length,6);assert.equal(revenue.length,6);
 assert.equal(debtSummary(next.receivables.map(r=>classifyDebt(r,today))).total,438000000);assert.equal(next.audit[0].actorId,accountant.id);
});
test('invoice validation rejects duplicate, unknown PO, invalid money and future booking',()=>{
 const next=recordInvoice(base(),accountant,invoice,items,today);
 assert.throws(()=>recordInvoice(next,accountant,{...invoice,docNo:' inv-test '},items,today));
 for(const patch of [{rowId:999},{netRevenue:1.5},{recordDate:'2026-11-06'},{dueDate:'2026-11-04'},{basis:''},{shippedQty:-1}]) assert.throws(()=>recordInvoice(base(),accountant,{...invoice,...patch},items,today));
 assert.throws(()=>recordInvoice(base(),sale,invoice,items,today));assert.throws(()=>recordInvoice({...base(),isPeriodLocked:true},accountant,invoice,items,today));
});
test('unidentified opening cash is blocked until explicitly reconciled',()=>{
 assert.throws(()=>allocateReceipt(base(),accountant,{receiptId:'PMT-2026-001',debtId:ar[0].id,amount:1000000,date:today},today),/đối soát/);
 assert.equal(identified().receipts[0].amount,25000000);assert.equal(identified().revenue[0].cashCollected,112000000);
 assert.throws(()=>saveReceipt(base(),sale,{customerName:'A',reference:'X',date:today},today));
});
test('allocation links the exact customer and updates receipt, AR, invoice and history together',()=>{
 const state=identified(), next=allocateReceipt(state,accountant,{receiptId:'PMT-2026-001',debtId:ar[0].id,amount:25000000,date:today},today);
 assert.equal(next.receipts[0].allocatedAmount,25000000);assert.equal(next.receivables[0].remaining,55000000);assert.equal(next.revenue[0].cashCollected,137000000);assert.equal(next.allocations.length,1);
 assert.equal(state.receivables[0].remaining,80000000);assert.equal(next.audit.at(-1).type,'RECEIPT_ALLOCATED');
});
test('allocation cannot cross customer/currency, exceed cash, overpay, or use a future date, while both CEO and Admin can allocate',()=>{
 const payload={receiptId:'PMT-2026-001',debtId:ar[0].id,amount:1000000,date:today};
 assert.throws(()=>allocateReceipt(identified(),accountant,{...payload,debtId:ar[1].id},today));
 assert.throws(()=>allocateReceipt(identified(),accountant,{...payload,amount:25000001},today));
 assert.throws(()=>allocateReceipt(identified(),accountant,{...payload,date:'2026-11-06'},today));
 const wrong=identified();wrong.receivables[0].currency='USD';assert.throws(()=>allocateReceipt(wrong,accountant,payload,today));
 assert.throws(()=>allocateReceipt(identified(),sale,payload,today), /không có quyền/);
 assert.equal(allocateReceipt(identified(),admin,payload,today).audit.at(-1).type, 'RECEIPT_ALLOCATED');
 assert.equal(allocateReceipt(identified(),ceo,payload,today).audit.at(-1).type, 'RECEIPT_ALLOCATED');
 const later=recordInvoice(identified(),accountant,{...invoice,recordDate:'2026-11-10'},items,'2026-11-10');
 assert.throws(()=>allocateReceipt(later,accountant,{...payload,debtId:later.receivables.at(-1).id},'2026-11-10'),/trước ngày ghi nhận/);
});
test('new receipt accepts real reference and does not automatically create revenue',()=>{
 const next=saveReceipt(base(),accountant,{customerName:'',reference:'BANK-NEW',amount:5000000,date:today},today);
 assert.equal(next.receipts.length,2);assert.equal(next.revenue.length,6);
 assert.equal(next.receipts.at(-1).status, 'unidentified');
 assert.throws(()=>saveReceipt(next,accountant,{customerName:ar[0].customerName,reference:'bank-new',amount:1,date:today},today), /đã tồn tại/);
});
test('unallocated receipt reconciliation rejects typos and can repair legacy mismatches with audit', () => {
 const state = identified();
 const receipt = state.receipts[0];
 const wrongName = receipt.customerName + 'x';
 receipt.customerName = wrongName;
 const details = { id: receipt.id, customerName: ar[0].customerName, reference: receipt.reference, date: today, correctionReason: 'Đã đối chiếu phiếu thu' };
 assert.throws(() => saveReceipt(state, accountant, { ...details, customerName: wrongName }, today), /danh sách/);
 assert.throws(() => saveReceipt(state, accountant, { ...details, correctionReason: '' }, today), /Lý do/);
 const fixed = saveReceipt(state, accountant, details, today);
 assert.equal(state.receipts[0].customerName, wrongName);
 assert.equal(fixed.receipts[0].customerName, ar[0].customerName);
 assert.equal(fixed.audit.at(-1).type, 'RECEIPT_CORRECTED');
 assert.ok(fixed.audit.at(-1).detail.includes(wrongName));
 const allocated = allocateReceipt(fixed, accountant, { receiptId: receipt.id, debtId: ar[0].id, amount: 1, date: today }, today);
 assert.throws(() => saveReceipt(allocated, accountant, details, today), /chưa được phân bổ/);
});
test('CEO and Admin cannot approve an unsubmitted payable and accountant cannot approve',()=>{
 const row=base().payables.find(p=>p.approvalState===AP_REVIEW);
 assert.throws(()=>reviewPayable(base(),ceo,{id:row.id,approve:true,note:'Kiểm tra'},today));
 assert.throws(()=>reviewPayable(base(),admin,{id:row.id,approve:true,note:'Kiểm tra'},today));
 assert.throws(()=>reviewPayable(base(),accountant,{id:'AP-02',approve:true,note:'Kiểm tra'},today));
 assert.throws(()=>recordPayablePayment(base(),accountant,{id:'AP-02',amount:1,date:today,reference:'PAY-X'},today));
});
test('AP proposed due date never replaces the official date before approval',()=>{
 const seed=base();seed.payables.find(p=>p.id==='AP-04').vendorNo='15490';
 const state=submitPayable(seed,accountant,{id:'AP-04',amount:20000000,dueDate:'2026-11-20',note:'Đã đối chiếu hợp đồng'});
 assert.equal(state.payables.find(p=>p.id==='AP-04').dueDate,'—');assert.equal(state.payables.find(p=>p.id==='AP-04').approvalState,AP_PENDING);
 const returned=reviewPayable(state,admin,{id:'AP-04',approve:false,note:'Bổ sung chứng từ'},today);
 assert.equal(returned.payables.find(p=>p.id==='AP-04').approvalState,AP_RETURNED);assert.equal(returned.payables.find(p=>p.id==='AP-04').dueDate,'—');
 assert.throws(()=>reviewPayable(state,ceo,{id:'AP-04',approve:false,note:''},today));
});
test('approved payment budget survives partial payments and prevents duplicate or excessive payments',()=>{
 const seed=base();seed.payables.find(p=>p.id==='AP-04').vendorNo='15490'; // Isolated verified single-supplier test fixture.
 const submitted=submitPayable(seed,accountant,{id:'AP-04',amount:20000000,dueDate:'2026-11-20',note:'Chứng từ đầy đủ'});
 const approved=reviewPayable(submitted,ceo,{id:'AP-04',approve:true,note:'Đồng ý trong hạn mức'},today);
 assert.equal(approved.payables.find(p=>p.id==='AP-04').dueDate,'20/11/2026');
 const paid=recordPayablePayment(approved,accountant,{id:'AP-04',amount:12000000,date:today,reference:'BANK-OUT-001'},today);
 const row=paid.payables.find(p=>p.id==='AP-04');assert.equal(row.approvedRemaining,8000000);assert.equal(row.remaining,198000000);assert.equal(row.approvalState,AP_APPROVED);
 assert.throws(()=>recordPayablePayment(paid,accountant,{id:'AP-04',amount:9000000,date:today,reference:'BANK-OUT-002'},today));
 assert.throws(()=>recordPayablePayment(paid,accountant,{id:'AP-04',amount:1,date:today,reference:'bank-out-001'},today));
 const exhausted=recordPayablePayment(paid,accountant,{id:'AP-04',amount:8000000,date:today,reference:'BANK-OUT-002'},today);
 assert.equal(exhausted.payables.find(p=>p.id==='AP-04').approvalState,AP_REVIEW);
 const early=base();early.openingDate='2026-11-01';const reviewed=reviewPayable(early,ceo,{id:'AP-02',approve:true,note:'Đã đối soát'},today);
 assert.throws(()=>recordPayablePayment(reviewed,accountant,{id:'AP-02',amount:1,date:'2026-11-04',reference:'OLD-DATE'},today),/trước ngày duyệt/);
});
test('finance state restores a whole transaction and rejects stale browser updates',()=>{
 const storage=memory(),next=recordInvoice(base(),accountant,invoice,items,today);
 persistFinanceState(next,storage);const restored=loadFinanceState(base(),storage);
 assert.equal(restored.revenue.length,7);assert.equal(restored.receivables.length,6);assert.equal(restored.audit.length,1);
 assert.throws(()=>persistFinanceState(recordInvoice(base(),accountant,{...invoice,docNo:'INV-OTHER'},items,today),storage),/cửa sổ khác/);
 storage.setItem(FINANCE_STORAGE_KEY,'{bad');const invalid=loadFinanceState(base(),storage);assert.ok(invalid.loadIssue);assert.throws(()=>recordInvoice(invalid,accountant,invoice,items,today));
 assert.throws(()=>validateFinanceState({...base(),receipts:[{id:'bad',amount:1,allocatedAmount:2,currency:'VND'}]}));
});
test('progress updates preserve the source sales value and do not latch a computed alert',()=>{
 const source=loadTrackedItems(items,memory())[3];
 const computed=classifyProgress({...source,manualPriorityRank:2},today);assert.equal(computed.priorityRank,0);
 const next=updateProgressRecord(computed,sale,{...computed,shipDateEtd:'2026-11-10',etaDate:'2026-11-15',changeReason:'Lịch vận chuyển đã xác nhận',ban:999999},today);
 assert.equal(next.manualPriorityRank,2);assert.equal(next.ban,0);assert.equal(classifyProgress(next,today).priorityRank,2);assert.equal(next.trackingHistory.length,1);
 assert.throws(()=>updateProgressRecord(source,sale,{...source,manualPriorityRank:2,changeReason:'Tự hạ'},today));
 assert.equal(updateProgressRecord(source,admin,{...source,manualPriorityRank:2,changeReason:'Admin hạ mức cảnh báo'},today).manualPriorityRank,2);
 assert.throws(()=>updateProgressRecord(source,accountant,{...source,changeReason:'Thử sửa'},today));
});
test('confirmed delivery closes automatic missing schedule while source manual alarms require review',()=>{
 const source={...items[0],orderedQty:9000,deliveredQty:9000,unit:'PCS',actualDeliveryDate:'05/11/2026',shipDateEtd:'—',etaDate:'—',manualPriorityRank:2};
 assert.equal(classifyProgress(source,today).priorityRank,2);
 assert.equal(classifyProgress({...source,manualPriorityRank:0,manualAlertReason:'Chưa đủ hồ sơ'},today).priorityRank,0);
});
test('source PO relation takes precedence over vendor fallback and compressed PO references work',()=>{
 const row={poId:'PO-2026-092',vendorNo:'15089'};
 const inventory=[{poId:'PO-2026-092',vendorNo:'15089',countryOfOrigin:'A'},{poId:'PO-2026-093',vendorNo:'15089',countryOfOrigin:'B'}];
 assert.equal(matchesOrigin(row,'B',inventory),false);
 assert.equal(matchesOrigin({poId:'PO-2026-095A/B'},'SHENZEN CHINA',items),true);
 const state=base();assert.equal(itemFinancialSummary(items[0],state).payables,180000000);
});
test('actual API interceptor uses login identity and never defaults an unknown user to CEO',()=>{
 let intercept;setupInterceptors({interceptors:{request:{use:fn=>{intercept=fn;}}}});
 setClientIdentity(null);assert.throws(()=>intercept({url:'/operations/tasks',method:'post'}),/401/);
 setClientIdentity({id:sale.id,role:'Sale'});assert.throws(()=>intercept({url:'/operations/tasks',method:'post'}),/403/);
 assert.equal(intercept({url:'/operations/tasks/T1/handover',method:'post'}).method,'post');
 setClientIdentity(null);
});

test('a legacy multi-supplier bill cannot be paid before document-level reconciliation',()=>{
 const state=base(),row=state.payables.find(p=>p.id==='AP-05');row.approvalState=AP_APPROVED;row.approvedRemaining=row.remaining;
 assert.throws(()=>recordPayablePayment(state,accountant,{id:row.id,amount:1,date:today,reference:'DO-NOT-PAY'},today),/gộp nhiều nhà cung cấp/);
});

test('grouped AP cannot be submitted or approved, and verified split preserves balances and starts individual approvals', () => {
 const state = base();
 const source = state.payables.find(row => row.id === 'AP-05');
 const payload = { id: source.id, note: 'Đối soát số tiền từng nhà cung cấp', parts: {
   15511: { docNo: 'QA-ALDY', originalAmount: 97000000, allocatedPaid: 61000000, dueDate: today },
   15378: { docNo: 'QA-ROCKY', originalAmount: 50000000, allocatedPaid: 30000000, dueDate: today },
 } };
 const approval = { id: source.id, note: 'Đề nghị', approve: true };
 assert.throws(() => submitPayable(state, accountant, { id: 'AP-04' }), /tách/);
 assert.throws(() => reviewPayable(state, ceo, approval, today), /tách/);
 assert.equal(reviewPayable(state, ceo, { ...approval, approve: false }, today).payables.find(row => row.id === source.id).approvalState, AP_RETURNED);
 assert.throws(() => splitPayable(state, sale, payload, items), /không có quyền/);
 assert.equal(splitPayable(state, admin, payload, items).payableSplitSources[0].id, source.id);
 assert.equal(splitPayable(state, ceo, payload, items).payableSplitSources[0].id, source.id);
 assert.throws(() => splitPayable(state, accountant, { ...payload, parts: { ...payload.parts, 15511: { ...payload.parts[15511], originalAmount: 98000000 } } }, items), /khớp/);
 assert.throws(() => splitPayable(state, accountant, { ...payload, parts: { ...payload.parts, 15511: { ...payload.parts[15511], docNo: source.docNo } } }, items), /chưa được sử dụng/);
 source.approvalState = AP_APPROVED;
 source.approvedRemaining = source.remaining;
 delete state.payableSplitSources;
 const split = splitPayable(state, accountant, payload, items);
 const children = split.payables.filter(row => row.splitSourceDocNo === source.docNo);
 assert.equal(children.length, 2);
 assert.equal(children.reduce((sum, row) => sum + row.remaining, 0), source.remaining);
 assert.equal(split.payables.some(row => row.id === source.id), false);
 assert.equal(split.payableSplitSources[0].approvalState, AP_APPROVED);
 assert.equal(split.audit.at(-1).type, 'PAYABLE_SPLIT');
 assert.ok(children.every(row => row.approvalState === AP_REVIEW && row.approvedRemaining === 0 && row.poLineId));
 validateFinanceState(split);
 assert.throws(() => splitPayable(split, accountant, payload, items), /không còn đủ điều kiện/);
 const child = children[0];
 const submitted = submitPayable(split, accountant, { id: child.id, amount: 1, dueDate: today, note: 'QA' });
 const approved = reviewPayable(submitted, admin, { id: child.id, approve: true, note: 'QA' }, today);
 const paid = recordPayablePayment(approved, accountant, { id: child.id, amount: 1, date: today, reference: 'QA-OUT-SPLIT' }, today);
 assert.equal(paid.payables.find(row => row.id === child.id).remaining, child.remaining - 1);
});
