const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");
const btn = document.getElementById("loginBtn");
const spinner = document.getElementById("loginSpinner");
const btnText = document.getElementById("loginBtnText");

// إذا كانت هناك جلسة صالحة أصلاً، لا داعي لصفحة الدخول
(function redirectIfLoggedIn() {
  const raw =
    sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (raw) window.location.href = "dashboard.html";
})();

if (new URLSearchParams(location.search).get("expired") === "1") {
  showError("انتهت الجلسة بسبب عدم النشاط. الرجاء تسجيل الدخول مجدداً.");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  setLoading(true);
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "login", username, password }),
    });
    const data = await res.json();

    if (data.ok) {
      saveSession(
        {
          sessionId: data.sessionId,
          username: data.username,
          role: data.role,
          permissions: data.permissions,
        },
        remember
      );
      window.location.href = "dashboard.html";
    } else {
      showError(data.message || "اسم المستخدم أو كلمة المرور غير صحيحة");
    }
  } catch (err) {
    showError("تعذّر الاتصال بالخادم. تحقق من رابط الإعداد في admin-config.js");
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  btn.disabled = isLoading;
  spinner.classList.toggle("show", isLoading);
  btnText.textContent = isLoading ? "جارٍ التحقق..." : "تسجيل الدخول";
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("show");
}
function hideError() {
  errorBox.classList.remove("show");
}
