// حفظ أو حذف اشتراك الإشعارات (Push Subscription) الخاص بالمستخدم مع المدينة المختارة
const { getStore } = require("@netlify/blobs");

function keyFromEndpoint(endpoint) {
  return Buffer.from(endpoint).toString("base64url").slice(0, 150);
}

exports.handler = async (event) => {
  const store = getStore("athar-subscriptions");

  if (event.httpMethod === "POST") {
    try {
      const data = JSON.parse(event.body || "{}");
      const { subscription, location } = data;
      if (!subscription || !subscription.endpoint) {
        return { statusCode: 400, body: JSON.stringify({ error: "missing subscription" }) };
      }
      const key = keyFromEndpoint(subscription.endpoint);
      const existing = await store.get(key, { type: "json" }).catch(() => null);
      const record = {
        subscription,
        location: location || { city: "Gaza", country: "Palestine" },
        lastNotified: existing ? existing.lastNotified : { date: null, prayers: [] },
        updatedAt: new Date().toISOString()
      };
      await store.setJSON(key, record);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === "DELETE") {
    try {
      const data = JSON.parse(event.body || "{}");
      if (!data.endpoint) {
        return { statusCode: 400, body: JSON.stringify({ error: "missing endpoint" }) };
      }
      const key = keyFromEndpoint(data.endpoint);
      await store.delete(key);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
