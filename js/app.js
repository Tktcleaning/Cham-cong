/*
 * Chấm Công TKT Cleaning — bản demo khung sườn.
 * Dữ liệu chấm công (kể cả ảnh chụp) lưu tạm trong localStorage của trình duyệt — CHƯA gửi lên server công ty.
 * Đăng nhập: kiểm tra thật qua Google Sheet danh sách nhân viên (xem api/login.js), có khoá theo "mã máy"
 * để một SĐT + mã NV chỉ dùng được trên 1 thiết bị — tránh chấm công hộ.
 */

const STORAGE_USER = "chamcong_user";
const STORAGE_RECORDS = "chamcong_records";
const STORAGE_PROJECT = "chamcong_current_project";
const STORAGE_DEVICE = "chamcong_device_id";

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

// Danh sách công trình mẫu — sau này thay bằng danh sách thật từ hệ thống công ty.
const PROJECTS = [
  { id: "ct01", name: "Chung cư Green Tower" },
  { id: "ct02", name: "Cao ốc văn phòng ABC" },
  { id: "ct03", name: "Nhà xưởng KCN Tân Bình" },
  { id: "ct04", name: "Trung tâm thương mại Sun Mall" },
  { id: "ct05", name: "Biệt thự khu The Garden" },
];

const view = {
  login: document.getElementById("view-login"),
  project: document.getElementById("view-project"),
  main: document.getElementById("view-main"),
  history: document.getElementById("view-history"),
};

function showView(name) {
  Object.values(view).forEach(v => v.classList.remove("active"));
  view[name].classList.add("active");
}

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

// Gửi bản ghi chấm công (kèm ảnh) lên hệ thống công ty.
// TODO: chưa có backend thật — hiện chỉ lưu localStorage. Khi có API, thay nội dung hàm này bằng fetch() POST thật.
function sendToServer(record) {
  console.log("[demo] Sẽ gửi lên server công ty:", { ...record, photo: record.photo ? "<base64 ảnh>" : null });
}

// ---------- Đăng nhập ----------
const inputPhone = document.getElementById("input-phone");
const inputEmployee = document.getElementById("input-employee");
const loginError = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");

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

    setUser({ phone, employeeId, fullName: data.fullName || "" });
    renderProjectList();
    showView("project");
  } catch (err) {
    loginError.textContent = "Không kết nối được máy chủ, vui lòng thử lại.";
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "ĐĂNG NHẬP";
  }
});

function logout() {
  clearUser();
  inputPhone.value = "";
  inputEmployee.value = "";
  showView("login");
}
document.getElementById("btn-logout").addEventListener("click", logout);
document.getElementById("btn-project-logout").addEventListener("click", logout);

// ---------- Chọn dự án ----------
const projectList = document.getElementById("project-list");
const labelProject = document.getElementById("label-project");

function renderProjectList() {
  const current = getCurrentProject();
  projectList.innerHTML = PROJECTS.map(p => `
    <button class="project-item ${current && current.id === p.id ? "selected" : ""}" data-id="${p.id}">
      🏗️ ${p.name}
    </button>`).join("");

  projectList.querySelectorAll(".project-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const project = PROJECTS.find(p => p.id === btn.dataset.id);
      setCurrentProject(project);
      enterMainView();
    });
  });
}

document.getElementById("btn-change-project").addEventListener("click", () => {
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

function enterMainView() {
  const user = getUser();
  if (!user) { showView("login"); return; }

  const project = getCurrentProject();
  if (!project) { renderProjectList(); showView("project"); return; }

  labelEmployee.textContent = user.fullName ? `${user.fullName} (${user.employeeId})` : user.employeeId;
  labelPhone.textContent = user.phone;
  labelProject.textContent = `🏗️ ${project.name}`;
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

function refreshStatus() {
  const user = getUser();
  if (!user) return;
  const status = getTodayStatus(user.phone);

  if (status === "in") {
    statusBanner.className = "status-banner status-on";
    statusText.textContent = "ĐANG TRONG CA";
    btnCheckIn.disabled = true;
    btnCheckOut.disabled = false;
  } else {
    statusBanner.className = "status-banner status-off";
    statusText.textContent = "CHƯA VÀO CA";
    btnCheckIn.disabled = false;
    btnCheckOut.disabled = true;
  }
}

function formatTime(d) {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(d) {
  return d.toLocaleDateString("vi-VN");
}

// Nén ảnh về kích thước nhỏ (tối đa 800px chiều rộng) trước khi lưu, tránh đầy localStorage.
function compressPhoto(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
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

  const record = {
    phone: user.phone,
    employeeId: user.employeeId,
    projectId: project.id,
    projectName: project.name,
    type,
    timestamp: now.toISOString(),
    lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy,
    photo: photo || null,
  };

  saveRecord(record);
  sendToServer(record);
  overlayLoading.classList.remove("active");
  refreshStatus();

  const label = type === "in" ? "VÀO CA" : "TAN CA";
  const parts = [`✅ Đã chấm công ${label} lúc ${formatTime(now)}`, `tại ${project.name}`];
  if (loc.note) parts.push(`⚠️ ${loc.note}`);
  gpsStatus.textContent = parts.join(" — ");
}

// VÀO CA / TAN CA: đều mở camera điện thoại chụp hình hiện trường trước, rồi mới lấy vị trí và lưu.
let pendingCheckType = null;

btnCheckIn.addEventListener("click", () => {
  pendingCheckType = "in";
  cameraInput.value = "";
  cameraInput.click();
});

btnCheckOut.addEventListener("click", () => {
  pendingCheckType = "out";
  cameraInput.value = "";
  cameraInput.click();
});

cameraInput.addEventListener("change", async () => {
  const file = cameraInput.files[0];
  if (!file || !pendingCheckType) return; // người dùng huỷ chụp hình

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
    return `
      <div class="history-item ${r.type === "out" ? "out" : ""}">
        <div class="row-1"><span>${typeLabel}</span><span>${formatTime(d)}</span></div>
        <div class="row-2">${formatDate(d)} · ${locLabel}</div>
        <div class="row-3">🏗️ ${r.projectName || "Không rõ công trình"}</div>
        ${photoHtml}
      </div>`;
  }).join("");
}

document.getElementById("btn-history").addEventListener("click", () => {
  renderHistory();
  showView("history");
});
document.getElementById("btn-back").addEventListener("click", () => {
  refreshStatus();
  showView("main");
});

// ---------- Khởi động ----------
(function init() {
  const user = getUser();
  if (user) {
    enterMainView();
  } else {
    showView("login");
  }
})();

// PWA: đăng ký service worker (bỏ qua lỗi nếu chạy từ file:// hoặc không hỗ trợ)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
