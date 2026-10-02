require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  
  CENTER_NAME: 'Trung tâm BDVH 144',
  TEACHER_NAME: 'Nguyễn Khoa',
  ASSISTANT_NAME: 'Võ Đoàn Đăng Khôi',
  GOOGLE_MAPS_URL: 'https://maps.app.goo.gl/RsTMMvJtbgwDP5fQ7',

  CLASSES: {
    'Lớp 10': {
      name: 'Lớp 10',
      dayOfWeek: 'thứ Bảy',
      timeSlot: '07:30–09:30',
      startHour: 7,
      startMinute: 30,
      endHour: 9,
      endMinute: 30
    },
    'Lớp 11': {
      name: 'Lớp 11',
      dayOfWeek: 'thứ Bảy',
      timeSlot: '17:30–19:00',
      startHour: 17,
      startMinute: 30,
      endHour: 19,
      endMinute: 0
    }
  },

  FIRST_SESSION_DATE: '2026-10-03', // YYYY-MM-DD (thứ Bảy)
  
  STORAGE_DIR: path.join(__dirname, '../storage'),
  EXCEL_DIR: path.join(__dirname, '../storage/excel')
};
