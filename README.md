# Chấm Công TKT Cleaning

Ứng dụng chấm công cho công nhân vệ sinh công trình — đăng nhập bằng số điện thoại, ghi nhận giờ vào/ra kèm định vị GPS. Chạy được cả trên trình duyệt máy tính và điện thoại (PWA — có thể "Thêm vào Màn hình chính" trên Android/iOS).

## Trạng thái hiện tại: khung sườn demo

- **Đăng nhập:** chỉ cần SĐT + mã nhân viên, chưa gửi OTP thật.
- **Dữ liệu:** lưu tạm trong `localStorage` của trình duyệt — mất khi đổi thiết bị hoặc xoá cache. **Chưa gửi về server công ty.**
- **Định vị:** dùng `navigator.geolocation` của trình duyệt, cần HTTPS (hoặc localhost) và người dùng cho phép quyền vị trí.

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

1. **Backend lưu dữ liệu thật** — thay `localStorage` bằng gửi dữ liệu chấm công về server/database của công ty (ví dụ Firebase Firestore hoặc API riêng).
2. **Xác thực SĐT thật** — thêm OTP qua SMS nếu cần bảo mật cao hơn (hiện đang bỏ qua theo yêu cầu ban đầu).
3. **Trang quản trị cho công ty** — xem báo cáo chấm công của tất cả công nhân, xuất Excel, theo công trình.
4. **Kiểm tra vị trí công trình** — so khớp GPS chấm công với toạ độ công trình được giao (tránh chấm công sai địa điểm).
5. **Icon/logo chính thức** — `icons/icon-192.png` và `icon-512.png` hiện là placeholder ("CC"), cần thay bằng logo TKT Cleaning thật.
6. **Deploy** — đưa lên hosting có HTTPS (Firebase Hosting, Vercel, Netlify...) để dùng được ngoài công trình thật.
