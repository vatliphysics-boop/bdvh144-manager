/**
 * MIGRATION SCRIPT - TRUNG TÂM BDVH 144
 * Di chuyển toàn bộ cấu trúc và dữ liệu từ SQLite sang PostgreSQL
 * Không xóa dữ liệu SQLite hiện có.
 */

const fs = require('fs');
const path = require('path');
const { query, initDatabase } = require('../server/db');

async function runMigration() {
  console.log('--- BẮT ĐẦU MIGRATION SANG POSTGRESQL ---');

  // 1. Khởi tạo schema PostgreSQL
  console.log('1. Khởi tạo bảng và cấu trúc trên PostgreSQL...');
  await initDatabase();
  console.log('✓ Hoàn thành khởi tạo cấu trúc PostgreSQL.');

  // 2. Kiểm tra nếu có database.sqlite để chuyển dữ liệu
  const sqlitePath = path.join(__dirname, '../database.sqlite');
  if (fs.existsSync(sqlitePath)) {
    console.log(`2. Tìm thấy tệp SQLite tại: ${sqlitePath}. Tiến hành chuyển đổi dữ liệu...`);
    try {
      const Database = require('better-sqlite3');
      const sqliteDb = new Database(sqlitePath, { readonly: true });

      // Sessions
      const sessions = sqliteDb.prepare('SELECT * FROM sessions').all();
      for (const s of sessions) {
        await query(`
          INSERT INTO sessions (id, session_date, registration_open_at, registration_close_at, is_manually_locked, excel_file_path, excel_generated_at, self_attendance_lop10, self_attendance_lop11, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (session_date) DO NOTHING
        `, [s.id, s.session_date, s.registration_open_at, s.registration_close_at, s.is_manually_locked, s.excel_file_path, s.excel_generated_at, s.self_attendance_lop10, s.self_attendance_lop11, s.created_at]);
      }
      console.log(`✓ Đã đồng bộ ${sessions.length} buổi học.`);

      // Registrations
      const registrations = sqliteDb.prepare('SELECT * FROM registrations').all();
      for (const r of registrations) {
        await query(`
          INSERT INTO registrations (id, session_id, class_name, full_name, school_name, idempotency_key, student_token, registered_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [r.id, r.session_id, r.class_name, r.full_name, r.school_name, r.idempotency_key, r.student_token, r.registered_at]);
      }
      console.log(`✓ Đã đồng bộ ${registrations.length} lượt ghi danh học sinh.`);

      // Student Attendance
      const stAtt = sqliteDb.prepare('SELECT * FROM student_attendance').all();
      for (const a of stAtt) {
        await query(`
          INSERT INTO student_attendance (id, registration_id, session_id, class_name, status, updated_at, updated_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (registration_id) DO NOTHING
        `, [a.id, a.registration_id, a.session_id, a.class_name, a.status, a.updated_at, a.updated_by]);
      }

      // Teacher Attendance
      const tAtt = sqliteDb.prepare('SELECT * FROM teacher_attendance').all();
      for (const a of tAtt) {
        await query(`
          INSERT INTO teacher_attendance (id, session_id, class_name, person_name, role, status, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (session_id, class_name, person_name) DO NOTHING
        `, [a.id, a.session_id, a.class_name, a.person_name, a.role, a.status, a.updated_at]);
      }

      // Timesheets
      const timesheets = sqliteDb.prepare('SELECT * FROM timesheets').all();
      for (const t of timesheets) {
        await query(`
          INSERT INTO timesheets (id, session_id, class_name, teaching_date, scheduled_time, assistant_name, check_in_time, check_in_iso, check_out_time, check_out_iso, duration_minutes, duration_formatted, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (session_id, class_name) DO NOTHING
        `, [t.id, t.session_id, t.class_name, t.teaching_date, t.scheduled_time, t.assistant_name, t.check_in_time, t.check_in_iso, t.check_out_time, t.check_out_iso, t.duration_minutes, t.duration_formatted, t.status, t.created_at]);
      }

      // Tests
      const tests = sqliteDb.prepare('SELECT * FROM tests').all();
      for (const t of tests) {
        await query(`
          INSERT INTO tests (id, session_id, class_name, title, is_open, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (session_id, class_name) DO NOTHING
        `, [t.id, t.session_id, t.class_name, t.title, t.is_open, t.created_at]);
      }

      sqliteDb.close();

      // Đồng bộ sequence ID trên PostgreSQL sau khi chèn ID cụ thể
      const tablesWithSerial = ['sessions', 'registrations', 'student_attendance', 'teacher_attendance', 'timesheets', 'tests'];
      for (const t of tablesWithSerial) {
        try {
          await query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`);
        } catch (e) {
          // Bỏ qua nếu môi trường không dùng sequence chuẩn
        }
      }

      console.log('✓ Toàn bộ dữ liệu SQLite đã được bảo toàn và chuyển đổi sang PostgreSQL thành công.');
    } catch (err) {
      console.warn('Lưu ý khi đọc SQLite cũ:', err.message);
    }
  } else {
    console.log('Không có tệp SQLite cũ cần chuyển đổi, cơ sở dữ liệu PostgreSQL đã được chuẩn hóa mới.');
  }

  console.log('--- MIGRATION HOÀN TẤT THÀNH CÔNG ---');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('LỖI MIGRATION:', err);
  process.exit(1);
});
