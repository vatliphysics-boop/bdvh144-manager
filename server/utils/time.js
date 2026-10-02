const { TIMEZONE } = require('../config');

/**
 * Get current time details in Asia/Ho_Chi_Minh timezone
 */
function getNowVN() {
  const now = new Date();
  
  // Format with Intl
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(now);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const year = map.year;
  const month = map.month;
  const day = map.day;
  const hour = map.hour === '24' ? '00' : map.hour;
  const minute = map.minute;
  const second = map.second;

  const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD
  const timeStr = `${hour}:${minute}:${second}`; // HH:mm:ss
  const isoVN = `${dateStr}T${timeStr}+07:00`;

  // Determine weekday: 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[map.weekday] ?? 0;

  return {
    dateStr,
    timeStr,
    isoVN,
    dayOfWeek,
    year: parseInt(year, 10),
    month: parseInt(month, 10),
    day: parseInt(day, 10),
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    second: parseInt(second, 10),
    epochMs: now.getTime()
  };
}

/**
 * Format YYYY-MM-DD to DD/MM/YYYY
 */
function formatDateToVN(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Calculate registration window for a session Saturday (YYYY-MM-DD)
 * Opens: Thursday 00:00:00 (session Saturday minus 2 days)
 * Closes: Saturday 07:00:00
 */
function getSessionWindow(sessionDateStr) {
  // sessionDateStr is a Saturday in YYYY-MM-DD
  const [y, m, d] = sessionDateStr.split('-').map(Number);
  
  // Date in UTC to avoid local timezone offset problems
  const satUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  
  // Thursday is 2 days before Saturday
  const thuUtc = new Date(satUtc.getTime() - 2 * 24 * 60 * 60 * 1000);
  const thuYear = thuUtc.getUTCFullYear();
  const thuMonth = String(thuUtc.getUTCMonth() + 1).padStart(2, '0');
  const thuDay = String(thuUtc.getUTCDate()).padStart(2, '0');
  const thuDateStr = `${thuYear}-${thuMonth}-${thuDay}`;

  const openIso = `${thuDateStr}T00:00:00+07:00`;
  const closeIso = `${sessionDateStr}T07:00:00+07:00`;

  return {
    thuDateStr,
    openIso,
    closeIso,
    openDisplay: `00:00 thứ Năm, ${thuDay}/${thuMonth}/${thuYear}`,
    closeDisplay: `07:00 thứ Bảy, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${thuYear}`
  };
}

/**
 * Check if the registration window is currently open
 */
function isRegistrationOpen(session, nowVN = getNowVN()) {
  if (!session) return false;
  if (session.is_manually_locked === 1) return false;

  const currentIso = nowVN.isoVN;
  const window = getSessionWindow(session.session_date);

  // Compare ISO strings directly because both are in +07:00
  return currentIso >= window.openIso && currentIso <= window.closeIso;
}

/**
 * Calculate upcoming session date (Saturday) based on reference date or today
 */
function getUpcomingSaturday(referenceDateStr) {
  let ref;
  if (referenceDateStr) {
    const [y, m, d] = referenceDateStr.split('-').map(Number);
    ref = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  } else {
    const nowVN = getNowVN();
    ref = new Date(Date.UTC(nowVN.year, nowVN.month - 1, nowVN.day, 0, 0, 0));
  }

  // Find Saturday (day 6)
  const day = ref.getUTCDay();
  const diffToSat = (6 - day + 7) % 7;
  const satUtc = new Date(ref.getTime() + diffToSat * 24 * 60 * 60 * 1000);

  const y = satUtc.getUTCFullYear();
  const m = String(satUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(satUtc.getUTCDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

/**
 * Add weeks to a date YYYY-MM-DD
 */
function addWeeks(dateStr, weeks = 1) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + weeks * 7, 0, 0, 0));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * Format duration between two ISO or time strings into Vietnamese: X giờ Y phút
 */
function formatDuration(startIsoOrTime, endIsoOrTime, dateStr) {
  let startMs, endMs;

  if (startIsoOrTime.includes('T')) {
    startMs = new Date(startIsoOrTime).getTime();
  } else {
    startMs = new Date(`${dateStr}T${startIsoOrTime}+07:00`).getTime();
  }

  if (endIsoOrTime.includes('T')) {
    endMs = new Date(endIsoOrTime).getTime();
  } else {
    endMs = new Date(`${dateStr}T${endIsoOrTime}+07:00`).getTime();
  }

  if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
    return { minutes: 0, text: '0 phút' };
  }

  const diffMinutes = Math.floor((endMs - startMs) / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  let text = '';
  if (hours > 0 && mins > 0) {
    text = `${hours} giờ ${mins} phút`;
  } else if (hours > 0) {
    text = `${hours} giờ`;
  } else {
    text = `${mins} phút`;
  }

  return { minutes: diffMinutes, text };
}

module.exports = {
  getNowVN,
  formatDateToVN,
  getSessionWindow,
  isRegistrationOpen,
  getUpcomingSaturday,
  addWeeks,
  formatDuration
};
