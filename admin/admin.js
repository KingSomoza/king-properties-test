/* ============================================================
   لوحة التحكم — المنطق الرئيسي
   كل نداء للخادم يمر عبر apiCall(action, payload) المعرّفة في session.js
   انظر backend/Code.gs لمطابقة أسماء الحقول والإجراءات (actions).
   ============================================================ */

const session = requireSession();
let currentUser = session;
let state = {
  properties: [],
  requests: [],
  users: [],
};

/* ---------------- topbar + صلاحيات ---------------- */
function initUserChrome() {
  document.getElementById("topUserName").textContent = currentUser.username;
  document.getElementById("topUserRole").textContent =
    currentUser.role === "full_access" ? "مدير رئيسي" : "مشرف";
  document.getElementById("topUserAvatar").textContent = currentUser.username
    .charAt(0)
    .toUpperCase();

  const perms = currentUser.permissions || [];
  const canManageUsers =
    currentUser.role === "full_access" || perms.includes("manage_users");
  if (!canManageUsers) {
    document.getElementById("navUsers").style.display = "none";
  }
}

/* ---------------- التنقل بين الصفحات ---------------- */
const titles = {
  home: "الرئيسية",
  properties: "إدارة العقارات",
  requests: "طلبات الإضافة",
  stats: "الإحصائيات",
  users: "إدارة المستخدمين",
  settings: "الإعدادات",
};

document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.view));
});

function switchView(name) {
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.toggle("active", n.dataset.view === name));
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document.getElementById("viewTitle").textContent = titles[name];
  document.getElementById("sidebar").classList.remove("open");

  if (name === "properties" && state.properties.length === 0) loadProperties();
  if (name === "requests" && state.requests.length === 0) loadRequests();
  if (name === "users" && state.users.length === 0) loadUsers();
  if (name === "stats") loadStatsCharts();
}

document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});
document.getElementById("logoutBtn").addEventListener("click", logout);

/* ---------------- Toast ---------------- */
function toast(msg, type = "") {
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------- Modal helpers ---------------- */
const modalOverlay = document.getElementById("modalOverlay");
document.getElementById("modalClose").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
function openModal(title, bodyHtml, footHtml) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  document.getElementById("modalFoot").innerHTML = footHtml;
  modalOverlay.classList.add("show");
}
function closeModal() {
  modalOverlay.classList.remove("show");
}

/* ============================================================
   الرئيسية — بطاقات الإحصائيات + آخر العقارات/الطلبات
   ============================================================ */
async function loadHome() {
  try {
    const res = await apiCall("getStats", { period: "month" });
    if (!res || !res.ok) return;
    renderStatCards(res.stats);
    if (typeof renderHomeCharts === "function") renderHomeCharts(res.stats);
    renderRecentTable(
      "recentPropertiesBody",
      res.stats.recentProperties || [],
      (p) => `${p.title} — ${p.governorate || ""}`
    );
    renderRecentTable(
      "recentRequestsBody",
      res.stats.recentRequests || [],
      (r) => `${r.fullName} — ${r.propertyType || ""}`
    );
    const pending = (res.stats.recentRequests || []).filter(
      (r) => r.status === "قيد المراجعة"
    ).length;
    const badge = document.getElementById("requestsBadge");
    if (res.stats.pendingRequestsCount) {
      badge.style.display = "inline-block";
      badge.textContent = res.stats.pendingRequestsCount;
    }
  } catch (e) {
    toast("تعذّر تحميل الإحصائيات", "error");
  }
}

function renderStatCards(stats = {}) {
  const cards = [
    { icon: "fa-building", label: "إجمالي العقارات", value: stats.totalProperties ?? "—" },
    { icon: "fa-inbox", label: "إجمالي الطلبات", value: stats.totalRequests ?? "—" },
    { icon: "fa-users", label: "إجمالي المستخدمين", value: stats.totalUsers ?? "—" },
    { icon: "fa-eye", label: "إجمالي الزوار", value: stats.totalVisitors ?? "—" },
  ];
  document.getElementById("statsGrid").innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card framed">
      <div class="top">
        <div class="icon"><i class="fa-solid ${c.icon}"></i></div>
      </div>
      <p class="value">${c.value}</p>
      <p class="label">${c.label}</p>
    </div>`
    )
    .join("");
}

function renderRecentTable(bodyId, rows, formatter) {
  const body = document.getElementById(bodyId);
  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty-state">لا توجد بيانات بعد</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .slice(0, 5)
    .map((r) => `<tr><td>${formatter(r)}</td></tr>`)
    .join("");
}

/* ============================================================
   إدارة العقارات
   ============================================================ */
async function loadProperties() {
  try {
    const res = await apiCall("getProperties", {});
    if (!res || !res.ok) return toast("تعذّر تحميل العقارات", "error");
    state.properties = res.properties || [];
    populateTypeFilter();
    renderProperties();
  } catch (e) {
    toast("تعذّر الاتصال بالخادم", "error");
  }
}

function populateTypeFilter() {
  const types = [...new Set(state.properties.map((p) => p.type).filter(Boolean))];
  const sel = document.getElementById("propFilterType");
  sel.innerHTML =
    `<option value="">كل الأنواع</option>` +
    types.map((t) => `<option value="${t}">${t}</option>`).join("");
}

function renderProperties() {
  const search = document.getElementById("propSearch").value.trim().toLowerCase();
  const type = document.getElementById("propFilterType").value;
  const status = document.getElementById("propFilterStatus").value;

  const rows = state.properties.filter((p) => {
    if (type && p.type !== type) return false;
    if (status && p.status !== status) return false;
    if (search) {
      const hay = `${p.title} ${p.id} ${p.ownerPhone}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const body = document.getElementById("propertiesBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-building-circle-xmark"></i>لا توجد عقارات مطابقة</div></td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td>${p.id}</td>
      <td>${p.title || "—"}</td>
      <td>${p.type || "—"}</td>
      <td>${p.governorate || "—"}</td>
      <td>${p.price ? Number(p.price).toLocaleString("ar") : "—"}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${p.ownerName || "—"}</td>
      <td>${p.addDate || "—"}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-icon btn-sm" onclick="editProperty('${p.id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-icon btn-sm btn-danger-outline" onclick="deleteProperty('${p.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}
function statusBadge(status) {
  const map = {
    "نشط": "badge-success",
    "غير نشط": "badge-neutral",
    "مباع": "badge-danger",
    "مؤجر": "badge-warning",
  };
  return `<span class="badge ${map[status] || "badge-neutral"}">${status || "—"}</span>`;
}

["propSearch", "propFilterType", "propFilterStatus"].forEach((id) =>
  document.getElementById(id).addEventListener("input", renderProperties)
);

function propertyFormHtml(p = {}) {
  return `
  <div class="form-grid">
    <div class="form-field full">
      <label>عنوان العقار</label>
      <input id="f_title" value="${p.title || ""}">
    </div>
    <div class="form-field">
      <label>النوع</label>
      <input id="f_type" value="${p.type || ""}" placeholder="شقة / فيلا / محل...">
    </div>
    <div class="form-field">
      <label>المحافظة</label>
      <input id="f_governorate" value="${p.governorate || ""}">
    </div>
    <div class="form-field">
      <label>السعر</label>
      <input id="f_price" type="number" value="${p.price || ""}">
    </div>
    <div class="form-field">
      <label>الحالة</label>
      <select id="f_status">
        ${["نشط", "غير نشط", "مباع", "مؤجر"]
          .map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`)
          .join("")}
      </select>
    </div>
    <div class="form-field full"><hr style="border:none;border-top:1px solid var(--line); margin:2px 0 8px;"></div>
    <div class="form-field">
      <label>اسم المالك / المكتب</label>
      <input id="f_ownerName" value="${p.ownerName || ""}">
    </div>
    <div class="form-field">
      <label>هاتف المالك</label>
      <input id="f_ownerPhone" value="${p.ownerPhone || ""}">
    </div>
    <div class="form-field">
      <label>نوع المالك</label>
      <select id="f_ownerType">
        ${["مالك", "مكتب عقاري", "دلال"]
          .map((s) => `<option ${p.ownerType === s ? "selected" : ""}>${s}</option>`)
          .join("")}
      </select>
    </div>
    <div class="form-field">
      <label>نسبة العمولة (%)</label>
      <input id="f_commission" type="number" value="${p.commission || ""}">
    </div>
    <div class="form-field full">
      <label>ملاحظات</label>
      <textarea id="f_notes">${p.notes || ""}</textarea>
    </div>
  </div>`;
}

function readPropertyForm() {
  return {
    title: val("f_title"),
    type: val("f_type"),
    governorate: val("f_governorate"),
    price: val("f_price"),
    status: val("f_status"),
    ownerName: val("f_ownerName"),
    ownerPhone: val("f_ownerPhone"),
    ownerType: val("f_ownerType"),
    commission: val("f_commission"),
    notes: val("f_notes"),
  };
}
function val(id) {
  return document.getElementById(id).value.trim();
}

document.getElementById("addPropertyBtn").addEventListener("click", () => {
  openModal(
    "إضافة عقار جديد",
    propertyFormHtml(),
    `<button class="btn" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" onclick="submitNewProperty()">حفظ العقار</button>`
  );
});
async function submitNewProperty() {
  const property = readPropertyForm();
  if (!property.title) return toast("العنوان مطلوب", "error");
  const res = await apiCall("addProperty", { property });
  if (res && res.ok) {
    toast("تمت إضافة العقار", "success");
    closeModal();
    loadProperties();
  } else {
    toast((res && res.message) || "تعذّرت الإضافة", "error");
  }
}

function editProperty(id) {
  const p = state.properties.find((x) => x.id === id);
  if (!p) return;
  openModal(
    "تعديل العقار",
    propertyFormHtml(p),
    `<button class="btn" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" onclick="submitEditProperty('${id}')">حفظ التعديلات</button>`
  );
}
async function submitEditProperty(id) {
  const property = readPropertyForm();
  const res = await apiCall("updateProperty", { id, property });
  if (res && res.ok) {
    toast("تم حفظ التعديلات", "success");
    closeModal();
    loadProperties();
  } else {
    toast((res && res.message) || "تعذّر الحفظ", "error");
  }
}

async function deleteProperty(id) {
  if (!confirm("هل أنت متأكد من حذف هذا العقار؟ لا يمكن التراجع عن هذا الإجراء.")) return;
  const res = await apiCall("deleteProperty", { id });
  if (res && res.ok) {
    toast("تم حذف العقار", "success");
    loadProperties();
  } else {
    toast((res && res.message) || "تعذّر الحذف", "error");
  }
}

/* ============================================================
   إدارة الطلبات
   ============================================================ */
async function loadRequests() {
  try {
    const res = await apiCall("getRequests", {});
    if (!res || !res.ok) return toast("تعذّر تحميل الطلبات", "error");
    state.requests = res.requests || [];
    renderRequests();
  } catch (e) {
    toast("تعذّر الاتصال بالخادم", "error");
  }
}
document.getElementById("reqFilterStatus").addEventListener("change", renderRequests);

function renderRequests() {
  const status = document.getElementById("reqFilterStatus").value;
  const rows = state.requests.filter((r) => !status || r.status === status);
  const body = document.getElementById("requestsBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-inbox"></i>لا توجد طلبات</div></td></tr>`;
    return;
  }
  const reqStatusMap = {
    "قيد المراجعة": "badge-warning",
    "موافق عليه": "badge-success",
    "مرفوض": "badge-danger",
  };
  body.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${r.id}</td>
      <td>${r.fullName || "—"}</td>
      <td>${r.phone || "—"}</td>
      <td>${r.propertyType || "—"}</td>
      <td>${r.requestDate || "—"}</td>
      <td><span class="badge ${reqStatusMap[r.status] || "badge-neutral"}">${r.status || "—"}</span></td>
      <td>
        <div class="row-actions">
          ${
            r.status === "قيد المراجعة"
              ? `<button class="btn btn-icon btn-sm btn-gold-outline" onclick="convertRequest('${r.id}')" title="تحويل إلى عقار"><i class="fa-solid fa-right-left"></i></button>
                 <button class="btn btn-icon btn-sm" onclick="setRequestStatus('${r.id}','مرفوض')" title="رفض"><i class="fa-solid fa-xmark"></i></button>`
              : ""
          }
          <button class="btn btn-icon btn-sm btn-danger-outline" onclick="deleteRequest('${r.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

async function setRequestStatus(id, status) {
  const res = await apiCall("updateRequestStatus", { id, status });
  if (res && res.ok) {
    toast("تم تحديث حالة الطلب", "success");
    loadRequests();
  } else {
    toast((res && res.message) || "تعذّر التحديث", "error");
  }
}
async function convertRequest(id) {
  if (!confirm("سيتم تحويل هذا الطلب إلى عقار جديد في القاعدة الرئيسية. متابعة؟")) return;
  const res = await apiCall("convertRequestToProperty", { id });
  if (res && res.ok) {
    toast("تم تحويل الطلب إلى عقار", "success");
    loadRequests();
  } else {
    toast((res && res.message) || "تعذّر التحويل", "error");
  }
}
async function deleteRequest(id) {
  if (!confirm("هل تريد حذف هذا الطلب نهائياً؟")) return;
  const res = await apiCall("deleteRequest", { id });
  if (res && res.ok) {
    toast("تم حذف الطلب", "success");
    loadRequests();
  } else {
    toast((res && res.message) || "تعذّر الحذف", "error");
  }
}

/* ============================================================
   إدارة المستخدمين
   ============================================================ */
async function loadUsers() {
  try {
    const res = await apiCall("getUsers", {});
    if (!res || !res.ok) return toast("تعذّر تحميل المستخدمين", "error");
    state.users = res.users || [];
    renderUsers();
  } catch (e) {
    toast("تعذّر الاتصال بالخادم", "error");
  }
}
const ALL_PERMISSIONS = [
  { key: "manage_properties", label: "إدارة العقارات" },
  { key: "manage_requests", label: "إدارة الطلبات" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_stats", label: "عرض الإحصائيات" },
  { key: "manage_settings", label: "إدارة الإعدادات" },
];

function renderUsers() {
  const body = document.getElementById("usersBody");
  if (!state.users.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-users"></i>لا يوجد مستخدمون إضافيون بعد</div></td></tr>`;
    return;
  }
  body.innerHTML = state.users
    .map(
      (u) => `
    <tr>
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.role === "full_access" ? "مدير رئيسي" : "مشرف"}</td>
      <td>${u.lastLogin || "لم يسجّل دخول بعد"}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-icon btn-sm" onclick="editUser('${u.id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-icon btn-sm btn-danger-outline" onclick="deleteUser('${u.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

function userFormHtml(u = {}) {
  const perms = u.permissions || [];
  return `
  <div class="form-field" style="margin-bottom:14px;">
    <label>اسم المستخدم</label>
    <input id="u_username" value="${u.username || ""}">
  </div>
  <div class="form-field" style="margin-bottom:14px;">
    <label>${u.id ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور"}</label>
    <input id="u_password" type="password">
  </div>
  <div class="form-field" style="margin-bottom:14px;">
    <label>الدور</label>
    <select id="u_role" onchange="document.getElementById('permBlock').style.display = this.value==='full_access' ? 'none':'block'">
      <option value="supervisor" ${u.role !== "full_access" ? "selected" : ""}>مشرف</option>
      <option value="full_access" ${u.role === "full_access" ? "selected" : ""}>مدير رئيسي (كل الصلاحيات)</option>
    </select>
  </div>
  <div id="permBlock" style="display:${u.role === "full_access" ? "none" : "block"}">
    <label style="font-size:12.5px; font-weight:600; color:var(--ink-soft);">الصلاحيات</label>
    <div class="perm-grid">
      ${ALL_PERMISSIONS.map(
        (p) => `
        <label class="perm-chip">
          <input type="checkbox" value="${p.key}" ${perms.includes(p.key) ? "checked" : ""} class="u_perm">
          ${p.label}
        </label>`
      ).join("")}
    </div>
  </div>`;
}

document.getElementById("addUserBtn").addEventListener("click", () => {
  openModal(
    "إضافة مستخدم جديد",
    userFormHtml(),
    `<button class="btn" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" onclick="submitNewUser()">حفظ</button>`
  );
});
function readUserForm() {
  const role = val("u_role");
  const permissions =
    role === "full_access"
      ? ["full_access"]
      : [...document.querySelectorAll(".u_perm:checked")].map((c) => c.value);
  return { username: val("u_username"), password: val("u_password"), role, permissions };
}
async function submitNewUser() {
  const user = readUserForm();
  if (!user.username || !user.password) return toast("اسم المستخدم وكلمة المرور مطلوبان", "error");
  const res = await apiCall("addUser", { user });
  if (res && res.ok) {
    toast("تمت إضافة المستخدم", "success");
    closeModal();
    loadUsers();
  } else {
    toast((res && res.message) || "تعذّرت الإضافة", "error");
  }
}
function editUser(id) {
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  openModal(
    "تعديل المستخدم",
    userFormHtml(u),
    `<button class="btn" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" onclick="submitEditUser('${id}')">حفظ التعديلات</button>`
  );
}
async function submitEditUser(id) {
  const user = readUserForm();
  if (!user.password) delete user.password; // لا تغيير لكلمة المرور
  const res = await apiCall("updateUser", { id, user });
  if (res && res.ok) {
    toast("تم حفظ التعديلات", "success");
    closeModal();
    loadUsers();
  } else {
    toast((res && res.message) || "تعذّر الحفظ", "error");
  }
}
async function deleteUser(id) {
  if (!confirm("هل تريد حذف هذا المستخدم؟")) return;
  const res = await apiCall("deleteUser", { id });
  if (res && res.ok) {
    toast("تم حذف المستخدم", "success");
    loadUsers();
  } else {
    toast((res && res.message) || "تعذّر الحذف", "error");
  }
}

function createAdminForce() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Users");
  
  if (!sheet) {
    sheet = ss.insertSheet("Users");
    sheet.appendRow(["ID", "Username", "Password", "Salt", "Role", "Permissions", "Created At", "Last Login"]);
    console.log('✅ تم إنشاء ورقة Users');
  }
  
  // حذف أي حساب admin موجود
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === 'admin') {
      sheet.deleteRow(i + 1);
      console.log('🗑️ تم حذف حساب admin القديم');
    }
  }
  
  const salt = "fixed_salt_2024";
  const password = "ChangeMe123!";
  
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + password,
    Utilities.Charset.UTF_8
  );
  const passwordHash = raw.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  
  sheet.appendRow([
    'U-' + Utilities.getUuid().split('-')[0],
    'admin',
    passwordHash,
    salt,
    'full_access',
    '',
    new Date().toISOString(),
    ''
  ]);
  
  console.log('✅ تم إنشاء حساب admin!');
  console.log('👤 Username: admin');
  console.log('🔑 Password: ChangeMe123!');
  
  // عرض البيانات للتأكد
  const newData = sheet.getDataRange().getValues();
  console.log('📊 عدد المستخدمين الآن:', newData.length - 1);
  for (let i = 1; i < newData.length; i++) {
    console.log(`  ${i}. ${newData[i][1]} | ${newData[i][4]}`);
  }
}

/* ============================================================
   الإعدادات
   ============================================================ */
document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  const newUsername = val("newUsername");
  const newPassword = val("newPassword");
  const confirmPassword = val("confirmPassword");

  if (!newUsername && !newPassword) return toast("لا يوجد تغيير لحفظه", "error");
  if (newPassword && newPassword !== confirmPassword)
    return toast("كلمتا المرور غير متطابقتين", "error");

  const res = await apiCall("updateSettings", {
    username: newUsername || undefined,
    password: newPassword || undefined,
  });
  if (res && res.ok) {
    toast("تم حفظ الإعدادات، سيتم تسجيل خروجك الآن", "success");
    setTimeout(logout, 1500);
  } else {
    toast((res && res.message) || "تعذّر الحفظ", "error");
  }
});

/* ---------------- تشغيل ---------------- */
initUserChrome();
loadHome();
