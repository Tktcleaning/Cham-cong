const { Readable } = require("stream");
const { google } = require("googleapis");
const { getAuth } = require("./_lib/google");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

// Tab "ChamCong": Thời Gian | SĐT | Mã NV | Họ Tên | Loại | Dự Án | Vĩ Độ | Kinh Độ | Link Ảnh
const SHEET_RANGE = "ChamCong!A:I";

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl || "");
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

async function uploadPhoto(drive, folderId, buffer, mimeType, filename) {
  const { data } = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });
  return data.webViewLink || "";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Phương thức không được hỗ trợ" });
    return;
  }

  const {
    phone, employeeId, fullName, projectName, type,
    timestamp, lat, lng, photo,
  } = req.body || {};

  if (!phone || !employeeId || !type || !timestamp) {
    res.status(400).json({ ok: false, message: "Thiếu thông tin chấm công" });
    return;
  }

  try {
    const auth = getAuth(SCOPES);
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });
    const sheetId = process.env.GOOGLE_ATTENDANCE_SHEET_ID;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    let photoLink = "";
    if (photo && folderId) {
      const parsed = dataUrlToBuffer(photo);
      if (parsed) {
        const safeTime = timestamp.replace(/[:.]/g, "-");
        const filename = `${phone}_${type}_${safeTime}.jpg`;
        photoLink = await uploadPhoto(drive, folderId, parsed.buffer, parsed.mimeType, filename);
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          timestamp,
          phone,
          employeeId,
          fullName || "",
          type === "in" ? "Vào ca" : "Tan ca",
          projectName || "",
          lat != null ? lat : "",
          lng != null ? lng : "",
          photoLink,
        ]],
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Lỗi hệ thống, vui lòng thử lại sau" });
  }
};
