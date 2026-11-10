import { isTokenJtiBlacklisted } from '../cache/redisCache.js';
import { readDatabaseSnapshot } from '../db/index.js';
import { directoryProfiles } from '../services/authDirectoryService.js';
import { verifyJwt } from '../utils/cryptoAuth.js';
import { AppError } from '../utils/errors.js';
import { can, canOpenSection, isExecutiveRole } from '../utils/roles.js';

/**
 * Middleware xác thực người dùng BẮT BUỘC qua chữ ký số JWT Bearer Token.
 * Đã loại bỏ hoàn toàn cơ chế X-Actor-Id để ngăn chặn giả mạo danh tính (Header Spoofing).
 * Kiểm tra chặt chẽ 4 lớp:
 * 1. Chữ ký số JWT HS256 hợp lệ, đúng Issuer/Audience, có mã JTI duy nhất và chưa hết hạn.
 * 2. Mã JTI của Token chưa bị đưa vào danh sách đen (Redis Blacklist) do Đăng xuất (Logout) hoặc Làm mới (Refresh).
 * 3. tokenVersion khớp với phiên bản hiện tại (thu hồi tức thì khi đổi mật khẩu hoặc khóa tài khoản).
 * 4. Tài khoản đang ở trạng thái status === 'active' (trả về 423 Locked nếu bị khóa).
 */
export async function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!bearerToken) {
    throw new AppError('401: Cần đăng nhập trước khi gửi yêu cầu.', 401, 'UNAUTHORIZED');
  }

  const decoded = verifyJwt(bearerToken);
  if (!decoded?.sub) {
    throw new AppError('401: Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401, 'INVALID_TOKEN');
  }

  if (decoded.jti && (await isTokenJtiBlacklisted(decoded.jti))) {
    throw new AppError(
      '401: Phiên đăng nhập đã kết thúc (đã đăng xuất hoặc đã được làm mới). Vui lòng đăng nhập lại.',
      401,
      'TOKEN_BLACKLISTED'
    );
  }

  const snapshot = await readDatabaseSnapshot();
  const profiles = directoryProfiles(snapshot.directory);
  const found = profiles.find(u => u.id === decoded.sub);

  if (!found) {
    throw new AppError('401: Không tìm thấy tài khoản người dùng.', 401, 'USER_NOT_FOUND');
  }

  const currentTokenVer = snapshot.directory.tokenVersions?.[found.id] || 1;
  if (!decoded.tokenVersion || Number(decoded.tokenVersion) !== currentTokenVer) {
    throw new AppError(
      '401: Phiên đăng nhập đã bị thu hồi do đổi mật khẩu hoặc thay đổi trạng thái tài khoản.',
      401,
      'TOKEN_REVOKED'
    );
  }

  if (found.status !== 'active') {
    throw new AppError(
      'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để mở khóa.',
      423,
      'ACCOUNT_LOCKED'
    );
  }

  req.user = found;
  req.jwtPayload = decoded;
  req.dbSnapshot = snapshot;
  await next();
}

/**
 * Middleware kiểm tra quyền RBAC theo mã quyền (Permission Key)
 */
export function requirePermission(permissionKey) {
  return async (req, _res, next) => {
    if (!req.user || !can(req.user, permissionKey)) {
      throw new AppError(
        'Bạn không có quyền thực hiện thao tác này.',
        403,
        'FORBIDDEN_PERMISSION',
        { requiredPermission: permissionKey }
      );
    }
    await next();
  };
}

/**
 * Middleware kiểm tra quyền truy cập phân hệ điều hướng (Navigation Section Isolation).
 * Chặn tuyệt đối trường hợp người dùng gọi trực tiếp API của phân hệ đã bị Admin/CEO tắt trên thanh điều hướng.
 */
export function requireSectionAccess(sectionKey) {
  return async (req, _res, next) => {
    if (!req.user || !canOpenSection(req.user, sectionKey)) {
      throw new AppError(
        `Tài khoản của bạn không được cấp quyền truy cập phân hệ "${sectionKey}".`,
        403,
        'FORBIDDEN_SECTION_ACCESS',
        { requiredSection: sectionKey }
      );
    }
    await next();
  };
}

/**
 * Middleware kiểm tra nhóm quyền Điều hành Cấp cao (Executive Parity: CEO và Admin ngang quyền 100%)
 */
export async function requireExecutive(req, _res, next) {
  if (!req.user || !isExecutiveRole(req.user.role)) {
    throw new AppError(
      'Chỉ CEO và Admin được phép thực hiện thao tác điều hành này.',
      403,
      'EXECUTIVE_ONLY'
    );
  }
  await next();
}
