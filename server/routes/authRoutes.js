const express = require('express');
const router = express.Router();
const { verifyCode, logoutSession } = require('../auth');

// POST /api/auth/login-code
router.post('/login-code', async (req, res) => {
  const { code } = req.body;
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';

  try {
    const result = await verifyCode(code, ip);
    if (!result.success) {
      return res.status(result.status).json({
        success: false,
        message: result.message
      });
    }

    // Set HttpOnly cookie for 7 days
    res.cookie('admin_session', result.token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    const redirectUrl = result.role === 'ADMIN' ? '/admin.html' : '/teacher.html';

    res.json({
      success: true,
      role: result.role,
      description: result.description,
      redirectUrl
    });
  } catch (err) {
    console.error('Lỗi login-code:', err);
    res.status(500).json({ success: false, message: 'Lỗi xác thực hệ thống.' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.json({ loggedIn: false });
  }

  res.json({
    loggedIn: true,
    role: req.user.role,
    description: req.user.description
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    if (req.user?.token) {
      await logoutSession(req.user.token);
    }
    res.clearCookie('admin_session');
    res.json({ success: true, message: 'Đã đăng xuất phiên làm việc.' });
  } catch (err) {
    console.error('Lỗi logout:', err);
    res.clearCookie('admin_session');
    res.json({ success: true, message: 'Đã đăng xuất.' });
  }
});

module.exports = router;
