# Chấm Công TKT Company

Ứng dụng chấm công cho công nhân vệ sinh công trình — đăng nhập bằng số điện thoại, ghi nhận giờ vào/ra kèm định vị GPS. Chạy được cả trên trình duyệt máy tính và điện thoại (PWA — có thể "Thêm vào Màn hình chính" trên Android/iOS).

**Hộp thoại thông báo riêng của app:** toàn bộ `alert()` gốc của trình duyệt (không tuỳ biến được nút) đã thay bằng hộp thoại tự viết (`showAlert()` trong `js/app.js`, HTML ở `#overlay-alert`) — nút "Đóng" cỡ lớn, tiếng Việt, đúng phong cách app.

## Trạng thái hiện tại

- **Đăng nhập:** kiểm tra thật qua Google Sheet danh sách nhân viên (không phải OTP SMS) — xem mục "Đăng nhập & khoá thiết bị" bên dưới.
- **Dữ liệu chấm công (ảnh, giờ, GPS):** gửi thật lên Google Sheet + Vercel Blob (ảnh) của công ty qua `api/checkin.js` — xem mục "Đồng bộ dữ liệu chấm công" bên dưới. Vẫn giữ thêm 1 bản sao trong `localStorage` làm dự phòng nếu gửi lên server thất bại (mất mạng...).
- **Danh sách công trình mỗi nhân viên:** lấy thật từ Sheet "PhanCong" riêng, trả về kèm lúc đăng nhập — xem mục "Phân công công trình" bên dưới.
- **Định vị:** dùng `navigator.geolocation` của trình duyệt, cần HTTPS (hoặc localhost) và người dùng cho phép quyền vị trí.

## Tự động cập nhật bản mới, không cần xoá cache

Trước đây `sw.js` (Service Worker cho PWA) dùng chiến lược "cache trước" (cache-first) — sau khi deploy bản mới, trình duyệt vẫn trung thành phục vụ bản cũ đã lưu cho tới khi người dùng tự xoá lịch sử/cache, điều mà công nhân lớn tuổi không biết cách làm. Đã sửa với 3 lớp phòng thủ:
1. `sw.js` đổi sang chiến lược "mạng trước" (network-first) — luôn lấy bản mới nhất từ server khi có mạng, chỉ dùng bản cache khi mất mạng.
2. `sw.js` gọi `self.skipWaiting()` + `self.clients.claim()` để service worker mới giành quyền điều khiển ngay, không cần đóng hết các tab đang mở.
3. `js/app.js` lắng nghe sự kiện `controllerchange` và tự `location.reload()` khi service worker mới vừa giành quyền — trang tự làm mới, không cần người dùng thao tác gì.

Ngoài ra `vercel.json` đặt header `Cache-Control: no-cache, must-revalidate` cho `index.html`, `sw.js`, `manifest.json`, `css/style.css`, `js/app.js` — chặn luôn việc trình duyệt tự cache các file này ở tầng HTTP (độc lập với Service Worker), một lớp phòng thủ nữa để đảm bảo luôn kiểm tra bản mới nhất.

## Thương hiệu

Logo (`icons/logo.png`, dùng luôn cho icon PWA `icon-192.png`/`icon-512.png`) lấy từ file gốc `Logo-TKT-Company-144x144.png` của công ty — đây là bản độ phân giải cao nhất hiện có với đúng mẫu logo "TKT Company" toàn vàng, nên các icon 192/512px được phóng to từ đây (không có bản gốc lớn hơn). Tông màu chủ đạo của app lấy đúng màu vàng logo (`#d1ac2a`, biến CSS `--gold` trong `css/style.css`) thay cho tông xanh lá trước đây; nút TAN CA vẫn giữ màu đỏ (không đổi) vì đó là màu chức năng phân biệt vào ca/tan ca, không phải màu thương hiệu.

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

**Nhớ SĐT/mã NV kể cả sau khi đăng xuất:** app ưu tiên tiện dụng hơn bảo mật (dùng nội bộ công ty, không phải app ngân hàng) — bấm đăng xuất (🚪) chỉ kết thúc phiên đăng nhập hiện tại, KHÔNG xoá ô SĐT/mã NV đã nhập lần gần nhất. Lần đăng nhập sau sẽ tự điền sẵn 2 ô này, chỉ cần bấm ĐĂNG NHẬP lại (lưu riêng trong `localStorage`, tách biệt với phiên đăng nhập đang hoạt động).

**Biến môi trường cần cấu hình trên Vercel** (Project Settings → Environment Variables — không commit vào git):
- `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` — **toàn bộ file JSON key** của service account, encode base64 thành 1 chuỗi. Cách lấy (PowerShell, thay đường dẫn file cho đúng):
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\ten-file-key.json")) | Set-Clipboard
  ```
  Lệnh trên copy thẳng kết quả vào clipboard — chỉ cần dán (Ctrl+V) vào ô giá trị trên Vercel, không cần chỉnh sửa gì. Cách này tránh việc copy-paste tay chuỗi `private_key` nhiều dòng dễ bị lệch ký tự.
- `GOOGLE_SHEET_ID` — lấy từ URL của Google Sheet, đoạn giữa `/d/` và `/edit`.

Nhớ chia sẻ (Share) Google Sheet cho đúng `client_email` trong file JSON key (dạng `...@...iam.gserviceaccount.com`) với quyền **Editor**, nếu không hàm sẽ báo lỗi không đọc/ghi được.

## Phân công công trình

Mỗi nhân viên chỉ thấy đúng các công trình được phân công cho mình (không phải danh sách chung cho tất cả). Dữ liệu lấy từ tab **`Phancong`** — thêm ngay trong cùng file Sheet "Danh sách nhân viên" (gộp chung cho 1 người dễ thao tác, thay vì tách file riêng như dự tính ban đầu), trả về kèm luôn trong response của `api/login.js` — không cần gọi thêm API riêng, không cần thêm biến môi trường/share gì mới.

**Cấu trúc tab `Phancong`** (dòng 1 là tiêu đề — mỗi dòng là 1 cặp nhân viên–công trình, 1 nhân viên có thể có nhiều dòng nếu làm nhiều công trình; cột Họ Tên chỉ để dễ nhìn khi sửa Sheet, code không dùng tới):

| Họ Tên | Mã Nhân Viên | Mã Công Trình | Tên Công Trình |
|---|---|---|---|
| Vũ Trường Sơn | VP001 | CT01 | Chung cư Green Tower |
| Vũ Trường Sơn | VP001 | CT02 | Cao ốc văn phòng ABC |

Nếu nhân viên chưa có dòng nào trong tab này, app sẽ báo "Bạn chưa được phân công công trình nào" ở màn hình chọn công trình thay vì crash hay hiện danh sách rỗng khó hiểu.

**Lưu ý dữ liệu:** Mã Công Trình phải **duy nhất cho mỗi công trình** — nếu 2 công trình khác tên nhưng lỡ dùng chung 1 mã, app sẽ không phân biệt được (cả 2 cùng bị đánh dấu "đã chọn", và bấm vào cái nào cũng chỉ ghi nhận đúng 1 cái đầu tiên khớp mã). Đây là lỗi dữ liệu, không phải lỗi code — cần rà soát để đảm bảo mỗi Mã Công Trình chỉ ứng với đúng 1 Tên Công Trình.

**Công trình chưa định tên ("Công Trình Khác"):** nếu 1 dòng trong `Phancong` có Tên Công Trình đúng bằng chữ **"Công Trình Khác"** (không phân biệt hoa/thường), khi nhân viên chọn công trình này ở màn chấm công sẽ hiện thêm ô nhập **"Tên Công Trình"** (ngay dưới đồng hồ giờ/ngày) để tự gõ tên công trình thật đang làm hôm đó — bắt buộc phải nhập mới bấm VÀO CA được. Tên hiệu lực lưu vào toàn bộ dữ liệu (Sheet, lịch sử, huy hiệu công trình) có dạng **`Công Trình Khác : <tên đã gõ>`** — giữ nguyên chữ "Công Trình Khác" làm tiền tố, không thay thế hẳn. Ô nhập bị khoá lại (không sửa được) trong suốt ca làm để tránh đổi tên giữa ca, tự mở lại sau khi tan ca. Xem `isOtherProject()` / `getEffectiveProjectName()` trong `js/app.js`.

## Tính giờ làm mỗi ca

Khi bấm **TAN CA**, app tự tính thời gian của **ca vừa hoàn thành** (từ lần VÀO CA gần nhất tới lúc TAN CA này) — dùng chung 1 giá trị cho cả 2 nơi để khớp nhau:
- Lưu kèm vào bản ghi lịch sử (`workedMs`, chỉ tính cho local `localStorage`, **không gửi lên Google Sheet**), hiện ở màn "Xem lịch sử" tại đúng dòng Tan ca đó (`🕐 Đã làm: X giờ Y phút`).
- Hiện trong hộp thoại thông báo ngay sau khi tan ca ("Bạn đã làm trong ngày hôm nay: X giờ Y phút. Cảm ơn và chúc bạn một ngày tốt lành!"), sau đó tự chuyển về màn hình chọn công trình.

**Lưu ý:** đây là thời gian của RIÊNG ca vừa xong, không phải tổng cộng dồn nếu trong ngày có nhiều ca vào-ra (bản đầu tiên từng cộng dồn cả ngày, gây lệch số với Lịch sử khi test nhiều ca liên tiếp — đã bỏ). Tính từ dữ liệu `localStorage` trên máy, không phải từ Sheet — nếu công nhân đổi thiết bị giữa ca, thời gian hiển thị sẽ không tính được đúng (không tìm thấy bản ghi VÀO CA tương ứng trên thiết bị mới).

## Đồng bộ dữ liệu chấm công

Mỗi lần bấm **VÀO CA** hoặc **TAN CA** là một lần gửi riêng biệt lên `api/checkin.js` — tức 1 ca làm ra 2 dòng dữ liệu (1 dòng vào, 1 dòng ra), không gộp chung.

**Khoá công trình khi đang trong ca:** sau khi VÀO CA, nút "Đổi dự án" bị vô hiệu hoá cho tới khi bấm TAN CA — tránh trường hợp vào ca ở công trình này nhưng tan ca ở công trình khác (đã từng xảy ra ở bản trước, gây sai lệch dữ liệu). Nếu công nhân lỡ đăng xuất khi đang trong ca rồi đăng nhập lại, app tự khôi phục đúng công trình đang làm dở (đọc từ bản ghi VÀO CA gần nhất trong ngày) thay vì bắt chọn lại.

**Ảnh chụp không lưu trực tiếp trong Sheet** (mỗi ô Sheet giới hạn ~50.000 ký tự, ảnh nén xong ở dạng base64 vẫn thường vượt mức đó), và **cũng không lưu ở Google Drive** — service account của Google không có dung lượng lưu trữ riêng trên Drive cá nhân/gmail thường (chỉ tài khoản Google Workspace trả phí mới dùng được Shared Drive để né giới hạn này). Thay vào đó: ảnh được **upload lên Vercel Blob** (dịch vụ lưu file của chính Vercel, không dính giới hạn của Google), Sheet chỉ lưu link ảnh đó — link ở chế độ **public** (chuỗi ngẫu nhiên dài, không đoán được nếu không có link, nhưng ai có link đều xem được, giống hệt cách link Google Drive hoạt động).

**File Sheet riêng cho chấm công** (khác với file "Danh sách nhân viên" dùng cho đăng nhập — tách riêng để dễ quản lý). Tên file gợi ý: `Ghi_nhan_cham_cong`, tab tên `ChamCong`, dòng 1 là tiêu đề:

| Thời Gian | Số Điện Thoại | Mã Nhân Viên | Họ Tên | Loại | Dự Án | Vĩ Độ | Kinh Độ | Link Ảnh |
|---|---|---|---|---|---|---|---|---|

**Biến môi trường thêm** (ngoài 2 biến ở mục đăng nhập):
- `GOOGLE_ATTENDANCE_SHEET_ID` — ID của file Sheet chấm công riêng này (khác `GOOGLE_SHEET_ID` là file danh sách nhân viên), lấy từ URL Sheet giữa `/d/` và `/edit`.
- `BLOB_READ_WRITE_TOKEN` — tự động có sẵn khi tạo Blob store qua `vercel blob create-store` và liên kết với project, không cần tự thêm tay.

Nhớ **share file Sheet chấm công này** cho đúng `client_email` của service account (quyền Editor) — dùng chung 1 service account với phần đăng nhập, không cần tạo thêm.

Nếu gửi lên server thất bại (ảnh vẫn lưu tạm trong `localStorage` máy công nhân), app sẽ báo "Đã lưu tạm trên máy, chưa gửi được lên hệ thống công ty" — hiện chưa có cơ chế tự động gửi lại, cần làm thêm nếu cần độ tin cậy cao hơn.

## Báo quên chấm công

Nút **QUÊN CHẤM CÔNG** cạnh nút Xem lịch sử ở màn hình chính — dùng khi công nhân quên bấm vào ca/tan ca (không cần chụp ảnh hay GPS, chỉ là báo cáo bằng chữ để công ty đối chiếu). Nhập lý do quên + tên quản lý trực tiếp, gửi qua `api/forgot.js` vào tab **`QuenChamCong`** (cùng file Sheet chấm công `Ghi_nhan_cham_cong`, tự tạo thêm — không dùng chung tab `ChamCong` vì đây là báo cáo tự khai, không phải dữ liệu chấm công đã xác minh GPS).

**Cấu trúc tab `QuenChamCong`** (dòng 1 là tiêu đề, không cần biến môi trường mới — dùng chung `GOOGLE_ATTENDANCE_SHEET_ID`):

| Thời Gian Báo Cáo | Số Điện Thoại | Mã Nhân Viên | Họ Tên | Dự Án | Lý Do Quên | Người Quản Lý |
|---|---|---|---|---|---|---|

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
