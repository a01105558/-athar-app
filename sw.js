// خدمة العامل الخاصة بتطبيق "أثر" — للعمل بدون اتصال وتفعيل خاصية التثبيت (PWA)
const CACHE_NAME = "athar-cache-v1";
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

// استراتيجية: الشبكة أولاً للـ API (مواقيت الصلاة تتغير)، والكاش أولاً لملفات التطبيق
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isApiCall = url.hostname.includes("aladhan.com");

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

  // ملفات التطبيق: كاش أولاً مع تحديث في الخلفية
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
