/* ============================================================
   إعدادات لوحة التحكم
   ============================================================ */
   
// ⚠️ ضع رابط الـ Web App الخاص بك هنا (نفس الرابط المستخدم في الموقع الرئيسي)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWceDQFxAM4xHNgkkGEcmdpNvVvBy9UoTMNb6tRBSRYthMB--z8aZEdyoREcqosBSc/exec";
//                          👆 استخدم نفس الرابط الموجود في CONFIG.API_URL داخل app.js

/* مدة الجلسة بالدقائق قبل تسجيل الخروج التلقائي عند عدم النشاط */
const SESSION_TIMEOUT_MINUTES = 30;

/* مفتاح التخزين المحلي للجلسة */
const SESSION_KEY = "kp_admin_session";