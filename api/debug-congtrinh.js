// TẠM THỜI — xem cấu trúc thật của tab CongTrinh để biết chính xác thứ tự cột trước khi code
// tính năng "+" chọn công trình cho nhân viên trong trang Admin. Sẽ xoá sau khi dùng xong.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "CongTrinh!A1:F20",
    });
    res.status(200).json({ rows: data.values || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
