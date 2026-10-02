const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const config = require('../config');
const { getNowVN, getSessionWindow, isRegistrationOpen, formatDateToVN, addWeeks } = require('../utils/time');

// Helper to get or find active session from PostgreSQL
async function getActiveSession() {
  const nowVN = getNowVN();
  
  // 1. Closest upcoming or ongoing session
  let res = await query(`
    SELECT * FROM sessions
    WHERE session_date >= $1
    ORDER BY session_date ASC
    LIMIT 1
  `, [nowVN.dateStr]);

  if (res.rows.length === 0) {
    res = await query('SELECT * FROM sessions ORDER BY session_date DESC LIMIT 1');
  }

  return res.rows[0] || null;
}

// GET /api/student/current-session
router.get('/current-session', async (req, res) => {
  try {
    const nowVN = getNowVN();
    const session = await getActiveSession();

    if (!session) {
      return res.status(404).json({ success: false, message: 'Chưa có buổi học nào được cấu hình.' });
    }

    const window = getSessionWindow(session.session_date);

    // Strict time cutoff check: If past Saturday 07:00, auto-lock in DB
    if (nowVN.isoVN >= window.closeIso && session.is_manually_locked === 0) {
      session.is_manually_locked = 1;
      await query('UPDATE sessions SET is_manually_locked = 1 WHERE id = $1', [session.id]);
    }

    const isOpen = isRegistrationOpen(session, nowVN);

    // Calculate next open window if currently closed
    let nextOpenDisplay = null;
    if (!isOpen) {
      if (nowVN.isoVN < window.openIso) {
        nextOpenDisplay = window.openDisplay;
      } else {
        const nextSat = addWeeks(session.session_date, 1);
        const nextWindow = getSessionWindow(nextSat);
        nextOpenDisplay = nextWindow.openDisplay;
      }
    }

    // Check if current browser has student_token and has registered in this session
    const studentToken = req.cookies?.student_token;
    let myRegistration = null;
    if (studentToken) {
      const myRegRes = await query(`
        SELECT r.*, sa.status as attendance_status
        FROM registrations r
        LEFT JOIN student_attendance sa ON r.id = sa.registration_id
        WHERE r.session_id = $1 AND r.student_token = $2
        ORDER BY r.id DESC LIMIT 1
      `, [session.id, studentToken]);
      myRegistration = myRegRes.rows[0] || null;
    }

    // Check test availability
    const test10Res = await query('SELECT id, is_open FROM tests WHERE session_id = $1 AND class_name = $2', [session.id, 'Lớp 10']);
    const test11Res = await query('SELECT id, is_open FROM tests WHERE session_id = $1 AND class_name = $2', [session.id, 'Lớp 11']);
    
    const testLop10 = test10Res.rows[0];
    const testLop11 = test11Res.rows[0];

    res.json({
      success: true,
      session: {
        id: session.id,
        sessionDate: session.session_date,
        formattedDate: formatDateToVN(session.session_date),
        isManuallyLocked: session.is_manually_locked === 1,
        isOpen,
        window,
        nextOpenDisplay,
        selfAttendanceLop10: session.self_attendance_lop10 === 1,
        selfAttendanceLop11: session.self_attendance_lop11 === 1,
        hasOpenTestLop10: testLop10 ? testLop10.is_open === 1 : false,
        hasOpenTestLop11: testLop11 ? testLop11.is_open === 1 : false
      },
      classes: config.CLASSES,
      centerName: config.CENTER_NAME,
      teacherName: config.TEACHER_NAME,
      assistantName: config.ASSISTANT_NAME,
      googleMapsUrl: config.GOOGLE_MAPS_URL,
      myRegistration: myRegistration || null
    });
  } catch (err) {
    console.error('Lỗi lấy current-session:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
  }
});

// POST /api/student/register
router.post('/register', async (req, res) => {
  try {
    const nowVN = getNowVN();
    const { full_name, class_name, school_name, idempotency_key } = req.body;

    // 1. Validate fields
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).'
      });
    }

    if (!class_name || (class_name !== 'Lớp 10' && class_name !== 'Lớp 11')) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn Lớp 10 hoặc Lớp 11.'
      });
    }

    const cleanName = full_name.trim();
    const cleanSchool = school_name ? school_name.trim() : '';

    // 2. Fetch active session
    const session = await getActiveSession();
    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Hệ thống hiện chưa mở buổi học nào.'
      });
    }

    const window = getSessionWindow(session.session_date);

    // 3. Strict Backend Time Window Cutoff (Saturday 07:00:00 Asia/Ho_Chi_Minh)
    if (nowVN.isoVN >= window.closeIso && session.is_manually_locked === 0) {
      session.is_manually_locked = 1;
      await query('UPDATE sessions SET is_manually_locked = 1 WHERE id = $1', [session.id]);
    }

    const isOpen = isRegistrationOpen(session, nowVN);
    if (!isOpen) {
      let message = 'Cổng ghi danh hiện đang đóng.';
      if (session.is_manually_locked === 1) {
        message = 'Cổng ghi danh đã được chốt cho buổi học này.';
      } else if (nowVN.isoVN < window.openIso) {
        message = `Cổng ghi danh chưa mở. Thời gian mở: ${window.openDisplay}.`;
      } else if (nowVN.isoVN > window.closeIso) {
        message = `Cổng ghi danh đã đóng lúc 07:00 thứ Bảy, ${formatDateToVN(session.session_date)}.`;
      }
      return res.status(400).json({ success: false, message });
    }

    // 4. Idempotency Check: if idempotency_key is provided and already processed
    if (idempotency_key) {
      const existingRes = await query(`
        SELECT * FROM registrations WHERE idempotency_key = $1
      `, [idempotency_key]);

      const existing = existingRes.rows[0];
      if (existing) {
        const classInfo = config.CLASSES[existing.class_name];
        return res.json({
          success: true,
          isDuplicateResend: true,
          registration: {
            id: existing.id,
            fullName: existing.full_name,
            className: existing.class_name,
            schoolName: existing.school_name,
            sessionDate: session.session_date,
            formattedDate: formatDateToVN(session.session_date),
            timeSlot: classInfo.timeSlot,
            centerName: config.CENTER_NAME,
            teacherName: config.TEACHER_NAME,
            assistantName: config.ASSISTANT_NAME,
            googleMapsUrl: config.GOOGLE_MAPS_URL,
            registeredAt: existing.registered_at
          }
        });
      }
    }

    // 5. Manage student_token cookie for automatic browser recognition
    let studentToken = req.cookies?.student_token;
    if (!studentToken) {
      studentToken = uuidv4();
      res.cookie('student_token', studentToken, {
        httpOnly: true,
        maxAge: 90 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
    }

    // 6. Insert new registration (distinct row, do not merge even if same full name)
    const registeredAtDisplay = `${nowVN.timeStr} ${formatDateToVN(nowVN.dateStr)}`;
    const finalIdempotencyKey = idempotency_key || uuidv4();

    const insertRes = await query(`
      INSERT INTO registrations (session_id, class_name, full_name, school_name, idempotency_key, student_token, registered_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [session.id, class_name, cleanName, cleanSchool, finalIdempotencyKey, studentToken, registeredAtDisplay]);

    const registrationId = insertRes.rows[0].id;

    // Insert initial attendance row
    await query(`
      INSERT INTO student_attendance (registration_id, session_id, class_name, status, updated_at, updated_by)
      VALUES ($1, $2, $3, 'Chưa điểm danh', $4, 'system')
    `, [registrationId, session.id, class_name, nowVN.isoVN]);

    const classInfo = config.CLASSES[class_name];

    res.json({
      success: true,
      registration: {
        id: registrationId,
        fullName: cleanName,
        className: class_name,
        schoolName: cleanSchool,
        sessionDate: session.session_date,
        formattedDate: formatDateToVN(session.session_date),
        timeSlot: classInfo.timeSlot,
        centerName: config.CENTER_NAME,
        teacherName: config.TEACHER_NAME,
        assistantName: config.ASSISTANT_NAME,
        googleMapsUrl: config.GOOGLE_MAPS_URL,
        registeredAt: registeredAtDisplay
      }
    });
  } catch (err) {
    console.error('Lỗi register:', err);
    res.status(500).json({ success: false, message: 'Lỗi ghi danh.' });
  }
});


// POST /api/student/self-attend
router.post('/self-attend', async (req, res) => {
  try {
    const studentToken = req.cookies?.student_token;
    if (!studentToken) {
      return res.status(403).json({ success: false, message: 'Bạn chưa ghi danh trên trình duyệt này.' });
    }

    const { class_name } = req.body;
    if (!class_name || (class_name !== 'Lớp 10' && class_name !== 'Lớp 11')) {
      return res.status(400).json({ success: false, message: 'Lớp không hợp lệ.' });
    }

    const session = await getActiveSession();
    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy buổi học.' });
    }

    const isEnabled = class_name === 'Lớp 10' ? session.self_attendance_lop10 === 1 : session.self_attendance_lop11 === 1;
    if (!isEnabled) {
      return res.status(403).json({
        success: false,
        message: 'Chức năng tự điểm danh cho lớp này hiện đang đóng.'
      });
    }

    const regRes = await query(`
      SELECT * FROM registrations
      WHERE session_id = $1 AND class_name = $2 AND student_token = $3
      ORDER BY id DESC LIMIT 1
    `, [session.id, class_name, studentToken]);

    const reg = regRes.rows[0];
    if (!reg) {
      return res.status(403).json({
        success: false,
        message: 'Không tìm thấy thông tin ghi danh của bạn trong lớp này.'
      });
    }

    const nowVN = getNowVN();
    await query(`
      UPDATE student_attendance
      SET status = 'Có mặt', updated_at = $1, updated_by = 'self'
      WHERE registration_id = $2
    `, [nowVN.isoVN, reg.id]);

    res.json({
      success: true,
      message: `Đã điểm danh Có mặt thành công cho học sinh ${reg.full_name} (${class_name})!`
    });
  } catch (err) {
    console.error('Lỗi self-attend:', err);
    res.status(500).json({ success: false, message: 'Lỗi điểm danh.' });
  }
});

// GET /api/student/test
router.get('/test', async (req, res) => {
  try {
    const studentToken = req.cookies?.student_token;
    const { class_name } = req.query;

    if (!class_name || (class_name !== 'Lớp 10' && class_name !== 'Lớp 11')) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn lớp.' });
    }

    const session = await getActiveSession();
    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy buổi học.' });
    }

    const testRes = await query('SELECT * FROM tests WHERE session_id = $1 AND class_name = $2', [session.id, class_name]);
    const test = testRes.rows[0];

    if (!test || test.is_open === 0) {
      return res.json({
        success: true,
        hasTest: false,
        message: 'Giáo viên chưa mở bài test.'
      });
    }

    // Questions WITHOUT correct_answer!
    const qRes = await query(`
      SELECT id, question_text, question_type, options_json, points, sort_order
      FROM test_questions
      WHERE test_id = $1
      ORDER BY sort_order ASC, id ASC
    `, [test.id]);

    const questions = qRes.rows;
    if (questions.length === 0) {
      return res.json({
        success: true,
        hasTest: false,
        message: 'Giáo viên chưa mở bài test.'
      });
    }

    const formattedQuestions = questions.map(q => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      options: q.options_json ? JSON.parse(q.options_json) : null,
      points: q.points
    }));

    // Check if student already submitted
    let submission = null;
    if (studentToken) {
      const regRes = await query(`
        SELECT id, full_name FROM registrations
        WHERE session_id = $1 AND class_name = $2 AND student_token = $3
      `, [session.id, class_name, studentToken]);

      const reg = regRes.rows[0];
      if (reg) {
        const subRes = await query('SELECT * FROM test_submissions WHERE test_id = $1 AND registration_id = $2', [test.id, reg.id]);
        const sub = subRes.rows[0];
        if (sub) {
          submission = {
            score: sub.score,
            totalPoints: sub.total_points,
            submittedAt: sub.submitted_at,
            answers: JSON.parse(sub.answers_json)
          };
        }
      }
    }

    res.json({
      success: true,
      hasTest: true,
      test: {
        id: test.id,
        title: test.title,
        className: test.class_name,
        questions: formattedQuestions
      },
      alreadySubmitted: !!submission,
      submission
    });
  } catch (err) {
    console.error('Lỗi student test:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải bài test.' });
  }
});

// POST /api/student/test-submit
router.post('/test-submit', async (req, res) => {
  try {
    const studentToken = req.cookies?.student_token;
    if (!studentToken) {
      return res.status(403).json({ success: false, message: 'Bạn chưa ghi danh trên trình duyệt này.' });
    }

    const { test_id, answers } = req.body;
    if (!test_id || !answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, message: 'Dữ liệu nộp bài không hợp lệ.' });
    }

    const testRes = await query('SELECT * FROM tests WHERE id = $1', [test_id]);
    const test = testRes.rows[0];

    if (!test || test.is_open === 0) {
      return res.status(400).json({ success: false, message: 'Bài test hiện không mở.' });
    }

    const regRes = await query(`
      SELECT * FROM registrations
      WHERE session_id = $1 AND class_name = $2 AND student_token = $3
      ORDER BY id DESC LIMIT 1
    `, [test.session_id, test.class_name, studentToken]);

    const reg = regRes.rows[0];
    if (!reg) {
      return res.status(403).json({ success: false, message: 'Bạn chưa ghi danh vào lớp này.' });
    }

    // Anti-duplicate submission check
    const existingSubRes = await query('SELECT id FROM test_submissions WHERE test_id = $1 AND registration_id = $2', [test.id, reg.id]);
    if (existingSubRes.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Bạn đã nộp bài test này rồi, không thể nộp lại.' });
    }

    // Grade on server
    const questionsRes = await query('SELECT * FROM test_questions WHERE test_id = $1', [test.id]);
    const questions = questionsRes.rows;

    let totalScore = 0;
    let totalPoints = 0;

    for (const q of questions) {
      const studentAns = answers[q.id];
      totalPoints += q.points;

      if (studentAns !== undefined && studentAns !== null) {
        if (q.question_type === 'single_choice' || q.question_type === 'true_false') {
          if (String(studentAns).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()) {
            totalScore += q.points;
          }
        } else if (q.question_type === 'short_answer') {
          const cleanStudent = String(studentAns).trim().toLowerCase().replace(/\s+/g, ' ');
          const cleanCorrect = String(q.correct_answer).trim().toLowerCase().replace(/\s+/g, ' ');
          if (cleanStudent === cleanCorrect) {
            totalScore += q.points;
          }
        }
      }
    }

    const nowVN = getNowVN();
    const submittedAtDisplay = `${nowVN.timeStr} ${formatDateToVN(nowVN.dateStr)}`;

    await query(`
      INSERT INTO test_submissions (test_id, registration_id, student_token, student_name, answers_json, score, total_points, submitted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [test.id, reg.id, studentToken, reg.full_name, JSON.stringify(answers), totalScore, totalPoints, submittedAtDisplay]);

    res.json({
      success: true,
      score: totalScore,
      totalPoints,
      submittedAt: submittedAtDisplay,
      message: `Đã nộp bài thành công! Bạn đạt ${totalScore}/${totalPoints} điểm.`
    });
  } catch (err) {
    console.error('Lỗi test-submit:', err);
    res.status(500).json({ success: false, message: 'Lỗi nộp bài test.' });
  }
});

module.exports = router;
