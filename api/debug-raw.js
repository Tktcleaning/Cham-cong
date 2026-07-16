// TẠM THỜI — xem dữ liệu thô của 1 SĐT cụ thể trong ChamCong, xoá sau khi dùng xong.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]) });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_ATTENDANCE_SHEET_ID,
      range: "ChamCong!A2:F",
    });
    const phone = req.query.phone;
    const rows = (data.values || []).filter(r => !phone || r[1] === phone);
    res.status(200).json({ count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
