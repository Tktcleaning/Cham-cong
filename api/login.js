const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

// Sheet "NhanVien": cột A Họ Tên | B Số Điện Thoại | C Mã Nhân Viên | D Mã Máy. Dòng 1 là tiêu đề.
const SHEET_RANGE = "NhanVien!A2:D";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

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
    const rowIndex = rows.findIndex(
      r => (r[1] || "").trim() === phone.trim()
        && (r[2] || "").trim().toLowerCase() === employeeId.trim().toLowerCase()
    );

    if (rowIndex === -1) {
      res.status(401).json({ ok: false, message: "Số điện thoại hoặc mã nhân viên không đúng" });
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

    res.status(200).json({ ok: true, fullName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
