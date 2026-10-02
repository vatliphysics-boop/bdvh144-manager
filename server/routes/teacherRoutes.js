const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireTeacherOrAdmin } = require('../auth');
const { formatDateToVN } = require('../utils/time');

// Protected by requireTeacherOrAdmin
router.use(requireTeacherOrAdmin);

// GET /api/teacher/timesheets - View Khôi's teaching report with date filter & summary
router.get('/timesheets', async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    let queryText = `
      SELECT t.*, s.session_date
      FROM timesheets t
      JOIN sessions s ON t.session_id = s.id
    `;
    const params = [];

    if (fromDate && toDate) {
      queryText += ` WHERE t.teaching_date >= $1 AND t.teaching_date <= $2`;
      params.push(fromDate, toDate);
    } else if (fromDate) {
      queryText += ` WHERE t.teaching_date >= $1`;
      params.push(fromDate);
    } else if (toDate) {
      queryText += ` WHERE t.teaching_date <= $1`;
      params.push(toDate);
    }

    queryText += ` ORDER BY t.teaching_date DESC, t.id DESC`;

    const result = await query(queryText, params);
    const rows = result.rows;

    let totalCompletedSessions = 0;
    let totalOngoingSessions = 0;
    let totalCompletedMinutes = 0;

    const formattedRows = rows.map(r => {
      const isCompleted = r.status === 'Đã kết thúc';
      if (isCompleted) {
        totalCompletedSessions += 1;
        totalCompletedMinutes += (parseInt(r.duration_minutes, 10) || 0);
      } else {
        totalOngoingSessions += 1;
      }

      return {
        id: r.id,
        teachingDate: r.teaching_date,
        formattedTeachingDate: formatDateToVN(r.teaching_date),
        className: r.class_name,
        scheduledTime: r.scheduled_time,
        assistantName: r.assistant_name,
        checkInTime: r.check_in_time,
        checkOutTime: r.check_out_time || '—',
        durationMinutes: r.duration_minutes,
        durationFormatted: isCompleted ? (r.duration_formatted || '0 phút') : 'Đang tính (chưa kết thúc)',
        status: r.status
      };
    });

    const hours = Math.floor(totalCompletedMinutes / 60);
    const mins = totalCompletedMinutes % 60;
    let totalHoursFormatted = '';
    if (hours > 0 && mins > 0) {
      totalHoursFormatted = `${hours} giờ ${mins} phút`;
    } else if (hours > 0) {
      totalHoursFormatted = `${hours} giờ`;
    } else {
      totalHoursFormatted = `${mins} phút`;
    }

    res.json({
      success: true,
      summary: {
        totalCompletedSessions,
        totalOngoingSessions,
        totalCompletedMinutes,
        totalHoursFormatted: totalCompletedSessions > 0 ? totalHoursFormatted : '0 phút'
      },
      timesheets: formattedRows
    });
  } catch (err) {
    console.error('Lỗi teacher/timesheets:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải báo cáo chấm công.' });
  }
});

module.exports = router;
