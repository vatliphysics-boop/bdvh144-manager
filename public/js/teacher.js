/**
 * TEACHER.JS - THẦY NGUYỄN KHOA REPORT VIEW
 * Trung tâm BDVH 144
 */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</span> <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Check auth on load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (!data.loggedIn || (data.role !== 'TEACHER' && data.role !== 'ADMIN')) {
      window.location.href = '/';
      return;
    }

    loadTeacherReport();

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

// Load teacher report
async function loadTeacherReport() {
  const fromDate = document.getElementById('filter-from-date').value;
  const toDate = document.getElementById('filter-to-date').value;

  const tbody = document.getElementById('teacher-timesheet-tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Đang tải báo cáo chấm công...</td></tr>`;

  try {
    let url = '/api/teacher/timesheets';
    const params = new URLSearchParams();
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Lỗi tải báo cáo', 'error');
      return;
    }

    // Update stats cards
    document.getElementById('stat-total-sessions').textContent = `${data.summary.totalCompletedSessions} buổi`;
    document.getElementById('stat-total-hours').textContent = data.summary.totalHoursFormatted;
    document.getElementById('stat-ongoing-sessions').textContent = `${data.summary.totalOngoingSessions} buổi`;

    // Render table
    if (data.timesheets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Không có bản ghi chấm công nào trong khoảng thời gian đã chọn.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.timesheets.map(t => {
      const isCompleted = t.status === 'Đã kết thúc';
      return `
        <tr>
          <td><strong>${t.formattedTeachingDate}</strong></td>
          <td><span style="font-weight: 700; color: #1e3a8a;">${t.className}</span></td>
          <td style="color: #475569;">${t.scheduledTime} &bull; ${t.className === 'Lớp 11' ? 'Phòng 4' : 'Phòng 1'}</td>
          <td>${t.checkInTime}</td>
          <td>${t.checkOutTime}</td>
          <td>
            <strong>${t.durationFormatted}</strong>
          </td>
          <td>
            <span class="attendance-badge ${isCompleted ? 'present' : 'late'}">
              ${isCompleted ? '✓ Đã kết thúc' : '⏳ Đang dạy'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Lỗi tải báo cáo chấm công:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

// Reset date filter
function resetFilter() {
  document.getElementById('filter-from-date').value = '';
  document.getElementById('filter-to-date').value = '';
  loadTeacherReport();
}
