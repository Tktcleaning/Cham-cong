// API cho trang Admin — xuất toàn bộ tab Bang_luong (Bao_cao_cham_cong) ra file CSV để tải về,
// không cần mở Google Sheet. Xác thực bằng deviceId admin, giống api/admin-employees.js.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

// Khớp với ADMIN_EMPLOYEE_IDS trong api/login.js — thêm mã admin mới thì sửa ở cả 2 nơi.
const ADMIN_EMPLOYEE_IDS = new Set(["admin", "admin00", "admin01"]);
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });

    const { data: nvData } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "NhanVien!A2:D",
    });
    const isVerifiedAdmin = !!deviceId && (nvData.values || []).some(
      r => ADMIN_EMPLOYEE_IDS.has((r[2] || "").trim().toLowerCase()) && (r[3] || "").trim() === deviceId
    );
    if (!isVerifiedAdmin) {
      res.status(403).json({ ok: false, message: "Không có quyền truy cập" });
      return;
    }

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_PAYROLL_SHEET_ID,
      range: "Bang_luong!A1:BD500",
    });
    const rows = data.values || [];
    const csv = "﻿" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n");

    const today = new Date();
    const filename = `Bang_luong_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
