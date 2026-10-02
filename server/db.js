const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { getSessionWindow, getNowVN } = require('./utils/time');

let pool = null;
let pgliteInstance = null;

// Determine database connection
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

if (isProduction && !databaseUrl) {
  console.error('\n=============================================================================');
  console.error('❌ [LỖI CẤU HÌNH PRODUCTION] THIẾU BIẾN MÔI TRƯỜNG DATABASE_URL!');
  console.error('Ứng dụng đang chạy ở chế độ production nhưng chưa được cấu hình DATABASE_URL.');
  console.error('Vui lòng thiết lập biến môi trường DATABASE_URL trỏ tới cơ sở dữ liệu PostgreSQL');
  console.error('trên đám mây (ví dụ: Render PostgreSQL hoặc Neon.tech).');
  console.error('Hệ thống từ chối sử dụng cơ sở dữ liệu cục bộ tạm thời.');
  console.error('=============================================================================\n');
  process.exit(1);
}

if (databaseUrl) {
  console.log('[Database] Đang kết nối tới PostgreSQL qua DATABASE_URL...');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]:', err);
  });
} else {
  console.log('[Database Dev] Không có DATABASE_URL, khởi tạo PostgreSQL WASM Engine cục bộ...');
  const { PGlite } = require('@electric-sql/pglite');
  const pgDataDir = path.join(__dirname, '../.pgdata');
  if (!fs.existsSync(pgDataDir)) {
    fs.mkdirSync(pgDataDir, { recursive: true });
  }
  pgliteInstance = new PGlite(pgDataDir);
}

/**
 * Standard PostgreSQL query wrapper returning { rows, rowCount }
 */
async function query(text, params = []) {
  if (pool) {
    return await pool.query(text, params);
  } else if (pgliteInstance) {
    const res = await pgliteInstance.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: (res.rows && res.rows.length) || 0
    };
  } else {
    throw new Error('Chưa khởi tạo kết nối cơ sở dữ liệu.');
  }
}

async function exec(text) {
  if (pool) {
    return await pool.query(text);
  } else if (pgliteInstance) {
    return await pgliteInstance.exec(text);
  } else {
    throw new Error('Chưa khởi tạo kết nối cơ sở dữ liệu.');
  }
}

/**
 * Hash access code with PBKDF2-SHA256 and salt
 */
function hashAccessCode(code, salt) {
  return crypto.pbkdf2Sync(code.trim(), salt, 100000, 32, 'sha256').toString('hex');
}

/**
 * Initialize PostgreSQL Schema
 */
async function initDatabase() {
  // 1. Create Tables individually
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      session_date VARCHAR(20) UNIQUE NOT NULL,
      registration_open_at VARCHAR(50) NOT NULL,
      registration_close_at VARCHAR(50) NOT NULL,
      is_manually_locked INTEGER DEFAULT 0,
      excel_file_path TEXT,
      excel_generated_at VARCHAR(50),
      self_attendance_lop10 INTEGER DEFAULT 0,
      self_attendance_lop11 INTEGER DEFAULT 0,
      created_at VARCHAR(50) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      class_name VARCHAR(50) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      school_name VARCHAR(255),
      idempotency_key VARCHAR(100) UNIQUE,
      student_token VARCHAR(100) NOT NULL,
      registered_at VARCHAR(50) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS student_attendance (
      id SERIAL PRIMARY KEY,
      registration_id INTEGER UNIQUE NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      class_name VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Chưa điểm danh',
      updated_at VARCHAR(50) NOT NULL,
      updated_by VARCHAR(50) NOT NULL DEFAULT 'admin'
    )`,
    `CREATE TABLE IF NOT EXISTS teacher_attendance (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      class_name VARCHAR(50) NOT NULL,
      person_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Chưa điểm danh',
      updated_at VARCHAR(50) NOT NULL,
      CONSTRAINT uq_teacher_attendance UNIQUE(session_id, class_name, person_name)
    )`,
    `CREATE TABLE IF NOT EXISTS timesheets (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      class_name VARCHAR(50) NOT NULL,
      teaching_date VARCHAR(20) NOT NULL,
      scheduled_time VARCHAR(50) NOT NULL,
      assistant_name VARCHAR(255) NOT NULL DEFAULT 'Võ Đoàn Đăng Khôi',
      check_in_time VARCHAR(20) NOT NULL,
      check_in_iso VARCHAR(50) NOT NULL,
      check_out_time VARCHAR(20),
      check_out_iso VARCHAR(50),
      duration_minutes INTEGER DEFAULT 0,
      duration_formatted VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'Đang dạy',
      created_at VARCHAR(50) NOT NULL,
      CONSTRAINT uq_timesheet UNIQUE(session_id, class_name)
    )`,
    `CREATE TABLE IF NOT EXISTS tests (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      class_name VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 0,
      created_at VARCHAR(50) NOT NULL,
      CONSTRAINT uq_tests UNIQUE(session_id, class_name)
    )`,
    `CREATE TABLE IF NOT EXISTS test_questions (
      id SERIAL PRIMARY KEY,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type VARCHAR(50) NOT NULL,
      options_json TEXT,
      correct_answer TEXT NOT NULL,
      points REAL NOT NULL DEFAULT 1.0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS test_submissions (
      id SERIAL PRIMARY KEY,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
      student_token VARCHAR(100) NOT NULL,
      student_name VARCHAR(255) NOT NULL,
      answers_json TEXT NOT NULL,
      score REAL NOT NULL,
      total_points REAL NOT NULL,
      submitted_at VARCHAR(50) NOT NULL,
      CONSTRAINT uq_test_submission UNIQUE(test_id, registration_id)
    )`,
    `CREATE TABLE IF NOT EXISTS access_codes (
      id SERIAL PRIMARY KEY,
      code_hash VARCHAR(255) NOT NULL UNIQUE,
      code_salt VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      description VARCHAR(255) NOT NULL,
      created_at VARCHAR(50) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token VARCHAR(255) PRIMARY KEY,
      role VARCHAR(50) NOT NULL,
      description VARCHAR(255),
      created_at VARCHAR(50) NOT NULL,
      expires_at VARCHAR(50) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pg_reg_session ON registrations(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pg_reg_token ON registrations(student_token)`,
    `CREATE INDEX IF NOT EXISTS idx_pg_timesheet_session ON timesheets(session_id)`
  ];

  for (const stmt of schemaStatements) {
    await query(stmt);
  }

  // 2. Seed initial session 2026-10-03 if not exists
  const nowVN = getNowVN();
  const existingSession = await query('SELECT * FROM sessions WHERE session_date = $1', [config.FIRST_SESSION_DATE]);
  let sessionId;

  if (existingSession.rows.length === 0) {
    const window = getSessionWindow(config.FIRST_SESSION_DATE);
    const insertRes = await query(`
      INSERT INTO sessions (session_date, registration_open_at, registration_close_at, is_manually_locked, created_at)
      VALUES ($1, $2, $3, 0, $4)
      RETURNING id
    `, [config.FIRST_SESSION_DATE, window.openIso, window.closeIso, nowVN.isoVN]);

    sessionId = insertRes.rows[0].id;
  } else {
    sessionId = existingSession.rows[0].id;
  }

  await ensureTeacherAttendanceForSession(sessionId);

  // 3. Seed / Refresh Access Codes from Server Environment Variables
  await seedAccessCodes();
}

/**
 * Ensure teacher attendance records exist for session
 */
async function ensureTeacherAttendanceForSession(sessionId) {
  const nowVN = getNowVN();
  const staff = [
    { name: config.TEACHER_NAME, role: 'Giáo viên' },
    { name: config.ASSISTANT_NAME, role: 'Trợ giảng' }
  ];

  for (const className of ['Lớp 10', 'Lớp 11']) {
    for (const member of staff) {
      await query(`
        INSERT INTO teacher_attendance (session_id, class_name, person_name, role, status, updated_at)
        VALUES ($1, $2, $3, $4, 'Chưa điểm danh', $5)
        ON CONFLICT (session_id, class_name, person_name) DO NOTHING
      `, [sessionId, className, member.name, member.role, nowVN.isoVN]);
    }
  }
}

/**
 * Seed or refresh access codes from environment variables
 * Invalidate all existing sessions when codes change
 */
async function seedAccessCodes() {
  const nowVN = getNowVN();

  // Read codes securely from environment variables
  let codeKhoiPrimary = process.env.CODE_KHOI_PRIMARY;
  let codeKhoiBackup  = process.env.CODE_KHOI_BACKUP;
  let codeThayKhoa    = process.env.CODE_THAY_KHOA;

  if (isProduction && (!codeKhoiPrimary || !codeKhoiBackup || !codeThayKhoa)) {
    console.error('\n⚠️ [CẢNH BÁO BẢO MẬT] Thiếu biến môi trường mã truy cập: CODE_KHOI_PRIMARY, CODE_KHOI_BACKUP, hoặc CODE_THAY_KHOA.');
    console.error('Vui lòng thiết lập đầy đủ trong Dashboard của dịch vụ Cloud (Render, Railway, ...).\n');
  }

  // Fallback generation for dev if completely unset
  if (!codeKhoiPrimary) codeKhoiPrimary = 'DEV-KHOI-PR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  if (!codeKhoiBackup)  codeKhoiBackup  = 'DEV-KHOI-BK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  if (!codeThayKhoa)    codeThayKhoa    = 'DEV-KHOA-BC-' + crypto.randomBytes(4).toString('hex').toUpperCase();

  const codesToConfigure = [
    { code: codeKhoiPrimary, role: 'ADMIN', description: 'Võ Đoàn Đăng Khôi (Mã chính)' },
    { code: codeKhoiBackup,  role: 'ADMIN', description: 'Võ Đoàn Đăng Khôi (Mã dự phòng)' },
    { code: codeThayKhoa,    role: 'TEACHER', description: 'Thầy Nguyễn Khoa (Xem báo cáo)' }
  ];

  // Invalidate any old session tokens upon restart/code update
  await query('DELETE FROM admin_sessions');
  await query('DELETE FROM access_codes');

  for (const item of codesToConfigure) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashAccessCode(item.code, salt);

    await query(`
      INSERT INTO access_codes (code_hash, code_salt, role, description, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [hash, salt, item.role, item.description, nowVN.isoVN]);
  }

  console.log('[Security] Đã cập nhật 3 mã truy cập bảo mật và thu hồi toàn bộ phiên đăng nhập cũ.');
}

module.exports = {
  query,
  initDatabase,
  hashAccessCode,
  ensureTeacherAttendanceForSession,
  seedAccessCodes
};
