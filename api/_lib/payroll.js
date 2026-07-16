const SHEET_TAB = "Bang_luong";
const DAY_COLUMN_START = 9; // cột I = ngày 1

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

function roundToHalfHour(hoursDecimal) {
  return Math.round(hoursDecimal * 2) / 2;
}

// Tìm dòng theo đúng cặp Mã NV + Tên Công Trình, tạo dòng mới nếu chưa có, rồi cộng dồn giờ vào
// đúng cột ngày. Gọi tuần tự (await từng lần) khi xử lý nhiều ca liên tiếp — mỗi lần đọc lại
// dữ liệu mới nhất nên các ca sau sẽ thấy đúng dòng vừa tạo ở ca trước, không bị tạo trùng dòng.
async function upsertPayrollHours(sheets, sheetId, { employeeId, fullName, projectName, day, hours }) {
  const col = dayColumnLetter(day);

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
    const sheetRowNumber = rows.length + 2;
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
}

module.exports = { upsertPayrollHours, roundToHalfHour, dayColumnLetter };
