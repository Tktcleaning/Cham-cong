// API cho trang Admin — đọc danh mục công trình (tab CongTrinh: Mã Công Trình | Tên Công Trình)
// để hiện trong cửa sổ chọn công trình, và gán 1 hoặc nhiều công trình cho 1 nhân viên cùng lúc
// (ghi thêm dòng vào tab Phancong: Họ Tên | Mã Nhân Viên | Mã Công Trình | Tên Công Trình).
// Cùng file Sheet với NhanVien (GOOGLE_SHEET_ID). Xác thực admin giống api/admin-employees.js.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

// Khớp với ADMIN_EMPLOYEE_IDS trong api/login.js — thêm mã admin mới thì sửa ở cả 2 nơi.
const ADMIN_EMPLOYEE_IDS = new Set(["admin", "admin00", "admin01"]);
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function verifyAdmin(sheets, sheetId, deviceId) {
  if (!deviceId) return false;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "NhanVien!A2:D" });
  const rows = data.values || [];
  return rows.some(
    r => ADMIN_EMPLOYEE_IDS.has((r[2] || "").trim().toLowerCase()) && (r[3] || "").trim() === deviceId
  );
}

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const deviceId = req.method === "GET" ? req.query.deviceId : (req.body || {}).deviceId;

    const isAdmin = await verifyAdmin(sheets, sheetId, deviceId);
    if (!isAdmin) {
      res.status(403).json({ ok: false, message: "Không có quyền truy cập" });
      return;
    }

    if (req.method === "GET") {
      const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "CongTrinh!A2:B" });
      const rows = data.values || [];
      const projects = rows
        .map(r => ({ projectCode: (r[0] || "").trim(), projectName: (r[1] || "").trim() }))
        .filter(p => p.projectCode && p.projectName);
      res.status(200).json({ ok: true, projects });
      return;
    }

    if (req.method === "POST") {
      const { action } = req.body || {};

      if (action === "assign") {
        const employeeFullName = (req.body.employeeFullName || "").trim();
        const employeeId = (req.body.employeeId || "").trim();
        const projects = Array.isArray(req.body.projects) ? req.body.projects : [];
        if (!employeeId || !projects.length) {
          res.status(400).json({ ok: false, message: "Thiếu thông tin phân công" });
          return;
        }
        const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Phancong!A2:D" });
        const existingRows = data.values || [];
        const newRowStart = existingRows.length + 2;
        const values = projects.map(p => [employeeFullName, employeeId, (p.projectCode || "").trim(), (p.projectName || "").trim()]);
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Phancong!A${newRowStart}:D${newRowStart + values.length - 1}`,
          valueInputOption: "RAW",
          requestBody: { values },
        });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ ok: false, message: "Hành động không hợp lệ" });
      return;
    }

    res.status(405).json({ ok: false, message: "Phương thức không được hỗ trợ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
