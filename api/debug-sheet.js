// TẠM THỜI — chỉ dùng để xem cấu trúc file bao_cao_cham_cong (Bang_luong) 1 lần, sẽ xoá sau khi dùng xong.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const SHEET_ID = "1mmVhL394IlNgwqL7C6Bo3cthzhMC2vGe_NMQ4iyVXhc";

module.exports = async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]) });

    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const tabs = meta.data.sheets.map(s => ({
      title: s.properties.title,
      rowCount: s.properties.gridProperties.rowCount,
      colCount: s.properties.gridProperties.columnCount,
    }));

    const firstTab = meta.data.sheets[0].properties.title;
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${firstTab}!A1:BD5`,
    });

    res.status(200).json({ tabs, sampleRows: data.values || [] });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
