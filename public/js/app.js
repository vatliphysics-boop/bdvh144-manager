/**
 * APP.JS - STUDENT INTERFACE LOGIC
 * Trung tâm BDVH 144
 */

let appState = {
  session: null,
  classes: null,
  currentClassTab: 'Lớp 10',
  registeredClass: null,
  activeTest: null,
  idempotencyKey: null
};

// Generate UUID for idempotency
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Toast helper
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  appState.idempotencyKey = generateUUID();
  loadCurrentSession();

  // Listen to open login modal
  const btnLogin = document.getElementById('btn-open-login-modal');
  if (btnLogin) {
    btnLogin.addEventListener('click', openLoginModal);
  }
});

// Load Current Session & Registration Status
async function loadCurrentSession() {
  try {
    const res = await fetch('/api/student/current-session');
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Không thể tải thông tin buổi học', 'error');
      return;
    }

    appState.session = data.session;
    appState.classes = data.classes;

    // Update banner
    const dateDisplay = document.getElementById('session-date-display');
    if (dateDisplay) {
      dateDisplay.innerHTML = `<span>📅</span> Buổi học: <strong>${data.session.formattedDate} (thứ Bảy)</strong>`;
    }

    const badge = document.getElementById('reg-status-badge');
    const formContainer = document.getElementById('reg-form-container');
    const closedContainer = document.getElementById('reg-closed-container');

    if (data.session.isOpen) {
      badge.className = 'status-badge open';
      badge.innerHTML = '<span>🟢</span> Đang mở ghi danh';
      if (formContainer) formContainer.style.display = 'block';
      if (closedContainer) closedContainer.style.display = 'none';
    } else {
      badge.className = 'status-badge closed';
      badge.innerHTML = '<span>🔴</span> Cổng ghi danh đang đóng';
      if (formContainer) formContainer.style.display = 'none';
      if (closedContainer) {
        closedContainer.style.display = 'block';
        const nextBox = document.getElementById('closed-next-open-box');
        if (nextBox && data.session.nextOpenDisplay) {
          nextBox.innerHTML = `⏰ Thời gian mở ghi danh tiếp theo: <strong>${data.session.nextOpenDisplay}</strong>`;
        }
      }
    }

    updateSelectedClassDisplay();

    // If user already registered, show success screen immediately
    if (data.myRegistration) {
      appState.registeredClass = data.myRegistration.class_name || data.myRegistration.className;
      
      const classInfo = data.classes[appState.registeredClass];
      document.getElementById('succ-student-name').textContent = data.myRegistration.full_name || data.myRegistration.fullName || '—';
      document.getElementById('succ-class-name').textContent = appState.registeredClass;
      document.getElementById('succ-session-date').textContent = data.session.formattedDate + ' (thứ Bảy)';
      document.getElementById('succ-class-time').textContent = classInfo ? classInfo.timeSlot : '—';
      
      document.getElementById('view-register').style.display = 'none';
      document.getElementById('view-success').style.display = 'block';

      updateBanners(data.session, data.myRegistration.attendance_status);
    }

  } catch (err) {
    console.error('Lỗi nạp phiên học:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
  }
}

function updateBanners(session, attendanceStatus) {
  const className = appState.registeredClass;
  if (!className) return;

  // Check self attendance banner
  const selfBanner = document.getElementById('self-attend-banner');
  const isSelfAttendOpen = className === 'Lớp 10' ? session.selfAttendanceLop10 : session.selfAttendanceLop11;

  if (isSelfAttendOpen) {
    selfBanner.style.display = 'flex';
    const btnSelf = document.getElementById('btn-do-self-attend');
    if (attendanceStatus === 'Có mặt') {
      btnSelf.disabled = true;
      btnSelf.textContent = '✓ Bạn đã được điểm danh Có mặt';
    } else {
      btnSelf.disabled = false;
      btnSelf.textContent = '✓ Điểm danh Có mặt ngay';
    }
  } else {
    selfBanner.style.display = 'none';
  }

  // Check test banner
  const testBanner = document.getElementById('test-open-banner');
  const hasOpenTest = className === 'Lớp 10' ? session.hasOpenTestLop10 : session.hasOpenTestLop11;

  if (hasOpenTest) {
    testBanner.style.display = 'flex';
  } else {
    testBanner.style.display = 'none';
  }
}



// Update selected class info before submit
function updateSelectedClassDisplay() {
  const selected = document.querySelector('input[name="class_choice"]:checked')?.value || 'Lớp 10';
  const infoBox = document.getElementById('reg-pre-submit-info');
  if (infoBox && appState.classes && appState.classes[selected]) {
    const classInfo = appState.classes[selected];
    const dateFormatted = appState.session?.formattedDate || 'thứ Bảy';
    infoBox.innerHTML = `📌 Bạn đang đăng ký: <strong>${selected}</strong> &bull; Ngày học: <strong>${dateFormatted}</strong> &bull; Giờ học: <strong>${classInfo.timeSlot}</strong>.`;
  }
}

// Handle Registration Form Submit
async function handleRegistrationSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById('student-name');
  const schoolInput = document.getElementById('student-school');
  const selectedClass = document.querySelector('input[name="class_choice"]:checked')?.value;
  const submitBtn = document.getElementById('btn-submit-registration');

  const fullName = nameInput.value.trim();
  const schoolName = schoolInput.value.trim();

  if (!fullName) {
    showToast('Vui lòng nhập họ và tên của học sinh.', 'error');
    nameInput.focus();
    return;
  }

  // Prevent double click
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>⏳</span> Đang lưu ghi danh...`;

  try {
    const response = await fetch('/api/student/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        class_name: selectedClass,
        school_name: schoolName,
        idempotency_key: appState.idempotencyKey
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showToast(data.message || 'Ghi danh không thành công. Vui lòng kiểm tra lại.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>🚀</span> Xác nhận ghi danh`;
      return;
    }

    // Success confirmed by backend
    appState.registeredClass = data.registration.className;
    
    // Determine room
    let room = 'Phòng 1';
    if (data.registration.className === 'Lớp 11') {
      room = 'Phòng 4';
    }

    // Populate success screen
    document.getElementById('succ-student-name').textContent = data.registration.fullName;
    document.getElementById('succ-class-name').textContent = data.registration.className;
    
    // Format date properly (e.g. thứ Bảy, 03/10/2026)
    const dateStr = data.registration.formattedDate;
    document.getElementById('succ-session-date').textContent = dateStr.includes('thứ') ? dateStr : `thứ Bảy, ${dateStr}`;
    
    document.getElementById('succ-class-time').textContent = data.registration.timeSlot;
    document.getElementById('succ-room-name').textContent = room;

    // Show success view (this will trigger the CSS animation)
    document.getElementById('view-register').style.display = 'none';
    document.getElementById('view-success').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (appState.session) {
       updateBanners(appState.session, 'Chưa điểm danh');
    }

    showToast('Ghi danh thành công!', 'success');

    // Reset idempotency key for any future registrations
    appState.idempotencyKey = generateUUID();

  } catch (err) {
    console.error('Lỗi gửi form:', err);
    showToast('Không thể kết nối đến máy chủ. Vui lòng thử lại.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>🚀</span> Xác nhận ghi danh`;
  }
}



// Student self attendance handler
async function handleSelfAttendance() {
  const btn = document.getElementById('btn-do-self-attend');
  btn.disabled = true;
  btn.textContent = 'Đang xử lý...';

  try {
    const res = await fetch('/api/student/self-attend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_name: appState.registeredClass })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khi điểm danh', 'error');
      btn.disabled = false;
      btn.textContent = '✓ Điểm danh Có mặt ngay';
      return;
    }

    showToast(data.message, 'success');
    loadCurrentSession();

  } catch (err) {
    console.error('Lỗi điểm danh:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
    btn.disabled = false;
    btn.textContent = '✓ Điểm danh Có mặt ngay';
  }
}

// Student Test Modal
async function openStudentTestModal() {
  const modal = document.getElementById('student-test-modal');
  const body = document.getElementById('student-test-body');
  const title = document.getElementById('student-test-title');
  const info = document.getElementById('student-test-class-info');

  body.innerHTML = `<div style="text-align: center; padding: 2rem;">Đang tải bài test...</div>`;
  modal.classList.add('open');

  try {
    const res = await fetch(`/api/student/test?class_name=${encodeURIComponent(appState.registeredClass)}`);
    const data = await res.json();

    if (!data.success || !data.hasTest) {
      body.innerHTML = `<div class="empty-state">${data.message || 'Giáo viên chưa mở bài test.'}</div>`;
      return;
    }

    appState.activeTest = data.test;
    title.textContent = data.test.title;
    info.textContent = `${appState.registeredClass} • Trung tâm BDVH 144`;

    if (data.alreadySubmitted) {
      body.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; background: #ecfdf5; border-radius: 12px; border: 1.5px solid #a7f3d0;">
          <div style="font-size: 2.5rem; color: #059669;">✓</div>
          <h3 style="font-size: 1.3rem; font-weight: 800; color: #065f46; margin: 0.5rem 0;">Bạn đã hoàn thành bài test này!</h3>
          <p style="font-size: 1.1rem; font-weight: 700; color: #047857;">Kết quả: ${data.submission.score} / ${data.submission.totalPoints} điểm</p>
          <p style="font-size: 0.85rem; color: #4b5563; margin-top: 0.35rem;">Thời điểm nộp: ${data.submission.submittedAt}</p>
        </div>
      `;
      return;
    }

    // Render questions
    let qHtml = `<form id="student-submit-test-form" onsubmit="handleStudentTestSubmit(event)">`;

    data.test.questions.forEach((q, idx) => {
      qHtml += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.15rem; margin-bottom: 1.15rem;">
          <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 0.5rem; color: #1e3a8a;">
            Câu ${idx + 1} (${q.points} điểm): ${escapeHtml(q.questionText)}
          </div>
      `;

      if (q.questionType === 'single_choice' && q.options) {
        qHtml += `<div style="display: flex; flex-direction: column; gap: 0.5rem;">`;
        q.options.forEach((opt, oIdx) => {
          qHtml += `
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.92rem; cursor: pointer;">
              <input type="radio" name="ans_${q.id}" value="${escapeHtml(opt)}" required>
              <span>${escapeHtml(opt)}</span>
            </label>
          `;
        });
        qHtml += `</div>`;
      } else if (q.questionType === 'true_false') {
        qHtml += `
          <div style="display: flex; gap: 1.5rem; margin-top: 0.35rem;">
            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.95rem;">
              <input type="radio" name="ans_${q.id}" value="Đúng" required> Đúng
            </label>
            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.95rem;">
              <input type="radio" name="ans_${q.id}" value="Sai" required> Sai
            </label>
          </div>
        `;
      } else {
        qHtml += `
          <input type="text" name="ans_${q.id}" class="form-input" placeholder="Nhập câu trả lời ngắn của bạn..." required>
        `;
      }

      qHtml += `</div>`;
    });

    qHtml += `
        <button type="submit" class="submit-btn" id="btn-submit-test">
          Nộp bài kiểm tra
        </button>
      </form>
    `;

    body.innerHTML = qHtml;

  } catch (err) {
    console.error('Lỗi bài test:', err);
    body.innerHTML = `<div class="empty-state">Lỗi khi tải bài test.</div>`;
  }
}

// Submit student test
async function handleStudentTestSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = document.getElementById('btn-submit-test');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang chấm điểm...';

  const answers = {};
  if (appState.activeTest && appState.activeTest.questions) {
    appState.activeTest.questions.forEach(q => {
      if (q.questionType === 'single_choice' || q.questionType === 'true_false') {
        const checked = form.querySelector(`input[name="ans_${q.id}"]:checked`);
        if (checked) answers[q.id] = checked.value;
      } else {
        const inp = form.querySelector(`input[name="ans_${q.id}"]`);
        if (inp) answers[q.id] = inp.value;
      }
    });
  }

  try {
    const res = await fetch('/api/student/test-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_id: appState.activeTest.id,
        answers
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Lỗi khi nộp bài', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Nộp bài kiểm tra';
      return;
    }

    const body = document.getElementById('student-test-body');
    body.innerHTML = `
      <div style="text-align: center; padding: 2rem; background: #ecfdf5; border-radius: 12px; border: 1.5px solid #a7f3d0;">
        <div style="font-size: 3rem; color: #059669;">🎉</div>
        <h3 style="font-size: 1.4rem; font-weight: 800; color: #065f46; margin: 0.5rem 0;">Nộp bài thành công!</h3>
        <p style="font-size: 1.25rem; font-weight: 800; color: #047857; margin: 0.5rem 0;">
          Điểm số của bạn: ${data.score} / ${data.totalPoints} điểm
        </p>
        <p style="font-size: 0.85rem; color: #4b5563;">Thời điểm nộp: ${data.submittedAt}</p>
        <button class="btn-primary" style="margin-top: 1.25rem;" onclick="closeStudentTestModal()">
          Đóng cửa sổ
        </button>
      </div>
    `;

    showToast('Đã lưu bài làm và chấm điểm thành công!', 'success');

  } catch (err) {
    console.error('Lỗi nộp bài test:', err);
    showToast('Lỗi kết nối máy chủ', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Nộp bài kiểm tra';
  }
}

function closeStudentTestModal() {
  const modal = document.getElementById('student-test-modal');
  if (modal) modal.classList.remove('open');
}

// Access code login modal handlers
function openLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.classList.add('open');
    document.getElementById('access-code-input').focus();
  }
}

function closeLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) modal.classList.remove('open');
}

function closeLoginModalOnBackdrop(e) {
  if (e.target.id === 'login-modal') {
    closeLoginModal();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const codeInput = document.getElementById('access-code-input');
  const submitBtn = document.getElementById('btn-login-submit');
  const code = codeInput.value.trim();

  if (!code) {
    showToast('Vui lòng nhập mã truy cập.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang xác thực mã...';

  try {
    const res = await fetch('/api/auth/login-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Mã truy cập không hợp lệ.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Xác nhận truy cập';
      codeInput.value = '';
      codeInput.focus();
      return;
    }

    showToast('Xác thực thành công! Đang chuyển hướng...', 'success');
    setTimeout(() => {
      window.location.href = data.redirectUrl;
    }, 400);

  } catch (err) {
    console.error('Lỗi đăng nhập mã:', err);
    showToast('Lỗi kết nối đến máy chủ.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Xác nhận truy cập';
  }
}

// Escape HTML for safety
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
