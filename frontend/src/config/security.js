import { ENV } from './env.js';

export const SECURITY_POLICY = Object.freeze({
  jwtAlgorithm: 'HS256',
  jwtIssuer: ENV.JWT_ISSUER,
  jwtAudience: ENV.JWT_AUDIENCE,
  jwtAccessTtlSeconds: ENV.JWT_EXPIRES_IN_SECONDS,
  jwtRefreshTtlSeconds: ENV.JWT_REFRESH_EXPIRES_IN_SECONDS,
  pbkdf2Iterations: ENV.PBKDF2_ITERATIONS,
  maxJsonBodyBytes: 10 * 1024 * 1024,
  maxTaskAttachments: 3,
  maxTaskAttachmentsBytes: 1 * 1024 * 1024,
  requireTermsOnLogin: ENV.REQUIRE_TERMS_ON_LOGIN,
  rateLimitsPerMinute: {
    auth: ENV.AUTH_RATE_LIMIT_PER_MIN,
    write: ENV.WRITE_RATE_LIMIT_PER_MIN,
    read: ENV.API_RATE_LIMIT_PER_MIN,
  },
  headers: {
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  },
});
