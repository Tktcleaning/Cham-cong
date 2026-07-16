const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SHEET_TAB = "Bang_luong";
// Cột A-H: STT | Code | CCCD | Họ và tên | Công trình | Kiểu CT | Đơn giá | Mức Lương
// Cột I trở đi (31 cột): ngày 1-31 trong tháng.
const DAY_COLUMN_START = 9; // cột I = ngày 1 (I là cột thứ 9 tính từ A=1)

function columnIndexToLetter(index) {
  let letter = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    index = Math.floor((index - 1) / 26);
  }
  return letter;
}

function dayColumnLetter(day) {
  return columnIndexToLetter(DAY_COLUMN_START + day - 1);
}

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
    const col = dayColumnLetter(dayNum);

    // Chỉ cần đọc cột B (Code) và E (Công trình) để tìm đúng dòng nhân viên+công trình.
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_TAB}!A2:E`,
    });
    const rows = data.values || [];

    const rowIndex = rows.findIndex(
      r => (r[1] || "").trim().toLowerCase() === employeeId.trim().toLowerCase()
        && (r[4] || "").trim().toLowerCase() === projectName.trim().toLowerCase()
    );

    if (rowIndex === -1) {
      // Chưa có dòng cho nhân viên+công trình này trong tháng — thêm dòng mới, các cột lương/phụ
      // cấp còn lại (Kiểu CT, Đơn giá...) để trống cho kế toán tự nhập.
      const sheetRowNumber = rows.length + 2; // +2: dữ liệu bắt đầu từ dòng 2
      const stt = rows.length + 1;

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_TAB}!A${sheetRowNumber}:E${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[stt, employeeId, "", fullName || "", projectName]] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_TAB}!${col}${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[hours]] },
      });
    } else {
      const sheetRowNumber = rowIndex + 2;

      // Cộng dồn nếu trong ngày đã có giờ ghi sẵn (nhiều ca cùng ngày cùng công trình).
      const { data: existingCell } = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${SHEET_TAB}!${col}${sheetRowNumber}`,
      });
      const existingHours = Number((existingCell.values && existingCell.values[0] && existingCell.values[0][0]) || 0);
      const newHours = existingHours + Number(hours);

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_TAB}!${col}${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[newHours]] },
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
