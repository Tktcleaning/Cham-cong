// TẠM THỜI — xem dòng cuối cùng của ChamCong để kiểm tra cột Ghi Chú, xoá sau khi dùng.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]) });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_ATTENDANCE_SHEET_ID,
      range: "ChamCong!A:J",
    });
    const rows = data.values || [];
    res.status(200).json({ header: rows[0], lastRow: rows[rows.length - 1] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
