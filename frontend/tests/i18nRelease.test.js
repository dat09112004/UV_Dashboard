import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { english } from '../src/locales/messages.js';
import { getLanguage, phrase, setLanguage, translate } from '../src/locales/i18n.js';
import { getColumnFormatMetadata, downloadEntryWorkbook } from '../src/features/dataEntry/workbook.js';
import { ENTRY_SHEETS, visibleSheetColumns } from '../src/features/dataEntry/schema.js';

const vietnamese = /[ĂăÂâĐđÊêÔôƠơƯưẠ-ỹ]/u;

test('dictionary keys are canonical and all translations preserve placeholder counts', () => {
  for (const [source, target] of Object.entries(english)) {
    assert.equal(source, source.trim().normalize('NFC'), source);
    assert.equal(target, target.trim(), source);
    assert.equal(source.split('§').length, target.split('§').length, source);
    assert.ok(target.length > 0, source);
  }
});

test('labels retain source spacing and support decomposed Vietnamese from APIs', () => {
  assert.equal(translate('  Doanh thu \n', 'en'), '  Revenue \n');
  assert.equal(translate('Đổi mật khẩu'.normalize('NFD'), 'en'), 'Change password');
  assert.equal(translate(' · Hạn thu ', 'en'), ' · Collection Due ');
  assert.equal(translate('Đã giao:', 'en'), 'Delivered:');
  assert.equal(translate('Dự kiến xuất (ETD): ', 'en'), 'Estimated departure (ETD): ');
});

test('session, OTP, validation, delivery, and finance messages translate completely', () => {
  const messages = [
    'Phiên đăng nhập đã hết hạn theo thời gian bảo mật. Vui lòng đăng nhập lại.',
    'Mã OTP 6 chữ số đã được gửi từ noreply@uyenvu-international.com (hiệu lực 3 phút).',
    'Số lượng giao vượt quá tồn kho khả dụng (1,000 pcs).',
    'Mã PO "PO-2026-001" bị trùng lặp với dòng 5 trong bản nháp.',
    'Thiếu trường bắt buộc "Ngành hàng".',
    'Đã tạo phiếu giao hàng đi DN-001 và tự động đồng bộ Công nợ phải thu.',
    'Số tiền đề nghị chi đã thay đổi so với bản đang xem. Vui lòng tải lại chứng từ.',
    'Tệp Excel vượt quá giới hạn 12 trang tính.',
    'Hạn thanh toán đề nghị đã thay đổi so với bản đang xem. Vui lòng tải lại chứng từ.',
    'Đăng nhập thành công với vai trò: Quản Trị Viên Hệ Thống (Admin)',
    'Quá hạn 1 ngày (đủ hàng +5 ngày)',
    'Công nợ phải thu phải là số nguyên VND lớn hơn 0 và không vượt quá 1.000 tỷ VND.',
  ];
  for (const message of messages) {
    assert.doesNotMatch(translate(message, 'en'), vietnamese, message);
    assert.equal(translate(message, 'vi'), message);
  }
});

test('nested assignment summaries translate status and reminders while retaining names and notes', () => {
  const source = 'Đã giao: Phòng Sale (Lê Hương) đảm nhận · Trạng thái: Đang thực hiện · Hạn 25/11/2026 · Ghi chú: ghi chú riêng $& · Có 1 nhắc việc mới';
  assert.equal(translate(source, 'en'), 'Assigned to: Sales Department (Lê Hương) · Status: In progress · Due 25/11/2026 · Note: ghi chú riêng $& · 1 new reminder');
  assert.equal(translate('Đã gửi yêu cầu chuyển giao đơn hàng sang Nguyễn Văn A. Đang chờ người nhận đồng ý.', 'en'),
    'Order transfer request sent to Nguyễn Văn A. Awaiting their acceptance.');
  for (const value of ['PO-2026-001', '15001', 'CÔNG TY TNHH MẪU MỚI', 'Ghi chú cá nhân không thuộc từ điển $&']) {
    assert.equal(translate(value, 'en'), value);
  }
});

test('counted messages and pending confirmation text can render after switching either way', () => {
  const saved = getLanguage();
  try {
    setLanguage('en');
    assert.equal(phrase('§ phiếu giao', 1), '1 delivery note');
    assert.equal(phrase('§ phiếu giao', 2), '2 delivery notes');
    assert.equal(translate(' · Có 1 nhắc việc mới'), ' · 1 new reminder');
    const source = 'Cho phép § đăng nhập lại?';
    assert.equal(phrase(source, 'Nguyễn A'), 'Allow Nguyễn A to sign in again?');
    setLanguage('vi');
    assert.equal(phrase(source, 'Nguyễn A'), 'Cho phép Nguyễn A đăng nhập lại?');
  } finally { setLanguage(saved); }
});

test('all workbook column descriptions and example notes localise independently of UI language', () => {
  const saved = getLanguage();
  try {
    setLanguage('vi');
    for (const schema of ENTRY_SHEETS) {
      for (const column of schema.columns) {
        const englishMeta = getColumnFormatMetadata(column, schema.id, 'en');
        for (const text of [englishMeta.typeLabel, englishMeta.requiredLabel, englishMeta.note]) {
          assert.doesNotMatch(text, vietnamese, `${schema.id}.${column.key}: ${text}`);
        }
        assert.match(englishMeta.note, /Type:/);
        const viMeta = getColumnFormatMetadata(column, schema.id, 'vi');
        assert.match(viMeta.note, /Kiểu:/);
      }
    }
  } finally { setLanguage(saved); }
});

test('English Excel templates contain translated notes, validation prompts and guide worksheets', async () => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let blob;
  URL.createObjectURL = value => { blob = value; return 'blob:template-test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {}, append() {} },
  };
  try {
    const schema = ENTRY_SHEETS.find(sheet => sheet.id === 'orders');
    const columns = visibleSheetColumns(schema.columns);
    await downloadEntryWorkbook(schema, columns, [], 'en');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    const sheet = book.worksheets[0];
    const guide = book.getWorksheet('Data format guide');
    assert.ok(guide);
    for (const worksheet of [sheet, guide]) {
      worksheet.eachRow(row => row.eachCell(cell => {
        if (typeof cell.value === 'string') assert.doesNotMatch(cell.value, vietnamese, cell.address);
        if (typeof cell.note === 'string') assert.doesNotMatch(cell.note, vietnamese, cell.address);
        const validation = cell.dataValidation;
        if (validation) for (const key of ['promptTitle', 'prompt', 'errorTitle', 'error']) {
          if (validation[key]) assert.doesNotMatch(validation[key], vietnamese, `${cell.address}.${key}`);
        }
      }));
    }
    assert.ok(sheet.getRow(1).getCell(1).note);
    assert.ok(sheet.getRow(2).getCell(1).dataValidation.prompt);
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test('native browser validation uses the selected language and preserves business custom errors', async () => {
  const { localizeInvalidInput, clearLocalizedValidation, resetLocalizedValidation } = await import('../src/locales/formValidation.js');
  const saved = getLanguage();
  const field = {
    type: 'password', tagName: 'INPUT', minLength: 12, validationMessage: '',
    validity: { valid: false, tooShort: true, customError: false },
    setCustomValidity(message) { this.validationMessage = message; this.validity.customError = Boolean(message); },
  };
  try {
    setLanguage('en');
    localizeInvalidInput({ target: field });
    assert.equal(field.validationMessage, 'Enter at least 12 characters.');
    setLanguage('vi');
    resetLocalizedValidation(field);
    localizeInvalidInput({ target: field });
    assert.equal(field.validationMessage, 'Vui lòng nhập ít nhất 12 ký tự.');
    clearLocalizedValidation({ target: field });
    assert.equal(field.validationMessage, '');
    field.setCustomValidity('Business constraint');
    resetLocalizedValidation(field);
    assert.equal(field.validationMessage, 'Business constraint');
  } finally { setLanguage(saved); }
});

test('count templates cannot swallow whole business statuses in combined messages', () => {
  assert.equal(translate('Chưa xác định hạn · Cần tách chứng từ', 'en'), 'No due date · Document split required');
  assert.equal(translate('2 chứng từ', 'en'), '2 documents');
  assert.equal(translate('Nhập thêm 2 chứng từ riêng', 'en'), 'Nhập thêm 2 chứng từ riêng');
});
