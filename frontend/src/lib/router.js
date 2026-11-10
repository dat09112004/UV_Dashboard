import { URL } from 'node:url';
import { ENV } from '../config/env.js';
import { resolveHttpError } from '../utils/errors.js';

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function compilePathPattern(pattern) {
  const paramNames = [];
  const regexSource = pattern
    .replace(/\/+$/, '')
    .replace(/:([A-Za-z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });
  const regex = new RegExp(`^${regexSource || '/'}$`);
  return { regex, paramNames };
}

/**
 * Đệ quy làm sạch đối tượng JSON để ngăn chặn tuyệt đối tấn công Prototype Pollution
 */
function sanitizeParsedJson(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeParsedJson);
  }
  if (value !== null && typeof value === 'object') {
    const clean = Object.create(null);
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_PROTO_KEYS.has(k)) continue;
      clean[k] = sanitizeParsedJson(v);
    }
    return { ...clean };
  }
  return value;
}

async function parseJsonBody(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return {};
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', chunk => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Dữ liệu tải lên vượt quá giới hạn cho phép (10 MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      if (contentType && !contentType.includes('application/json')) {
        reject(new Error('Yêu cầu bắt buộc sử dụng Content-Type: application/json.'));
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(sanitizeParsedJson(parsed));
      } catch {
        reject(new Error('Định dạng JSON trong yêu cầu không hợp lệ.'));
      }
    });
    req.on('error', reject);
  });
}

export class Router {
  constructor() {
    this.routes = [];
    this.globalMiddlewares = [];
  }

  use(middleware) {
    this.globalMiddlewares.push(middleware);
  }

  register(method, pathPattern, ...handlers) {
    const { regex, paramNames } = compilePathPattern(pathPattern);
    this.routes.push({
      method: method.toUpperCase(),
      pathPattern,
      regex,
      paramNames,
      handlers,
    });
  }

  get(pathPattern, ...handlers) {
    this.register('GET', pathPattern, ...handlers);
  }

  post(pathPattern, ...handlers) {
    this.register('POST', pathPattern, ...handlers);
  }

  put(pathPattern, ...handlers) {
    this.register('PUT', pathPattern, ...handlers);
  }

  patch(pathPattern, ...handlers) {
    this.register('PATCH', pathPattern, ...handlers);
  }

  delete(pathPattern, ...handlers) {
    this.register('DELETE', pathPattern, ...handlers);
  }

  async handle(req, res) {
    // 1. Strict CORS Whitelist Verification
    const requestOrigin = req.headers.origin;
    if (requestOrigin && ENV.CORS_ORIGINS.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    } else if (!requestOrigin && ENV.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', ENV.CORS_ORIGINS[0] || 'http://localhost:5173');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Cache, X-Cache-Invalidated, X-RateLimit-Tier, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After'
    );

    // 2. Enterprise HTTP Security Headers (OWASP Top 10 Compliant)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    );
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    res.json = (statusCode, payload) => {
      const body = JSON.stringify(payload);
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
    };

    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
      req.pathname = pathname;
      req.path = pathname;
      req.query = sanitizeParsedJson(Object.fromEntries(parsedUrl.searchParams.entries()));
      req.body = await parseJsonBody(req);

      let matchedRoute = null;
      let params = {};

      for (const route of this.routes) {
        if (route.method !== req.method.toUpperCase()) continue;
        const match = route.regex.exec(pathname);
        if (match) {
          matchedRoute = route;
          params = Object.fromEntries(
            route.paramNames.map((name, idx) => [name, decodeURIComponent(match[idx + 1])])
          );
          break;
        }
      }

      if (!matchedRoute) {
        res.json(404, {
          status: 'error',
          code: 'ENDPOINT_NOT_FOUND',
          message: `Không tìm thấy đường dẫn API: ${req.method} ${pathname}`,
        });
        return;
      }

      req.params = sanitizeParsedJson(params);
      const chain = [...this.globalMiddlewares, ...matchedRoute.handlers];

      let index = 0;
      const next = async () => {
        if (index >= chain.length) return;
        const handler = chain[index++];
        await handler(req, res, next);
      };

      await next();
    } catch (err) {
      const httpError = resolveHttpError(err);
      if (!res.writableEnded) {
        res.json(httpError.statusCode, {
          status: 'error',
          code: httpError.code,
          message: httpError.message,
          ...(httpError.details ? { details: httpError.details } : {}),
        });
      }
    }
  }
}
