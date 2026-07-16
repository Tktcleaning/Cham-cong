// TẠM THỜI — dùng 1 lần để đưa dữ liệu chấm công cũ (Ghi_nhan_cham_cong) vào bảng lương
// (Bao_cao_cham_cong), sẽ xoá sau khi chạy xong. Mặc định luôn chạy dry-run (không ghi gì),
// phải gọi kèm ?dryRun=false mới thực sự ghi vào Sheet.
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");
const { upsertPayrollHours, roundToHalfHour } = require("./_lib/payroll");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const ATTENDANCE_RANGE = "ChamCong!A2:F"; // Thời Gian | SĐT | Mã NV | Họ Tên | Loại | Dự Án

// SĐT dùng để tự test API trong lúc phát triển — loại khỏi dữ liệu thật.
const TEST_PHONES = new Set(["0900000000"]);

function parseVNTimestamp(s) {
  const [datePart, timePart] = (s || "").split(" ");
  if (!datePart || !timePart) return null;
  const [d, m, y] = datePart.split("/").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

module.exports = async (req, res) => {
  const dryRun = req.query.dryRun !== "false";

  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const attendanceSheetId = process.env.GOOGLE_ATTENDANCE_SHEET_ID;
    const payrollSheetId = process.env.GOOGLE_PAYROLL_SHEET_ID;

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: attendanceSheetId,
      range: ATTENDANCE_RANGE,
    });
    const rows = data.values || [];

    // Gom theo SĐT, sắp thời gian tăng dần để ghép đúng cặp vào-ra theo thứ tự thời gian thật.
    const byPhone = {};
    for (const r of rows) {
      const [timestamp, phone, employeeId, fullName, loai, duAn] = r;
      if (!phone || TEST_PHONES.has(phone.trim())) continue;
      const t = parseVNTimestamp(timestamp);
      if (!t) continue;
      (byPhone[phone] = byPhone[phone] || []).push({ t, employeeId, fullName, loai, duAn });
    }

    const shifts = [];
    const skippedUnpaired = [];
    for (const phone in byPhone) {
      const list = byPhone[phone].sort((a, b) => a.t - b.t);
      let openIn = null;
      for (const rec of list) {
        if (rec.loai === "Vào ca") {
          if (openIn) skippedUnpaired.push({ phone, ...openIn }); // vào ca 2 lần liên tiếp không có tan ca ở giữa
          openIn = rec;
        } else if (rec.loai === "Tan ca") {
          if (!openIn) { skippedUnpaired.push({ phone, ...rec }); continue; }
          const hours = roundToHalfHour((rec.t - openIn.t) / 3600000);
          shifts.push({
            employeeId: (openIn.employeeId || "").trim(),
            fullName: openIn.fullName || "",
            projectName: (rec.duAn || openIn.duAn || "").trim(),
            day: rec.t.getDate(),
            hours,
          });
          openIn = null;
        }
      }
      if (openIn) skippedUnpaired.push({ phone, ...openIn }); // còn "vào ca" chưa có "tan ca" (ca đang mở)
    }

    // Gộp các ca cùng NV + cùng công trình + cùng ngày thành 1 số giờ trước khi ghi (giống hệt
    // cách api/payroll.js cộng dồn khi có nhiều ca một ngày).
    const merged = {};
    for (const s of shifts) {
      const key = `${s.employeeId}|${s.projectName}|${s.day}`;
      if (!merged[key]) merged[key] = { ...s, hours: 0 };
      merged[key].hours = roundToHalfHour(merged[key].hours + s.hours);
    }
    const finalShifts = Object.values(merged).sort((a, b) =>
      a.employeeId.localeCompare(b.employeeId) || a.day - b.day
    );

    if (dryRun) {
      res.status(200).json({
        dryRun: true,
        shiftsToWrite: finalShifts,
        skippedUnpaired: skippedUnpaired.map(s => ({ phone: s.phone, employeeId: s.employeeId, loai: s.loai, time: s.t })),
      });
      return;
    }

    for (const shift of finalShifts) {
      await upsertPayrollHours(sheets, payrollSheetId, shift);
    }

    res.status(200).json({ dryRun: false, written: finalShifts.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
