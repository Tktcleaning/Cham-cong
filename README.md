# Chấm Công TKT Cleaning

Ứng dụng chấm công cho công nhân vệ sinh công trình — đăng nhập bằng số điện thoại, ghi nhận giờ vào/ra kèm định vị GPS. Chạy được cả trên trình duyệt máy tính và điện thoại (PWA — có thể "Thêm vào Màn hình chính" trên Android/iOS).

## Trạng thái hiện tại

- **Đăng nhập:** kiểm tra thật qua Google Sheet danh sách nhân viên (không phải OTP SMS) — xem mục "Đăng nhập & khoá thiết bị" bên dưới.
- **Dữ liệu chấm công (ảnh, giờ, GPS):** gửi thật lên Google Sheet + Vercel Blob (ảnh) của công ty qua `api/checkin.js` — xem mục "Đồng bộ dữ liệu chấm công" bên dưới. Vẫn giữ thêm 1 bản sao trong `localStorage` làm dự phòng nếu gửi lên server thất bại (mất mạng...).
- **Danh sách công trình mỗi nhân viên:** lấy thật từ Sheet "PhanCong" riêng, trả về kèm lúc đăng nhập — xem mục "Phân công công trình" bên dưới.
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
- `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` — **toàn bộ file JSON key** của service account, encode base64 thành 1 chuỗi. Cách lấy (PowerShell, thay đường dẫn file cho đúng):
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\ten-file-key.json")) | Set-Clipboard
  ```
  Lệnh trên copy thẳng kết quả vào clipboard — chỉ cần dán (Ctrl+V) vào ô giá trị trên Vercel, không cần chỉnh sửa gì. Cách này tránh việc copy-paste tay chuỗi `private_key` nhiều dòng dễ bị lệch ký tự.
- `GOOGLE_SHEET_ID` — lấy từ URL của Google Sheet, đoạn giữa `/d/` và `/edit`.

Nhớ chia sẻ (Share) Google Sheet cho đúng `client_email` trong file JSON key (dạng `...@...iam.gserviceaccount.com`) với quyền **Editor**, nếu không hàm sẽ báo lỗi không đọc/ghi được.

## Phân công công trình

Mỗi nhân viên chỉ thấy đúng các công trình được phân công cho mình (không phải danh sách chung cho tất cả). Dữ liệu lấy từ tab **`PhanCong`** — thêm ngay trong cùng file Sheet "Danh sách nhân viên" (gộp chung cho 1 người dễ thao tác, thay vì tách file riêng như dự tính ban đầu), trả về kèm luôn trong response của `api/login.js` — không cần gọi thêm API riêng, không cần thêm biến môi trường/share gì mới.

**Cấu trúc tab `PhanCong`** (dòng 1 là tiêu đề — mỗi dòng là 1 cặp nhân viên–công trình, 1 nhân viên có thể có nhiều dòng nếu làm nhiều công trình):

| Mã Nhân Viên | Mã Công Trình | Tên Công Trình |
|---|---|---|
| VP001 | CT01 | Chung cư Green Tower |
| VP001 | CT02 | Cao ốc văn phòng ABC |

Nếu nhân viên chưa có dòng nào trong tab này, app sẽ báo "Bạn chưa được phân công công trình nào" ở màn hình chọn công trình thay vì crash hay hiện danh sách rỗng khó hiểu.

## Đồng bộ dữ liệu chấm công

Mỗi lần bấm **VÀO CA** hoặc **TAN CA** là một lần gửi riêng biệt lên `api/checkin.js` — tức 1 ca làm ra 2 dòng dữ liệu (1 dòng vào, 1 dòng ra), không gộp chung.

**Ảnh chụp không lưu trực tiếp trong Sheet** (mỗi ô Sheet giới hạn ~50.000 ký tự, ảnh nén xong ở dạng base64 vẫn thường vượt mức đó), và **cũng không lưu ở Google Drive** — service account của Google không có dung lượng lưu trữ riêng trên Drive cá nhân/gmail thường (chỉ tài khoản Google Workspace trả phí mới dùng được Shared Drive để né giới hạn này). Thay vào đó: ảnh được **upload lên Vercel Blob** (dịch vụ lưu file của chính Vercel, không dính giới hạn của Google), Sheet chỉ lưu link ảnh đó — link ở chế độ **public** (chuỗi ngẫu nhiên dài, không đoán được nếu không có link, nhưng ai có link đều xem được, giống hệt cách link Google Drive hoạt động).

**File Sheet riêng cho chấm công** (khác với file "Danh sách nhân viên" dùng cho đăng nhập — tách riêng để dễ quản lý). Tên file gợi ý: `Ghi_nhan_cham_cong`, tab tên `ChamCong`, dòng 1 là tiêu đề:

| Thời Gian | Số Điện Thoại | Mã Nhân Viên | Họ Tên | Loại | Dự Án | Vĩ Độ | Kinh Độ | Link Ảnh |
|---|---|---|---|---|---|---|---|---|

**Biến môi trường thêm** (ngoài 2 biến ở mục đăng nhập):
- `GOOGLE_ATTENDANCE_SHEET_ID` — ID của file Sheet chấm công riêng này (khác `GOOGLE_SHEET_ID` là file danh sách nhân viên), lấy từ URL Sheet giữa `/d/` và `/edit`.
- `BLOB_READ_WRITE_TOKEN` — tự động có sẵn khi tạo Blob store qua `vercel blob create-store` và liên kết với project, không cần tự thêm tay.

Nhớ **share file Sheet chấm công này** cho đúng `client_email` của service account (quyền Editor) — dùng chung 1 service account với phần đăng nhập, không cần tạo thêm.

Nếu gửi lên server thất bại (ảnh vẫn lưu tạm trong `localStorage` máy công nhân), app sẽ báo "Đã lưu tạm trên máy, chưa gửi được lên hệ thống công ty" — hiện chưa có cơ chế tự động gửi lại, cần làm thêm nếu cần độ tin cậy cao hơn.

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

1. **Trang quản trị cho công ty** — xem báo cáo chấm công của tất cả công nhân trực tiếp qua Google Sheet hiện tại, hoặc xây thêm giao diện lọc/xuất Excel riêng theo công trình nếu cần.
2. **Kiểm tra vị trí công trình** — so khớp GPS chấm công với toạ độ công trình được giao (tránh chấm công sai địa điểm).
3. **Tự động gửi lại khi mất mạng** — hiện nếu gửi `api/checkin.js` thất bại, dữ liệu chỉ nằm trong `localStorage` máy công nhân, chưa có cơ chế tự đồng bộ lại khi có mạng trở lại.
4. **Icon/logo chính thức** — `icons/icon-192.png` và `icon-512.png` hiện là placeholder ("CC"), cần thay bằng logo TKT Cleaning thật.
