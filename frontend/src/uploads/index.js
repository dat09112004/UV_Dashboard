import { AppError } from '../utils/errors.js';

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.freeze([
  '.pdf',
  '.xlsx',
  '.xls',
  '.csv',
  '.doc',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.txt',
]);

export const MAX_ATTACHMENT_COUNT = 3;
export const MAX_ATTACHMENT_TOTAL_BYTES = 1 * 1024 * 1024; // 1 MB

export function validateAttachmentUploadBatch(files = []) {
  if (!Array.isArray(files)) {
    throw new AppError('Danh sách tệp đính kèm không hợp lệ.', 400, 'INVALID_ATTACHMENT_LIST');
  }
  if (files.length > MAX_ATTACHMENT_COUNT) {
    throw new AppError(
      'Tối đa 3 tệp và tổng dung lượng 1 MB mỗi lần gửi.',
      400,
      'TOO_MANY_ATTACHMENTS'
    );
  }
  let totalBytes = 0;
  for (const file of files) {
    const name = String(file?.name || '').trim().toLowerCase();
    const hasValidExt = ALLOWED_ATTACHMENT_EXTENSIONS.some(ext => name.endsWith(ext));
    if (!name || !hasValidExt) {
      throw new AppError(
        'Tệp đính kèm không hợp lệ hoặc không thuộc định dạng cho phép.',
        400,
        'UNSUPPORTED_ATTACHMENT_TYPE'
      );
    }
    const rawContent = String(file?.content || '');
    const byteLen = Buffer.from(rawContent, 'base64').byteLength;
    totalBytes += byteLen;
    if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new AppError(
        'Tối đa 3 tệp và tổng dung lượng 1 MB mỗi lần gửi.',
        400,
        'ATTACHMENT_SIZE_EXCEEDED'
      );
    }
  }
  return { valid: true, count: files.length, totalBytes };
}
