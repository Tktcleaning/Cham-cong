// Đổi timestamp ISO (UTC) sang giờ Việt Nam (GMT+7, cố định quanh năm — không có giờ tiết kiệm
// ánh sáng ngày nên cộng thẳng 7 tiếng là đủ, không cần thư viện múi giờ) trước khi ghi vào Sheet.
// Tự tính tay (không dùng toLocaleString) để định dạng luôn nhất quán dd/MM/yyyy HH:mm:ss, không
// phụ thuộc vào dữ liệu ICU có sẵn hay không trên từng môi trường chạy Node khác nhau.
function toVietnamTimeString(isoString) {
  const utcDate = new Date(isoString);
  const vnDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");

  const day = pad(vnDate.getUTCDate());
  const month = pad(vnDate.getUTCMonth() + 1);
  const year = vnDate.getUTCFullYear();
  const hours = pad(vnDate.getUTCHours());
  const minutes = pad(vnDate.getUTCMinutes());
  const seconds = pad(vnDate.getUTCSeconds());

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

module.exports = { toVietnamTimeString };
