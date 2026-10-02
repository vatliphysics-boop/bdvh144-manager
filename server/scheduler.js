const cron = require('node-cron');
const { query, ensureTeacherAttendanceForSession } = require('./db');
const { getNowVN, getSessionWindow, addWeeks } = require('./utils/time');
const { generateSessionExcelBuffer } = require('./excel');

/**
 * Check and handle auto-closing of registration at 07:00 Saturday
 * Resilient catch-up logic to ensure locked sessions always have snapshot records.
 */
async function checkScheduleCycle(retryCount = 0) {
  try {
    const nowVN = getNowVN();
    const currentIso = nowVN.isoVN;

    // 1. Catch-up: Find sessions past close time (07:00 Saturday) that haven't been locked
    const expiredSessions = await query(`
      SELECT * FROM sessions
      WHERE registration_close_at <= $1 AND is_manually_locked = 0
    `, [currentIso]);

    for (const session of expiredSessions.rows) {
      console.log(`[Scheduler] Buổi học ${session.session_date} đã đến hạn đóng lúc 07:00 thứ Bảy. Tự động chốt...`);
      await query(`
        UPDATE sessions
        SET is_manually_locked = 1
        WHERE id = $1
      `, [session.id]);

      try {
        await generateSessionExcelBuffer(session.id);
        console.log(`[Scheduler] Đã lưu snapshot dữ liệu Excel cho buổi ${session.session_date}`);
      } catch (excelErr) {
        console.error(`[Scheduler Error] Lỗi tạo snapshot Excel buổi ${session.session_date}:`, excelErr.message);
        // Will be retried on next scheduler cycle
      }
    }

    // 2. Ensure next Saturday session is provisioned
    const latestRes = await query(`
      SELECT * FROM sessions ORDER BY session_date DESC LIMIT 1
    `);
    const latestSession = latestRes.rows[0];

    if (latestSession) {
      if (latestSession.session_date <= nowVN.dateStr) {
        const nextSatDate = addWeeks(latestSession.session_date, 1);
        const exists = await query('SELECT id FROM sessions WHERE session_date = $1', [nextSatDate]);

        if (exists.rows.length === 0) {
          const window = getSessionWindow(nextSatDate);
          const res = await query(`
            INSERT INTO sessions (session_date, registration_open_at, registration_close_at, is_manually_locked, created_at)
            VALUES ($1, $2, $3, 0, $4)
            RETURNING id
          `, [nextSatDate, window.openIso, window.closeIso, nowVN.isoVN]);

          await ensureTeacherAttendanceForSession(res.rows[0].id);
          console.log(`[Scheduler] Đã tự động khởi tạo buổi học tiếp theo: ${nextSatDate}`);
        }
      }
    }
  } catch (error) {
    console.error(`[Scheduler Error] Thất bại ở chu kỳ kiểm tra:`, error.message);
    if (retryCount < 3) {
      setTimeout(() => checkScheduleCycle(retryCount + 1), 5000 * (retryCount + 1));
    }
  }
}

function startScheduler() {
  console.log('[Scheduler] Khởi động tiến trình tự động server-side (chạy mỗi phút)...');
  // Run once on startup to catch up any missed tasks while server was down
  checkScheduleCycle();

  // Run every minute (cron: * * * * *)
  cron.schedule('* * * * *', () => {
    checkScheduleCycle();
  });
}

module.exports = {
  startScheduler,
  checkScheduleCycle
};
