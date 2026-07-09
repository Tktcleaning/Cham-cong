# Chấm Công TKT Cleaning

Ứng dụng chấm công cho công nhân vệ sinh công trình — đăng nhập bằng số điện thoại, ghi nhận giờ vào/ra kèm định vị GPS. Chạy được cả trên trình duyệt máy tính và điện thoại (PWA — có thể "Thêm vào Màn hình chính" trên Android/iOS).

## Trạng thái hiện tại

- **Đăng nhập:** kiểm tra thật qua Google Sheet danh sách nhân viên (không phải OTP SMS) — xem mục "Đăng nhập & khoá thiết bị" bên dưới.
- **Dữ liệu chấm công (ảnh, giờ, GPS):** vẫn lưu tạm trong `localStorage` của trình duyệt — mất khi đổi thiết bị hoặc xoá cache. **Chưa gửi về server công ty** (việc này khác với phần đăng nhập, sẽ làm ở bước tiếp theo).
- **Định vị:** dùng `navigator.geolocation` của trình duyệt, cần HTTPS (hoặc localhost) và người dùng cho phép quyền vị trí.

## Đăng nhập & khoá thiết bị (chống chấm công hộ)

Đăng nhập được kiểm tra qua hàm server `api/login.js`, đọc/ghi trực tiếp một Google Sheet ("Danh sách nhân viên") bằng tài khoản dịch vụ (service account) của Google — không lộ khoá bí mật ra trình duyệt.

**Cấu trúc Sheet** (tab tên `NhanVien`, dòng 1 là tiêu đề):

| Họ Tên | Số Điện Thoại | Mã Nhân Viên | Mã Máy |
|---|---|---|---|
| Nguyễn Văn A | 0912345678 | NV001 | *(để trống, app tự điền)* |

**Luồng hoạt động:**
1. App tự tạo một "mã máy" ngẫu nhiên lưu trong `localStorage` của trình duyệt ngay lần đầu mở (vì web app không lấy được ID phần cứng thật — nếu công nhân xoá dữ liệu trình duyệt hoặc đổi trình duyệt trên cùng điện thoại, mã máy sẽ đổi, coi như "đổi máy").
2. Khi đăng nhập, app gửi (SĐT, mã NV, mã máy) lên `api/login.js`.
3. Hàm tìm dòng khớp SĐT + mã NV trong Sheet:
   - Không thấy → báo sai thông tin.
   - Thấy, cột Mã Máy đang trống → coi là lần đăng nhập đầu, **tự ghi mã máy vào Sheet** để khoá lại.
   - Thấy, Mã Máy khác với máy hiện tại → từ chối, báo liên hệ công ty.
   - Thấy, Mã Máy khớp → cho vào bình thường.
4. **Công ty "reset" khi nhân viên đổi điện thoại:** chỉ cần mở Sheet, xoá giá trị ô Mã Máy của nhân viên đó — không cần sửa code.

**Biến môi trường cần cấu hình trên Vercel** (Project Settings → Environment Variables — không commit vào git):
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — email dạng `...@...iam.gserviceaccount.com` từ file JSON key của service account.
- `GOOGLE_PRIVATE_KEY` — chuỗi `private_key` từ file JSON key (giữ nguyên các ký tự `\n`).
- `GOOGLE_SHEET_ID` — lấy từ URL của Google Sheet, đoạn giữa `/d/` và `/edit`.

Nhớ chia sẻ (Share) Google Sheet cho đúng email service account ở trên với quyền **Editor**, nếu không hàm sẽ báo lỗi không đọc/ghi được.

## Trình duyệt khuyến nghị cho công nhân

- **iPhone (iOS): dùng Safari.** Đã test kỹ, chạy ổn định — chụp ảnh + lấy GPS đều mượt.
- **iPhone + Chrome: KHÔNG khuyến khích.** Chrome trên iOS bắt buộc dùng engine WebKit của Apple (không phải engine Chrome gốc), và bị lỗi hay treo/timeout khi lấy vị trí GPS ngay sau khi quay lại từ app Camera — đây là hạn chế của nền tảng iOS, không phải lỗi ở code app. App đã tự nhận diện trường hợp này và hiển thị thông báo nhắc người dùng đổi sang Safari.
- **Android + Chrome: dùng bình thường, không có vấn đề gì.** Trên Android, Chrome là trình duyệt gốc (engine Blink), định vị GPS hoạt động đầy đủ và ổn định.

## Cách xem thử

Mở `index.html` trực tiếp bằng trình duyệt, hoặc chạy một server tĩnh đơn giản (khuyến khích, vì định vị GPS cần HTTPS/localhost để hoạt động ổn định trên điện thoại thật):

```
npx serve Cham_Cong
```

## Việc cần làm tiếp để lên bản thật

1. **Backend lưu dữ liệu chấm công thật** — thay `localStorage` bằng gửi ảnh/giờ/GPS/dự án về server/database của công ty (đăng nhập đã làm xong ở trên, còn phần ghi nhận chấm công thì chưa).
2. **Danh sách công trình thật** — hiện đang hard-code 5 công trình mẫu trong `PROJECTS` (js/app.js), cần thay bằng danh sách thật (có thể dùng chung cơ chế Google Sheet như danh sách nhân viên).
3. **Trang quản trị cho công ty** — xem báo cáo chấm công của tất cả công nhân, xuất Excel, theo công trình.
4. **Kiểm tra vị trí công trình** — so khớp GPS chấm công với toạ độ công trình được giao (tránh chấm công sai địa điểm).
5. **Icon/logo chính thức** — `icons/icon-192.png` và `icon-512.png` hiện là placeholder ("CC"), cần thay bằng logo TKT Cleaning thật.
