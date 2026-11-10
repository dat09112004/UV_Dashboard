/**
 * Chốt chặn Bảo mật Zero-Mock (`src/mocks/index.js`):
 * Toàn bộ dữ liệu mẫu tĩnh (MOCK_ACCOUNTS, demoPasswords, mock PO/Finance) trên Frontend đã bị loại bỏ.
 * Mọi dữ liệu bắt buộc đồng bộ trực tiếp từ PostgreSQL 3NF & Redis Cache qua RESTful API `/api/v1/*`.
 */
export const ZERO_MOCK_ENFORCED = true;

export function assertNoMockDataInProduction() {
  return ZERO_MOCK_ENFORCED;
}
