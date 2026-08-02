// دالة مجدولة (Cron) تشتغل كل دقيقة، تفحص مواقيت الصلاة لكل مشترك وتبعت إشعار Push حقيقي
const webpush = require("web-push");
const { getStore } = require("@netlify/blobs");

const PRAYER_KEYS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PRAYER_NAMES_AR = {
  Fajr: "الفجر",
  Dhuhr: "الظهر",
  Asr: "العصر",
  Maghrib: "المغرب",
  Isha: "العشاء"
};

webpush.setVapidDetails(
  "mailto:athar-app@example.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function pad(n) {
  return String(n).padStart(2, "0");
}

async function fetchTimings(location, dateStr) {
  let url;
  if (location.useGeo && location.lat != null && location.lng != null) {
    url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${location.lat}&longitude=${location.lng}&method=4`;
  } else {
    const city = location.city || "Gaza";
    const country = location.country || "Palestine";
    url = `https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=4`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("aladhan api error " + res.status);
  const data = await res.json();
  return data.data.timings;
}

exports.handler = async () => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("VAPID keys are not configured in environment variables");
    return { statusCode: 500, body: "VAPID keys missing" };
  }

  const store = getStore("athar-subscriptions");
  const { blobs } = await store.list();

  const now = new Date();
  const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const todayKey = now.toISOString().slice(0, 10);

  const timingsCache = new Map();

  async function getCachedTimings(location) {
    const cacheKey = JSON.stringify(location) + "|" + dateStr;
    if (timingsCache.has(cacheKey)) return timingsCache.get(cacheKey);
    const timings = await fetchTimings(location, dateStr);
    timingsCache.set(cacheKey, timings);
    return timings;
  }

  let sent = 0;

  for (const blobMeta of blobs) {
    const key = blobMeta.key;
    let record;
    try {
      record = await store.get(key, { type: "json" });
    } catch (e) {
      continue;
    }
    if (!record || !record.subscription) continue;

    let timings;
    try {
      timings = await getCachedTimings(record.location || { city: "Gaza", country: "Palestine" });
    } catch (e) {
      continue;
    }

    const lastNotified =
      record.lastNotified && record.lastNotified.date === todayKey
        ? record.lastNotified.prayers || []
        : [];

    let changed = false;
    let removeRecord = false;

    for (const pk of PRAYER_KEYS) {
      const timeStr = (timings[pk] || "").split(" ")[0];
      if (!timeStr) continue;
      const [h, m] = timeStr.split(":").map(Number);
      const prayerDate = new Date(now);
      prayerDate.setHours(h, m, 0, 0);

      const diffMs = now - prayerDate;
      // نافذة دقيقة واحدة تطابق تردد التنفيذ المجدول
      if (diffMs >= 0 && diffMs < 60000 && !lastNotified.includes(pk)) {
        const payload = JSON.strin
