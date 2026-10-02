const crypto = require('crypto');
const { query, hashAccessCode } = require('./db');
const { getNowVN } = require('./utils/time');

// Rate limiting in-memory map: ip -> { count, lockedUntil }
const rateLimitMap = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMins = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      allowed: false,
      message: `Đã thử sai mã quá nhiều lần. Vui lòng thử lại sau ${remainingMins} phút.`
    };
  }

  // If lockout expired, reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, firstAttempt: now };
  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  rateLimitMap.set(ip, record);
}

function clearRateLimit(ip) {
  rateLimitMap.delete(ip);
}

/**
 * Verify submitted access code against hashed values in PostgreSQL
 */
async function verifyCode(inputCode, ip) {
  const rateStatus = checkRateLimit(ip);
  if (!rateStatus.allowed) {
    return { success: false, status: 429, message: rateStatus.message };
  }

  if (!inputCode || typeof inputCode !== 'string') {
    recordFailedAttempt(ip);
    return { success: false, status: 400, message: 'Vui lòng nhập mã truy cập.' };
  }

  const cleanCode = inputCode.trim();
  const allCodes = await query('SELECT * FROM access_codes');

  let matchedRow = null;
  for (const row of allCodes.rows) {
    const computedHash = hashAccessCode(cleanCode, row.code_salt);
    if (crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(row.code_hash, 'hex'))) {
      matchedRow = row;
      break;
    }
  }

  if (!matchedRow) {
    recordFailedAttempt(ip);
    const remaining = MAX_ATTEMPTS - (rateLimitMap.get(ip)?.count || 1);
    return {
      success: false,
      status: 401,
      message: `Mã truy cập không đúng. Còn lại ${Math.max(0, remaining)} lần thử.`
    };
  }

  // Success: clear rate limit
  clearRateLimit(ip);

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const nowVN = getNowVN();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  await query(`
    INSERT INTO admin_sessions (token, role, description, created_at, expires_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [token, matchedRow.role, matchedRow.description, nowVN.isoVN, expiresAt]);

  return {
    success: true,
    token,
    role: matchedRow.role,
    description: matchedRow.description
  };
}

/**
 * Middleware: parse session cookie and load user into req.user
 */
async function sessionMiddleware(req, res, next) {
  try {
    const token = req.cookies?.admin_session;
    if (!token) {
      req.user = null;
      return next();
    }

    const sessionRes = await query(`
      SELECT * FROM admin_sessions
      WHERE token = $1 AND expires_at > $2
    `, [token, new Date().toISOString()]);

    const session = sessionRes.rows[0];

    if (!session) {
      res.clearCookie('admin_session');
      req.user = null;
      return next();
    }

    req.user = {
      role: session.role,
      description: session.description,
      token: session.token
    };
    next();
  } catch (err) {
    console.error('Lỗi phiên đăng nhập:', err);
    req.user = null;
    next();
  }
}

/**
 * Middleware: Requires ADMIN role (Võ Đoàn Đăng Khôi)
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Bạn không có quyền truy cập chức năng quản lý này.'
    });
  }
  next();
}

/**
 * Middleware: Requires TEACHER or ADMIN role
 */
function requireTeacherOrAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'TEACHER')) {
    return res.status(403).json({
      success: false,
      message: 'Vui lòng nhập mã hợp lệ để xem báo cáo.'
    });
  }
  next();
}

/**
 * Logout session
 */
async function logoutSession(token) {
  if (token) {
    await query('DELETE FROM admin_sessions WHERE token = $1', [token]);
  }
}

module.exports = {
  verifyCode,
  sessionMiddleware,
  requireAdmin,
  requireTeacherOrAdmin,
  logoutSession
};
