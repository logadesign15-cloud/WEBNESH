"use strict";

/**
 * POST /api/booking
 * Validates a booking request and sends it to NESH as a WhatsApp message
 * through the WhatsApp Business Cloud API (approved template message).
 * Secrets are read from Vercel environment variables only.
 */

const SERVICES = [
  "Computer / Laptop Repair",
  "HDD to SSD Data Transfer",
  "SSD / RAM Upgrade",
  "Windows / Software Installation",
  "Virus / Malware Removal",
  "PC Cleaning / Maintenance",
  "Wi-Fi / Network Setup",
  "Printer Setup",
  "Data Backup / Recovery",
  "Custom PC Build",
  "On-site IT Support",
  "Other / Not sure"
];
const DEVICES = ["", "Laptop", "Desktop PC", "Printer / Network", "Other"];
const SLOTS = [
  "9:00 AM – 11:00 AM",
  "11:00 AM – 1:00 PM",
  "1:00 PM – 3:00 PM",
  "3:00 PM – 5:00 PM",
  "5:00 PM – 7:00 PM"
];

// Best-effort rate limit (per serverless instance): 5 requests / 10 minutes / IP
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > MAX_HITS;
}

// WhatsApp template parameters must not contain newlines, tabs or 4+ spaces.
function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function todayInKualaLumpur() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const d = {};
  parts.forEach((p) => { d[p.type] = p.value; });
  return `${d.year}-${d.month}-${d.day}`;
}

function validate(input) {
  const data = {
    name: clean(input.name, 80),
    phone: clean(input.phone, 30),
    service: clean(input.service, 60),
    device: clean(input.device, 30),
    date: clean(input.date, 10),
    slot: clean(input.slot, 30),
    location: clean(input.location, 100),
    details: clean(input.details, 300)
  };

  if (!data.name) return { error: "Please enter your name." };
  if (!/^[+\d][\d\s()-]{6,29}$/.test(data.phone)) return { error: "Please enter a valid contact number." };
  if (!SERVICES.includes(data.service)) return { error: "Please choose a service." };
  if (!DEVICES.includes(data.device)) return { error: "Please choose a valid device type." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date + "T00:00:00Z"))) {
    return { error: "Please choose a valid date." };
  }
  if (data.date < todayInKualaLumpur()) return { error: "Please choose today or a future date." };
  if (!SLOTS.includes(data.slot)) return { error: "Please choose a time slot." };
  if (!data.location) return { error: "Please enter your service location." };

  return { data };
}

function summarise(d) {
  return clean(
    [
      `Name: ${d.name}`,
      `Phone: ${d.phone}`,
      `Service: ${d.service}`,
      `Device: ${d.device || "-"}`,
      `Date: ${d.date}`,
      `Time: ${d.slot}`,
      `Location: ${d.location}`,
      `Details: ${d.details || "-"}`
    ].join(" | "),
    1000
  );
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  // Only accept requests coming from this site
  try {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      return send(res, 403, { error: "Request not allowed." });
    }
  } catch (e) {
    return send(res, 403, { error: "Request not allowed." });
  }

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  if (rateLimited(ip)) {
    return send(res, 429, { error: "Too many requests. Please wait a few minutes and try again." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== "object" || JSON.stringify(body).length > 5000) {
    return send(res, 400, { error: "Invalid request." });
  }

  // Honeypot: real visitors never fill this field
  if (body.website) return send(res, 200, { ok: true });

  const result = validate(body);
  if (result.error) return send(res, 400, { error: result.error });

  const {
    WHATSAPP_ACCESS_TOKEN: token,
    WHATSAPP_PHONE_NUMBER_ID: phoneId,
    WHATSAPP_RECIPIENT_PHONE: recipient,
    WHATSAPP_TEMPLATE_NAME: template,
    WHATSAPP_TEMPLATE_LANGUAGE: language = "en",
    WHATSAPP_API_VERSION: version = "v23.0"
  } = process.env;

  const missing = [
    ["WHATSAPP_ACCESS_TOKEN", token],
    ["WHATSAPP_PHONE_NUMBER_ID", phoneId],
    ["WHATSAPP_RECIPIENT_PHONE", recipient],
    ["WHATSAPP_TEMPLATE_NAME", template]
  ].filter((entry) => !entry[1]).map((entry) => entry[0]);

  if (missing.length) {
    console.error("Booking notification is not configured. Missing:", missing.join(", "));
    return send(res, 503, { error: "Online booking is temporarily unavailable." });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: String(recipient).replace(/\D/g, ""),
          type: "template",
          template: {
            name: template,
            language: { code: language },
            components: [
              { type: "body", parameters: [{ type: "text", text: summarise(result.data) }] }
            ]
          }
        }),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("WhatsApp API error", response.status, detail.slice(0, 500));
      return send(res, 502, { error: "We couldn't send your request." });
    }

    return send(res, 200, { ok: true });
  } catch (err) {
    console.error("WhatsApp API request failed:", err && err.message);
    return send(res, 502, { error: "We couldn't send your request." });
  }
}

module.exports = handler;
module.exports._test = { validate, summarise, clean };
