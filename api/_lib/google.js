const { google } = require("googleapis");

// Đọc cả file JSON key của service account dưới dạng base64 trong 1 biến môi trường duy nhất
// (GOOGLE_SERVICE_ACCOUNT_KEY_BASE64) — tránh phải copy-paste tay chuỗi private_key nhiều dòng
// dễ bị lỗi lệch ký tự khi dán vào ô env var của Vercel.
function getAuth(scopes) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!raw) {
    throw new Error("Thiếu biến môi trường GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
  }
  const keyJson = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));

  return new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes,
  });
}

module.exports = { getAuth };
