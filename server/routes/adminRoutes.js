const express = require('express');
const router = express.Router();
const { query, ensureTeacherAttendanceForSession } = require('../db');
const config = require('../config');
const { requireAdmin } = require('../auth');
const { getNowVN, getSessionWindow, formatDateToVN, formatDuration } = require('../utils/time');
const { generateSessionExcelBuffer } = require('../excel');

// All admin routes require ADMIN role
router.use(requireAdmin);

// GET /api/admin/sessions - List all sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessionsRes = await query(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id AND r.class_name = 'Lớp 10') as count_lop10,
        (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id AND r.class_name = 'Lớp 11') as count_lop11
      FROM sessions s
      ORDER BY s.session_date DESC
    `);

    const formatted = sessionsRes.rows.map(s => {
      const c10 = parseInt(s.count_lop10, 10) || 0;
      const c11 = parseInt(s.count_lop11, 10) || 0;
      return {
        id: s.id,
        sessionDate: s.session_date,
        formattedDate: formatDateToVN(s.session_date),
        registrationOpenAt: s.registration_open_at,
        registrationCloseAt: s.registration_close_at,
        isManuallyLocked: s.is_manually_locked === 1,
        hasExcel: !!s.excel_generated_at,
        excelGeneratedAt: s.excel_generated_at,
        countLop10: c10,
        countLop11: c11,
        totalCount: c10 + c11
      };
    });

    res.json({ success: true, sessions: formatted });
  } catch (err) {
    console.error('Lỗi admin sessions:', err);
    res.status(500).json({ success: false, message: 'Lỗi nạp danh sách buổi học.' });
  }
});

// POST /api/admin/sessions - Create new session
router.post('/sessions', async (req, res) => {
  try {
    const { session_date } = req.body;
    if (!session_date || !/^\d{4}-\d{2}-\d{2}$/.test(session_date)) {
      return res.status(400).json({ success: false, message: 'Định dạng ngày học không hợp lệ (YYYY-MM-DD).' });
    }

    const existingRes = await query('SELECT id FROM sessions WHERE session_date = $1', [session_date]);
    if (existingRes.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Buổi học cho ngày này đã tồn tại.' });
    }

    const window = getSessionWindow(session_date);
    const nowVN = getNowVN();

    const insertRes = await query(`
      INSERT INTO sessions (session_date, registration_open_at, registration_close_at, is_manually_locked, created_at)
      VALUES ($1, $2, $3, 0, $4)
      RETURNING id
    `, [session_date, window.openIso, window.closeIso, nowVN.isoVN]);

    const sessionId = insertRes.rows[0].id;
    await ensureTeacherAttendanceForSession(sessionId);

    res.json({
      success: true,
      message: `Đã tạo buổi học mới ngày ${formatDateToVN(session_date)} thành công.`,
      sessionId
    });
  } catch (err) {
    console.error('Lỗi tạo buổi học:', err);
    res.status(500).json({ success: false, message: 'Lỗi tạo buổi học.' });
  }
});

// GET /api/admin/sessions/:id - Get full session details
router.get('/sessions/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const sessionRes = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const session = sessionRes.rows[0];

    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy buổi học.' });
    }

    await ensureTeacherAttendanceForSession(sessionId);

    const teacherRes = await query(`
      SELECT * FROM teacher_attendance WHERE session_id = $1 ORDER BY class_name ASC, role DESC
    `, [sessionId]);

    const regRes = await query(`
      SELECT r.*, sa.status as attendance_status, sa.updated_at as attendance_updated_at, sa.updated_by as attendance_updated_by
      FROM registrations r
      LEFT JOIN student_attendance sa ON r.id = sa.registration_id
      WHERE r.session_id = $1
      ORDER BY r.class_name ASC, r.id ASC
    `, [sessionId]);

    const timesheetRes = await query(`
      SELECT * FROM timesheets WHERE session_id = $1 ORDER BY class_name ASC
    `, [sessionId]);

    const testRes = await query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM test_questions tq WHERE tq.test_id = t.id) as question_count,
        (SELECT COUNT(*) FROM test_submissions ts WHERE ts.test_id = t.id) as submission_count
      FROM tests t
      WHERE t.session_id = $1
      ORDER BY t.class_name ASC
    `, [sessionId]);

    res.json({
      success: true,
      session: {
        id: session.id,
        sessionDate: session.session_date,
        formattedDate: formatDateToVN(session.session_date),
        registrationOpenAt: session.registration_open_at,
        registrationCloseAt: session.registration_close_at,
        isManuallyLocked: session.is_manually_locked === 1,
        selfAttendanceLop10: session.self_attendance_lop10 === 1,
        selfAttendanceLop11: session.self_attendance_lop11 === 1,
        hasExcel: !!session.excel_generated_at,
        excelGeneratedAt: session.excel_generated_at
      },
      teacherAttendance: teacherRes.rows,
      registrations: regRes.rows,
      timesheets: timesheetRes.rows,
      tests: testRes.rows.map(t => ({
        ...t,
        question_count: parseInt(t.question_count, 10) || 0,
        submission_count: parseInt(t.submission_count, 10) || 0
      }))
    });
  } catch (err) {
    console.error('Lỗi session details:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải chi tiết buổi học.' });
  }
});

// POST /api/admin/sessions/:id/lock - Manually lock registration and export Excel
router.post('/sessions/:id/lock', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const sessionRes = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const session = sessionRes.rows[0];

    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy buổi học.' });
    }

    await query('UPDATE sessions SET is_manually_locked = 1 WHERE id = $1', [sessionId]);
    const { fileName } = await generateSessionExcelBuffer(sessionId);

    res.json({
      success: true,
      message: `Đã chốt ghi danh và xuất trang tính thành công cho buổi ${formatDateToVN(session.session_date)}.`,
      fileName,
      downloadUrl: `/api/admin/sessions/${sessionId}/download-excel`
    });
  } catch (error) {
    console.error('Lỗi xuất Excel:', error);
    res.status(500).json({ success: false, message: 'Đã khóa ghi danh nhưng lỗi khi tạo file Excel.' });
  }
});

// GET /api/admin/sessions/:id/download-excel (and alias /excel) - Stream generated Excel directly from database snapshot
router.get(['/sessions/:id/download-excel', '/sessions/:id/excel'], async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const sessionRes = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const session = sessionRes.rows[0];

    if (!session) {
      return res.status(404).send('Không tìm thấy buổi học.');
    }

    const { buffer, fileName } = await generateSessionExcelBuffer(sessionId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Lỗi download-excel:', err);
    res.status(500).send('Lỗi tạo file Excel.');
  }
});

// POST /api/admin/sessions/:id/toggle-self-attendance
router.post('/sessions/:id/toggle-self-attendance', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { className, enabled } = req.body;

    if (className !== 'Lớp 10' && className !== 'Lớp 11') {
      return res.status(400).json({ success: false, message: 'Lớp không hợp lệ.' });
    }

    const column = className === 'Lớp 10' ? 'self_attendance_lop10' : 'self_attendance_lop11';
    await query(`UPDATE sessions SET ${column} = $1 WHERE id = $2`, [enabled ? 1 : 0, sessionId]);

    res.json({
      success: true,
      message: `Đã ${enabled ? 'MỞ' : 'ĐÓNG'} chức năng học sinh tự điểm danh cho ${className}.`
    });
  } catch (err) {
    console.error('Lỗi toggle-self-attendance:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật tự điểm danh.' });
  }
});

// POST /api/admin/sessions/:id/teacher-attendance
router.post('/sessions/:id/teacher-attendance', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { className, personName, status } = req.body;

    const validStatuses = ['Chưa điểm danh', 'Có mặt', 'Đi muộn', 'Vắng'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái điểm danh không hợp lệ.' });
    }

    const nowVN = getNowVN();
    const updatedDisplay = `${nowVN.timeStr} ${formatDateToVN(nowVN.dateStr)}`;

    await query(`
      UPDATE teacher_attendance
      SET status = $1, updated_at = $2
      WHERE session_id = $3 AND class_name = $4 AND person_name = $5
    `, [status, updatedDisplay, sessionId, className, personName]);

    res.json({ success: true, message: `Đã cập nhật điểm danh: ${personName} (${className}) - ${status}.` });
  } catch (err) {
    console.error('Lỗi teacher-attendance:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật điểm danh.' });
  }
});

// POST /api/admin/sessions/:id/student-attendance
router.post('/sessions/:id/student-attendance', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { registrationId, status } = req.body;

    const validStatuses = ['Chưa điểm danh', 'Có mặt', 'Đi muộn', 'Vắng'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
    }

    const nowVN = getNowVN();
    const updatedDisplay = `${nowVN.timeStr} ${formatDateToVN(nowVN.dateStr)}`;

    await query(`
      UPDATE student_attendance
      SET status = $1, updated_at = $2, updated_by = 'admin'
      WHERE registration_id = $3 AND session_id = $4
    `, [status, updatedDisplay, registrationId, sessionId]);

    res.json({ success: true, message: `Đã cập nhật trạng thái: ${status}.` });
  } catch (err) {
    console.error('Lỗi student-attendance:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật học sinh.' });
  }
});

// POST /api/admin/timesheet/check-in
router.post('/timesheet/check-in', async (req, res) => {
  try {
    const { sessionId, className } = req.body;
    if (!sessionId || !className) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn buổi học và lớp.' });
    }

    const sessionRes = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const session = sessionRes.rows[0];
    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy buổi học.' });
    }

    const nowVN = getNowVN();

    // Strict check: Cannot check-in for future sessions
    if (session.session_date > nowVN.dateStr) {
      return res.status(400).json({
        success: false,
        message: `Không thể chấm công cho buổi học trong tương lai (${formatDateToVN(session.session_date)}).`
      });
    }

    // Check if already checked in
    const existingRes = await query(`
      SELECT * FROM timesheets WHERE session_id = $1 AND class_name = $2
    `, [sessionId, className]);

    const existing = existingRes.rows[0];
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Đã chấm công vào lúc ${existing.check_in_time} rồi, không thể ghi đè.`
      });
    }

    const classInfo = config.CLASSES[className];
    const scheduledTime = classInfo ? classInfo.timeSlot : '';

    await query(`
      INSERT INTO timesheets (
        session_id, class_name, teaching_date, scheduled_time, assistant_name,
        check_in_time, check_in_iso, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Đang dạy', $8)
    `, [
      sessionId,
      className,
      session.session_date,
      scheduledTime,
      config.ASSISTANT_NAME,
      nowVN.timeStr,
      nowVN.isoVN,
      nowVN.isoVN
    ]);

    res.json({
      success: true,
      message: `Đã chấm công vào thành công lúc ${nowVN.timeStr} (${className})!`
    });
  } catch (err) {
    console.error('Lỗi check-in:', err);
    res.status(500).json({ success: false, message: 'Lỗi chấm công vào.' });
  }
});

// POST /api/admin/timesheet/check-out
router.post('/timesheet/check-out', async (req, res) => {
  try {
    const { sessionId, className } = req.body;
    const tsRes = await query(`
      SELECT * FROM timesheets WHERE session_id = $1 AND class_name = $2
    `, [sessionId, className]);

    const timesheet = tsRes.rows[0];
    if (!timesheet) {
      return res.status(400).json({
        success: false,
        message: 'Chưa có bản ghi chấm công vào. Bạn phải bấm Chấm công vào trước!'
      });
    }

    if (timesheet.check_out_time && timesheet.status === 'Đã kết thúc') {
      return res.status(400).json({
        success: false,
        message: `Đã chấm công ra lúc ${timesheet.check_out_time} rồi.`
      });
    }

    const nowVN = getNowVN();
    const duration = formatDuration(timesheet.check_in_iso, nowVN.isoVN, timesheet.teaching_date);

    await query(`
      UPDATE timesheets
      SET check_out_time = $1, check_out_iso = $2, duration_minutes = $3, duration_formatted = $4, status = 'Đã kết thúc'
      WHERE id = $5
    `, [nowVN.timeStr, nowVN.isoVN, duration.minutes, duration.text, timesheet.id]);

    res.json({
      success: true,
      message: `Đã chấm công ra thành công lúc ${nowVN.timeStr}. Tổng thời gian: ${duration.text}.`
    });
  } catch (err) {
    console.error('Lỗi check-out:', err);
    res.status(500).json({ success: false, message: 'Lỗi chấm công ra.' });
  }
});

// GET /api/admin/timesheet/list
router.get('/timesheet/list', async (req, res) => {
  try {
    const listRes = await query(`
      SELECT t.*, s.session_date
      FROM timesheets t
      JOIN sessions s ON t.session_id = s.id
      ORDER BY t.teaching_date DESC, t.id DESC
    `);

    const formatted = listRes.rows.map(item => ({
      ...item,
      formattedTeachingDate: formatDateToVN(item.teaching_date)
    }));

    res.json({ success: true, list: formatted });
  } catch (err) {
    console.error('Lỗi list timesheets:', err);
    res.status(500).json({ success: false, message: 'Lỗi nạp danh sách chấm công.' });
  }
});

// POST /api/admin/test/save - Create or update test and questions
router.post('/test/save', async (req, res) => {
  try {
    const { sessionId, className, title, questions } = req.body;

    if (!sessionId || !className || !title) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bài test.' });
    }

    const testRes = await query('SELECT * FROM tests WHERE session_id = $1 AND class_name = $2', [sessionId, className]);
    let test = testRes.rows[0];

    // Check if test already has submissions
    if (test) {
      const subCountRes = await query('SELECT COUNT(*) as c FROM test_submissions WHERE test_id = $1', [test.id]);
      const subCount = parseInt(subCountRes.rows[0].c, 10);
      if (subCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Đã có học sinh nộp bài cho đề test này. Không thể sửa câu hỏi!'
        });
      }
    }

    const nowVN = getNowVN();

    if (!test) {
      const insertRes = await query(`
        INSERT INTO tests (session_id, class_name, title, is_open, created_at)
        VALUES ($1, $2, $3, 0, $4)
        RETURNING id
      `, [sessionId, className, title.trim(), nowVN.isoVN]);

      test = { id: insertRes.rows[0].id };
    } else {
      await query('UPDATE tests SET title = $1 WHERE id = $2', [title.trim(), test.id]);
    }

    // Replace questions
    await query('DELETE FROM test_questions WHERE test_id = $1', [test.id]);

    if (Array.isArray(questions) && questions.length > 0) {
      for (let idx = 0; idx < questions.length; idx++) {
        const q = questions[idx];
        await query(`
          INSERT INTO test_questions (test_id, question_text, question_type, options_json, correct_answer, points, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          test.id,
          q.questionText.trim(),
          q.questionType,
          q.options ? JSON.stringify(q.options) : null,
          String(q.correctAnswer).trim(),
          parseFloat(q.points || 1.0),
          idx + 1
        ]);
      }
    }

    res.json({
      success: true,
      testId: test.id,
      message: 'Đã lưu bài test và danh sách câu hỏi thành công!'
    });
  } catch (err) {
    console.error('Lỗi test/save:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu bài test.' });
  }
});

// GET /api/admin/test/:testId
router.get('/test/:testId', async (req, res) => {
  try {
    const testId = parseInt(req.params.testId, 10);
    const testRes = await query('SELECT * FROM tests WHERE id = $1', [testId]);
    const test = testRes.rows[0];

    if (!test) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài test.' });
    }

    const qRes = await query(`
      SELECT * FROM test_questions WHERE test_id = $1 ORDER BY sort_order ASC, id ASC
    `, [testId]);

    const formattedQuestions = qRes.rows.map(q => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      options: q.options_json ? JSON.parse(q.options_json) : null,
      correctAnswer: q.correct_answer,
      points: q.points,
      sortOrder: q.sort_order
    }));

    const subRes = await query(`
      SELECT * FROM test_submissions WHERE test_id = $1 ORDER BY id DESC
    `, [testId]);

    res.json({
      success: true,
      test: {
        ...test,
        questions: formattedQuestions,
        submissions: subRes.rows.map(s => ({
          id: s.id,
          studentName: s.student_name,
          score: s.score,
          totalPoints: s.total_points,
          submittedAt: s.submitted_at,
          answers: JSON.parse(s.answers_json)
        }))
      }
    });
  } catch (err) {
    console.error('Lỗi get test details:', err);
    res.status(500).json({ success: false, message: 'Lỗi nạp bài test.' });
  }
});

// POST /api/admin/test/:testId/toggle
router.post('/test/:testId/toggle', async (req, res) => {
  try {
    const testId = parseInt(req.params.testId, 10);
    const { isOpen } = req.body;

    await query('UPDATE tests SET is_open = $1 WHERE id = $2', [isOpen ? 1 : 0, testId]);

    res.json({
      success: true,
      message: `Đã ${isOpen ? 'MỞ' : 'ĐÓNG'} bài test thành công!`
    });
  } catch (err) {
    console.error('Lỗi toggle test:', err);
    res.status(500).json({ success: false, message: 'Lỗi thay đổi trạng thái test.' });
  }
});

module.exports = router;
