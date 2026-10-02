/**
 * ADMIN.JS - VÕ ĐOÀN ĐĂNG KHÔI MANAGEMENT PORTAL
 * Trung tâm BDVH 144
 */

let adminState = {
  currentSessionId: null,
  sessions: [],
  sessionDetails: null,
  activeClassFilter: 'ALL',
  editingClass: 'Lớp 10'
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconHtml = type === 'error' ? '<svg class="icon-svg" style="color: #ef4444;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' : type === 'success' ? '<svg class="icon-svg" style="color: #10b981;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M9 12l2 2 4-4"></path></svg>' : '<svg class="icon-svg" style="color: #3b82f6;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  toast.innerHTML = `${iconHtml} <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Check admin auth on load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (!data.loggedIn || data.role !== 'ADMIN') {
      window.location.href = '/';
      return;
    }

    loadSessionsList();
    loadTimesheetHistory();

  } catch (err) {
    console.error('Lỗi xác thực:', err);
    window.location.href = '/';
  }
});

// Logout
async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// Load all sessions
async function loadSessionsList() {
  try {
    const res = await fetch('/api/admin/sessions');
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Lỗi tải danh sách buổi học', 'error');
      return;
    }

    adminState.sessions = data.sessions;
    const picker = document.getElementById('select-session-picker');
    picker.innerHTML = '';

    data.sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `Buổi ${s.formattedDate} (${s.countLop10 + s.countLop11} học sinh)${s.isManuallyLocked ? ' [Đã chốt]' : ''}`;
      picker.appendChild(opt);
    });

    if (data.sessions.length > 0) {
      adminState.currentSessionId = data.sessions[0].id;
      picker.value = adminState.currentSessionId;
      loadSessionDetails();
    }

  } catch (err) {
    console.error('Lỗi nạp buổi học:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// When picker changes
function onSessionChange() {
  const picker = document.getElementById('select-session-picker');
  adminState.currentSessionId = parseInt(picker.value, 10);
  loadSessionDetails();
}

// Load full details for current session
async function loadSessionDetails() {
  if (!adminState.currentSessionId) return;

  try {
    const res = await fetch(`/api/admin/sessions/${adminState.currentSessionId}`);
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Lỗi tải chi tiết buổi học', 'error');
      return;
    }

    adminState.sessionDetails = data;
    renderSessionBarSummary();
    renderLockExcelSection();
    renderTimesheetCards();
    renderTeacherAttendanceTable();
    renderStudentAttendanceSection();
    renderTestManagementSection();

  } catch (err) {
    console.error('Lỗi tải chi tiết:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Render session bar summary
function renderSessionBarSummary() {
  const s = adminState.sessionDetails.session;
  const regs = adminState.sessionDetails.registrations;
  const count10 = regs.filter(r => r.class_name === 'Lớp 10').length;
  const count11 = regs.filter(r => r.class_name === 'Lớp 11').length;

  const badge = document.getElementById('session-summary-badge');
  badge.innerHTML = `Lớp 10: <strong>${count10}</strong> &bull; Lớp 11: <strong>${count11}</strong> &bull; Tổng: <strong>${regs.length} học sinh</strong>`;
}

// Render Lock & Excel Section
function renderLockExcelSection() {
  const s = adminState.sessionDetails.session;
  const lockTitle = document.getElementById('lock-status-title');
  const lockDesc = document.getElementById('lock-status-desc');
  const fileInfo = document.getElementById('excel-file-info');
  const btnLock = document.getElementById('btn-manual-lock');

  if (s.isManuallyLocked) {
    lockTitle.innerHTML = `<span style="color: #dc2626;"><svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Đã chốt ghi danh cho buổi học này</span>`;
    lockDesc.textContent = 'Cổng ghi danh đã dừng nhận đăng ký mới.';
    btnLock.disabled = true;
    btnLock.textContent = '✓ Đã chốt ghi danh';
  } else {
    lockTitle.innerHTML = `<span style="color: #059669;"><span class="status-dot"></span> Đang nhận ghi danh theo lịch tuần</span>`;
    lockDesc.textContent = 'Cổng mở tự động từ 00:00 thứ Năm đến 07:00 thứ Bảy. Bấm nút bên dưới để chốt sớm.';
    btnLock.disabled = false;
    btnLock.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Chốt ghi danh & xuất trang tính';
  }

  if (s.hasExcel) {
    fileInfo.innerHTML = `
      <div style="color: #059669; font-weight: 700;">✓ Đã tạo file Excel sẵn sàng tải về.</div>
      <div style="font-size: 0.8rem; color: #64748b;">Thời điểm tạo: ${s.excelGeneratedAt || 'Mới cập nhật'}</div>
    `;
  } else {
    fileInfo.textContent = 'Chưa xuất file Excel cho buổi học này.';
  }
}

// Handle manual lock early
async function handleManualLock() {
  if (!confirm('Bạn có chắc chắn muốn chốt ghi danh sớm cho buổi học này và xuất file Excel? Sau khi chốt, học sinh sẽ không thể đăng ký mới.')) {
    return;
  }

  const btn = document.getElementById('btn-manual-lock');
  btn.disabled = true;
  btn.textContent = 'Đang chốt và xuất Excel...';

  try {
    const res = await fetch(`/api/admin/sessions/${adminState.currentSessionId}/lock`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khi chốt ghi danh', 'error');
      btn.disabled = false;
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();

    // Auto trigger download
    window.location.href = data.downloadUrl;

  } catch (err) {
    console.error('Lỗi chốt ghi danh:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
    btn.disabled = false;
  }
}

// Handle download Excel
function handleDownloadExcel() {
  if (!adminState.currentSessionId) return;
  window.location.href = `/api/admin/sessions/${adminState.currentSessionId}/download-excel`;
}

// Timesheet cards rendering
function renderTimesheetCards() {
  const timesheets = adminState.sessionDetails.timesheets;
  const ts10 = timesheets.find(t => t.class_name === 'Lớp 10');
  const ts11 = timesheets.find(t => t.class_name === 'Lớp 11');

  updatePunchCardUI('Lớp 10', ts10);
  updatePunchCardUI('Lớp 11', ts11);
}

function updatePunchCardUI(className, ts) {
  const slug = className === 'Lớp 10' ? 'lop10' : 'lop11';
  const btnIn = document.getElementById(`btn-in-${slug}`);
  const btnOut = document.getElementById(`btn-out-${slug}`);
  const statusEl = document.getElementById(`punch-status-${slug}`);

  if (!ts) {
    btnIn.disabled = false;
    btnOut.disabled = true;
    statusEl.innerHTML = `Trạng thái: <strong>Chưa chấm công hôm nay</strong>`;
    document.getElementById(`punch-card-${slug}`).style.display = 'block';
  } else if (ts.status === 'Đang dạy') {
    btnIn.disabled = true;
    btnOut.disabled = false;
    statusEl.innerHTML = `
      <div style="color: var(--primary-700); font-weight: 700;"><span class="status-dot" style="color: #10b981;"></span> Đang dạy (${className})</div>
      <div>Giờ vào: <strong>${ts.check_in_time}</strong> (Giờ máy chủ)</div>
    `;
    document.getElementById(`punch-card-${slug}`).style.display = 'block';
  } else if (ts.status === 'Đã kết thúc') {
    // Hide the punch card when session is finished
    document.getElementById(`punch-card-${slug}`).style.display = 'none';
  }
}

// Punch Check-in
async function handlePunchCheckIn(className) {
  try {
    const res = await fetch('/api/admin/timesheet/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: adminState.currentSessionId,
        className
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi chấm công vào', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();
    loadTimesheetHistory();

  } catch (err) {
    console.error('Lỗi chấm công vào:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Punch Check-out
async function handlePunchCheckOut(className) {
  try {
    const res = await fetch('/api/admin/timesheet/check-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: adminState.currentSessionId,
        className
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi chấm công ra', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();
    loadTimesheetHistory();

  } catch (err) {
    console.error('Lỗi chấm công ra:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Load timesheet history
async function loadTimesheetHistory() {
  try {
    const res = await fetch('/api/admin/timesheet/list');
    const data = await res.json();

    if (!data.success) return;

    const tbody = document.getElementById('timesheet-history-tbody');
    if (data.list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Chưa có bản ghi chấm công nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.list.map(t => {
      const isDone = t.status === 'Đã kết thúc';
      return `
        <tr>
          <td><strong>${t.formattedTeachingDate}</strong></td>
          <td>${t.class_name}</td>
          <td>${t.scheduled_time} &bull; ${t.class_name === 'Lớp 11' ? 'Phòng 4' : 'Phòng 1'}</td>
          <td>${t.check_in_time}</td>
          <td>${t.check_out_time || '—'}</td>
          <td><strong>${isDone ? (t.duration_formatted || '0 phút') : 'Đang tính...'}</strong></td>
          <td>
            <span class="attendance-badge ${isDone ? 'present' : 'late'}">${t.status}</span>
          </td>
          <td>
            <button class="btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="viewHistoryDetails(${t.session_id}, '${t.class_name}')">
              Xem danh sách
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Lỗi nạp lịch sử chấm công:', err);
  }
}

// Teacher & TA attendance table
function renderTeacherAttendanceTable() {
  const list = adminState.sessionDetails.teacherAttendance;
  const tbody = document.getElementById('teacher-attendance-tbody');

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Chưa có dữ liệu điểm danh giáo viên.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.person_name)}</strong></td>
      <td><span style="font-weight: 700; color: #1e3a8a;">${item.role}</span></td>
      <td>${item.class_name}</td>
      <td>
        <select class="select-status" data-status="${item.status}" onchange="updateTeacherAttendance('${item.class_name}', '${item.person_name}', this.value)">
          <option value="Chưa điểm danh" ${item.status === 'Chưa điểm danh' ? 'selected' : ''}>Chưa điểm danh</option>
          <option value="Có mặt" ${item.status === 'Có mặt' ? 'selected' : ''}>Có mặt</option>
          <option value="Đi muộn" ${item.status === 'Đi muộn' ? 'selected' : ''}>Đi muộn</option>
          <option value="Vắng" ${item.status === 'Vắng' ? 'selected' : ''}>Vắng</option>
        </select>
      </td>
      <td style="font-size: 0.82rem; color: #64748b;">${item.updated_at || '—'}</td>
    </tr>
  `).join('');
}

// Update teacher attendance
async function updateTeacherAttendance(className, personName, status) {
  try {
    const res = await fetch(`/api/admin/sessions/${adminState.currentSessionId}/teacher-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ className, personName, status })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi cập nhật', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();

  } catch (err) {
    console.error('Lỗi cập nhật điểm danh:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Student attendance section
function renderStudentAttendanceSection() {
  const s = adminState.sessionDetails.session;
  const regs = adminState.sessionDetails.registrations;

  // Toggle buttons
  const btn10 = document.getElementById('btn-toggle-self-10');
  const btn11 = document.getElementById('btn-toggle-self-11');

  btn10.className = s.selfAttendanceLop10 ? 'btn-success' : 'btn-outline';
  btn10.textContent = s.selfAttendanceLop10 ? '✓ Đang MỞ tự điểm danh' : 'Đang ĐÓNG (Bấm để Mở)';

  btn11.className = s.selfAttendanceLop11 ? 'btn-success' : 'btn-outline';
  btn11.textContent = s.selfAttendanceLop11 ? '✓ Đang MỞ tự điểm danh' : 'Đang ĐÓNG (Bấm để Mở)';

  // Counters
  // Counters
  const activeRegs = regs.filter(r => r.is_kicked !== 1);
  document.getElementById('count-all-students').textContent = activeRegs.length;
  document.getElementById('count-lop10-students').textContent = activeRegs.filter(r => r.class_name === 'Lớp 10').length;
  document.getElementById('count-lop11-students').textContent = activeRegs.filter(r => r.class_name === 'Lớp 11').length;

  filterAdminClass(adminState.activeClassFilter);
}

// Toggle self-attendance
async function handleToggleSelfAttendance(className) {
  const s = adminState.sessionDetails.session;
  const current = className === 'Lớp 10' ? s.selfAttendanceLop10 : s.selfAttendanceLop11;
  const enabled = !current;

  try {
    const res = await fetch(`/api/admin/sessions/${adminState.currentSessionId}/toggle-self-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ className, enabled })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi cập nhật', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();

  } catch (err) {
    console.error('Lỗi bật tắt tự điểm danh:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Filter class in admin table
function filterAdminClass(filter) {
  adminState.activeClassFilter = filter;

  document.getElementById('admin-class-filter-all').classList.toggle('active', filter === 'ALL');
  document.getElementById('admin-class-filter-10').classList.toggle('active', filter === 'Lớp 10');
  document.getElementById('admin-class-filter-11').classList.toggle('active', filter === 'Lớp 11');

  const regs = adminState.sessionDetails.registrations;
  const filtered = filter === 'ALL' ? regs : regs.filter(r => r.class_name === filter);

  const activeStudents = filtered.filter(r => r.is_kicked !== 1);
  const kickedStudents = filtered.filter(r => r.is_kicked === 1);

  const tbody = document.getElementById('student-attendance-tbody');
  if (activeStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Chưa có học sinh nào trong danh sách.</td></tr>`;
  } else {
    tbody.innerHTML = activeStudents.map((r, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 700; color: #64748b;">${idx + 1}</td>
        <td><strong>${escapeHtml(r.full_name)}</strong></td>
        <td><span style="font-weight: 700; color: #1e3a8a;">${r.class_name}</span></td>
        <td style="color: #475569;">${escapeHtml(r.school_name || '—')}</td>
        <td style="font-size: 0.85rem; color: #64748b;">${r.registered_at}</td>
        <td>
          <select class="select-status" data-status="${r.attendance_status}" onchange="updateStudentAttendance(${r.id}, this.value)">
            <option value="Chưa điểm danh" ${r.attendance_status === 'Chưa điểm danh' ? 'selected' : ''}>Chưa điểm danh</option>
            <option value="Có mặt" ${r.attendance_status === 'Có mặt' ? 'selected' : ''}>Có mặt</option>
            <option value="Đi muộn" ${r.attendance_status === 'Đi muộn' ? 'selected' : ''}>Đi muộn</option>
            <option value="Vắng" ${r.attendance_status === 'Vắng' ? 'selected' : ''}>Vắng</option>
          </select>
        </td>
        <td style="font-size: 0.82rem; color: #64748b;">
          ${r.attendance_updated_by === 'self' ? '👤 Học sinh tự điểm danh' : r.attendance_updated_by === 'admin' ? '🛡️ Quản trị viên' : '—'}
        </td>
        <td>
          <div style="display: flex; gap: 0.25rem;">
            <button class="btn-warning" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; background: #9f1239; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="openKickModal(${r.id}, '${escapeHtml(r.full_name).replace(/'/g, "\\'")}', '${r.class_name}')">Mời ra</button>
            <button class="btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; color: #dc2626; border-color: #fca5a5;" onclick="openDeleteModal(${r.id}, '${escapeHtml(r.full_name).replace(/'/g, "\\'")}', '${r.class_name}')">Xóa</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  const kickedTbody = document.getElementById('kicked-students-tbody');
  document.getElementById('count-kicked-students').textContent = kickedStudents.length;
  
  if (kickedStudents.length === 0) {
    kickedTbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="background: transparent;">Không có học sinh nào bị mời ra.</td></tr>`;
  } else {
    kickedTbody.innerHTML = kickedStudents.map((r, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 700; color: #9f1239;">${idx + 1}</td>
        <td><strong>${escapeHtml(r.full_name)}</strong></td>
        <td><span style="font-weight: 700; color: #1e3a8a;">${r.class_name}</span></td>
        <td style="color: #9f1239;">${escapeHtml(r.kicked_reason || 'Không có lý do')}</td>
        <td style="font-size: 0.85rem; color: #64748b;">
          ${escapeHtml(r.kicked_by || 'Quản trị viên')}<br>
          <span style="font-size: 0.75rem">${r.kicked_at || ''}</span>
        </td>
        <td>
          <div style="display: flex; gap: 0.25rem;">
            <button class="btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="handleRestore(${r.id})">Khôi phục</button>
            <button class="btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; color: #dc2626; border-color: #fca5a5;" onclick="openDeleteModal(${r.id}, '${escapeHtml(r.full_name).replace(/'/g, "\\'")}', '${r.class_name}')">Xóa</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

// Update student attendance
async function updateStudentAttendance(registrationId, status) {
  try {
    const res = await fetch(`/api/admin/sessions/${adminState.currentSessionId}/student-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, status })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi cập nhật', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();

  } catch (err) {
    console.error('Lỗi cập nhật học sinh:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Test Management rendering
function renderTestManagementSection() {
  const tests = adminState.sessionDetails.tests;
  const container = document.getElementById('test-cards-container');

  const test10 = tests.find(t => t.class_name === 'Lớp 10');
  const test11 = tests.find(t => t.class_name === 'Lớp 11');

  function renderCard(className, test) {
    if (!test) {
      return `
        <div style="background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 1.25rem;">
          <h4 style="font-size: 1.05rem; font-weight: 800; color: #1e3a8a;">${className}</h4>
          <p style="font-size: 0.88rem; color: #64748b; margin: 0.5rem 0 1rem;">Chưa soạn đề test cho lớp này.</p>
          <button class="btn-primary" onclick="openTestEditor('${className}')">
            <svg class="icon-svg" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Soạn đề test
          </button>
        </div>
      `;
    }

    const isOpen = test.is_open === 1;
    return `
      <div style="background: #ffffff; border: 1.5px solid ${isOpen ? '#2563eb' : '#e2e8f0'}; border-radius: 12px; padding: 1.25rem; box-shadow: 0 2px 4px rgba(0,0,0,0.04);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <h4 style="font-size: 1.05rem; font-weight: 800; color: #1e3a8a;">${className} - ${escapeHtml(test.title)}</h4>
          <span class="status-badge ${isOpen ? 'open' : 'closed'}">${isOpen ? 'Đang mở' : 'Đang đóng'}</span>
        </div>
        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 1rem;">
          Số câu hỏi: <strong>${test.question_count} câu</strong> &bull; Đã nộp: <strong>${test.submission_count} bài</strong>
        </p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="${isOpen ? 'btn-warning' : 'btn-success'}" onclick="toggleTestStatus(${test.id}, ${!isOpen})">
            ${isOpen ? '<svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Đóng bài test' : '<span class="status-dot" style="color: #10b981;"></span> Mở bài test'}
          </button>
          <button class="btn-outline" onclick="openTestEditor('${className}', ${test.id})">
            <svg class="icon-svg" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Sửa đề
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = renderCard('Lớp 10', test10) + renderCard('Lớp 11', test11);

  // Load submissions
  loadAllTestSubmissions();
}

// Toggle test open/closed
async function toggleTestStatus(testId, isOpen) {
  try {
    const res = await fetch(`/api/admin/test/${testId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOpen })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi thay đổi trạng thái', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadSessionDetails();

  } catch (err) {
    console.error('Lỗi mở/đóng test:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Load test submissions
async function loadAllTestSubmissions() {
  const tests = adminState.sessionDetails.tests;
  const tbody = document.getElementById('test-submissions-tbody');

  let allSubs = [];
  for (const t of tests) {
    try {
      const res = await fetch(`/api/admin/test/${t.id}`);
      const data = await res.json();
      if (data.success && data.test.submissions) {
        data.test.submissions.forEach(sub => {
          allSubs.push({ ...sub, className: t.class_name });
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (allSubs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Chưa có lượt nộp bài test nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = allSubs.map((s, idx) => `
    <tr>
      <td style="text-align: center; font-weight: 700; color: #64748b;">${idx + 1}</td>
      <td><strong>${escapeHtml(s.studentName)}</strong></td>
      <td><span style="font-weight: 700; color: #1e3a8a;">${s.className}</span></td>
      <td><strong style="color: #059669; font-size: 1rem;">${s.score} / ${s.totalPoints} điểm</strong></td>
      <td style="font-size: 0.85rem; color: #64748b;">${s.submittedAt}</td>
    </tr>
  `).join('');
}

// Test Editor Modal
let questionListState = [];

async function openTestEditor(className, testId = null) {
  adminState.editingClass = className;
  questionListState = [];

  document.getElementById('edit-test-class').value = className;
  document.getElementById('test-editor-title').textContent = `Soạn đề test - ${className}`;
  document.getElementById('edit-test-name').value = `Test cuối giờ - ${className}`;

  if (testId) {
    try {
      const res = await fetch(`/api/admin/test/${testId}`);
      const data = await res.json();
      if (data.success) {
        document.getElementById('edit-test-name').value = data.test.title;
        questionListState = data.test.questions.map(q => ({
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options || ['A. ', 'B. ', 'C. ', 'D. '],
          correctAnswer: q.correctAnswer,
          points: q.points || 1.0
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (questionListState.length === 0) {
    // Add 1 default question
    addQuestionCard();
  } else {
    renderQuestionCards();
  }

  document.getElementById('test-editor-modal').classList.add('open');
}

function closeTestEditorModal() {
  document.getElementById('test-editor-modal').classList.remove('open');
}

function addQuestionCard() {
  questionListState.push({
    questionText: '',
    questionType: 'single_choice',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 'A',
    points: 1.0
  });
  renderQuestionCards();
}

function removeQuestionCard(index) {
  questionListState.splice(index, 1);
  renderQuestionCards();
}

function renderQuestionCards() {
  const container = document.getElementById('test-questions-list');
  container.innerHTML = questionListState.map((q, idx) => `
    <div class="test-q-card">
      <div class="test-q-header">
        <span class="test-q-number">Câu hỏi ${idx + 1}</span>
        <button type="button" class="btn-remove-q" onclick="removeQuestionCard(${idx})">Xóa</button>
      </div>

      <div class="form-group" style="margin-bottom: 0.75rem;">
        <label style="font-size: 0.85rem; font-weight: 700;">Nội dung câu hỏi:</label>
        <input type="text" class="form-input" value="${escapeHtml(q.questionText)}" onchange="questionListState[${idx}].questionText = this.value" placeholder="Nhập câu hỏi..." required>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
        <div>
          <label style="font-size: 0.82rem; font-weight: 700;">Loại câu hỏi:</label>
          <select class="form-input" style="padding: 0.5rem;" onchange="onQuestionTypeChange(${idx}, this.value)">
            <option value="single_choice" ${q.questionType === 'single_choice' ? 'selected' : ''}>Trắc nghiệm 1 đáp án</option>
            <option value="true_false" ${q.questionType === 'true_false' ? 'selected' : ''}>Đúng / Sai</option>
            <option value="short_answer" ${q.questionType === 'short_answer' ? 'selected' : ''}>Trả lời ngắn</option>
          </select>
        </div>
        <div>
          <label style="font-size: 0.82rem; font-weight: 700;">Điểm số:</label>
          <input type="number" step="0.5" class="form-input" style="padding: 0.5rem;" value="${q.points}" onchange="questionListState[${idx}].points = parseFloat(this.value)">
        </div>
      </div>

      ${renderQuestionOptionsInput(q, idx)}
    </div>
  `).join('');
}

function onQuestionTypeChange(index, newType) {
  questionListState[index].questionType = newType;
  if (newType === 'single_choice') {
    questionListState[index].options = ['A', 'B', 'C', 'D'];
    questionListState[index].correctAnswer = 'A';
  } else if (newType === 'true_false') {
    questionListState[index].options = null;
    questionListState[index].correctAnswer = 'Đúng';
  } else {
    questionListState[index].options = null;
    questionListState[index].correctAnswer = '';
  }
  renderQuestionCards();
}

function renderQuestionOptionsInput(q, idx) {
  if (q.questionType === 'single_choice') {
    return `
      <div>
        <label style="font-size: 0.82rem; font-weight: 700;">4 Lựa chọn (A, B, C, D):</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.25rem;">
          <input type="text" class="form-input" placeholder="Lựa chọn A" value="${escapeHtml(q.options?.[0] || 'A')}" onchange="questionListState[${idx}].options[0] = this.value">
          <input type="text" class="form-input" placeholder="Lựa chọn B" value="${escapeHtml(q.options?.[1] || 'B')}" onchange="questionListState[${idx}].options[1] = this.value">
          <input type="text" class="form-input" placeholder="Lựa chọn C" value="${escapeHtml(q.options?.[2] || 'C')}" onchange="questionListState[${idx}].options[2] = this.value">
          <input type="text" class="form-input" placeholder="Lựa chọn D" value="${escapeHtml(q.options?.[3] || 'D')}" onchange="questionListState[${idx}].options[3] = this.value">
        </div>
        <div style="margin-top: 0.5rem;">
          <label style="font-size: 0.82rem; font-weight: 700; color: #059669;">Đáp án đúng:</label>
          <input type="text" class="form-input" placeholder="Ví dụ: A hoặc nội dung đáp án đúng" value="${escapeHtml(q.correctAnswer)}" onchange="questionListState[${idx}].correctAnswer = this.value" required>
        </div>
      </div>
    `;
  } else if (q.questionType === 'true_false') {
    return `
      <div>
        <label style="font-size: 0.82rem; font-weight: 700; color: #059669;">Đáp án đúng:</label>
        <select class="form-input" style="padding: 0.5rem;" onchange="questionListState[${idx}].correctAnswer = this.value">
          <option value="Đúng" ${q.correctAnswer === 'Đúng' ? 'selected' : ''}>Đúng</option>
          <option value="Sai" ${q.correctAnswer === 'Sai' ? 'selected' : ''}>Sai</option>
        </select>
      </div>
    `;
  } else {
    return `
      <div>
        <label style="font-size: 0.82rem; font-weight: 700; color: #059669;">Đáp án đúng (chuẩn hóa kiểm tra khách quan):</label>
        <input type="text" class="form-input" placeholder="Ví dụ: 25" value="${escapeHtml(q.correctAnswer)}" onchange="questionListState[${idx}].correctAnswer = this.value" required>
      </div>
    `;
  }
}

// Save test
async function handleSaveTest(event) {
  event.preventDefault();

  const title = document.getElementById('edit-test-name').value.trim();
  const className = document.getElementById('edit-test-class').value;

  if (questionListState.length === 0) {
    showToast('Vui lòng thêm ít nhất 1 câu hỏi.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/test/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: adminState.currentSessionId,
        className,
        title,
        questions: questionListState
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi lưu bài test', 'error');
      return;
    }

    showToast(data.message, 'success');
    closeTestEditorModal();
    loadSessionDetails();

  } catch (err) {
    console.error('Lỗi lưu bài test:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Modal: Create new session
function openNewSessionModal() {
  document.getElementById('new-session-modal').classList.add('open');
}

function closeNewSessionModal() {
  document.getElementById('new-session-modal').classList.remove('open');
}

async function handleCreateSession(event) {
  event.preventDefault();

  const dateInput = document.getElementById('new-session-date');
  const sessionDate = dateInput.value;

  if (!sessionDate) {
    showToast('Vui lòng chọn ngày học.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_date: sessionDate })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khởi tạo buổi học', 'error');
      return;
    }

    showToast(data.message, 'success');
    closeNewSessionModal();
    loadSessionsList();

  } catch (err) {
    console.error('Lỗi tạo buổi học:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// History Details Modal
async function viewHistoryDetails(sessionId, className) {
  try {
    const res = await fetch(`/api/admin/sessions/${sessionId}`);
    const data = await res.json();
    
    if (!data.success) {
      showToast('Không thể tải chi tiết ca dạy.', 'error');
      return;
    }
    
    const students = data.session.students.filter(s => s.class_name === className);
    document.getElementById('history-modal-title').textContent = `Chi tiết ca: ${className}`;
    document.getElementById('history-modal-subtitle').textContent = `Ngày: ${data.session.formattedDate} | Sĩ số: ${students.length}`;
    
    const tbody = document.getElementById('history-modal-tbody');
    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Không có dữ liệu học sinh.</td></tr>';
    } else {
      tbody.innerHTML = students.map((s, idx) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${escapeHtml(s.full_name)}</strong></td>
          <td>${escapeHtml(s.school_name || '—')}</td>
          <td>
            <span class="attendance-badge ${s.status.includes('Có mặt') ? 'present' : s.status === 'Vắng mặt' ? 'absent' : s.status === 'Đi trễ' ? 'late' : 'default'}">${s.status}</span>
          </td>
        </tr>
      `).join('');
    }
    
    document.getElementById('history-details-modal').classList.add('open');
  } catch (err) {
    console.error(err);
    showToast('Lỗi khi mở lịch sử', 'error');
  }
}

function closeHistoryDetailsModal() {
  document.getElementById('history-details-modal').classList.remove('open');
}

// ==========================================
// KICK & RESTORE STUDENTS
// ==========================================

let currentKickId = null;

function openKickModal(regId, studentName, className) {
  currentKickId = regId;
  document.getElementById('kick-student-name').textContent = studentName;
  document.getElementById('kick-student-class').textContent = className;
  document.getElementById('kick-student-date').textContent = adminState.sessionDetails.session.formattedDate;
  document.getElementById('kick-reason').value = '';
  document.getElementById('kick-modal').classList.add('active');
}

function closeKickModal() {
  currentKickId = null;
  document.getElementById('kick-modal').classList.remove('active');
}

async function submitKick(e) {
  e.preventDefault();
  if (!currentKickId) return;
  
  const reason = document.getElementById('kick-reason').value.trim();
  const btn = document.querySelector('#kick-form .submit-btn');
  btn.disabled = true;
  btn.textContent = 'Đang xử lý...';
  
  try {
    const res = await fetch(`/api/admin/registrations/${currentKickId}/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khi mời ra khỏi lớp', 'error');
    } else {
      showToast(data.message, 'success');
      closeKickModal();
      loadSessionDetails();
    }
  } catch (err) {
    console.error('Lỗi kick:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Xác nhận mời ra';
  }
}

async function handleRestore(regId) {
  if (!confirm('Bạn có chắc chắn muốn khôi phục học sinh này vào lớp? Hồ sơ cũ sẽ được sử dụng lại.')) return;
  
  try {
    const res = await fetch(`/api/admin/registrations/${regId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khi khôi phục', 'error');
    } else {
      showToast(data.message, 'success');
      loadSessionDetails();
    }
  } catch (err) {
    console.error('Lỗi restore:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// ==========================================
// DELETE STUDENT REGISTRATION
// ==========================================

let currentDeleteId = null;

function openDeleteModal(regId, studentName, className) {
  currentDeleteId = regId;
  document.getElementById('delete-student-name').textContent = studentName;
  document.getElementById('delete-student-class').textContent = className;
  document.getElementById('delete-student-date').textContent = adminState.sessionDetails.session.formattedDate;
  document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
  currentDeleteId = null;
  document.getElementById('delete-modal').classList.remove('active');
}

async function submitDelete() {
  if (!currentDeleteId) return;
  
  const btn = document.getElementById('btn-confirm-delete');
  btn.disabled = true;
  btn.textContent = 'Đang xóa...';
  
  try {
    const res = await fetch(`/api/admin/registrations/${currentDeleteId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khi xóa ghi danh', 'error');
    } else {
      showToast(data.message, 'success');
      closeDeleteModal();
      loadSessionDetails();
    }
  } catch (err) {
    console.error('Lỗi delete:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Xác nhận xóa';
  }
}

