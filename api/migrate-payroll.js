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

// Ca thiếu vào/ra (test/bấm trùng ngoài đời thật) — theo yêu cầu người dùng, để chạy thử dữ liệu:
// thiếu "Vào ca" thì giả định vào lúc 08:00 cùng ngày; thiếu "Tan ca" thì giả định ra lúc 17:00 cùng ngày.
function sameDayAt(date, hh, mm) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, 0);
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
    const assumedShifts = [];
    for (const phone in byPhone) {
      const list = byPhone[phone].sort((a, b) => a.t - b.t);
      let openIn = null;

      const closeShift = (inRec, outRec, assumed) => {
        const hours = roundToHalfHour(Math.max(0, (outRec.t - inRec.t) / 3600000));
        const shift = {
          employeeId: (inRec.employeeId || outRec.employeeId || "").trim(),
          fullName: inRec.fullName || outRec.fullName || "",
          projectName: (outRec.duAn || inRec.duAn || "").trim(),
          day: inRec.t.getDate(),
          hours,
        };
        shifts.push(shift);
        if (assumed) assumedShifts.push({ phone, ...shift, assumed, inTime: inRec.t, outTime: outRec.t });
      };

      for (const rec of list) {
        if (rec.loai === "Vào ca") {
          if (openIn) {
            // vào ca 2 lần liên tiếp không có tan ca ở giữa -> giả định tan ca 17:00 cùng ngày ca trước
            closeShift(openIn, { t: sameDayAt(openIn.t, 17, 0) }, "thiếu tan ca (giả định 17:00)");
          }
          openIn = rec;
        } else if (rec.loai === "Tan ca") {
          if (!openIn) {
            // tan ca không có vào ca trước đó -> giả định vào ca 08:00 cùng ngày
            closeShift({ t: sameDayAt(rec.t, 8, 0) }, rec, "thiếu vào ca (giả định 08:00)");
            continue;
          }
          closeShift(openIn, rec, false);
          openIn = null;
        }
      }
      if (openIn) {
        // còn "vào ca" chưa có "tan ca" (ca đang mở, kể cả ca cuối cùng của SĐT) -> giả định tan ca 17:00 cùng ngày
        closeShift(openIn, { t: sameDayAt(openIn.t, 17, 0) }, "thiếu tan ca (giả định 17:00)");
      }
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
        assumedShifts,
      });
      return;
    }

    // Ghi theo từng đợt nhỏ (batch), có nghỉ giữa các lượt trong đợt, để tránh vượt quota
    // "Read requests per minute" của Google Sheets API (mỗi lượt upsert đọc lại dữ liệu trước
    // khi ghi) và tránh vượt thời gian chạy tối đa của serverless function.
    // Gọi lại nhiều lần với ?startFrom=N tăng dần cho tới khi done=true.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const startFrom = Number(req.query.startFrom || 0);
    const batchSize = Number(req.query.batchSize || 15);
    const endAt = Math.min(startFrom + batchSize, finalShifts.length);
    let written = 0;
    for (let i = startFrom; i < endAt; i++) {
      await upsertPayrollHours(sheets, payrollSheetId, finalShifts[i]);
      written++;
      if (i < endAt - 1) await sleep(1500);
    }

    res.status(200).json({
      dryRun: false, written, startFrom, nextStartFrom: endAt,
      total: finalShifts.length, done: endAt >= finalShifts.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
