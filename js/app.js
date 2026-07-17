/*
 * Chấm Công TKT Company.
 * Dữ liệu chấm công (kể cả ảnh chụp) gửi thật lên Google Sheet + Vercel Blob qua api/checkin.js,
 * đồng thời giữ thêm 1 bản sao trong localStorage làm dự phòng nếu gửi server thất bại.
 * Đăng nhập: kiểm tra thật qua Google Sheet danh sách nhân viên (xem api/login.js), có khoá theo "mã máy"
 * để một SĐT + mã NV chỉ dùng được trên 1 thiết bị — tránh chấm công hộ. Danh sách công trình mỗi
 * nhân viên được thấy cũng lấy từ Sheet "PhanCong" riêng, trả về kèm lúc đăng nhập.
 */

const STORAGE_USER = "chamcong_user";
const STORAGE_RECORDS = "chamcong_records";
const STORAGE_PROJECT = "chamcong_current_project";
const STORAGE_DEVICE = "chamcong_device_id";
const STORAGE_REMEMBERED = "chamcong_remembered_login";

// "Mã máy": vì là ứng dụng web nên không lấy được ID phần cứng thật — tạo 1 mã ngẫu nhiên
// duy nhất lưu trong trình duyệt ngay lần đầu mở app, dùng để khoá 1 SĐT+mã NV vào 1 thiết bị.
function getDeviceId() {
  let id = localStorage.getItem(STORAGE_DEVICE);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(STORAGE_DEVICE, id);
  }
  return id;
}

const view = {
  inappBlocked: document.getElementById("view-inapp-blocked"),
  login: document.getElementById("view-login"),
  project: document.getElementById("view-project"),
  main: document.getElementById("view-main"),
  history: document.getElementById("view-history"),
  forgot: document.getElementById("view-forgot"),
  makeup: document.getElementById("view-makeup"),
  admin: document.getElementById("view-admin"),
};

function showView(name) {
  Object.values(view).forEach(v => v.classList.remove("active"));
  view[name].classList.add("active");
}

// Trình duyệt trong app (Zalo, Facebook/Messenger, Instagram...) chạy trên WebView riêng —
// thường không hỗ trợ đầy đủ Geolocation API, và có bộ nhớ trình duyệt (localStorage) tách biệt
// hoàn toàn với Safari/Chrome thật trên cùng điện thoại, gây lệch "Mã Máy" giữa 2 nơi tưởng là 1
// thiết bị. Không có cách nào "sửa" được giới hạn này từ phía code app — phải chặn và bắt người
// dùng tự mở lại bằng trình duyệt thật.
function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /zalo|FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(ua);
}

if (isInAppBrowser()) {
  showView("inappBlocked");
  const btnCopyLink = document.getElementById("btn-copy-link");
  const copyLinkStatus = document.getElementById("copy-link-status");
  btnCopyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copyLinkStatus.className = "copy-status";
      copyLinkStatus.textContent = "Đã sao chép link — dán vào Safari/Chrome để mở.";
    } catch (err) {
      copyLinkStatus.className = "copy-status error";
      copyLinkStatus.textContent = "Không sao chép được, vui lòng tự copy link ở thanh địa chỉ.";
    }
  });

  // Trên Android, thử mở thẳng Chrome bằng link "intent://" — yêu cầu hệ điều hành mở app khác
  // xử lý URL này thay vì WebView hiện tại. Chỉ là "cố gắng hết sức": nhiều trình duyệt trong app
  // (Zalo...) tự chặn việc điều hướng ra ngoài để giữ người dùng ở lại, nên không đảm bảo luôn
  // thành công — nếu không được, người dùng vẫn còn cách sao chép link hoặc bấm menu "⋮"/"⋯" thủ công.
  // Trên iPhone, Apple không cho phép trang web tự mở Safari bằng code (giới hạn hệ điều hành,
  // không có cách nào lách được), nên không hiện nút này.
  if (/android/i.test(navigator.userAgent || "")) {
    const btnOpenChrome = document.getElementById("btn-open-chrome");
    btnOpenChrome.style.display = "";
    btnOpenChrome.addEventListener("click", () => {
      const url = location.href.replace(/^https?:\/\//, "");
      location.href = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`;
    });
  }

  throw new Error("in-app browser blocked"); // dừng toàn bộ phần code còn lại của app (đăng nhập, GPS...)
}

// Hộp thoại thông báo riêng của app (thay cho alert() gốc trình duyệt) — cho phép tuỳ biến
// nút "Đóng" to, tiếng Việt, đúng phong cách app thay vì nút mặc định của trình duyệt.
const overlayAlert = document.getElementById("overlay-alert");
const alertMessage = document.getElementById("alert-message");
const btnAlertClose = document.getElementById("btn-alert-close");
let alertResolve = null;

function showAlert(message) {
  return new Promise(resolve => {
    alertMessage.textContent = message;
    overlayAlert.classList.add("active");
    alertResolve = resolve;
  });
}

btnAlertClose.addEventListener("click", () => {
  overlayAlert.classList.remove("active");
  if (alertResolve) {
    alertResolve();
    alertResolve = null;
  }
});

function getUser() {
  const raw = localStorage.getItem(STORAGE_USER);
  return raw ? JSON.parse(raw) : null;
}

function setUser(user) {
  localStorage.setItem(STORAGE_USER, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(STORAGE_USER);
  localStorage.removeItem(STORAGE_PROJECT);
}

// Nhớ SĐT + mã NV lần đăng nhập gần nhất (kể cả sau khi đăng xuất) để lần sau khỏi nhập lại —
// app không cần bảo mật cao nên ưu tiên tiện dụng hơn.
function rememberLogin(phone, employeeId) {
  localStorage.setItem(STORAGE_REMEMBERED, JSON.stringify({ phone, employeeId }));
}

function getRememberedLogin() {
  const raw = localStorage.getItem(STORAGE_REMEMBERED);
  return raw ? JSON.parse(raw) : null;
}

function getCurrentProject() {
  const raw = localStorage.getItem(STORAGE_PROJECT);
  return raw ? JSON.parse(raw) : null;
}

function setCurrentProject(project) {
  localStorage.setItem(STORAGE_PROJECT, JSON.stringify(project));
}

function getAllRecords() {
  const raw = localStorage.getItem(STORAGE_RECORDS);
  return raw ? JSON.parse(raw) : [];
}

function saveRecord(record) {
  const records = getAllRecords();
  records.unshift(record);
  localStorage.setItem(STORAGE_RECORDS, JSON.stringify(records));
}

function getUserRecords(phone) {
  return getAllRecords().filter(r => r.phone === phone);
}

function isValidPhone(phone) {
  return /^0\d{9}$/.test(phone);
}

// Gửi bản ghi chấm công (kèm ảnh) lên Google Sheet của công ty qua api/checkin.js.
// Bản ghi vẫn luôn được lưu trước vào localStorage (saveRecord) làm bản sao dự phòng —
// nếu gửi lên server thất bại (mất mạng...), dữ liệu không bị mất, chỉ là chưa đồng bộ.
async function sendToServer(record) {
  try {
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    return false;
  }
}

// Ghi số giờ làm (tròn 0.5h) vào đúng cột ngày + đúng dòng nhân viên-công trình trong bảng lương
// — chỉ gọi khi TAN CA, vì lúc đó mới biết tổng số giờ của ca vừa hoàn thành.
function roundToHalfHour(ms) {
  const hours = ms / 3600000;
  return Math.round(hours * 2) / 2;
}

async function sendToPayroll({ employeeId, fullName, projectName, day, hours }) {
  try {
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, fullName, projectName, day, hours }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    return false;
  }
}

// ---------- Đăng nhập ----------
const inputPhone = document.getElementById("input-phone");
const inputEmployee = document.getElementById("input-employee");
const loginError = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");

function fillRememberedLoginInputs() {
  const remembered = getRememberedLogin();
  if (remembered) {
    inputPhone.value = remembered.phone || "";
    inputEmployee.value = remembered.employeeId || "";
  }
}

btnLogin.addEventListener("click", async () => {
  const phone = inputPhone.value.trim();
  const employeeId = inputEmployee.value.trim();

  if (!isValidPhone(phone)) {
    loginError.textContent = "Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).";
    return;
  }
  if (!employeeId) {
    loginError.textContent = "Vui lòng nhập mã nhân viên.";
    return;
  }

  loginError.textContent = "";
  btnLogin.disabled = true;
  btnLogin.textContent = "ĐANG KIỂM TRA...";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, employeeId, deviceId: getDeviceId() }),
    });
    const data = await res.json();

    if (!data.ok) {
      loginError.textContent = data.message || "Đăng nhập thất bại";
      return;
    }

    setUser({ phone, employeeId, fullName: data.fullName || "", projects: data.projects || [], isAdmin: !!data.isAdmin });
    rememberLogin(phone, employeeId);
    routeAfterAuth();
    return;
  } catch (err) {
    loginError.textContent = "Không kết nối được máy chủ, vui lòng thử lại.";
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "ĐĂNG NHẬP";
  }
});

function logout() {
  clearUser();
  // Không xoá SĐT/mã NV đã nhớ — app ưu tiên tiện dụng hơn bảo mật, để lần đăng nhập sau đỡ gõ lại.
  fillRememberedLoginInputs();
  showView("login");
}
document.getElementById("btn-logout").addEventListener("click", logout);
document.getElementById("btn-project-logout").addEventListener("click", logout);

// ---------- Chọn dự án ----------
const projectList = document.getElementById("project-list");
const labelProject = document.getElementById("label-project");
const btnChangeProject = document.getElementById("btn-change-project");

function renderProjectList() {
  const user = getUser();
  const projects = (user && user.projects) || [];

  if (projects.length === 0) {
    projectList.innerHTML = '<p class="empty-text">Bạn chưa được phân công công trình nào. Vui lòng liên hệ công ty.</p>';
    return;
  }

  const current = getCurrentProject();
  projectList.innerHTML = projects.map(p => `
    <button class="project-item ${current && current.id === p.id ? "selected" : ""}" data-id="${p.id}">
      🏗️ ${p.name}
    </button>`).join("");

  projectList.querySelectorAll(".project-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const project = projects.find(p => p.id === btn.dataset.id);
      setCurrentProject(project);
      enterMainView();
    });
  });
}

btnChangeProject.addEventListener("click", () => {
  const user = getUser();
  // Đang trong ca (đã vào ca, chưa tan ca) thì không cho đổi công trình khác — tránh vào ca ở
  // công trình này nhưng lại tan ca ở công trình khác, gây sai lệch dữ liệu chấm công.
  if (user && getTodayStatus(user.phone) === "in") {
    showAlert("Bạn đang trong ca làm việc. Vui lòng bấm TAN CA ở công trình hiện tại trước khi đổi sang công trình khác.");
    return;
  }
  renderProjectList();
  showView("project");
});

// ---------- Màn hình chấm công ----------
const labelEmployee = document.getElementById("label-employee");
const labelPhone = document.getElementById("label-phone");
const statusBanner = document.getElementById("status-banner");
const statusText = document.getElementById("status-text");
const btnCheckIn = document.getElementById("btn-check-in");
const btnCheckOut = document.getElementById("btn-check-out");
const gpsStatus = document.getElementById("gps-status");
const overlayLoading = document.getElementById("overlay-loading");
const overlayText = document.getElementById("overlay-text");
const cameraInput = document.getElementById("camera-input");
const customProjectBox = document.getElementById("custom-project-box");
const inputCustomProject = document.getElementById("input-custom-project");

// ---------- Bổ sung tan ca bị quên (ca vào còn treo từ ngày trước) ----------
const makeupInfo = document.getElementById("makeup-info");
const inputMakeupTime = document.getElementById("input-makeup-time");
const btnMakeupSubmit = document.getElementById("btn-makeup-submit");
const makeupError = document.getElementById("makeup-error");
let currentStaleShift = null;

// "Công Trình Khác" là công trình chưa định tên sẵn — công nhân phải tự gõ tên công trình thật
// vào ô riêng trước khi chấm công, thay vì chọn từ danh sách có sẵn.
const OTHER_PROJECT_NAME = "Công Trình Khác";

function isOtherProject(project) {
  return !!project && (project.name || "").trim().toLowerCase() === OTHER_PROJECT_NAME.toLowerCase();
}

// Tên công trình thực tế dùng để hiển thị/lưu: nếu là "Công Trình Khác" thì lấy tên công nhân tự
// gõ (đang gõ dở trước khi vào ca, hoặc đã khoá lại từ lúc vào ca nếu đang trong ca); còn lại
// dùng đúng tên đã được công ty phân công sẵn.
function getEffectiveProjectName(project) {
  if (!isOtherProject(project)) return project.name;
  const typed = inputCustomProject.value.trim();
  return typed ? `${project.name} : ${typed}` : project.name;
}

function updateProjectLabel() {
  const project = getCurrentProject();
  if (!project) return;
  labelProject.textContent = `🏗️ ${getEffectiveProjectName(project)}`;
}

function updateCustomProjectBox() {
  const user = getUser();
  const project = getCurrentProject();
  if (!user || !isOtherProject(project)) {
    customProjectBox.classList.remove("show");
    return;
  }
  customProjectBox.classList.add("show");

  if (getTodayStatus(user.phone) === "in") {
    // Đang trong ca: khoá ô nhập, hiện đúng tên đã dùng lúc vào ca — tránh đổi tên giữa ca.
    // Bản ghi đã lưu dạng "Công Trình Khác : <tên gõ>" nên cần tách phần tiền tố ra để chỉ
    // hiện lại đúng phần tên công nhân đã gõ trong ô nhập.
    const openProject = getLastInProjectToday(user.phone);
    const savedName = openProject ? openProject.name : "";
    const prefix = `${project.name} : `;
    inputCustomProject.value = savedName.startsWith(prefix) ? savedName.slice(prefix.length) : "";
    inputCustomProject.disabled = true;
  } else {
    inputCustomProject.value = "";
    inputCustomProject.disabled = false;
  }
}

inputCustomProject.addEventListener("input", updateProjectLabel);

function enterMainView() {
  const user = getUser();
  if (!user) { showView("login"); return; }

  const project = getCurrentProject();
  if (!project) { renderProjectList(); showView("project"); return; }

  labelEmployee.textContent = user.fullName ? `${user.fullName} (${user.employeeId})` : user.employeeId;
  labelPhone.textContent = user.phone;
  refreshStatus();
  showView("main");
}

// Trạng thái ca làm hiện tại = bản ghi mới nhất trong ngày của user
function getTodayStatus(phone) {
  const today = new Date().toDateString();
  const records = getUserRecords(phone).filter(
    r => new Date(r.timestamp).toDateString() === today
  );
  if (records.length === 0) return "off";
  return records[0].type; // "in" hoặc "out", records đã unshift nên [0] là mới nhất
}

// Công trình của lần "vào ca" gần nhất trong ngày (khi đang trong ca) — dùng để khôi phục
// đúng công trình đang làm dở nếu công nhân lỡ đăng xuất rồi đăng nhập lại giữa ca.
function getLastInProjectToday(phone) {
  const today = new Date().toDateString();
  const records = getUserRecords(phone).filter(
    r => new Date(r.timestamp).toDateString() === today
  );
  if (records.length === 0 || records[0].type !== "in") return null;
  return { id: records[0].projectId, name: records[0].projectName };
}

// Bản ghi "vào ca" còn treo (chưa tan ca) từ một NGÀY TRƯỚC (không phải hôm nay) — nghĩa là công
// nhân đã quên bấm TAN CA. Trả về null nếu ca đang mở là của chính hôm nay (vẫn coi là bình thường).
function getStaleOpenShift(phone) {
  const records = getUserRecords(phone); // mới nhất ở đầu
  if (records.length === 0) return null;
  const latest = records[0];
  if (latest.type !== "in") return null;
  const today = new Date().toDateString();
  if (new Date(latest.timestamp).toDateString() === today) return null;
  return latest;
}

function showMakeupView(staleShift) {
  currentStaleShift = staleShift;
  const d = new Date(staleShift.timestamp);
  makeupInfo.textContent =
    `Bạn quên bấm TAN CA ngày ${formatDate(d)} tại ${staleShift.projectName} ` +
    `(đã vào ca lúc ${formatTime(d)}). Vui lòng nhập giờ bạn đã tan ca hôm đó để tiếp tục sử dụng app.`;
  makeupError.textContent = "";
  inputMakeupTime.value = "17:00";
  showView("makeup");
}

// Cổng điều hướng chung sau khi đã có phiên đăng nhập hợp lệ (gọi từ: đăng nhập thành công,
// khởi động app khi đã có phiên sẵn, và sau khi vừa xử lý xong tan ca bù) — luôn ưu tiên bắt xử
// lý ca quên tan ca trước, rồi mới tới các luồng bình thường khác.
function routeAfterAuth() {
  const user = getUser();
  if (!user) { showView("login"); return; }

  if (user.isAdmin) { enterAdminView(); return; }

  const staleShift = getStaleOpenShift(user.phone);
  if (staleShift) { showMakeupView(staleShift); return; }

  // Nếu vừa đăng xuất khi đang trong ca (hôm nay) rồi đăng nhập lại, khôi phục đúng công trình
  // đang làm dở thay vì bắt chọn lại — tránh vào ca 1 nơi nhưng tan ca ở nơi khác.
  if (getTodayStatus(user.phone) === "in") {
    const lastProject = getLastInProjectToday(user.phone);
    if (lastProject && lastProject.id) {
      setCurrentProject(lastProject);
      enterMainView();
      return;
    }
  }

  const project = getCurrentProject();
  if (!project) { renderProjectList(); showView("project"); return; }

  enterMainView();
}

// Thời điểm "vào ca" đang mở (chưa có "tan ca" đi kèm) trong ngày hôm nay — dùng để tính thời
// gian của ca vừa hoàn thành ngay khi bấm TAN CA.
function getOpenInTimestampToday(phone) {
  const today = new Date().toDateString();
  const records = getUserRecords(phone).filter(
    r => new Date(r.timestamp).toDateString() === today
  );
  const lastIn = records.find(r => r.type === "in"); // records mới nhất ở đầu
  return lastIn ? new Date(lastIn.timestamp) : null;
}

function formatDurationVN(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} giờ ${minutes} phút`;
}

function refreshStatus() {
  const user = getUser();
  if (!user) return;
  const status = getTodayStatus(user.phone);

  if (status === "in") {
    statusBanner.className = "status-banner status-on";
    statusText.textContent = "ĐANG TRONG CA";
    btnCheckIn.disabled = true;
    btnCheckOut.disabled = false;
    btnChangeProject.disabled = true;
  } else {
    statusBanner.className = "status-banner status-off";
    statusText.textContent = "CHƯA VÀO CA";
    btnCheckIn.disabled = false;
    btnCheckOut.disabled = true;
    btnChangeProject.disabled = false;
  }

  updateCustomProjectBox();
  updateProjectLabel();
}

function formatTime(d) {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(d) {
  return d.toLocaleDateString("vi-VN");
}

// Nén ảnh: giới hạn kích thước tối đa 400x600px (giữ tỉ lệ khung hình gốc) trước khi lưu,
// giúp giảm dung lượng lưu trữ (Vercel Blob) khi tích luỹ ảnh chấm công hàng ngày lâu dài.
function compressPhoto(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const maxWidth = 400;
        const maxHeight = 600;
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);

        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function getPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// "CriOS" chỉ xuất hiện trong user agent của Chrome khi chạy trên iOS (dùng engine WebKit của Apple,
// khác với Chrome trên Android dùng engine Blink gốc — không bị hạn chế định vị như trên iOS).
function isChromeOnIOS() {
  return /CriOS/.test(navigator.userAgent);
}

// Một số trình duyệt (vd Chrome trên iOS) đôi khi không tự gọi callback thành công/thất bại
// đúng như "timeout" khai báo trong options — treo vô thời hạn. Nên luôn bọc thêm một
// đồng hồ đếm giờ độc lập ở phía code của mình để chắc chắn luôn thoát ra được.
function withTimeout(promise, ms) {
  promise.catch(() => {}); // tránh cảnh báo "unhandled rejection" nếu promise gốc thua cuộc đua rồi mới reject
  const ourTimeout = Object.assign(new Error("Hết thời gian chờ (tự đặt)"), { code: 3 });
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(ourTimeout), ms)),
  ]);
}

// Thử định vị chính xác (GPS vệ tinh) trước; nếu bị từ chối quyền thì báo rõ luôn.
// Nếu chỉ timeout (thường gặp khi ở trong công trình/nhà che khuất tín hiệu vệ tinh,
// hoặc trình duyệt "treo" không phản hồi), thử lại lần 2 với định vị theo mạng/wifi —
// nhanh hơn dù kém chính xác hơn.
async function getLocation() {
  if (!navigator.geolocation) {
    return { lat: null, lng: null, accuracy: null, note: "Thiết bị không hỗ trợ định vị GPS" };
  }

  try {
    const pos = await withTimeout(
      getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }),
      11000
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, note: null };
  } catch (err) {
    if (err.code === 1 /* PERMISSION_DENIED */) {
      return { lat: null, lng: null, accuracy: null, note: "Chưa cấp quyền vị trí cho trình duyệt — vào Cài đặt bật lại quyền vị trí" };
    }
  }

  try {
    const pos = await withTimeout(
      getPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }),
      9000
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, note: null };
  } catch (err) {
    let note;
    if (err.code === 3 /* TIMEOUT */) {
      // Chrome trên iPhone chạy trên engine WebKit của Apple (không phải engine gốc của Chrome)
      // và hay bị treo/timeout khi lấy vị trí ngay sau khi quay lại từ app Camera — hạn chế riêng
      // của Chrome-iOS, không xảy ra với Chrome trên Android hay Safari trên iPhone.
      note = isChromeOnIOS()
        ? "Chrome trên iPhone không lấy được vị trí — vui lòng dùng Safari để chấm công"
        : "Hết thời gian chờ định vị — thử lại ở nơi thoáng hơn (gần cửa sổ/ngoài trời)";
    } else {
      note = "Không xác định được vị trí";
    }
    return { lat: null, lng: null, accuracy: null, note };
  }
}

async function finishCheck(type, photo, loc) {
  const user = getUser();
  const project = getCurrentProject();
  const now = new Date();

  // Tính thời gian ca vừa hoàn thành — phải tính TRƯỚC khi lưu bản ghi "tan ca" mới, vì cần tìm
  // bản ghi "vào ca" đang mở dựa trên các bản ghi đã có.
  let shiftMs = null;
  if (type === "out") {
    const openIn = getOpenInTimestampToday(user.phone);
    shiftMs = openIn ? (now - openIn) : 0;
  }

  // Với "Công Trình Khác", dùng đúng tên công nhân đã tự gõ (đọc trước khi refreshStatus() có
  // thể khoá/xoá lại ô nhập) thay vì tên chung chung "Công Trình Khác".
  const effectiveProjectName = getEffectiveProjectName(project);

  const record = {
    phone: user.phone,
    employeeId: user.employeeId,
    fullName: user.fullName || "",
    projectId: project.id,
    projectName: effectiveProjectName,
    type,
    timestamp: now.toISOString(),
    lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy,
    photo: photo || null,
    workedMs: shiftMs,
  };

  saveRecord(record);
  overlayText.textContent = "Đang gửi dữ liệu lên hệ thống...";
  const sent = await sendToServer(record);

  let payrollSent = true;
  if (type === "out") {
    overlayText.textContent = "Đang cập nhật bảng lương...";
    payrollSent = await sendToPayroll({
      employeeId: user.employeeId,
      fullName: user.fullName || "",
      projectName: effectiveProjectName,
      day: now.getDate(),
      hours: roundToHalfHour(shiftMs),
    });
  }

  overlayLoading.classList.remove("active");
  refreshStatus();

  const label = type === "in" ? "VÀO CA" : "TAN CA";
  const parts = [`✅ Đã chấm công ${label} lúc ${formatTime(now)}`, `tại ${effectiveProjectName}`];
  if (!sent) parts.push("⚠️ Đã lưu tạm trên máy, chưa gửi được lên hệ thống công ty (sẽ thử lại sau)");
  if (!payrollSent) parts.push("⚠️ Chưa cập nhật được bảng lương (sẽ cần kiểm tra lại thủ công)");
  if (loc.note) parts.push(`⚠️ ${loc.note}`);
  gpsStatus.textContent = parts.join(" — ");

  if (type === "out") {
    await showAlert(`Bạn đã làm trong ngày hôm nay: ${formatDurationVN(shiftMs)}.\nCảm ơn và chúc bạn một ngày tốt lành!`);
    renderProjectList();
    showView("project");
  }
}

// VÀO CA / TAN CA: đều mở camera điện thoại chụp hình hiện trường trước, rồi mới lấy vị trí và lưu.
let pendingCheckType = null;

btnCheckIn.addEventListener("click", () => {
  const project = getCurrentProject();
  if (isOtherProject(project) && !inputCustomProject.value.trim()) {
    showAlert("Vui lòng nhập tên công trình trước khi vào ca.");
    return;
  }
  pendingCheckType = "in";
  // Khoá ngay cả 2 nút lúc vừa bấm (trước khi mở Camera), không đợi cả luồng chụp ảnh+GPS xong
  // mới khoá — tránh bấm đúp trong lúc chờ mở Camera (nguyên nhân phổ biến gây lệch dữ liệu).
  btnCheckIn.disabled = true;
  btnCheckOut.disabled = true;
  cameraInput.value = "";
  cameraInput.click();
});

btnCheckOut.addEventListener("click", () => {
  pendingCheckType = "out";
  btnCheckIn.disabled = true;
  btnCheckOut.disabled = true;
  cameraInput.value = "";
  cameraInput.click();
});

// Nếu người dùng huỷ hộp thoại Camera (không chụp ảnh), phải mở khoá lại nút đúng theo trạng
// thái thật hiện tại — không phải mở khoá chung chung. Ưu tiên sự kiện "cancel" (trình duyệt
// mới); dự phòng bằng "focus" của cửa sổ cho trình duyệt cũ không hỗ trợ sự kiện này.
cameraInput.addEventListener("cancel", () => {
  pendingCheckType = null;
  refreshStatus();
});
window.addEventListener("focus", () => {
  setTimeout(() => {
    if (pendingCheckType && (!cameraInput.files || cameraInput.files.length === 0)) {
      pendingCheckType = null;
      refreshStatus();
    }
  }, 500);
});

cameraInput.addEventListener("change", async () => {
  const file = cameraInput.files[0];
  if (!file || !pendingCheckType) { refreshStatus(); return; } // người dùng huỷ chụp hình

  overlayLoading.classList.add("active");
  overlayText.textContent = "Đang xử lý ảnh và vị trí...";

  // Xin vị trí ngay lập tức, chạy song song với nén ảnh — không chờ nén ảnh xong mới xin,
  // vì để trễ dễ khiến Chrome trên iOS "treo" luôn việc lấy vị trí sau khi vừa quay lại từ app Camera.
  const [photo, loc] = await Promise.all([
    compressPhoto(file),
    getLocation(),
  ]);

  await finishCheck(pendingCheckType, photo, loc);
  pendingCheckType = null;
});

// ---------- Đồng hồ sống ----------
function tickClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent =
    now.toLocaleTimeString("vi-VN");
  document.getElementById("clock-date").textContent = formatDate(now);
}
setInterval(tickClock, 1000);
tickClock();

// ---------- Lịch sử ----------
const historyList = document.getElementById("history-list");

function renderHistory() {
  const user = getUser();
  if (!user) return;
  const records = getUserRecords(user.phone);

  if (records.length === 0) {
    historyList.innerHTML = '<p class="empty-text">Chưa có dữ liệu chấm công.</p>';
    return;
  }

  historyList.innerHTML = records.map(r => {
    const d = new Date(r.timestamp);
    const typeLabel = r.type === "in" ? "🟢 Vào ca" : "🔴 Tan ca";
    const locLabel = (r.lat && r.lng)
      ? `📍 ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`
      : "📍 Không có vị trí";
    const photoHtml = r.photo ? `<img class="photo-thumb" src="${r.photo}" alt="Ảnh công trình">` : "";
    const durationHtml = (r.type === "out" && r.workedMs != null)
      ? `<div class="row-3">🕐 Đã làm: ${formatDurationVN(r.workedMs)}</div>`
      : "";
    return `
      <div class="history-item ${r.type === "out" ? "out" : ""}">
        <div class="row-1"><span>${typeLabel}</span><span>${formatTime(d)}</span></div>
        <div class="row-2">${formatDate(d)} · ${locLabel}</div>
        <div class="row-3">🏗️ ${r.projectName || "Không rõ công trình"}</div>
        ${durationHtml}
        ${photoHtml}
      </div>`;
  }).join("");
}

document.getElementById("btn-history").addEventListener("click", () => {
  renderHistory();
  showView("history");
});
document.getElementById("btn-back").addEventListener("click", () => {
  // Nút "Xem lịch sử" giờ nằm ở màn Chọn công trình, nên quay lại đúng màn đó thay vì màn chính.
  renderProjectList();
  showView("project");
});

// ---------- Báo quên chấm công ----------
const inputForgotReason = document.getElementById("input-forgot-reason");
const inputForgotManager = document.getElementById("input-forgot-manager");
const forgotError = document.getElementById("forgot-error");
const btnForgotSubmit = document.getElementById("btn-forgot-submit");

document.getElementById("btn-forgot").addEventListener("click", () => {
  inputForgotReason.value = "";
  inputForgotManager.value = "";
  forgotError.textContent = "";
  showView("forgot");
});
document.getElementById("btn-forgot-back").addEventListener("click", () => {
  showView("main");
});

btnForgotSubmit.addEventListener("click", async () => {
  const reason = inputForgotReason.value.trim();
  const managerName = inputForgotManager.value.trim();

  if (!reason) {
    forgotError.textContent = "Vui lòng nhập lý do quên chấm công.";
    return;
  }
  if (!managerName) {
    forgotError.textContent = "Vui lòng nhập tên người quản lý trực tiếp.";
    return;
  }

  forgotError.textContent = "";
  btnForgotSubmit.disabled = true;
  btnForgotSubmit.textContent = "ĐANG GỬI...";

  const user = getUser();
  const project = getCurrentProject();

  try {
    const res = await fetch("/api/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: user.phone,
        employeeId: user.employeeId,
        fullName: user.fullName || "",
        projectName: project ? project.name : "",
        reason,
        managerName,
        timestamp: new Date().toISOString(),
      }),
    });
    const data = await res.json();

    if (!data.ok) {
      forgotError.textContent = data.message || "Gửi báo cáo thất bại, vui lòng thử lại.";
      return;
    }

    await showAlert("Đã gửi báo cáo quên chấm công tới công ty.");
    showView("main");
  } catch (err) {
    forgotError.textContent = "Không kết nối được máy chủ, vui lòng thử lại.";
  } finally {
    btnForgotSubmit.disabled = false;
    btnForgotSubmit.textContent = "GỬI BÁO CÁO";
  }
});

// ---------- Bổ sung tan ca bị quên ----------
document.getElementById("btn-makeup-logout").addEventListener("click", logout);

btnMakeupSubmit.addEventListener("click", async () => {
  const timeStr = inputMakeupTime.value;
  if (!timeStr || !currentStaleShift) {
    makeupError.textContent = "Vui lòng chọn giờ tan ca.";
    return;
  }

  const inDate = new Date(currentStaleShift.timestamp);
  const [hh, mm] = timeStr.split(":").map(Number);
  const outDate = new Date(inDate.getFullYear(), inDate.getMonth(), inDate.getDate(), hh, mm, 0);

  if (outDate <= inDate) {
    makeupError.textContent = `Giờ tan ca phải sau giờ vào ca (${formatTime(inDate)}).`;
    return;
  }

  makeupError.textContent = "";
  btnMakeupSubmit.disabled = true;
  btnMakeupSubmit.textContent = "ĐANG GỬI...";

  const user = getUser();
  const staleShift = currentStaleShift;
  const shiftMs = outDate - inDate;
  const note = "Bổ sung - quên tan ca";

  const record = {
    phone: user.phone,
    employeeId: user.employeeId,
    fullName: user.fullName || "",
    projectId: staleShift.projectId,
    projectName: staleShift.projectName,
    type: "out",
    timestamp: outDate.toISOString(),
    lat: null, lng: null, accuracy: null,
    photo: null,
    workedMs: shiftMs,
    note,
  };

  saveRecord(record);
  const sent = await sendToServer(record);
  const payrollSent = await sendToPayroll({
    employeeId: user.employeeId,
    fullName: user.fullName || "",
    projectName: staleShift.projectName,
    day: inDate.getDate(), // tính vào đúng ngày gốc đã vào ca, không phải hôm nay
    hours: roundToHalfHour(shiftMs),
  });

  btnMakeupSubmit.disabled = false;
  btnMakeupSubmit.textContent = "XÁC NHẬN TAN CA BÙ";
  currentStaleShift = null;

  if (!sent || !payrollSent) {
    await showAlert("Đã lưu tạm trên máy, nhưng chưa gửi được đầy đủ lên hệ thống công ty. Công ty sẽ cần kiểm tra lại thủ công.");
  } else {
    await showAlert(`Đã ghi nhận tan ca bù lúc ${formatTime(outDate)} (${formatDurationVN(shiftMs)}). Cảm ơn bạn!`);
  }

  routeAfterAuth();
});

// ---------- Trang Quản Trị (Admin) ----------
// Đăng nhập bằng SĐT+mã NV đặc biệt (xem api/login.js) sẽ vào thẳng đây thay vì màn chấm công
// bình thường. Không dùng chung cơ chế chấm công/lịch sử — chỉ để công ty xem/sửa danh sách nhân
// viên và tải dữ liệu chấm công, không cần mở Google Sheet thủ công.
const employeeListEl = document.getElementById("employee-list");
const btnAddEmployee = document.getElementById("btn-add-employee");
const btnExportPayroll = document.getElementById("btn-export-payroll");
const inputEmpSearch = document.getElementById("input-emp-search");
const overlayEmployeeForm = document.getElementById("overlay-employee-form");
const employeeFormTitle = document.getElementById("employee-form-title");
const inputEmpName = document.getElementById("input-emp-name");
const inputEmpPhone = document.getElementById("input-emp-phone");
const inputEmpCode = document.getElementById("input-emp-code");
const employeeFormError = document.getElementById("employee-form-error");
const btnEmpSave = document.getElementById("btn-emp-save");
const btnEmpCancel = document.getElementById("btn-emp-cancel");
let editingEmployeeRow = null; // null = đang thêm mới, có số = đang sửa đúng dòng đó trong Sheet
let allEmployees = []; // toàn bộ ~600 nhân viên tải 1 lần, lọc theo tên ngay trên trình duyệt

document.getElementById("btn-admin-logout").addEventListener("click", logout);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Bỏ dấu tiếng Việt để tìm kiếm không cần gõ đúng dấu (VD "trang" cũng tìm ra "Trang", "Tráng"...).
function normalizeVN(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function enterAdminView() {
  showView("admin");
  loadEmployeeList();
}

async function loadEmployeeList() {
  employeeListEl.innerHTML = "<p class='empty-text'>Đang tải...</p>";
  try {
    const res = await fetch(`/api/admin-employees?deviceId=${encodeURIComponent(getDeviceId())}`);
    const data = await res.json();
    if (!data.ok) {
      allEmployees = [];
      employeeListEl.innerHTML = `<p class="empty-text">${escapeHtml(data.message || "Không tải được danh sách")}</p>`;
      return;
    }
    allEmployees = data.employees;
    applySearchFilter();
  } catch (err) {
    allEmployees = [];
    employeeListEl.innerHTML = "<p class='empty-text'>Lỗi kết nối máy chủ.</p>";
  }
}

// Danh sách gần 600 nhân viên — không hiện hết cùng lúc, bắt buộc gõ tên mới hiện kết quả.
function applySearchFilter() {
  const term = normalizeVN(inputEmpSearch.value.trim());
  if (!term) {
    employeeListEl.innerHTML = "<p class='empty-text'>Nhập họ tên để tìm nhân viên.</p>";
    return;
  }
  const filtered = allEmployees.filter(e => normalizeVN(e.fullName).includes(term));
  renderEmployeeList(filtered);
}

inputEmpSearch.addEventListener("input", applySearchFilter);

function renderEmployeeList(employees) {
  if (!employees.length) {
    employeeListEl.innerHTML = "<p class='empty-text'>Không tìm thấy nhân viên nào.</p>";
    return;
  }
  employeeListEl.innerHTML = employees.map(e => `
    <div class="employee-item">
      <div class="employee-info">
        <div class="employee-name">${escapeHtml(e.fullName)}</div>
        <div class="employee-meta">SĐT: ${escapeHtml(e.phone)} · Mã NV: ${escapeHtml(e.employeeId)}</div>
        <div class="employee-device">${e.deviceId ? "🔒 Đã khoá máy" : "🔓 Chưa khoá máy"}</div>
        <div class="employee-projects">
          <div class="employee-projects-title">Công trình đang làm:</div>
          ${e.projects.length ? e.projects.map(p => `
            <div class="project-row">
              <span>${escapeHtml(p.projectName)}</span>
              <button class="btn-project-delete" data-row="${p.row}" data-name="${escapeHtml(p.projectName)}">Xoá</button>
            </div>
          `).join("") : '<div class="project-row-empty">Chưa được phân công công trình nào</div>'}
        </div>
      </div>
      <div class="employee-actions">
        <button class="btn-emp-edit" data-row="${e.row}" data-name="${escapeHtml(e.fullName)}" data-phone="${escapeHtml(e.phone)}" data-code="${escapeHtml(e.employeeId)}">Sửa</button>
        <button class="btn-emp-reset" data-row="${e.row}" ${e.deviceId ? "" : "disabled"}>Reset máy</button>
        <button class="btn-emp-delete" data-row="${e.row}" data-name="${escapeHtml(e.fullName)}">Xoá</button>
      </div>
    </div>
  `).join("");
}

employeeListEl.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".btn-emp-edit");
  const resetBtn = e.target.closest(".btn-emp-reset");
  const deleteBtn = e.target.closest(".btn-emp-delete");
  const projectDeleteBtn = e.target.closest(".btn-project-delete");

  if (editBtn) {
    editingEmployeeRow = Number(editBtn.dataset.row);
    employeeFormTitle.textContent = "Sửa nhân viên";
    inputEmpName.value = editBtn.dataset.name;
    inputEmpPhone.value = editBtn.dataset.phone;
    inputEmpCode.value = editBtn.dataset.code;
    employeeFormError.textContent = "";
    overlayEmployeeForm.classList.add("active");
    return;
  }

  if (resetBtn) {
    const row = Number(resetBtn.dataset.row);
    resetBtn.disabled = true;
    resetBtn.textContent = "Đang xử lý...";
    try {
      const res = await fetch("/api/admin-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetDevice", row, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (!data.ok) await showAlert(data.message || "Không thực hiện được");
    } catch (err) {
      await showAlert("Lỗi kết nối máy chủ.");
    }
    await loadEmployeeList();
    return;
  }

  if (deleteBtn) {
    const row = Number(deleteBtn.dataset.row);
    const name = deleteBtn.dataset.name;
    if (!confirm(`Xoá nhân viên "${name}" khỏi danh sách?`)) return;
    try {
      const res = await fetch("/api/admin-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", row, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (!data.ok) await showAlert(data.message || "Không xoá được");
    } catch (err) {
      await showAlert("Lỗi kết nối máy chủ.");
    }
    await loadEmployeeList();
    return;
  }

  if (projectDeleteBtn) {
    const row = Number(projectDeleteBtn.dataset.row);
    const name = projectDeleteBtn.dataset.name;
    if (!confirm(`Xoá phân công công trình "${name}" khỏi nhân viên này?`)) return;
    try {
      const res = await fetch("/api/admin-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteProjectAssignment", row, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (!data.ok) await showAlert(data.message || "Không xoá được");
    } catch (err) {
      await showAlert("Lỗi kết nối máy chủ.");
    }
    await loadEmployeeList();
  }
});

btnAddEmployee.addEventListener("click", () => {
  editingEmployeeRow = null;
  employeeFormTitle.textContent = "Thêm nhân viên";
  inputEmpName.value = "";
  inputEmpPhone.value = "";
  inputEmpCode.value = "";
  employeeFormError.textContent = "";
  overlayEmployeeForm.classList.add("active");
});

btnEmpCancel.addEventListener("click", () => {
  overlayEmployeeForm.classList.remove("active");
});

btnEmpSave.addEventListener("click", async () => {
  const fullName = inputEmpName.value.trim();
  const phone = inputEmpPhone.value.trim();
  const employeeId = inputEmpCode.value.trim();

  if (!fullName || !employeeId) {
    employeeFormError.textContent = "Vui lòng nhập đầy đủ thông tin.";
    return;
  }
  if (!isValidPhone(phone)) {
    employeeFormError.textContent = "Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).";
    return;
  }

  employeeFormError.textContent = "";
  btnEmpSave.disabled = true;
  btnEmpSave.textContent = "Đang lưu...";
  try {
    const body = editingEmployeeRow
      ? { action: "edit", row: editingEmployeeRow, fullName, phone, employeeId, deviceId: getDeviceId() }
      : { action: "add", fullName, phone, employeeId, deviceId: getDeviceId() };
    const res = await fetch("/api/admin-employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      employeeFormError.textContent = data.message || "Không lưu được";
      return;
    }
    overlayEmployeeForm.classList.remove("active");
    await loadEmployeeList();
  } catch (err) {
    employeeFormError.textContent = "Không kết nối được máy chủ.";
  } finally {
    btnEmpSave.disabled = false;
    btnEmpSave.textContent = "LƯU";
  }
});

btnExportPayroll.addEventListener("click", () => {
  window.location.href = `/api/admin-export-payroll?deviceId=${encodeURIComponent(getDeviceId())}`;
});

// ---------- Khởi động ----------
(function init() {
  const user = getUser();
  if (user) {
    routeAfterAuth();
  } else {
    fillRememberedLoginInputs();
    showView("login");
  }
})();

// PWA: đăng ký service worker (bỏ qua lỗi nếu chạy từ file:// hoặc không hỗ trợ)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});

  // Khi service worker mới (bản deploy mới hơn) giành quyền điều khiển trang, tự tải lại trang
  // ngay để hiển thị bản mới nhất — công nhân không cần biết cách xoá cache trình duyệt.
  let refreshingAfterUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    location.reload();
  });
}
