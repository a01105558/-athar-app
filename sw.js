// خدمة العامل الخاصة بتطبيق "أثر" — للعمل بدون اتصال وتفعيل خاصية التثبيت (PWA)
const CACHE_NAME = "athar-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// استراتيجية: الشبكة أولاً للصفحة الرئيسية والـ API (عشان دايماً تجيب آخر نسخة)
// والكاش أولاً بس لملفات ثابتة (الأيقونات) لتسريع الفتح والعمل بدون اتصال
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isApiCall = url.hostname.includes("aladhan.com");
  const isHTML = req.mode === "navigate" || req.destination === "document" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");

  if (isApiCall) {
    // شبكة أولاً، وإن فشلت اعتمد على آخر نسخة محفوظة إن وجدت
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (isHTML) {
    // شبكة أولاً دايماً لصفحة التطبيق نفسها، عشان أي تحديث يظهر فوراً
    // ويستخدم الكاش فقط لو الجهاز بدون اتصال بالإنترنت
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // باقي الملفات الثابتة (أيقونات، مانيفست): كاش أولاً مع تحديث بالخلفية
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// عند الضغط على إشعار: فتح التطبيق أو التركيز عليه إن كان مفتوحاً
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

// السماح للصفحة بطلب عرض إشعار عبر postMessage (يُستخدم كبديل موثوق لـ Notification المباشر)
// استقبال إشعار Push حقيقي مُرسَل من السيرفر (يعمل حتى لو التطبيق مقفول تماماً)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "أثر", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "أثر";
  const options = {
    body: data.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    dir: "rtl",
    lang: "ar",
    tag: data.tag || "athar-push",
    renotify: true,
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SHOW_NOTIFICATION") {
    self.registration.showNotification(data.title || "أثر", {
      body: data.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      dir: "rtl",
      lang: "ar",
      tag: data.tag || "athar-prayer",
      renotify: true,
      vibrate: [200, 100, 200]
    });
  }
});
