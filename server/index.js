const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./db');
const { sessionMiddleware } = require('./auth');
const { startScheduler } = require('./scheduler');

// Routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');

const app = express();

app.set('trust proxy', 1);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware);

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);

// Fallback to static html files
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint không tồn tại.' });
  }
  if (req.path === '/admin.html') {
    return res.sendFile(path.join(__dirname, '../public/admin.html'));
  }
  if (req.path === '/teacher.html') {
    return res.sendFile(path.join(__dirname, '../public/teacher.html'));
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Boot Database & Server
async function startServer() {
  try {
    await initDatabase();

    app.listen(config.PORT, () => {
      console.log('===============================================================');
      console.log(`🚀 WEBSITE GHI DANH VÀ QUẢN LÝ LỚP HỌC - ${config.CENTER_NAME.toUpperCase()}`);
      console.log(`🌐 Máy chủ đang chạy tại: http://localhost:${config.PORT}`);
      console.log(`👨‍🏫 Giáo viên: ${config.TEACHER_NAME} | 🧑‍💼 Trợ giảng: ${config.ASSISTANT_NAME}`);
      console.log(`📅 Buổi học đầu tiên: ${config.FIRST_SESSION_DATE} (Lớp 10: 07:30–09:30 | Lớp 11: 17:30–19:00)`);
      console.log('---------------------------------------------------------------');
      console.log('🔒 BẢO MẬT: 3 mã truy cập quản lý đã được băm bảo mật tại máy chủ.');
      console.log('   (Mã truy cập được nạp từ biến môi trường và không in trong log).');
      console.log('===============================================================');

      startScheduler();
    });
  } catch (err) {
    console.error('Lỗi khởi động máy chủ:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
