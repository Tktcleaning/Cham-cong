const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");
const { toVietnamTimeString } = require("./_lib/time");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Tab "QuenChamCong" (cùng file Sheet chấm công):
// Thời Gian Báo Cáo | SĐT | Mã NV | Họ Tên | Dự Án | Lý Do Quên | Người Quản Lý
const SHEET_RANGE = "QuenChamCong!A:G";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Phương thức không được hỗ trợ" });
    return;
  }

  const {
    phone, employeeId, fullName, projectName,
    reason, managerName, timestamp,
  } = req.body || {};

  if (!phone || !employeeId || !reason || !managerName || !timestamp) {
    res.status(400).json({ ok: false, message: "Thiếu thông tin báo cáo" });
    return;
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const sheetId = process.env.GOOGLE_ATTENDANCE_SHEET_ID;

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          toVietnamTimeString(timestamp),
          phone,
          employeeId,
          fullName || "",
          projectName || "",
          reason,
          managerName,
        ]],
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
