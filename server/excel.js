const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { query } = require('./db');
const { formatDateToVN, getNowVN } = require('./utils/time');

/**
 * Generate Excel workbook directly from PostgreSQL database snapshot
 * Generates two worksheets: "Lớp 10" and "Lớp 11"
 */
async function generateSessionExcelWorkbook(sessionId) {
  const sessionRes = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  const session = sessionRes.rows[0];

  if (!session) {
    throw new Error('Không tìm thấy buổi học.');
  }

  const [y, m, d] = session.session_date.split('-');
  const fileName = `Danh_Sach_Ghi_Danh_${d}-${m}-${y}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.ASSISTANT_NAME;
  workbook.lastModifiedBy = config.ASSISTANT_NAME;
  workbook.created = new Date();
  workbook.modified = new Date();

  // Helper to build each class sheet
  async function buildClassSheet(className, classInfo) {
    const sheet = workbook.addWorksheet(className, {
      views: [{ state: 'frozen', ySplit: 6, activeCell: 'A7' }],
      pageSetup: { paperSize: 9, orientation: 'portrait' }
    });

    sheet.columns = [
      { key: 'stt', width: 8 },
      { key: 'fullName', width: 34 },
      { key: 'school', width: 34 },
      { key: 'className', width: 14 },
      { key: 'registeredAt', width: 26 }
    ];

    // 1. Center Name
    const r1 = sheet.getRow(1);
    r1.getCell(1).value = config.CENTER_NAME.toUpperCase();
    r1.getCell(1).font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
    sheet.mergeCells('A1:E1');
    r1.height = 26;

    // 2. Title
    const r2 = sheet.getRow(2);
    r2.getCell(1).value = `DANH SÁCH GHI DANH - ${className.toUpperCase()}`;
    r2.getCell(1).font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF1F2937' } };
    sheet.mergeCells('A2:E2');
    r2.height = 22;

    // 3. Meta 1
    const r3 = sheet.getRow(3);
    r3.getCell(1).value = `Ngày học: ${formatDateToVN(session.session_date)} (${classInfo.dayOfWeek})   |   Giờ học: ${classInfo.timeSlot}`;
    r3.getCell(1).font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF4B5563' } };
    sheet.mergeCells('A3:E3');

    // 4. Meta 2
    const r4 = sheet.getRow(4);
    r4.getCell(1).value = `Giáo viên: Thầy ${config.TEACHER_NAME}   |   Trợ giảng: ${config.ASSISTANT_NAME}`;
    r4.getCell(1).font = { name: 'Arial', size: 11, color: { argb: 'FF4B5563' } };
    sheet.mergeCells('A4:E4');

    // 5. Blank row 5
    sheet.getRow(5).height = 10;

    // 6. Header Row
    const r6 = sheet.getRow(6);
    r6.values = ['STT', 'Họ và tên', 'Trường đang học', 'Lớp', 'Thời điểm ghi danh'];
    r6.height = 28;

    for (let c = 1; c <= 5; c++) {
      const cell = r6.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }
      };
      cell.font = {
        name: 'Arial',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 1 || c === 4 || c === 5 ? 'center' : 'left'
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    }

    // AutoFilter
    sheet.autoFilter = { from: 'A6', to: 'E6' };

    // 7. Data rows from PostgreSQL
    const studentsRes = await query(`
      SELECT * FROM registrations
      WHERE session_id = $1 AND class_name = $2
      ORDER BY is_kicked ASC, id ASC
    `, [sessionId, className]);

    const students = studentsRes.rows;
    let rowIndex = 7;

    students.forEach((s, idx) => {
      const row = sheet.getRow(rowIndex);
      const isEven = idx % 2 === 0;
      const bg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.values = [
        idx + 1,
        s.is_kicked === 1 ? `${s.full_name} (Đã mời ra)` : s.full_name,
        s.school_name || '—',
        s.class_name,
        s.registered_at
      ];
      row.height = 22;

      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        if (s.is_kicked === 1) {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FF9F1239' }, strike: true };
        } else {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bg }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: c === 1 || c === 4 || c === 5 ? 'center' : 'left'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      }
      rowIndex++;
    });

    if (students.length === 0) {
      const emptyRow = sheet.getRow(rowIndex);
      emptyRow.getCell(1).value = 'Chưa có học sinh ghi danh trong buổi học này.';
      sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
      emptyRow.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF6B7280' } };
      emptyRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      emptyRow.height = 30;
    }
  }

  await buildClassSheet('Lớp 10', config.CLASSES['Lớp 10']);
  await buildClassSheet('Lớp 11', config.CLASSES['Lớp 11']);

  return { workbook, fileName };
}

/**
 * Generate Excel as a binary Buffer from database snapshot
 * Ideal for streaming on cloud environments without relying on local disks
 */
async function generateSessionExcelBuffer(sessionId) {
  const { workbook, fileName } = await generateSessionExcelWorkbook(sessionId);
  const buffer = await workbook.xlsx.writeBuffer();

  const nowVN = getNowVN();
  await query(`
    UPDATE sessions
    SET excel_generated_at = $1
    WHERE id = $2
  `, [nowVN.isoVN, sessionId]);

  return { buffer, fileName };
}

module.exports = {
  generateSessionExcelWorkbook,
  generateSessionExcelBuffer
};
