// API cho trang Admin — xem/thêm/sửa/xoá nhân viên và reset Mã Máy trực tiếp trên tab NhanVien,
// không cần mở Google Sheet thủ công. Mọi request phải kèm deviceId của admin, kiểm tra khớp với
// Mã Máy đã khoá của dòng "admin" trong NhanVien mới được thực hiện (cùng cơ chế khoá thiết bị
// dùng cho nhân viên thường trong api/login.js).
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const ADMIN_PHONE = "0123443210";
const ADMIN_EMPLOYEE_ID = "admin";
const SHEET_RANGE = "NhanVien!A2:D";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const deviceId = req.method === "GET" ? req.query.deviceId : (req.body || {}).deviceId;

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: SHEET_RANGE,
    });
    const rows = data.values || [];

    const adminRowIndex = rows.findIndex(
      r => (r[1] || "").trim() === ADMIN_PHONE && (r[2] || "").trim().toLowerCase() === ADMIN_EMPLOYEE_ID
    );
    const adminRow = adminRowIndex === -1 ? null : rows[adminRowIndex];
    if (!adminRow || !deviceId || (adminRow[3] || "").trim() !== deviceId) {
      res.status(403).json({ ok: false, message: "Không có quyền truy cập" });
      return;
    }

    if (req.method === "GET") {
      // Gộp thêm công trình đang được phân công của mỗi nhân viên từ tab Phancong (cùng file Sheet),
      // để trang Admin hiện luôn danh sách công trình khi tìm ra 1 nhân viên.
      const { data: pcData } = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Phancong!A2:D",
      });
      const pcRows = pcData.values || [];
      const projectsByEmployee = {};
      pcRows.forEach((r, i) => {
        const empId = (r[1] || "").trim().toLowerCase();
        if (!empId) return;
        (projectsByEmployee[empId] = projectsByEmployee[empId] || []).push({
          row: i + 2,
          projectCode: (r[2] || "").trim(),
          projectName: (r[3] || "").trim(),
        });
      });

      const employees = rows
        .map((r, i) => ({
          row: i + 2,
          fullName: r[0] || "",
          phone: r[1] || "",
          employeeId: r[2] || "",
          deviceId: r[3] || "",
          projects: projectsByEmployee[(r[2] || "").trim().toLowerCase()] || [],
        }))
        .filter(e => !(e.phone === ADMIN_PHONE && e.employeeId.toLowerCase() === ADMIN_EMPLOYEE_ID));
      res.status(200).json({ ok: true, employees });
      return;
    }

    if (req.method === "POST") {
      const { action } = req.body || {};

      if (action === "add") {
        const fullName = (req.body.fullName || "").trim();
        const phone = (req.body.phone || "").trim();
        const employeeId = (req.body.employeeId || "").trim();
        if (!fullName || !phone || !employeeId) {
          res.status(400).json({ ok: false, message: "Vui lòng nhập đầy đủ thông tin" });
          return;
        }
        const dup = rows.some(
          r => (r[1] || "").trim() === phone && (r[2] || "").trim().toLowerCase() === employeeId.toLowerCase()
        );
        if (dup) {
          res.status(400).json({ ok: false, message: "Số điện thoại + mã nhân viên này đã tồn tại" });
          return;
        }
        const newRowNumber = rows.length + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `NhanVien!A${newRowNumber}:D${newRowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [[fullName, phone, employeeId, ""]] },
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "edit") {
        const row = Number(req.body.row);
        const fullName = (req.body.fullName || "").trim();
        const phone = (req.body.phone || "").trim();
        const employeeId = (req.body.employeeId || "").trim();
        if (!row || !fullName || !phone || !employeeId) {
          res.status(400).json({ ok: false, message: "Vui lòng nhập đầy đủ thông tin" });
          return;
        }
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `NhanVien!A${row}:C${row}`,
          valueInputOption: "RAW",
          requestBody: { values: [[fullName, phone, employeeId]] },
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "resetDevice") {
        const row = Number(req.body.row);
        if (!row) { res.status(400).json({ ok: false, message: "Thiếu dòng cần xử lý" }); return; }
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `NhanVien!D${row}`,
          valueInputOption: "RAW",
          requestBody: { values: [[""]] },
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "delete") {
        const row = Number(req.body.row);
        if (!row) { res.status(400).json({ ok: false, message: "Thiếu dòng cần xử lý" }); return; }
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheet = sheetMeta.data.sheets.find(s => s.properties.title === "NhanVien");
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sheet.properties.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row },
              },
            }],
          },
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "deleteProjectAssignment") {
        // Xoá hẳn 1 dòng phân công công trình trong tab Phancong (dồn các dòng bên dưới lên),
        // dùng khi nhân viên không còn làm công trình đó nữa.
        const row = Number(req.body.row);
        if (!row) { res.status(400).json({ ok: false, message: "Thiếu dòng cần xử lý" }); return; }
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheet = sheetMeta.data.sheets.find(s => s.properties.title === "Phancong");
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sheet.properties.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row },
              },
            }],
          },
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
