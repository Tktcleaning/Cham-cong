const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");
const { upsertPayrollHours } = require("./_lib/payroll");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Phương thức không được hỗ trợ" });
    return;
  }

  const { employeeId, fullName, projectName, day, hours } = req.body || {};
  const dayNum = Number(day);

  if (!employeeId || !projectName || !Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31 || hours == null) {
    res.status(400).json({ ok: false, message: "Thiếu thông tin hoặc dữ liệu không hợp lệ" });
    return;
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const sheetId = process.env.GOOGLE_PAYROLL_SHEET_ID;

    await upsertPayrollHours(sheets, sheetId, {
      employeeId, fullName, projectName, day: dayNum, hours: Number(hours),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
