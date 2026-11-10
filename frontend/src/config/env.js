import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore .env read errors in restricted environments
  }
}

loadDotEnv();

const nodeEnv = process.env.NODE_ENV || 'development';
const rawJwtSecret = process.env.JWT_SECRET || '';

if (nodeEnv === 'production' && rawJwtSecret.length < 32) {
  throw new Error(
    '[Security Fatal]: Biến môi trường JWT_SECRET bắt buộc phải có độ dài tối thiểu 32 ký tự trong môi trường production.'
  );
}

// Sinh khóa ngẫu nhiên 64 bytes an toàn mật mã cho phiên dev/test nếu chưa cấu hình JWT_SECRET
const runtimeJwtSecret =
  rawJwtSecret.length >= 32 ? rawJwtSecret : crypto.randomBytes(64).toString('hex');

const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const parsedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : defaultOrigins;

export const ENV = Object.freeze({
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 4000),
  HOST: process.env.HOST || '0.0.0.0',
  CORS_ORIGINS: parsedOrigins,
  TZ: process.env.TZ || 'Asia/Ho_Chi_Minh',
  JWT_SECRET: runtimeJwtSecret,
  JWT_ISSUER: 'uyen-vu-international-api',
  JWT_AUDIENCE: 'uyen-vu-international-client',
  JWT_EXPIRES_IN_SECONDS: Number(process.env.JWT_EXPIRES_IN_SECONDS || 28800),
  JWT_REFRESH_EXPIRES_IN_SECONDS: Number(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS || 604800),
  PBKDF2_ITERATIONS: Number(process.env.PBKDF2_ITERATIONS || 600000),
  LOGIN_MAX_ATTEMPTS: Number(process.env.LOGIN_MAX_ATTEMPTS || 10),
  LOGIN_WINDOW_MS: Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000),
  API_RATE_LIMIT_PER_MIN: Number(process.env.API_RATE_LIMIT_PER_MIN || 300),
  WRITE_RATE_LIMIT_PER_MIN: Number(process.env.WRITE_RATE_LIMIT_PER_MIN || 120),
  AUTH_RATE_LIMIT_PER_MIN: Number(process.env.AUTH_RATE_LIMIT_PER_MIN || 30),
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  REDIS_ENABLED: process.env.REDIS_ENABLED !== 'false',
  REDIS_TTL_SECONDS: Number(process.env.REDIS_TTL_SECONDS || 120),
  REQUIRE_TERMS_ON_LOGIN: process.env.REQUIRE_TERMS_ON_LOGIN !== 'false',
  ALLOW_TEST_RESET: nodeEnv === 'test' && process.env.ALLOW_TEST_RESET === 'true',
  DB_DRIVER: process.env.DB_DRIVER || 'auto',
  DATABASE_URL: process.env.DATABASE_URL || '',
  PGHOST: process.env.PGHOST || '',
  PGPORT: Number(process.env.PGPORT || 5432),
  PGUSER: process.env.PGUSER || 'uyenvu_user',
  PGPASSWORD: process.env.PGPASSWORD || '',
  PGDATABASE: process.env.PGDATABASE || 'uyen_vu_db',
  PGPOOL_MAX: Number(process.env.PGPOOL_MAX || 20),
  PGSSLMODE: process.env.PGSSLMODE || 'disable',
  ENGINE_SNAPSHOT_FILE: process.env.ENGINE_SNAPSHOT_FILE || '',
});
