import { dateInputValue } from '../../utils/business.js';
import { getLanguage, translate } from '../../locales/i18n.js';

export const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;
export const MAX_UNCOMPRESSED_WORKBOOK_BYTES = 32 * 1024 * 1024;
export const MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
export const MAX_WORKBOOK_ZIP_ENTRIES = 200;
export const MAX_WORKBOOK_SHEETS = 20;

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

/**
 * S11 + S06 Fix: Kiểm tra cấu trúc ZIP của tệp .xlsx (Central Directory + đối chiếu Local File Header)
 * trước khi đưa vào ExcelJS giải nén nhằm chặn ZIP bomb hoặc giả mạo kích thước header.
 */
export function inspectWorkbookZipArchive(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 22) {
    throw new Error('Không thể đọc tệp Excel.');
  }
  const view = new DataView(arrayBuffer);
  // Kiểm tra chữ ký ZIP đầu tệp (PK\x03\x04)
  if (view.getUint32(0, true) !== 0x04034b50) {
    throw new Error('Tệp Excel không đúng định dạng .xlsx.');
  }

  const maxCommentScan = Math.min(arrayBuffer.byteLength - 22, 65535);
  let eocdOffset = -1;
  for (let i = 0; i <= maxCommentScan; i += 1) {
    const pos = arrayBuffer.byteLength - 22 - i;
    if (view.getUint32(pos, true) === 0x06054b50) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Cấu trúc nén của tệp Excel không hợp lệ.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries === 0 || totalEntries > MAX_WORKBOOK_ZIP_ENTRIES) {
    throw new Error(`Tệp Excel vượt quá giới hạn cấu trúc (${MAX_WORKBOOK_ZIP_ENTRIES} thành phần).`);
  }
  if (centralDirOffset + centralDirSize > arrayBuffer.byteLength) {
    throw new Error('Cấu trúc thư mục nén của tệp Excel không hợp lệ.');
  }

  const decoder = new TextDecoder('utf-8');
  let ptr = centralDirOffset;
  let totalUncompressedBytes = 0;
  let sheetCount = 0;
  const entries = [];

  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (ptr + 46 > arrayBuffer.byteLength || view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error('Cấu trúc mục nén trong tệp Excel không hợp lệ.');
    }
    const generalPurposeFlags = view.getUint16(ptr + 8, true);
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      uncompressedSize > MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES
    ) {
      throw new Error('Tệp Excel có dung lượng giải nén vượt giới hạn an toàn (tối đa 32 MB).');
    }

    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error('Phương thức nén trong tệp Excel không được hỗ trợ.');
    }

    if (
      localHeaderOffset + 30 > arrayBuffer.byteLength ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      throw new Error('Cấu trúc Local Header trong tệp Excel không hợp lệ.');
    }
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(localHeaderOffset + 22, true);
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    if (localMethod !== compressionMethod || dataOffset + compressedSize > centralDirOffset) {
      throw new Error('Dữ liệu mục nén trong tệp Excel không đồng nhất.');
    }
    const hasDataDescriptor = (generalPurposeFlags & 0x08) !== 0 || (localFlags & 0x08) !== 0;
    if (
      !hasDataDescriptor &&
      (localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize)
    ) {
      throw new Error('Kích thước khai báo trong tệp Excel bị sai lệch.');
    }
    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      throw new Error('Kích thước mục không nén trong tệp Excel không hợp lệ.');
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_WORKBOOK_BYTES) {
      throw new Error('Tệp Excel có dung lượng giải nén vượt giới hạn an toàn (tối đa 32 MB).');
    }

    const nameEnd = ptr + 46 + nameLen;
    if (nameEnd > arrayBuffer.byteLength) {
      throw new Error('Cấu trúc tên thành phần trong tệp Excel không hợp lệ.');
    }
    const entryName = decoder.decode(new Uint8Array(arrayBuffer, ptr + 46, nameLen));
    if (entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
      throw new Error('Tên thành phần trong tệp Excel không hợp lệ.');
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(entryName)) {
      sheetCount += 1;
      if (sheetCount > MAX_WORKBOOK_SHEETS) {
        throw new Error(`Tệp Excel vượt quá giới hạn ${MAX_WORKBOOK_SHEETS} trang tính.`);
      }
    }

    entries.push({
      entryName,
      compressionMethod,
      dataOffset,
      compressedSize,
      uncompressedSize,
    });

    ptr = nameEnd + extraLen + commentLen;
  }

  return { totalEntries, totalUncompressedBytes, sheetCount, entries };
}

/**
 * S06 Fix: Đếm số byte giải nén thực tế qua DecompressionStream('deflate-raw')
 * để chặn triệt để tệp ZIP giả mạo uncompressedSize nhỏ trong header nhưng bung ra dung lượng lớn.
 */
async function verifyWorkbookDecompressedQuota(arrayBuffer, entries = []) {
  if (typeof globalThis.DecompressionStream !== 'function') return;
  let actualTotalBytes = 0;
  for (const entry of entries) {
    if (entry.compressedSize === 0) continue;
    if (entry.compressionMethod === 0) {
      actualTotalBytes += entry.compressedSize;
      if (
        entry.compressedSize > MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES ||
        actualTotalBytes > MAX_UNCOMPRESSED_WORKBOOK_BYTES
      ) {
        throw new Error('Tệp Excel có dung lượng giải nén vượt giới hạn an toàn (tối đa 32 MB).');
      }
      continue;
    }
    const compressedSlice = new Uint8Array(arrayBuffer, entry.dataOffset, entry.compressedSize);
    const stream = new Blob([compressedSlice])
      .stream()
      .pipeThrough(new globalThis.DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    let entryActualBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkLen = value?.byteLength ?? 0;
        entryActualBytes += chunkLen;
        actualTotalBytes += chunkLen;
        if (
          entryActualBytes > MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES ||
          actualTotalBytes > MAX_UNCOMPRESSED_WORKBOOK_BYTES
        ) {
          await reader.cancel().catch(() => {});
          throw new Error('Tệp Excel có dung lượng giải nén vượt giới hạn an toàn (tối đa 32 MB).');
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export async function openEntryWorkbook(file) {
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > MAX_WORKBOOK_BYTES) throw new Error('Chọn tệp .xlsx tối đa 8 MB.');
  const buffer = await file.arrayBuffer();
  const { entries } = inspectWorkbookZipArchive(buffer);
  await verifyWorkbookDecompressedQuota(buffer, entries);
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer); }
  catch { throw new Error('Không thể đọc tệp Excel.'); }
  if (!book.worksheets.length) throw new Error('Tệp Excel không có trang tính.');
  if (book.worksheets.length > MAX_WORKBOOK_SHEETS) {
    throw new Error(`Tệp Excel vượt quá giới hạn ${MAX_WORKBOOK_SHEETS} trang tính.`);
  }
  return book;
}

export function readEntrySheet(worksheet, schema, maxRows, year = '') {
  if (!worksheet || worksheet.rowCount > maxRows + 30 || worksheet.columnCount > 100) {
    throw new Error(`Trang tính vượt giới hạn ${maxRows} dòng dữ liệu hoặc 100 cột.`);
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
      // F01 Fix: Giữ nguyên kiểu number cho ô số Excel (ví dụ 1.234) để không bị hiểu nhầm thành chuỗi hàng nghìn "1.234" -> 1234
      values[match.key] = match.type === 'date'
        ? normalizeDate(value, year, date1904)
        : typeof value === 'number' && percentFormat
          ? Number((value * 100).toPrecision(15))
          : typeof value === 'number' && match.type === 'number'
            ? Number(value.toPrecision(15))
            : String(value).trim();
    }
    // X08 Fix: Không âm thầm bỏ qua dòng có dữ liệu nhưng bị để trống poId trong sheet PO Released
    if (Object.values(values).some(v => v !== '' && v !== null && v !== undefined)) rows.push({ line, values });
  }
  if (!rows.length || rows.length > maxRows) throw new Error(`Chọn bảng và nhập từ 1 đến ${maxRows} dòng.`);
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
  sheet.addRows(rows.map(row => Object.fromEntries(columns.map(({ key }) => {
    const rawVal = localizedFields.has(key) ? translate(row[key], language) ?? '' : row[key] ?? '';
    const safeVal = typeof rawVal === 'string' && (/^[=+\-@]/.test(rawVal) || /^[\t\r\n]+[=+\-@]/.test(rawVal))
      ? `'${rawVal}`
      : rawVal;
    return [key, safeVal];
  }))));
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
