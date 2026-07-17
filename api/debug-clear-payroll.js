// TẠM THỜI — xoá sạch dữ liệu (A2:AM) trong Bang_luong để chạy lại migrate từ đầu, tránh
// cộng trùng giờ do lần chạy trước bị lỗi quota giữa chừng. Xoá xong sẽ xoá luôn file này.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

module.exports = async (req, res) => {
  if (req.query.confirm !== "yes") {
    res.status(400).json({ error: "Thiếu ?confirm=yes" });
    return;
  }
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const payrollSheetId = process.env.GOOGLE_PAYROLL_SHEET_ID;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: payrollSheetId,
      range: "Bang_luong!A2:BD500",
    });
    res.status(200).json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
