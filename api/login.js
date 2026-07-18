const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

// Cùng 1 file Sheet, 2 tab khác nhau:
// "NhanVien": cột A Họ Tên | B Số Điện Thoại | C Mã Nhân Viên | D Mã Máy. Dòng 1 là tiêu đề.
const SHEET_RANGE = "NhanVien!A2:D";
// "Phancong": cột A Họ Tên | B Mã Nhân Viên | C Mã Công Trình | D Tên Công Trình.
const ASSIGNMENT_RANGE = "Phancong!A2:D";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Tài khoản quản trị — dùng chung cơ chế khoá thiết bị với nhân viên thường (cùng tab NhanVien,
// mỗi admin có SĐT thật riêng của mình), chỉ khác là không có danh sách công trình. Có thể có
// nhiều admin cùng lúc — thêm mã mới vào danh sách này (viết thường, không dấu). Ngoại trừ mã
// gốc "admin" (SĐT cố định bootstrap ban đầu), các mã admin khác PHẢI được công ty tự tạo dòng
// trước trong NhanVien (VD qua "+ Thêm nhân viên" ở trang Admin) rồi mới đăng nhập được — không
// tự tạo dòng mới từ màn đăng nhập cho các mã này, để tránh ai cũng có thể tự phong mình làm admin
// chỉ bằng cách gõ 1 mã "adminXX" chưa từng tồn tại.
const ADMIN_EMPLOYEE_IDS = new Set(["admin", "admin00", "admin01"]);
const BOOTSTRAP_ADMIN_PHONE = "0123443210";
const BOOTSTRAP_ADMIN_EMPLOYEE_ID = "admin";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Phương thức không được hỗ trợ" });
    return;
  }

  const { phone, employeeId, deviceId } = req.body || {};
  if (!phone || !employeeId || !deviceId) {
    res.status(400).json({ ok: false, message: "Thiếu thông tin đăng nhập" });
    return;
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: SHEET_RANGE,
    });

    const rows = data.values || [];
    const normalizedEmployeeId = employeeId.trim().toLowerCase();
    const isAdminLogin = ADMIN_EMPLOYEE_IDS.has(normalizedEmployeeId);
    const rowIndex = rows.findIndex(
      r => (r[1] || "").trim() === phone.trim()
        && (r[2] || "").trim().toLowerCase() === normalizedEmployeeId
    );

    if (rowIndex === -1) {
      const isBootstrapAdmin = phone.trim() === BOOTSTRAP_ADMIN_PHONE && normalizedEmployeeId === BOOTSTRAP_ADMIN_EMPLOYEE_ID;
      if (!isBootstrapAdmin) {
        res.status(401).json({ ok: false, message: "Số điện thoại hoặc mã nhân viên không đúng" });
        return;
      }
      // Lần đầu đăng nhập admin gốc trên máy này — tự tạo dòng trong NhanVien và khoá luôn vào
      // máy này (không cần công ty tự vào Google Sheet thêm tay).
      const newRowNumber = rows.length + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `NhanVien!A${newRowNumber}:D${newRowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [["Admin", BOOTSTRAP_ADMIN_PHONE, BOOTSTRAP_ADMIN_EMPLOYEE_ID, deviceId]] },
      });
      res.status(200).json({ ok: true, fullName: "Admin", isAdmin: true, projects: [] });
      return;
    }

    const row = rows[rowIndex];
    const fullName = (row[0] || "").trim();
    const registeredDevice = (row[3] || "").trim();
    const sheetRowNumber = rowIndex + 2; // +2: range bắt đầu từ dòng 2, mảng rows đánh số từ 0

    if (registeredDevice && registeredDevice !== deviceId) {
      res.status(403).json({
        ok: false,
        message: "Số điện thoại/mã nhân viên này đã đăng ký trên máy khác. Vui lòng liên hệ công ty để đặt lại.",
      });
      return;
    }

    if (!registeredDevice) {
      // Lần đầu đăng nhập trên máy này — ghi nhận mã máy vào Sheet để khoá lại.
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `NhanVien!D${sheetRowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [[deviceId]] },
      });
    }

    if (isAdminLogin) {
      res.status(200).json({ ok: true, fullName: fullName || "Admin", isAdmin: true, projects: [] });
      return;
    }

    // Lấy danh sách công trình được phân công cho đúng nhân viên này từ tab "PhanCong" (cùng file Sheet).
    const { data: assignData } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: ASSIGNMENT_RANGE,
    });
    const assignRows = assignData.values || [];
    const projects = assignRows
      .filter(r => (r[1] || "").trim().toLowerCase() === employeeId.trim().toLowerCase())
      .map(r => ({ id: (r[2] || "").trim(), name: (r[3] || "").trim() }))
      .filter(p => p.id && p.name);

    res.status(200).json({ ok: true, fullName, projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
