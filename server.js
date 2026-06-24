const express = require("express");
const path = require("path");
const { genCheckMacValue, verifyCheckMacValue, ecpayDate, genTradeNo } = require("./ecpay");
const store = require("./store");
const { sendConfirmation, mailerStatus } = require("./mailer");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // ECPay posts back as form-urlencoded
app.use(express.static(path.join(__dirname, "public")));

// Escape untrusted values before putting them into HTML (prevents XSS).
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== Config (use ECPay public TEST credentials by default) =====
const CFG = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || "2000132",
  HashKey: process.env.ECPAY_HASH_KEY || "5294y06JbISpM5x9",
  HashIV: process.env.ECPAY_HASH_IV || "v77hoKGq4kWxNNIS",
  // Stage (test) endpoint. Switch to https://payment.ecpay.com.tw/... for production.
  aioUrl:
    process.env.ECPAY_AIO_URL ||
    "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  baseUrl: process.env.BASE_URL || "", // if empty, derived per-request (works on Vercel)
};

// Public base URL of THIS server. On Vercel we derive it from the request host
// so the ECPay ReturnURL / OrderResultURL point at the live deployment.
function baseUrlFrom(req) {
  if (CFG.baseUrl) return CFG.baseUrl.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

// ===== Server-side source of truth for sessions/prices =====
const SESSIONS = {
  "TC-0621": { title: "短影音實戰營 台中場 6/21", price: 2980, seats: 12 },
  "KH-0628": { title: "短影音實戰營 高雄場 6/28", price: 2980, seats: 8 },
  "TP-0705": { title: "短影音實戰營 台北場 7/5", price: 2980, seats: 0 },
  "TC-0719": { title: "短影音實戰營 台中場 7/19", price: 2980, seats: 15 },
  "TP-0802": { title: "短影音實戰營 台北場 8/2", price: 2980, seats: 20 },
  "KH-0830": { title: "短影音實戰營 高雄場 8/30", price: 2980, seats: 18 },
};

// ===== Health / diagnostics =====
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    node: process.version,
    storage: store.usePg ? "postgres" : "in-memory",
    storeInitError: store.initError || null,
    email: mailerStatus(),
  });
});

// ===== Create order -> return auto-submitting ECPay form =====
app.post("/api/checkout", async (req, res) => {
  const { sessionId, qty, name, phone, email } = req.body || {};
  const session = SESSIONS[sessionId];

  // --- validation ---
  if (!session) return res.status(400).json({ error: "場次不存在" });
  if (session.seats <= 0) return res.status(400).json({ error: "該場次已額滿" });
  const n = parseInt(qty, 10);
  if (!Number.isInteger(n) || n < 1 || n > 10)
    return res.status(400).json({ error: "人數不正確" });
  if (n > session.seats) return res.status(400).json({ error: "超過剩餘名額" });
  if (!name || String(name).length > 60 || !/^09\d{8}$/.test(phone || "") || !/^\S+@\S+\.\S+$/.test(email || ""))
    return res.status(400).json({ error: "報名資料格式不正確" });

  const amount = session.price * n;
  const tradeNo = genTradeNo();
  const base = baseUrlFrom(req);

  try {
    await store.createOrder({ tradeNo, sessionId, qty: n, amount, name: String(name).trim(), phone, email });
  } catch (e) {
    console.error("createOrder failed:", e.message);
    return res.status(500).json({ error: "建立訂單失敗，請稍後再試" });
  }

  // --- build ECPay params ---
  const params = {
    MerchantID: CFG.MerchantID,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: ecpayDate(),
    PaymentType: "aio",
    TotalAmount: String(amount),
    TradeDesc: "ShortVideo Course Registration",
    ItemName: `${session.title} x${n}`,
    ReturnURL: `${base}/api/ecpay/notify`,       // server-to-server result (required)
    OrderResultURL: `${base}/api/ecpay/result`,  // browser redirect (POST) after pay
    ClientBackURL: `${base}/`,
    ChoosePayment: "ALL",
    EncryptType: "1",
    CustomField1: email,
  };
  params.CheckMacValue = genCheckMacValue(params, CFG.HashKey, CFG.HashIV);

  // --- auto-submitting HTML form ---
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("\n");
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>導向付款中…</title>
<style>body{font-family:sans-serif;background:#0d0d12;color:#fff;display:grid;place-items:center;height:100vh;margin:0}</style></head>
<body><p>正在前往綠界安全付款頁面，請稍候…</p>
<form id="ecpay" method="post" action="${CFG.aioUrl}">${inputs}</form>
<script>document.getElementById("ecpay").submit();</script></body></html>`);
});

// ===== ECPay server-to-server notification (ReturnURL) =====
app.post("/api/ecpay/notify", async (req, res) => {
  const data = req.body || {};
  const ok = verifyCheckMacValue(data, CFG.HashKey, CFG.HashIV);
  if (!ok) return res.send("0|CheckMacValue Error"); // reject forged callbacks

  try {
    if (data.RtnCode === "1") {
      // Idempotent: only the first successful notify flips PENDING->PAID and emails.
      const paidOrder = await store.markPaidIfPending(data.MerchantTradeNo, data.TradeNo);
      if (paidOrder) {
        const title = (SESSIONS[paidOrder.sessionId] || {}).title || "課程";
        await sendConfirmation(paidOrder, title); // mailer swallows its own errors
      }
    } else {
      await store.markFailed(data.MerchantTradeNo, data.RtnMsg);
    }
  } catch (e) {
    console.error("notify handling error:", e.message);
    // Still ack so ECPay doesn't hammer retries; reconcile later if needed.
  }
  res.send("1|OK"); // ECPay requires the literal "1|OK"
});

// ===== Browser redirect after payment (OrderResultURL) -> show result page =====
app.post("/api/ecpay/result", async (req, res) => {
  const data = req.body || {};
  const ok = verifyCheckMacValue(data, CFG.HashKey, CFG.HashIV);
  const paid = ok && data.RtnCode === "1";
  let order = null;
  try { order = await store.getOrder(data.MerchantTradeNo); } catch (_) {}
  const amount = order ? order.amount : data.TradeAmt;

  res.set("Content-Type", "text/html; charset=utf-8").send(`<!DOCTYPE html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${paid ? "報名成功" : "付款未完成"}</title><link rel="stylesheet" href="/styles.css">
<style>.result{max-width:480px;margin:8vh auto;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:48px 32px;text-align:center}
.result .ico{font-size:3.5rem}.result h1{margin:16px 0 8px}.result p{color:var(--muted)}
.kv{text-align:left;margin:24px 0;border-top:1px solid var(--line);padding-top:16px}
.kv div{display:flex;justify-content:space-between;padding:6px 0;font-size:.95rem}.kv span{color:var(--muted)}</style></head>
<body><div class="result">
<div class="ico">${paid ? "🎉" : "⚠️"}</div>
<h1>${paid ? "報名成功！" : "付款未完成"}</h1>
<p>${paid ? "我們已收到你的報名，確認信將寄送至你的信箱。" : "交易未成功，可回到首頁重新報名。"}</p>
<div class="kv">
<div><span>訂單編號</span><strong>${esc(data.MerchantTradeNo) || "-"}</strong></div>
<div><span>金額</span><strong>NT$ ${esc(amount) || "-"}</strong></div>
<div><span>狀態</span><strong>${esc(data.RtnMsg) || (paid ? "已付款" : "失敗")}</strong></div>
</div>
<a href="/" class="btn btn-pill btn-block">回到首頁</a>
</div></body></html>`);
});

// Admin-only order lookup. Returns buyer PII, so it requires a secret token
// supplied via the ADMIN_TOKEN env var (set it in Vercel; never commit it).
// If ADMIN_TOKEN is not configured, the endpoint is disabled entirely.
app.get("/api/orders/:id", async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return res.status(404).json({ error: "not found" });
  const provided = req.get("x-admin-token");
  if (provided !== adminToken) return res.status(401).json({ error: "unauthorized" });
  try {
    const o = await store.getOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "not found" });
    res.json(o);
  } catch (e) {
    res.status(500).json({ error: "lookup failed" });
  }
});

// Catch-all error handler so a thrown error returns JSON instead of crashing.
app.use((err, req, res, next) => {
  console.error("unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "server error", detail: String(err && err.message) });
});
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

// Only start a listener when run directly (local dev). On Vercel the app is
// imported by api/index.js and invoked as a serverless function.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server on ${CFG.baseUrl || "http://localhost:" + PORT} (port ${PORT})`);
    console.log(`ECPay endpoint: ${CFG.aioUrl}`);
    console.log(`MerchantID: ${CFG.MerchantID}${CFG.MerchantID === "2000132" ? " (ECPay public TEST account)" : ""}`);
    console.log(`Storage: ${store.usePg ? "Postgres" : "in-memory (no POSTGRES_URL)"}`);
    console.log(`Email: ${process.env.RESEND_API_KEY ? "Resend" : "disabled (no RESEND_API_KEY)"}`);
  });
}

module.exports = app;
