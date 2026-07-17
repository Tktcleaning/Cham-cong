// TẠM THỜI — đọc trạng thái hiện tại của Bang_luong để kiểm tra tiến độ migrate sau khi bị lỗi quota.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const payrollSheetId = process.env.GOOGLE_PAYROLL_SHEET_ID;
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: payrollSheetId,
      range: "Bang_luong!A2:AM200",
    });
    res.status(200).json({ rows: data.values || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
