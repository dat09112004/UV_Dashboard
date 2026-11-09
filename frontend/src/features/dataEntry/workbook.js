import { dateInputValue } from '../../utils/business.js';
import { getLanguage, translate } from '../../locales/i18n.js';

export const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;

const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

function cellValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    return cellValue(value.result ?? value.text ?? '');
  }
  return value ?? '';
}

function normalizeDate(value, year, date1904) {
  if (value === '' || value === '—') return '';
  if (typeof value === 'number' && value >= (date1904 ? 0 : 61) && value < (date1904 ? 2957004 : 2958466)) {
    return new Date((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const direct = dateInputValue(text);
  if (direct) return direct;
  const shortDate = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?$/i.exec(text);
  if (shortDate && /^\d{4}$/.test(year)) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(shortDate[1].toLowerCase()) + 1;
    return dateInputValue(`${year}-${String(month).padStart(2, '0')}-${shortDate[2].padStart(2, '0')}`) || text;
  }
  return text;
}

export async function openEntryWorkbook(file) {
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > MAX_WORKBOOK_BYTES) throw new Error('Chọn tệp .xlsx tối đa 8 MB.');
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(await file.arrayBuffer()); }
  catch { throw new Error('Không thể đọc tệp Excel.'); }
  if (!book.worksheets.length) throw new Error('Tệp Excel không có trang tính.');
  return book;
}

export function readEntrySheet(worksheet, schema, maxRows, year = '') {
  if (!worksheet || worksheet.rowCount > maxRows + 30 || worksheet.columnCount > 100) {
    throw new Error('Trang tính vượt giới hạn 500 dòng dữ liệu hoặc 100 cột.');
  }
  const aliases = new Map(schema.columns.flatMap(col => [col.key, col.label, translate(col.label, 'en'), ...col.aliases]
    .map(label => [normalize(label), col])));
  let best = { line: 0, columns: new Map() };
  for (let index = 1; index <= Math.min(20, worksheet.rowCount); index += 1) {
    const columns = new Map();
    worksheet.getRow(index).eachCell((cell, position) => {
      const match = aliases.get(normalize(cellValue(cell.value)));
      if (match && !columns.has(match.key)) columns.set(match.key, { match, position });
    });
    if (columns.size > best.columns.size) best = { line: index, columns };
  }
  if (best.columns.size < 2) throw new Error('Không nhận diện được hàng tiêu đề. Hãy dùng tệp mẫu hoặc đối chiếu tên cột.');
  const rows = [];
  const date1904 = worksheet.workbook.properties.date1904 === true;
  for (let line = best.line + 1; line <= worksheet.rowCount; line += 1) {
    const values = {};
    for (const { match, position } of best.columns.values()) {
      const cell = worksheet.getRow(line).getCell(position);
      const value = cell.isMerged && cell.master.col !== cell.col ? '' : cellValue(cell.value);
      if (cell.formula && (cell.result === undefined || cell.result?.error)) throw new Error(`Ô ${cell.address} chưa có kết quả công thức hợp lệ. Hãy tính lại hoặc dán giá trị.`);
      const isPercentage = ['onProcessPct', 'packagingPct'].includes(match.key);
      const percentFormat = isPercentage && cell.numFmt?.replace(/"[^"]*"|\\.|_.|\*./g, '').includes('%');
      values[match.key] = match.type === 'date' ? normalizeDate(value, year, date1904) :
        typeof value === 'number' && percentFormat ? String(Number((value * 100).toPrecision(15))) :
          String(value).trim();
    }
    if (schema.id === 'orders' && worksheet.name === 'PO Released' && !values.poId) continue;
    if (Object.values(values).some(Boolean)) rows.push({ line, values });
  }
  if (!rows.length || rows.length > maxRows) throw new Error('Chọn bảng và nhập từ 1 đến 500 dòng.');
  return rows;
}

export const entrySheetName = (schema, language = getLanguage()) =>
  language === 'en' ? translate(schema.label, language) : schema.name;

export async function downloadEntryWorkbook(schema, columns, rows, language = getLanguage()) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const name = entrySheetName(schema, language);
  const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(col => ({ key: col.key, header: translate(col.label, language), width: col.type === 'text' ? 27 : 20 }));
  const localizedFields = new Set(['status', 'approvalState', 'department']);
  sheet.addRows(rows.map(row => Object.fromEntries(columns.map(({ key }) =>
    [key, localizedFields.has(key) ? translate(row[key], language) ?? '' : row[key] ?? '']))));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142843' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  const bytes = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replaceAll(' ', '_')}${rows.length ? '' : language === 'en' ? '_template' : '_mau'}.xlsx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
