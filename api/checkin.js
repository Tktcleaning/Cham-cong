const { google } = require("googleapis");
const { put } = require("@vercel/blob");
const { getAuth } = require("./_lib/google");
const { toVietnamTimeString } = require("./_lib/time");

// Chỉ cần quyền Sheets — ảnh chấm công lưu ở Vercel Blob, không dùng Google Drive nữa
// (service account của Google không có dung lượng lưu trữ riêng trên Drive cá nhân/gmail thường).
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Tab "ChamCong": Thời Gian | SĐT | Mã NV | Họ Tên | Loại | Dự Án | Vĩ Độ | Kinh Độ | Link Ảnh | Ghi Chú
const SHEET_RANGE = "ChamCong!A:J";

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl || "");
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Phương thức không được hỗ trợ" });
    return;
  }

  const {
    phone, employeeId, fullName, projectName, type,
    timestamp, lat, lng, photo, note,
  } = req.body || {};

  if (!phone || !employeeId || !type || !timestamp) {
    res.status(400).json({ ok: false, message: "Thiếu thông tin chấm công" });
    return;
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth(SCOPES) });
    const sheetId = process.env.GOOGLE_ATTENDANCE_SHEET_ID;

    let photoLink = "";
    if (photo) {
      const parsed = dataUrlToBuffer(photo);
      if (parsed) {
        const safeTime = timestamp.replace(/[:.]/g, "-");
        const filename = `${phone}_${type}_${safeTime}.jpg`;
        const blob = await put(filename, parsed.buffer, {
          access: "public",
          contentType: parsed.mimeType,
        });
        photoLink = blob.url;
      }
    }

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
          type === "in" ? "Vào ca" : "Tan ca",
          projectName || "",
          lat != null ? lat : "",
          lng != null ? lng : "",
          photoLink,
          note || "",
        ]],
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
